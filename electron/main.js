import { app, BrowserWindow, Menu, ipcMain, shell } from "electron";
import { createAppLockHandlers } from "./appLock.js";
import { cleanupPrintDir, writePrintFile } from "./printFiles.js";
import {
  createBackupFile,
  listBackupFiles,
  moveDatabaseAside,
  openDatabaseFromFile,
  restoreBackupFile,
} from "./backupFiles.js";
import { createRecordStore, RECORD_COLLECTIONS } from "./recordStore.js";
import {
  checkBiometricAvailable,
  promptBiometric,
} from "./biometricAuth.js";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.env.NODE_ENV === "development";

app.setName("CorioliCardiologia");

let storeReady = null;
let mainWindowRef = null;
let sessionUnlocked = false;

function getDbPath() {
  return path.join(app.getPath("userData"), "corioli-cardiologia.db");
}

function getBackupsDir() {
  return path.join(app.getPath("userData"), "backups");
}

/**
 * PDF di stampa: sottocartella dedicata dentro la temp dell'utente.
 *
 * NON deve stare in `userData`: nel pacchetto MSIX del Microsoft Store le
 * scritture in `%APPDATA%\CorioliCardiologia` vengono dirottate dentro il container
 * (`%LOCALAPPDATA%\Packages\Corioli.CorioliCardiologia_*\LocalCache\Roaming\CorioliCardiologia`).
 * L'app vede il percorso virtuale, il visualizzatore PDF esterno aperto da
 * `shell.openPath` vede quello reale — che non esiste: ERR_FILE_NOT_FOUND.
 * In sviluppo il problema non si vede perché l'app non è pacchettizzata.
 *
 * La temp non è dirottata, quindi il percorso è lo stesso per app e visualizzatore.
 * I file vengono ripuliti all'avvio e alla chiusura (vedi cleanupPrintDir).
 */
function getPrintDir() {
  return path.join(app.getPath("temp"), "CorioliCardiologia", "stampe");
}

/** Vecchia cartella di stampa (versioni <= 1.3.2): va solo ripulita. */
function getLegacyPrintDir() {
  return path.join(app.getPath("userData"), "stampe");
}

/**
 * Apre (una volta sola) l'archivio SQLite su disco.
 *
 * Nelle versioni precedenti il database era tenuto in memoria da sql.js e riscritto per
 * intero a ogni salvataggio; ora è un normale file SQLite aggiornato pagina per
 * pagina (vedi recordStore.js). Il formato del file è lo stesso: un archivio
 * vecchio si apre così com'è e viene convertito a righe al primo avvio.
 */
async function openStore() {
  const { DatabaseSync } = await import("node:sqlite");
  const dbPath = getDbPath();
  const bakPath = `${dbPath}.bak`;

  let db = null;
  // True se il file su disco era leggibile: se non lo era non va usato come
  // sorgente della copia `.bak`, che altrimenti verrebbe rovinata a sua volta.
  let openedFromValidFile = false;

  if (fs.existsSync(dbPath)) {
    db = openDatabaseFromFile(DatabaseSync, dbPath);
    openedFromValidFile = db !== null;

    if (!db) {
      // Il file danneggiato viene messo da parte, mai sovrascritto: è l'unica
      // copia rimasta se anche il .bak dovesse mancare.
      try {
        moveDatabaseAside(dbPath, `.corrupted-${Date.now()}`);
      } catch (e) {
        console.error("Impossibile mettere da parte il DB corrotto:", e);
      }
      const bak = fs.existsSync(bakPath)
        ? openDatabaseFromFile(DatabaseSync, bakPath, { readOnly: true })
        : null;
      if (bak) {
        console.warn("corioli-cardiologia.db illeggibile: ripristino da corioli-cardiologia.db.bak");
        bak.close();
        try {
          fs.copyFileSync(bakPath, dbPath);
          db = openDatabaseFromFile(DatabaseSync, dbPath);
          openedFromValidFile = db !== null;
        } catch (e) {
          console.error("Ripristino da .bak non riuscito:", e);
        }
      }
    }
  }
  if (!db) {
    // Se il file danneggiato non è stato spostato, non va sovrascritto.
    if (fs.existsSync(dbPath)) {
      throw new Error("Database illeggibile e non spostabile: avvio interrotto.");
    }
    db = new DatabaseSync(dbPath);
  }

  // Copia di sicurezza del file valido con cui si è aperta la sessione: è il punto
  // di rollback se una scrittura successiva dovesse rovinare il database.
  let sessionBackupDone = false;
  function ensureSessionBackup() {
    if (sessionBackupDone) return;
    sessionBackupDone = true;
    if (!openedFromValidFile) return; // non sovrascrivere il .bak con un file guasto
    try {
      if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, bakPath);
    } catch (e) {
      console.error("Copia .bak non riuscita:", e);
    }
  }

  const store = createRecordStore(db, { beforeWrite: ensureSessionBackup });
  try {
    migrateIfNeeded(store, dbPath);
  } catch (e) {
    store.close();
    throw e;
  }
  return store;
}

