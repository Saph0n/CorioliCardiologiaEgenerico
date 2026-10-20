import crypto from "crypto";

/**
 * Archivio dei dati clinici su SQLite (node:sqlite, file su disco).
 *
 * Nelle versioni precedenti ogni collezione (pazienti, visite, ...) era un blob JSON
 * in `kv_store`, dentro un database sql.js tenuto in memoria e riscritto per
 * intero su disco a ogni salvataggio. Con archivi grandi (migliaia di visite,
 * immagini allegate in base64) ogni operazione costava secondi: leggere una
 * visita voleva dire decodificarle tutte, salvarne una riscriverle tutte.
 * E' lo stesso problema corretto in Corioli Ginecologia con la 1.4.0.
 *
 * Ora ogni record è una riga di `records`, indicizzata per paziente, e SQLite
 * scrive su disco solo le pagine modificate. `kv_store` resta per i dati piccoli
 * (profilo medico, modelli, preferenze, bozze, blocco app): stessa tabella,
 * stesse chiavi.
 *
 * Il modulo non dipende da Electron: riceve un `DatabaseSync` già aperto, così
 * la logica è verificabile in isolamento.
 */

/** Collezioni salvate una riga per record. Le altre chiavi restano in kv_store. */
export const RECORD_COLLECTIONS = [
  "patients",
  "visits",
  "visit_revisions",
  "richieste_esami",
  "certificati_paziente",
  "ricette_paziente",
  "documents",
];

/** La cronologia delle modifiche non va mai cancellata, nemmeno col reset totale. */
const PRESERVED_ON_CLEAR = "visit_revisions";

const LEGACY_PREFIX = "AppDottori_";

/** Dove la visita tiene le immagini allegate al referto (data URL base64). */
const VISIT_IMAGE_SECTION = "visita";
const VISIT_IMAGE_FIELD = "immagini";

function assertCollection(collection) {
  if (!RECORD_COLLECTIONS.includes(collection)) {
    throw new Error(`Collezione sconosciuta: ${collection}`);
  }
}

function assertId(id) {
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Identificativo del record non valido.");
  }
}

function patientIdOf(record) {
  const value = record?.patientId;
  return value == null || value === "" ? null : String(value);
}

/**
 * Separa le immagini allegate (base64, anche MB ciascuna) dal resto della
 * visita: finiscono nella colonna `images`, così gli elenchi leggono solo il
 * testo senza nemmeno toccarle.
 * @returns {[object, string | null]} visita senza immagini, immagini in JSON
 */
function splitVisitImages(visit) {
  const section = visit[VISIT_IMAGE_SECTION];
  const list = section?.[VISIT_IMAGE_FIELD];
  if (!Array.isArray(list) || list.length === 0) return [visit, null];
  const { [VISIT_IMAGE_FIELD]: _images, ...rest } = section;
  return [{ ...visit, [VISIT_IMAGE_SECTION]: rest }, JSON.stringify(list)];
}

/** Rimette le immagini separate da `splitVisitImages` nella visita. */
function joinVisitImages(data, images) {
  if (!images) return data;
  const visit = JSON.parse(data);
  visit[VISIT_IMAGE_SECTION] = {
    ...visit[VISIT_IMAGE_SECTION],
    [VISIT_IMAGE_FIELD]: JSON.parse(images),
  };
  return JSON.stringify(visit);
}

