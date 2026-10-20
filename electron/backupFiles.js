import fs from "fs";
import path from "path";

/**
 * Gestione dei file di backup del database, senza dipendenze da Electron:
 * riceve i percorsi come parametri, così la logica è verificabile in isolamento.
 *
 * I backup sono copie del file SQLite in `userData/backups/`, create:
 *  - all'avvio, una volta al giorno (motivo "auto");
 *  - prima di un import o di un ripristino ("pre-import" / "pre-restore");
 *  - su richiesta dalle impostazioni ("manuale").
 */

export const BACKUP_REASONS = [
  "auto",
  "manuale",
  "pre-import",
  "pre-restore",
  "pre-migrazione",
];

/** Quante copie conservare per motivo. Rotazione separata: un import sbagliato
 *  non deve poter spazzare via le copie giornaliere. */
export const BACKUP_KEEP = {
  auto: 10,
  manuale: 10,
  "pre-import": 5,
  "pre-restore": 5,
  // copia dell'archivio nel vecchio formato, presa prima della conversione a righe
  "pre-migrazione": 2,
};

/** File di appoggio che SQLite crea accanto al database. */
const SQLITE_SIDECARS = ["-journal", "-wal", "-shm"];

/**
 * Elimina i file di appoggio di SQLite rimasti accanto a `dbPath`.
 * Va chiamata solo a connessione chiusa e quando il database sta per essere
 * sostituito: un journal residuo verrebbe applicato al file nuovo, rovinandolo.
 */
export function removeSqliteSidecars(dbPath) {
  for (const suffix of SQLITE_SIDECARS) {
    try {
      fs.rmSync(`${dbPath}${suffix}`, { force: true });
    } catch (e) {
      console.error(`Rimozione ${dbPath}${suffix} non riuscita:`, e);
    }
  }
}

/** Sposta il database (e i suoi file di appoggio) aggiungendo `suffix` al nome. */
export function moveDatabaseAside(dbPath, suffix) {
  fs.renameSync(dbPath, `${dbPath}${suffix}`);
  for (const sidecar of SQLITE_SIDECARS) {
    const from = `${dbPath}${sidecar}`;
    if (!fs.existsSync(from)) continue;
    try {
      fs.renameSync(from, `${dbPath}${suffix}${sidecar}`);
    } catch (e) {
      console.error(`Spostamento ${from} non riuscito:`, e);
    }
  }
}

const BACKUP_NAME_RE =
  /^corioli-([a-z-]+)-(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.db$/;

export function normalizeBackupReason(reason) {
  return BACKUP_REASONS.includes(reason) ? reason : "manuale";
}

export function backupFileTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

/** Riconosce i soli nomi generati da questo modulo: blocca anche i path traversal. */
export function parseBackupFileName(name) {
  if (typeof name !== "string") return null;
  const m = BACKUP_NAME_RE.exec(name);
  if (!m) return null;
  return { reason: m[1], date: m[2], time: m[3].replace(/-/g, ":") };
}

/**
 * Scrittura atomica: file temporaneo + fsync + rename.
 * Un `writeFileSync` diretto sul database lascerebbe il file troncato se il
 * processo (o il PC) si ferma a metà scrittura.
 */
export function writeFileAtomicSync(filePath, buffer) {
  const tmpPath = `${filePath}.tmp`;
  let fd = null;
  try {
    fd = fs.openSync(tmpPath, "w");
    fs.writeSync(fd, buffer, 0, buffer.length, 0);
    fs.fsyncSync(fd); // i dati devono essere sul disco prima del rename
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (_) {}
    }
  }
  fs.renameSync(tmpPath, filePath); // sostituzione atomica
}

/** Elenco dei backup presenti, dal più recente al più vecchio. */
export function listBackupFiles(backupsDir) {
  if (!fs.existsSync(backupsDir)) return [];
  const out = [];
  for (const name of fs.readdirSync(backupsDir)) {
    const parsed = parseBackupFileName(name);
    if (!parsed) continue;
    try {
      const st = fs.statSync(path.join(backupsDir, name));
      if (!st.isFile()) continue;
      out.push({
        fileName: name,
        reason: parsed.reason,
        size: st.size,
        createdAt: st.mtime.toISOString(),
        sortKey: `${parsed.date}_${parsed.time}`,
      });
    } catch (_) {
      // file rimosso nel frattempo: si ignora
    }
  }
  // Ordinamento sul timestamp nel nome: indipendente dalle mtime, che una copia
  // di file può alterare.
  return out
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
    .map(({ sortKey: _sortKey, ...rest }) => rest);
}