/** Converte a righe un archivio nel vecchio formato (una volta sola). */
function migrateIfNeeded(store, dbPath) {
  if (store.hasLegacyBlobs()) {
    // Copia dell'archivio nel vecchio formato, conservata tra i backup: se la
    // conversione desse problemi si torna indietro dalle impostazioni.
    const backup = createBackupFile({
      dbPath,
      backupsDir: getBackupsDir(),
      reason: "pre-migrazione",
    });
    if (!backup.ok) console.error("Backup pre-migrazione non riuscito:", backup.error);
    const started = Date.now();
    const report = store.migrateLegacyBlobs();
    console.log(`Archivio convertito a righe in ${Date.now() - started} ms`, report);
    if (report.some((r) => r.migrated != null)) {
      try {
        const compactStarted = Date.now();
        store.compact();
        console.log(`Archivio compattato in ${Date.now() - compactStarted} ms`);
      } catch (e) {
        // Non grave: il file resta solo più grande del necessario.
        console.error("Compattazione dopo la conversione non riuscita:", e);
      }
    }
  }
}

async function getStore() {
  // Un errore di apertura vale per tutta la sessione: ritentare a ogni richiesta
  // rifarebbe ogni volta backup e conversione. Al prossimo avvio si riprova.
  storeReady ??= openStore();
  return storeReady;
}

/** Chiude l'archivio (prima di sostituire il file su disco). */
async function closeStore() {
  if (!storeReady) return;
  const pending = storeReady;
  storeReady = null;
  try {
    (await pending).close();
  } catch (e) {
    console.error("Chiusura archivio:", e);
  }
}

async function kvGet(key) {
  return (await getStore()).kvGet(key);
}

async function kvSet(key, value) {
  (await getStore()).kvSet(key, String(value ?? ""));
}

async function kvRemove(key) {
  (await getStore()).kvRemove(key);
}

/* Backup automatici: la logica sui file sta in `backupFiles.js`, qui solo il
 * collegamento con i percorsi di Electron e con l'archivio aperto. */

async function createBackup(reason) {
  // Ogni transazione è già su disco al commit: il file si copia così com'è.
  return createBackupFile({
    dbPath: getDbPath(),
    backupsDir: getBackupsDir(),
    reason,
  });
}

async function restoreBackup(fileName) {
  // Lo stato attuale viene salvato prima di essere sovrascritto.
  await createBackup("pre-restore");
  // La connessione va chiusa prima di sovrascrivere il file.
  await closeStore();
  const result = restoreBackupFile({
    dbPath: getDbPath(),
    backupsDir: getBackupsDir(),
    fileName,
  });
  if (!result.ok) return result;
  // Il DB in memoria è ormai disallineato: si riparte dal file ripristinato.
  app.relaunch();
  app.exit(0);
  return { ok: true };
}