export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      patient_id TEXT,
      data TEXT NOT NULL,
      -- immagini allegate alle visite; ultima colonna: leggere "data" non
      -- richiede di scorrere le pagine di overflow delle immagini
      images TEXT,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS records_by_patient ON records (collection, patient_id);
    -- Le voci di un indice su (collection) sono ordinate per rowid dentro la
    -- collezione: "WHERE collection = ? ORDER BY rowid" le legge così come
    -- sono. Senza, SQLite ordinava ogni volta l'intera collezione in un
    -- B-tree temporaneo (15000 visite: da ~100 a ~40 ms a lettura).
    CREATE INDEX IF NOT EXISTS records_by_collection ON records (collection);
  `);
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {{ beforeWrite?: () => void }} [options]
 *   `beforeWrite` viene chiamata prima di ogni scrittura (es. copia `.bak`).
 */
export function createRecordStore(db, { beforeWrite = () => {} } = {}) {
  db.exec("PRAGMA synchronous = FULL;");
  // Cache delle pagine fino a 64 MB (il predefinito è 2 MB): dashboard,
  // elenco pazienti ed elenco visite rileggono tutte le visite, e con la
  // cache piccola ogni lettura ripassava dal file.
  db.exec("PRAGMA cache_size = -65536;");
  initSchema(db);

  const q = {
    kvGet: db.prepare("SELECT value FROM kv_store WHERE key = ?"),
    kvSet: db.prepare(
      "INSERT INTO kv_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ),
    kvRemove: db.prepare("DELETE FROM kv_store WHERE key = ?"),
    kvClearApp: db.prepare("DELETE FROM kv_store WHERE key LIKE 'AppDottori_%'"),
    // L'ordine per rowid riproduce quello dei vecchi array: un aggiornamento
    // (upsert) mantiene la posizione, un nuovo record va in fondo.
    getAll: db.prepare("SELECT data, images FROM records WHERE collection = ? ORDER BY rowid"),
    getAllWithoutImages: db.prepare(
      "SELECT data FROM records WHERE collection = ? ORDER BY rowid",
    ),
    getById: db.prepare("SELECT data, images FROM records WHERE collection = ? AND id = ?"),
    getByPatient: db.prepare(
      "SELECT data, images FROM records WHERE collection = ? AND patient_id = ? ORDER BY rowid",
    ),
    count: db.prepare("SELECT COUNT(*) AS n FROM records WHERE collection = ?"),
    put: db.prepare(
      `INSERT INTO records (collection, id, patient_id, data, images) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(collection, id) DO UPDATE SET
         patient_id = excluded.patient_id, data = excluded.data, images = excluded.images`,
    ),
    delete: db.prepare("DELETE FROM records WHERE collection = ? AND id = ?"),
    deleteByPatient: db.prepare("DELETE FROM records WHERE collection = ? AND patient_id = ?"),
    deleteCollection: db.prepare("DELETE FROM records WHERE collection = ?"),
    clearRecords: db.prepare("DELETE FROM records WHERE collection <> ?"),
  };

  /** Esegue `fn` in una transazione: o tutto o niente. */
  function transaction(fn) {
    beforeWrite();
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch (_) {
        // transazione già annullata da SQLite
      }
      throw error;
    }
  }

  function putRecord(collection, record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`Record non valido nella collezione ${collection}.`);
    }
    assertId(record.id);
    const [data, images] =
      collection === "visits" ? splitVisitImages(record) : [record, null];
    q.put.run(collection, record.id, patientIdOf(record), JSON.stringify(data), images);
  }

  const fullRow = (row) => joinVisitImages(row.data, row.images);

  function applyOp(op) {
    switch (op?.type) {
      case "put":
        assertCollection(op.collection);
        for (const record of op.records ?? []) putRecord(op.collection, record);
        return;
      case "delete":
        assertCollection(op.collection);
        assertId(op.id);
        q.delete.run(op.collection, op.id);
        return;
      case "deleteByPatient":
        assertCollection(op.collection);
        assertId(op.patientId);
        q.deleteByPatient.run(op.collection, op.patientId);
        return;
      case "replaceCollection":
        assertCollection(op.collection);
        q.deleteCollection.run(op.collection);
        for (const record of op.records ?? []) putRecord(op.collection, record);
        return;
      case "kvSet":
        assertId(op.key);
        q.kvSet.run(op.key, String(op.value ?? ""));
        return;
      case "kvRemove":
        assertId(op.key);
        q.kvRemove.run(op.key);
        return;
      case "clearAppData":
        q.kvClearApp.run();
        q.clearRecords.run(PRESERVED_ON_CLEAR);
        return;
      default:
        throw new Error(`Operazione sconosciuta: ${op?.type}`);
    }
  }

  return {
    kvGet(key) {
      const row = q.kvGet.get(key);
      return row ? row.value : null;
    },
    kvSet(key, value) {
      beforeWrite();
      q.kvSet.run(key, String(value ?? ""));
    },
    kvRemove(key) {
      beforeWrite();
      q.kvRemove.run(key);
    },
    /** Cancella i dati dell'app (non il blocco PIN), cronologia esclusa. */
    clearAppData() {
      transaction(() => applyOp({ type: "clearAppData" }));
    },

    /**
     * I record viaggiano come stringhe JSON: il renderer le decodifica una per
     * una, senza mai costruire un'unica stringa gigante (limite V8 ~512 MB).
     */
    getAll(collection, { withoutImages = false } = {}) {
      assertCollection(collection);
      if (withoutImages) {
        return q.getAllWithoutImages.all(collection).map((r) => r.data);
      }
      return q.getAll.all(collection).map(fullRow);
    },
    getById(collection, id) {
      assertCollection(collection);
      const row = q.getById.get(collection, String(id));
      return row ? fullRow(row) : null;
    },
    getByPatient(collection, patientId) {
      assertCollection(collection);
      return q.getByPatient.all(collection, String(patientId)).map(fullRow);
    },
    count(collection) {
      assertCollection(collection);
      return Number(q.count.get(collection).n);
    },
    /** Applica più operazioni in un'unica transazione. */
    batch(ops) {
      if (!Array.isArray(ops)) throw new Error("Operazioni non valide.");
      if (ops.length === 0) return;
      transaction(() => {
        for (const op of ops) applyOp(op);
      });
    },

    /** True se nel database ci sono ancora collezioni nel vecchio formato blob. */
    hasLegacyBlobs() {
      return RECORD_COLLECTIONS.some((c) => q.kvGet.get(LEGACY_PREFIX + c));
    },

    /**
     * Converte i vecchi blob JSON (`AppDottori_<collezione>`) in righe, tutto in
     * un'unica transazione: o l'archivio è convertito per intero o resta com'era
     * (e la conversione si ripete al prossimo avvio). Un blob illeggibile resta
     * dov'è, intatto, e viene segnalato.
     */
    migrateLegacyBlobs() {
      const report = [];
      const pending = [];
      for (const collection of RECORD_COLLECTIONS) {
        const key = LEGACY_PREFIX + collection;
        const row = q.kvGet.get(key);
        if (!row) continue;
        let items;
        try {
          items = JSON.parse(row.value || "[]");
        } catch (error) {
          console.error(`Migrazione: ${key} non è JSON valido, lasciato intatto.`, error);
          report.push({ collection, error: "json" });
          continue;
        }
        if (!Array.isArray(items)) {
          console.error(`Migrazione: ${key} non è un elenco, lasciato intatto.`);
          report.push({ collection, error: "formato" });
          continue;
        }
        pending.push({ collection, key, items });
      }
      if (pending.length === 0) return report;

      transaction(() => {
        for (const { collection, key, items } of pending) {
          const seen = new Set();
          let migrated = 0;
          for (const item of items) {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              console.warn(`Migrazione: elemento non valido in ${key}, saltato.`, item);
              continue;
            }
            let id = item.id != null && item.id !== "" ? String(item.id) : crypto.randomUUID();
            // Id duplicati nel vecchio array: nessun record va perso, il doppione
            // riceve un id nuovo invece di sovrascrivere il primo.
            if (seen.has(id)) id = `${id}-dup-${crypto.randomUUID().slice(0, 8)}`;
            seen.add(id);
            putRecord(collection, { ...item, id });
            migrated++;
          }
          q.kvRemove.run(key);
          report.push({ collection, migrated });
        }
      });
      return report;
    },

    /**
     * Riscrive il file eliminando le pagine libere. Dopo la conversione i vecchi
     * blob lasciano il file grande il doppio, e ogni backup ne copierebbe il vuoto.
     */
    compact() {
      beforeWrite();
      db.exec("VACUUM");
    },

    close() {
      db.close();
    },
  };
}
