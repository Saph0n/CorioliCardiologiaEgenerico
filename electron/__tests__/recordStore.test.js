import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import initSqlJs from "sql.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRecordStore } from "../recordStore.js";

let root;
let dbPath;
let aperti;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "corioli-store-"));
  dbPath = path.join(root, "corioli-cardiologia.db");
  aperti = [];
});

afterEach(() => {
  for (const db of aperti) {
    try {
      db.close();
    } catch (_) {}
  }
  fs.rmSync(root, { recursive: true, force: true });
});

function apri(options) {
  const db = new DatabaseSync(dbPath);
  aperti.push(db);
  return createRecordStore(db, options);
}

const immagine = "data:image/jpeg;base64," + "A".repeat(2000);

/** Database nel formato delle versioni precedenti: un blob JSON per collezione, scritto da sql.js. */
async function creaArchivioVecchio(blobs) {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("CREATE TABLE kv_store (key TEXT PRIMARY KEY, value TEXT);");
  for (const [key, value] of Object.entries(blobs)) {
    db.run("INSERT INTO kv_store VALUES (?,?)", [
      key,
      typeof value === "string" ? value : JSON.stringify(value),
    ]);
  }
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  db.close();
}

const leggi = (store, collection) => store.getAll(collection).map((r) => JSON.parse(r));

describe("migrazione dal vecchio formato", () => {
  const vecchio = {
    AppDottori_patients: [
      { id: "p1", cognome: "Neri" },
      { id: "p2", cognome: "Conti" },
    ],
    AppDottori_visits: [
      { id: "v1", patientId: "p1", dataVisita: "2026-01-01", visita: { problemaClinico: "Controllo", immagini: [immagine] } },
      { id: "v2", patientId: "p2", dataVisita: "2026-02-01" },
      { id: "v3", patientId: "p1", dataVisita: "2026-03-01" },
    ],
    AppDottori_visit_revisions: [{ id: "r1", visitId: "v1", patientId: "p1", changes: [] }],
    AppDottori_documents: [{ id: "d1", patientId: "p1", fileData: "AAA" }, { id: "d2", fileData: "BBB" }],
    AppDottori_doctor: { id: "doc", cognome: "Rossi" },
    AppDottori_templates: [{ id: "t1", label: "Modello" }],
    app_lock_config: "{\"pin\":\"hash\"}",
  };

  it("converte ogni blob in righe e rimuove i blob", async () => {
    await creaArchivioVecchio(vecchio);
    const store = apri();
    expect(store.hasLegacyBlobs()).toBe(true);

    store.migrateLegacyBlobs();

    expect(store.hasLegacyBlobs()).toBe(false);
    expect(leggi(store, "patients").map((p) => p.cognome)).toEqual(["Neri", "Conti"]);
    expect(leggi(store, "visits").map((v) => v.id)).toEqual(["v1", "v2", "v3"]);
    expect(store.count("visit_revisions")).toBe(1);
    expect(store.count("documents")).toBe(2);
    expect(store.kvGet("AppDottori_visits")).toBeNull();
  });

  it("i dati restano identici, immagini comprese", async () => {
    await creaArchivioVecchio(vecchio);
    const store = apri();
    store.migrateLegacyBlobs();
    expect(JSON.parse(store.getById("visits", "v1"))).toEqual(vecchio.AppDottori_visits[0]);
  });

  it("profilo, modelli e blocco app restano in kv_store", async () => {
    await creaArchivioVecchio(vecchio);
    const store = apri();
    store.migrateLegacyBlobs();
    expect(JSON.parse(store.kvGet("AppDottori_doctor")).cognome).toBe("Rossi");
    expect(JSON.parse(store.kvGet("AppDottori_templates"))).toHaveLength(1);
    expect(store.kvGet("app_lock_config")).toBe("{\"pin\":\"hash\"}");
  });

  it("un blob illeggibile resta intatto e le altre collezioni vengono convertite", async () => {
    await creaArchivioVecchio({ ...vecchio, AppDottori_ricette_paziente: "{ rovinato" });
    const store = apri();
    const report = store.migrateLegacyBlobs();
    expect(report).toContainEqual({ collection: "ricette_paziente", error: "json" });
    expect(store.kvGet("AppDottori_ricette_paziente")).toBe("{ rovinato");
    expect(store.count("patients")).toBe(2);
  });

  it("id duplicati: nessun record va perso", async () => {
    await creaArchivioVecchio({
      AppDottori_visits: [
        { id: "v1", patientId: "p1", descrizioneClinica: "prima" },
        { id: "v1", patientId: "p1", descrizioneClinica: "seconda" },
      ],
    });
    const store = apri();
    store.migrateLegacyBlobs();
    const visite = leggi(store, "visits");
    expect(visite.map((v) => v.descrizioneClinica)).toEqual(["prima", "seconda"]);
    expect(visite[0].id).toBe("v1");
    expect(visite[1].id).not.toBe("v1");
  });

  it("record senza id ricevono un id, elementi non validi vengono saltati", async () => {
    await creaArchivioVecchio({ AppDottori_patients: [{ cognome: "SenzaId" }, null, 5] });
    const store = apri();
    store.migrateLegacyBlobs();
    const pazienti = leggi(store, "patients");
    expect(pazienti).toHaveLength(1);
    expect(typeof pazienti[0].id).toBe("string");
  });

  it("i dati convertiti sono su disco: riaprendo il file ci sono ancora", async () => {
    await creaArchivioVecchio(vecchio);
    const store = apri();
    store.migrateLegacyBlobs();
    store.close();
    aperti = [];
    const riaperto = apri();
    expect(riaperto.hasLegacyBlobs()).toBe(false);
    expect(riaperto.count("visits")).toBe(3);
  });

  it("archivio già convertito con nuovi blob (ritorno a una versione vecchia): si uniscono", async () => {
    await creaArchivioVecchio(vecchio);
    const store = apri();
    store.migrateLegacyBlobs();
    store.kvSet("AppDottori_patients", JSON.stringify([{ id: "p9", cognome: "Nuova" }]));
    store.migrateLegacyBlobs();
    expect(leggi(store, "patients").map((p) => p.cognome)).toEqual(["Neri", "Conti", "Nuova"]);
  });
});