async function kvClearAppDottori() {
  (await getStore()).clearAppData();
}

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.js");
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Corioli Cardiologia",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      spellcheck: true,
      preload: preloadPath,
    },
    // public/ non entra nel pacchetto: Vite la copia in dist/, che invece c'è.
    icon: path.join(__dirname, isDev ? "../public/corioli-icon.png" : "../dist/corioli-icon.png"),
    show: false,
    autoHideMenuBar: true,
    // Su Windows la barra del titolo la disegna l'app (`BarraFinestra`),
    // pulsanti riduci/ingrandisci/chiudi compresi. Quelli di Electron
    // (`titleBarOverlay`) sul bianco non si evidenziavano al passaggio del
    // mouse: il fondo lo calcolano dal tema di Windows e col tema scuro
    // viene bianco. Resta il bordo di sistema: ridimensionamento e ombra.
    ...(process.platform === "win32" && { titleBarStyle: "hidden" }),
  });

  // Su Windows Electron reinstalla File/Edit/View/Window/Help se il menu è null
  // alla creazione della finestra. Si toglie dopo, e di nuovo prima del primo paint.
  nascondiMenuDiSistema(mainWindow);

  // Correttore ortografico: italiano e inglese (da impostare subito)
  mainWindow.webContents.session.setSpellCheckerLanguages(["it", "en"]);

  // Menu contestuale: suggerimenti ortografici + Taglia/Copia/Incolla
  mainWindow.webContents.on("context-menu", (_event, params) => {
    const menuTemplate = [];
    const suggestions = params.dictionarySuggestions || [];
    const misspelledWord = params.misspelledWord || "";

    // Suggerimenti correzione ortografica (es. "Sostituisci con 'ciao'")
    if (suggestions.length > 0) {
      suggestions.forEach((word) => {
        menuTemplate.push({
          label: `Sostituisci con "${word}"`,
          click: () => mainWindow.webContents.replaceMisspelling(word),
        });
      });
    }
    if (misspelledWord) {
      menuTemplate.push({
        label: "Aggiungi al dizionario",
        click: () =>
          mainWindow.webContents.session.addWordToSpellCheckerDictionary(
            misspelledWord,
          ),
      });
    }
    if (menuTemplate.length > 0) {
      menuTemplate.push({ type: "separator" });
    }

    if (params.isEditable) {
      menuTemplate.push(
        { label: "Annulla", role: "undo" },
        { label: "Ripristina", role: "redo" },
        { type: "separator" },
        { label: "Taglia", role: "cut" },
        { label: "Copia", role: "copy" },
        { label: "Incolla", role: "paste" },
      );
      // I campi del referto sono aree modificabili (`RefertoTextarea`), gli
      // unici dell'app dove il grassetto esiste: lo applica la pagina.
      if (params.editFlags?.canEditRichly) {
        menuTemplate.push(
          { type: "separator" },
          {
            label: "Grassetto",
            accelerator: "CmdOrCtrl+B",
            registerAccelerator: false,
            click: () => mainWindow.webContents.send("referto:grassetto"),
          },
        );
      }
      menuTemplate.push(
        { type: "separator" },
        { label: "Seleziona tutto", role: "selectAll" },
      );
    } else if (params.selectionText) {
      menuTemplate.push(
        { label: "Copia", role: "copy" },
        { type: "separator" },
        { label: "Seleziona tutto", role: "selectAll" },
      );
    }

    if (menuTemplate.length > 0) {
      const contextMenu = Menu.buildFromTemplate(menuTemplate);
      contextMenu.popup(mainWindow);
    }
  });

  // Carica l'app
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, "../dist/index.html");
    mainWindow.loadFile(indexPath, { hash: "/" });
  }

  mainWindowRef = mainWindow;

  // Il pulsante ingrandisci diventa "ripristina" anche quando la finestra si
  // ingrandisce col doppio clic sulla barra o trascinandola in alto.
  for (const evento of ["maximize", "unmaximize"]) {
    mainWindow.on(evento, () => {
      mainWindow.webContents.send("finestra:ingrandita", mainWindow.isMaximized());
    });
  }

  mainWindow.once("ready-to-show", () => {
    nascondiMenuDiSistema(mainWindow);
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindowRef = null;
    app.quit();
  });

  // Previeni navigazione a file locali - forza uso di React Router
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    if (parsedUrl.protocol === "file:") {
      event.preventDefault();
      console.log("Blocked file navigation to:", navigationUrl);
    }
  });

  // Previeni apertura di nuove finestre
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("Blocked window open to:", url);
    return { action: "deny" };
  });
}

