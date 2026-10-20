import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import initSqlJs from "sql.js";
import {
  createBackupFile,
  listBackupFiles,
  moveDatabaseAside,
  openDatabaseFromFile,
  parseBackupFileName,
  restoreBackupFile,
  rotateBackups,
  writeFileAtomicSync,
} from "../backupFiles.js";

let root;
let dbPath;
let backupsDir;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "corioli-test-"));
  dbPath = path.join(root, "corioli-cardiologia.db");
  backupsDir = path.join(root, "backups");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("scrittura atomica del database", () => {
  it("sostituisce il contenuto e non lascia file temporanei", () => {
    fs.writeFileSync(dbPath, "versione-1");
    writeFileAtomicSync(dbPath, Buffer.from("versione-2"));
    expect(fs.readFileSync(dbPath, "utf8")).toBe("versione-2");
    expect(fs.existsSync(`${dbPath}.tmp`)).toBe(false);
  });

  it("un .tmp rimasto da una scrittura interrotta non intacca il database", () => {
    writeFileAtomicSync(dbPath, Buffer.from("dati-buoni"));
    fs.writeFileSync(`${dbPath}.tmp`, "scrittura-interrotta");
    expect(fs.readFileSync(dbPath, "utf8")).toBe("dati-buoni");
    writeFileAtomicSync(dbPath, Buffer.from("dati-nuovi"));
    expect(fs.readFileSync(dbPath, "utf8")).toBe("dati-nuovi");
  });
});

describe("nomi dei file di backup", () => {
  it("riconosce i nomi generati dall'app", () => {
    expect(parseBackupFileName("corioli-auto-2026-08-19_23-05-01.db").reason).toBe("auto");
    expect(parseBackupFileName("corioli-pre-import-2026-08-19_23-05-01.db").reason).toBe("pre-import");
  });

  it.each([
    "../../evil.db",
    "corioli-cardiologia.db",
    "corioli-auto-2026-08-19.db",
    "corioli-auto-2026-08-19_23-05-01.db.exe",
    "",
    null,
    undefined,
  ])("rifiuta %s", (nome) => {
    expect(parseBackupFileName(nome)).toBeNull();
  });
});

