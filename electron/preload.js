const { contextBridge, ipcRenderer } = require('electron');

// Espone API sicure al renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Funzioni per export/import dati
  exportData: () => ipcRenderer.send('export-data'),
  importData: () => ipcRenderer.send('import-data'),

  // Apri PDF in app predefinita per stampa (salva in temp e apre con Chrome/altro)
  openPdfForPrint: (pdfBase64) => ipcRenderer.invoke('open-pdf-for-print', pdfBase64),

  // Storage key-value (SQLite .db)
  kvGet: (key) => ipcRenderer.invoke('kv:get', key),
  kvSet: (key, value) => ipcRenderer.invoke('kv:set', key, value),
  kvRemove: (key) => ipcRenderer.invoke('kv:remove', key),
  kvClearAppDottori: () => ipcRenderer.invoke('kv:clearAppDottori'),

  // Listener per eventi
  onExportData: (callback) => ipcRenderer.on('export-data', callback),
  onImportData: (callback) => ipcRenderer.on('import-data', callback),

  // Rimuovi listener
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // Pulsanti riduci/ingrandisci/chiudi della barra del titolo (`BarraFinestra`).
  // Solo su Windows: altrove la barra del titolo e' quella di sistema.
  finestra:
    process.platform === 'win32'
      ? {
          riduci: () => ipcRenderer.send('finestra:riduci'),
          ingrandisci: () => ipcRenderer.send('finestra:ingrandisci'),
          chiudi: () => ipcRenderer.send('finestra:chiudi'),
          ingrandita: () => ipcRenderer.invoke('finestra:ingrandita'),
          onIngrandita: (callback) => {
            const ascolta = (_event, ingrandita) => callback(ingrandita);
            ipcRenderer.on('finestra:ingrandita', ascolta);
            return () => ipcRenderer.removeListener('finestra:ingrandita', ascolta);
          },
        }
      : undefined,

  // "Grassetto" scelto nel menu del tasto destro sul referto (electron/main.js)
  onGrassettoReferto: (callback) => {
    const ascolta = () => callback();
    ipcRenderer.on('referto:grassetto', ascolta);
    return () => ipcRenderer.removeListener('referto:grassetto', ascolta);
  },

  // Backup automatici (copie del file SQLite in userData/backups)
  backupCreate: (reason) => ipcRenderer.invoke('backup:create', reason),
  backupList: () => ipcRenderer.invoke('backup:list'),
  backupRestore: (fileName) => ipcRenderer.invoke('backup:restore', fileName),
  backupOpenFolder: () => ipcRenderer.invoke('backup:openFolder'),

  appLockStatus: () => ipcRenderer.invoke('appLock:status'),
  appLockSetup: (pin) => ipcRenderer.invoke('appLock:setup', pin),
  appLockVerifyPin: (pin) => ipcRenderer.invoke('appLock:verifyPin', pin),
  appLockRevealRecovery: (pin) => ipcRenderer.invoke('appLock:revealRecovery', pin),
  appLockRegenerateRecovery: (pin) => ipcRenderer.invoke('appLock:regenerateRecovery', pin),
  appLockChangePin: (payload) => ipcRenderer.invoke('appLock:changePin', payload),
  appLockResetPinWithRecovery: (payload) =>
    ipcRenderer.invoke('appLock:resetPinWithRecovery', payload),
  appLockResetPinWithOnlineGrant: (payload) =>
    ipcRenderer.invoke('appLock:resetPinWithOnlineGrant', payload),
  appLockSetBiometricEnabled: (payload) =>
    ipcRenderer.invoke('appLock:setBiometricEnabled', payload),
  appLockVerifyBiometric: () => ipcRenderer.invoke('appLock:verifyBiometric'),
  appLockIsSessionUnlocked: () => ipcRenderer.invoke('appLock:isSessionUnlocked'),
  appLockSetSessionUnlocked: () => ipcRenderer.invoke('appLock:setSessionUnlocked'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});