// Apri PDF in app predefinita (es. Chrome) per stampa.
// Il file resta finché l'app è aperta: cancellarlo a tempo lo faceva sparire
// mentre il medico stava ancora stampando.
ipcMain.handle("open-pdf-for-print", async (_event, pdfBase64) => {
  if (!pdfBase64 || typeof pdfBase64 !== "string") return;
  let filePath;
  try {
    filePath = writePrintFile(getPrintDir(), pdfBase64);
  } catch (e) {
    console.error("Errore scrittura PDF di stampa:", e);
    return;
  }
  try {
    const err = await shell.openPath(filePath);
    if (err) console.error("Errore apertura PDF:", err);
  } catch (e) {
    console.error("Errore apertura PDF:", e);
  }
});

// Key-value storage API for renderer (backed by SQLite .db file)
ipcMain.handle("kv:get", async (_event, key) => {
  if (typeof key !== "string") return null;
  try {
    return await kvGet(key);
  } catch (e) {
    console.error("Errore kv:get", e);
    return null;
  }
});

ipcMain.handle("kv:set", async (_event, key, value) => {
  if (typeof key !== "string") return;
  try {
    await kvSet(key, String(value ?? ""));
  } catch (e) {
    console.error("Errore kv:set", e);
  }
});

ipcMain.handle("kv:remove", async (_event, key) => {
  if (typeof key !== "string") return;
  try {
    await kvRemove(key);
  } catch (e) {
    console.error("Errore kv:remove", e);
  }
});

// Record clinici, una riga per record. Gli errori arrivano al renderer:
// un salvataggio fallito non deve sembrare riuscito.
function assertRecordCollection(collection) {
  if (!RECORD_COLLECTIONS.includes(collection)) {
    throw new Error(`Collezione sconosciuta: ${collection}`);
  }
}

ipcMain.handle("records:getAll", async (_event, collection, options) => {
  assertRecordCollection(collection);
  return (await getStore()).getAll(collection, {
    withoutImages: Boolean(options?.withoutImages),
  });
});

ipcMain.handle("records:getById", async (_event, collection, id) => {
  assertRecordCollection(collection);
  if (typeof id !== "string") return null;
  return (await getStore()).getById(collection, id);
});

ipcMain.handle("records:getByPatient", async (_event, collection, patientId) => {
  assertRecordCollection(collection);
  if (typeof patientId !== "string") return [];
  return (await getStore()).getByPatient(collection, patientId);
});

ipcMain.handle("records:count", async (_event, collection) => {
  assertRecordCollection(collection);
  return (await getStore()).count(collection);
});

ipcMain.handle("records:batch", async (_event, ops) => {
  (await getStore()).batch(ops);
});

ipcMain.handle("kv:clearAppDottori", async () => {
  try {
    await kvClearAppDottori();
  } catch (e) {
    console.error("Errore kv:clearAppDottori", e);
  }
});

ipcMain.handle("app:version", () => app.getVersion());