describe("lettura", () => {
  let store;

  beforeEach(() => {
    store = apri();
    store.batch([
      {
        type: "put",
        collection: "visits",
        records: [
          { id: "v1", patientId: "p1", visita: { problemaClinico: "ok", immagini: [immagine] } },
          { id: "v2", patientId: "p2", visita: { immagini: [immagine, immagine] } },
          { id: "v3", patientId: "p1" },
        ],
      },
    ]);
  });

  it("visite di un paziente, nell'ordine di inserimento", () => {
    expect(store.getByPatient("visits", "p1").map((r) => JSON.parse(r).id)).toEqual(["v1", "v3"]);
    expect(store.getByPatient("visits", "nessuna")).toEqual([]);
  });

  it("elenco senza immagini: le immagini restano nel record completo", () => {
    const leggere = store.getAll("visits", { withoutImages: true }).map((r) => JSON.parse(r));
    expect(leggere[0].visita).toEqual({ problemaClinico: "ok" });
    expect(leggere[1].visita).toEqual({});
    expect(leggere[2]).toEqual({ id: "v3", patientId: "p1" });
    expect(JSON.parse(store.getById("visits", "v1")).visita.immagini).toHaveLength(1);
  });

  it("conteggio e record mancante", () => {
    expect(store.count("visits")).toBe(3);
    expect(store.getById("visits", "assente")).toBeNull();
  });

  it("collezione sconosciuta rifiutata", () => {
    expect(() => store.getAll("kv_store")).toThrow(/Collezione sconosciuta/);
  });
});