describe("creazione e rotazione dei backup", () => {
  const giorno = (i) => new Date(2026, 0, 1 + i, 8, 0, 0);

  it("conserva le 10 copie automatiche più recenti", () => {
    fs.writeFileSync(dbPath, "dati");
    for (let i = 0; i < 13; i++) {
      expect(createBackupFile({ dbPath, backupsDir, reason: "auto", now: giorno(i) }).ok).toBe(true);
    }
    const items = listBackupFiles(backupsDir);
    expect(items).toHaveLength(10);
    expect(items[0].fileName).toContain("2026-01-13");
    expect(items.some((i) => i.fileName.includes("2026-01-01"))).toBe(false);
  });

  it("la rotazione delle automatiche non tocca le copie pre-import", () => {
    fs.writeFileSync(dbPath, "dati");
    createBackupFile({ dbPath, backupsDir, reason: "pre-import", now: giorno(0) });
    for (let i = 1; i < 13; i++) {
      createBackupFile({ dbPath, backupsDir, reason: "auto", now: giorno(i) });
    }
    const items = listBackupFiles(backupsDir);
    expect(items.filter((i) => i.reason === "pre-import")).toHaveLength(1);
    expect(items.filter((i) => i.reason === "auto")).toHaveLength(10);
  });

  it("un motivo sconosciuto diventa 'manuale'", () => {
    fs.writeFileSync(dbPath, "dati");
    expect(createBackupFile({ dbPath, backupsDir, reason: "inventato" }).reason).toBe("manuale");
  });

  it("senza database restituisce un errore leggibile", () => {
    const r = createBackupFile({ dbPath, backupsDir, reason: "auto" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Nessun database da salvare.");
  });

  it("ignora i file estranei presenti nella cartella", () => {
    fs.mkdirSync(backupsDir, { recursive: true });
    fs.writeFileSync(path.join(backupsDir, "appunti.txt"), "non toccare");
    fs.writeFileSync(dbPath, "dati");
    createBackupFile({ dbPath, backupsDir, reason: "auto" });
    rotateBackups(backupsDir);
    expect(fs.existsSync(path.join(backupsDir, "appunti.txt"))).toBe(true);
  });
});

describe("ripristino", () => {
  it("riporta il database al contenuto salvato", () => {
    fs.writeFileSync(dbPath, "dati-corretti");
    const snap = createBackupFile({ dbPath, backupsDir, reason: "manuale" });
    fs.writeFileSync(dbPath, "dati-rovinati");
    expect(restoreBackupFile({ dbPath, backupsDir, fileName: snap.fileName }).ok).toBe(true);
    expect(fs.readFileSync(dbPath, "utf8")).toBe("dati-corretti");
  });

  it("blocca i percorsi arbitrari e lascia il database intatto", () => {
    fs.writeFileSync(dbPath, "dati-correnti");
    const r = restoreBackupFile({ dbPath, backupsDir, fileName: "../../../corioli-cardiologia.db" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Nome backup non valido.");
    expect(fs.readFileSync(dbPath, "utf8")).toBe("dati-correnti");
  });

  it("segnala un backup inesistente", () => {
    fs.writeFileSync(dbPath, "dati");
    const r = restoreBackupFile({ dbPath, backupsDir, fileName: "corioli-auto-2000-01-01_00-00-00.db" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Backup non trovato.");
  });
});

describe("apertura del database e recupero", () => {
  let SQL;

  beforeEach(async () => {
    SQL = await initSqlJs();
  });

  // Il database di prova è creato con sql.js, come quelli delle versioni
  // precedenti: il nuovo archivio (node:sqlite) deve aprirli così come sono.
  const creaDb = () => {
    const db = new SQL.Database();
    db.run("CREATE TABLE kv_store (key TEXT PRIMARY KEY, value TEXT);");
    db.run("INSERT INTO kv_store VALUES (?,?)", [
      "AppDottori_patients",
      JSON.stringify([{ id: "p1", cognome: "Neri" }]),
    ]);
    return Buffer.from(db.export());
  };

  const leggiKv = (db) => db.prepare("SELECT value FROM kv_store").get().value;

  it("apre un database valido e ne legge i dati", () => {
    writeFileAtomicSync(dbPath, creaDb());
    const db = openDatabaseFromFile(DatabaseSync, dbPath);
    expect(db).not.toBeNull();
    expect(leggiKv(db)).toContain("Neri");
    db.close();
  });

  it.each([
    ["file troncato", (buf) => buf.subarray(0, Math.floor(buf.length / 2))],
    ["header sovrascritto", (buf) => { const c = Buffer.from(buf); c.fill(0, 0, 100); return c; }],
    ["file vuoto", () => Buffer.alloc(0)],
    ["contenuto non SQLite", () => Buffer.from("spazzatura")],
  ])("riconosce come illeggibile: %s", (_nome, rovina) => {
    const buono = creaDb();
    fs.writeFileSync(dbPath, rovina(buono));
    expect(openDatabaseFromFile(DatabaseSync, dbPath)).toBeNull();
  });

  it("dalla copia .bak i dati restano recuperabili", () => {
    const buono = creaDb();
    writeFileAtomicSync(dbPath, buono);
    fs.copyFileSync(dbPath, `${dbPath}.bak`);
    fs.writeFileSync(dbPath, buono.subarray(0, 200)); // il principale si rovina
    expect(openDatabaseFromFile(DatabaseSync, dbPath)).toBeNull();
    const recuperato = openDatabaseFromFile(DatabaseSync, `${dbPath}.bak`, { readOnly: true });
    expect(leggiKv(recuperato)).toContain("Neri");
    recuperato.close();
  });

  it("un percorso inesistente non fa crashare e non crea il file", () => {
    const assente = path.join(root, "assente.db");
    expect(openDatabaseFromFile(DatabaseSync, assente)).toBeNull();
    expect(fs.existsSync(assente)).toBe(false);
  });
});

describe("file di appoggio di SQLite", () => {
  it("il ripristino elimina un journal rimasto del vecchio database", () => {
    fs.mkdirSync(backupsDir, { recursive: true });
    const nome = "corioli-auto-2026-01-01_10-00-00.db";
    fs.writeFileSync(path.join(backupsDir, nome), "backup");
    fs.writeFileSync(dbPath, "attuale");
    fs.writeFileSync(`${dbPath}-journal`, "journal-vecchio");
    expect(restoreBackupFile({ dbPath, backupsDir, fileName: nome }).ok).toBe(true);
    expect(fs.readFileSync(dbPath, "utf8")).toBe("backup");
    expect(fs.existsSync(`${dbPath}-journal`)).toBe(false);
  });

  it("un database messo da parte si porta dietro il suo journal", () => {
    fs.writeFileSync(dbPath, "rovinato");
    fs.writeFileSync(`${dbPath}-journal`, "journal");
    moveDatabaseAside(dbPath, ".corrupted-1");
    expect(fs.existsSync(dbPath)).toBe(false);
    expect(fs.existsSync(`${dbPath}-journal`)).toBe(false);
    expect(fs.readFileSync(`${dbPath}.corrupted-1`, "utf8")).toBe("rovinato");
    expect(fs.readFileSync(`${dbPath}.corrupted-1-journal`, "utf8")).toBe("journal");
  });

  it("il motivo pre-migrazione è riconosciuto", () => {
    fs.writeFileSync(dbPath, "dati");
    const r = createBackupFile({ dbPath, backupsDir, reason: "pre-migrazione" });
    expect(r.ok).toBe(true);
    expect(r.fileName).toMatch(/^corioli-pre-migrazione-/);
  });
});