/** Elimina le copie eccedenti, contando separatamente per motivo. */
export function rotateBackups(backupsDir) {
  const byReason = new Map();
  for (const item of listBackupFiles(backupsDir)) {
    const list = byReason.get(item.reason) ?? [];
    list.push(item);
    byReason.set(item.reason, list);
  }
  const removed = [];
  for (const [reason, list] of byReason) {
    const keep = BACKUP_KEEP[reason] ?? 5;
    for (const stale of list.slice(keep)) {
      try {
        fs.unlinkSync(path.join(backupsDir, stale.fileName));
        removed.push(stale.fileName);
      } catch (e) {
        console.error("Rotazione backup:", e);
      }
    }
  }
  return removed;
}

/**
 * Copia il database nella cartella dei backup e applica la rotazione.
 * Il chiamante deve aver già scritto su disco lo stato corrente.
 */
export function createBackupFile({ dbPath, backupsDir, reason, now = new Date() }) {
  const normalized = normalizeBackupReason(reason);
  if (!fs.existsSync(dbPath)) {
    return { ok: false, error: "Nessun database da salvare." };
  }
  try {
    fs.mkdirSync(backupsDir, { recursive: true });
    const fileName = `corioli-${normalized}-${backupFileTimestamp(now)}.db`;
    const target = path.join(backupsDir, fileName);
    fs.copyFileSync(dbPath, target);
    rotateBackups(backupsDir);
    const st = fs.statSync(target);
    return {
      ok: true,
      fileName,
      reason: normalized,
      size: st.size,
      createdAt: st.mtime.toISOString(),
    };
  } catch (e) {
    console.error("Creazione backup non riuscita:", e);
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Sovrascrive il database con una copia di backup. Il nome è validato. */
export function restoreBackupFile({ dbPath, backupsDir, fileName }) {
  if (!parseBackupFileName(fileName)) {
    return { ok: false, error: "Nome backup non valido." };
  }
  const source = path.join(backupsDir, fileName);
  if (!fs.existsSync(source)) {
    return { ok: false, error: "Backup non trovato." };
  }
  try {
    // Il chiamante ha già chiuso la connessione: un journal rimasto del vecchio
    // database non deve essere applicato a quello ripristinato.
    removeSqliteSidecars(dbPath);
    fs.copyFileSync(source, dbPath);
    return { ok: true };
  } catch (e) {
    console.error("Ripristino backup non riuscito:", e);
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Apre un database SQLite (node:sqlite) verificando che sia effettivamente
 * leggibile. Restituisce null se il file manca, è troncato o corrotto, così il
 * chiamante può ripiegare sulla copia `.bak`.
 *
 * @param {typeof import("node:sqlite").DatabaseSync} DatabaseSync
 */
export function openDatabaseFromFile(DatabaseSync, filePath, { readOnly = false } = {}) {
  let db = null;
  try {
    // DatabaseSync crea il file se non esiste: qui invece un file assente è un errore.
    const st = fs.statSync(filePath);
    // Un file da 0 byte è per SQLite un database nuovo e valido: senza questo
    // controllo una scrittura interrotta sul nascere passerebbe per un archivio
    // vuoto legittimo e il recupero dalla copia `.bak` non scatterebbe.
    if (st.size === 0) {
      console.error(`DB vuoto (0 byte): ${filePath}`);
      return null;
    }
    db = new DatabaseSync(filePath, { readOnly });
    // Query di verifica: su un file corrotto SQLite fallisce qui, non all'apertura.
    db.prepare("SELECT name FROM sqlite_master LIMIT 1").all();
    return db;
  } catch (e) {
    console.error(`DB non leggibile (${filePath}):`, e?.message || e);
    try {
      db?.close();
    } catch (_) {}
    return null;
  }
}