describe("scrittura", () => {
  it("un aggiornamento mantiene la posizione del record", () => {
    const store = apri();
    store.batch([{ type: "put", collection: "patients", records: [{ id: "a", n: 1 }, { id: "b", n: 1 }] }]);
    store.batch([{ type: "put", collection: "patients", records: [{ id: "a", n: 2 }] }]);
    expect(leggi(store, "patients")).toEqual([{ id: "a", n: 2 }, { id: "b", n: 1 }]);
  });

  it("cambiare paziente a una visita aggiorna l'indice", () => {
    const store = apri();
    store.batch([{ type: "put", collection: "visits", records: [{ id: "v1", patientId: "p1" }] }]);
    store.batch([{ type: "put", collection: "visits", records: [{ id: "v1", patientId: "p2" }] }]);
    expect(store.getByPatient("visits", "p1")).toEqual([]);
    expect(store.getByPatient("visits", "p2")).toHaveLength(1);
  });

  it("tutto o niente: un'operazione non valida annulla l'intero gruppo", () => {
    const store = apri();
    store.batch([{ type: "put", collection: "patients", records: [{ id: "p1" }] }]);
    expect(() =>
      store.batch([
        { type: "delete", collection: "patients", id: "p1" },
        { type: "put", collection: "visits", records: [{ patientId: "p1" }] }, // senza id
      ]),
    ).toThrow();
    expect(store.count("patients")).toBe(1);
    expect(store.count("visits")).toBe(0);
  });

  it("eliminazione per paziente tocca solo quella collezione e quel paziente", () => {
    const store = apri();
    store.batch([
      { type: "put", collection: "visits", records: [{ id: "v1", patientId: "p1" }, { id: "v2", patientId: "p2" }] },
      { type: "put", collection: "visit_revisions", records: [{ id: "r1", patientId: "p1" }] },
    ]);
    store.batch([{ type: "deleteByPatient", collection: "visits", patientId: "p1" }]);
    expect(store.count("visits")).toBe(1);
    expect(store.count("visit_revisions")).toBe(1);
  });

  it("sostituzione di una collezione", () => {
    const store = apri();
    store.batch([{ type: "put", collection: "documents", records: [{ id: "d1" }, { id: "d2" }] }]);
    store.batch([{ type: "replaceCollection", collection: "documents", records: [{ id: "d3" }] }]);
    expect(leggi(store, "documents")).toEqual([{ id: "d3" }]);
  });

  it("il reset cancella i dati dell'app ma non la cronologia né il blocco app", () => {
    const store = apri();
    store.batch([
      { type: "put", collection: "patients", records: [{ id: "p1" }] },
      { type: "put", collection: "visit_revisions", records: [{ id: "r1" }] },
      { type: "kvSet", key: "AppDottori_preferences", value: "{}" },
      { type: "kvSet", key: "app_lock_config", value: "pin" },
    ]);
    store.clearAppData();
    expect(store.count("patients")).toBe(0);
    expect(store.count("visit_revisions")).toBe(1);
    expect(store.kvGet("AppDottori_preferences")).toBeNull();
    expect(store.kvGet("app_lock_config")).toBe("pin");
  });

  it("la copia di sicurezza scatta prima di ogni scrittura, non per le letture", () => {
    let chiamate = 0;
    const store = apri({ beforeWrite: () => chiamate++ });
    store.getAll("patients");
    store.kvGet("x");
    expect(chiamate).toBe(0);
    store.kvSet("x", "1");
    store.batch([{ type: "put", collection: "patients", records: [{ id: "p1" }] }]);
    expect(chiamate).toBe(2);
  });

  it("ogni scrittura è subito su disco", () => {
    const store = apri();
    store.batch([{ type: "put", collection: "patients", records: [{ id: "p1", cognome: "Neri" }] }]);
    // seconda connessione allo stesso file, senza chiudere la prima
    const altra = new DatabaseSync(dbPath, { readOnly: true });
    aperti.push(altra);
    expect(altra.prepare("SELECT data FROM records").get().data).toContain("Neri");
  });
});

describe("compattazione", () => {
  it("dopo la conversione il file torna alle dimensioni dei dati", async () => {
    const grande = Array.from({ length: 200 }, (_, i) => ({ id: "v" + i, patientId: "p1", testo: "x".repeat(5000) }));
    await creaArchivioVecchio({ AppDottori_visits: grande });
    const store = apri();
    store.migrateLegacyBlobs();
    const prima = fs.statSync(dbPath).size;
    store.compact();
    expect(fs.statSync(dbPath).size).toBeLessThan(prima * 0.7);
    expect(store.count("visits")).toBe(200);
  });
});

describe("immagini della visita in colonna separata", () => {
  it("il testo della visita non contiene le immagini, la visita completa sì", () => {
    const db = new DatabaseSync(dbPath);
    aperti.push(db);
    const store = createRecordStore(db);
    const visita = { id: "v1", patientId: "p1", visita: { problemaClinico: "ok", immagini: [immagine] } };
    store.batch([{ type: "put", collection: "visits", records: [visita] }]);

    const riga = db.prepare("SELECT data, images FROM records WHERE id = 'v1'").get();
    expect(riga.data).not.toContain("base64");
    expect(JSON.parse(riga.images)).toEqual([immagine]);
    expect(JSON.parse(store.getById("visits", "v1"))).toEqual(visita);
    expect(JSON.parse(store.getByPatient("visits", "p1")[0])).toEqual(visita);
    expect(JSON.parse(store.getAll("visits")[0])).toEqual(visita);
  });

  it("togliere tutte le immagini svuota la colonna", () => {
    const store = apri();
    store.batch([{ type: "put", collection: "visits", records: [{ id: "v1", visita: { immagini: [immagine] } }] }]);
    store.batch([{ type: "put", collection: "visits", records: [{ id: "v1", visita: { immagini: [] } }] }]);
    expect(JSON.parse(store.getById("visits", "v1"))).toEqual({ id: "v1", visita: { immagini: [] } });
    expect(store.getAll("visits", { withoutImages: true })).toHaveLength(1);
  });
});