// Pulsanti riduci/ingrandisci/chiudi della barra del titolo (`BarraFinestra`)
const finestraDi = (event) => BrowserWindow.fromWebContents(event.sender);
ipcMain.on("finestra:riduci", (e) => finestraDi(e)?.minimize());
ipcMain.on("finestra:ingrandisci", (e) => {
  const finestra = finestraDi(e);
  if (!finestra) return;
  if (finestra.isMaximized()) finestra.unmaximize();
  else finestra.maximize();
});
ipcMain.on("finestra:chiudi", (e) => finestraDi(e)?.close());
ipcMain.handle("finestra:ingrandita", (e) => finestraDi(e)?.isMaximized() ?? false);

ipcMain.handle("backup:create", async (_event, reason) => createBackup(reason));

ipcMain.handle("backup:list", async () => {
  try {
    return { ok: true, items: listBackupFiles(getBackupsDir()) };
  } catch (e) {
    console.error("Errore backup:list", e);
    return { ok: false, items: [], error: String(e?.message || e) };
  }
});

ipcMain.handle("backup:restore", async (_event, fileName) =>
  restoreBackup(fileName),
);

ipcMain.handle("backup:openFolder", async () => {
  const dir = getBackupsDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const err = await shell.openPath(dir);
    return err ? { ok: false, error: err } : { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

const biometricBridge = {
  checkAvailable: () => checkBiometricAvailable(),
  prompt: () => promptBiometric(mainWindowRef),
};

const appLock = createAppLockHandlers(kvGet, kvSet, biometricBridge);
ipcMain.handle("appLock:status", () => appLock.getStatus());
ipcMain.handle("appLock:setup", (_e, pin) => appLock.setup(pin));
ipcMain.handle("appLock:verifyPin", (_e, pin) => appLock.verifyPin(pin));
ipcMain.handle("appLock:revealRecovery", (_e, pin) => appLock.revealRecovery(pin));
ipcMain.handle("appLock:regenerateRecovery", (_e, pin) =>
  appLock.regenerateRecovery(pin),
);
ipcMain.handle("appLock:changePin", (_e, payload) =>
  appLock.changePin(payload?.currentPin, payload?.newPin),
);
ipcMain.handle("appLock:resetPinWithRecovery", (_e, payload) =>
  appLock.resetPinWithRecovery(payload?.recoveryCode, payload?.newPin),
);
ipcMain.handle("appLock:resetPinWithOnlineGrant", (_e, payload) =>
  appLock.resetPinWithOnlineGrant(
    payload?.clientId,
    payload?.grant,
    payload?.newPin,
  ),
);
ipcMain.handle("appLock:setBiometricEnabled", (_e, payload) =>
  appLock.setBiometricEnabled(payload?.pin, payload?.enabled),
);
ipcMain.handle("appLock:verifyBiometric", () => appLock.verifyBiometric());
ipcMain.handle("appLock:isSessionUnlocked", () => sessionUnlocked);
ipcMain.handle("appLock:setSessionUnlocked", () => {
  sessionUnlocked = true;
});
ipcMain.handle("shell:openExternal", async (_event, url) => {
  if (typeof url !== "string" || !/^(https?:|ms-windows-store:)/i.test(url)) {
    return { ok: false, error: "URL non consentito." };
  }
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    if (process.platform === "win32") {
      spawn("cmd.exe", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }).unref();
      return { ok: true };
    }
    return { ok: false, error: String(err?.message || err) };
  }
});

function nascondiMenuDiSistema(window) {
  // Su macOS il menu sta nella barra dello schermo, non nella finestra, e
  // porta le scorciatoie: senza, Cmd+C / Cmd+V / Cmd+Q non funzionano.
  if (process.platform !== "darwin") Menu.setApplicationMenu(null);
  window.removeMenu();
  window.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  // PDF rimasti da una sessione precedente (crash o chiusura forzata)
  cleanupPrintDir(getPrintDir());
  // e quelli lasciati dalla vecchia cartella di stampa in userData
  cleanupPrintDir(getLegacyPrintDir());
  createWindow();
});

app.on("before-quit", () => {
  cleanupPrintDir(getPrintDir());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
