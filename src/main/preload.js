const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ preload.js loaded successfully');

contextBridge.exposeInMainWorld('electronAPI', {
    openEditor: () => ipcRenderer.send('open-editor-window'),
    openPlayer: () => ipcRenderer.send('open-player-window'),
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    onWindowStateChange: (callback) => ipcRenderer.on('window-maximized-state', (_event, value) => callback(value)),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // --- ADDED: Updater API ---
    onUpdateAvailable: (callback) => ipcRenderer.on('updater:update-available', (_event, info) => callback(info)),
    onDownloadProgress: (callback) => ipcRenderer.on('updater:download-progress', (_event, progress) => callback(progress)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('updater:update-downloaded', (_event, info) => callback(info)),
    onUpdaterError: (callback) => ipcRenderer.on('updater:error', (_event, err) => callback(err)),
    startDownload: () => ipcRenderer.send('updater:start-download'),
    quitAndInstall: () => ipcRenderer.send('updater:quit-and-install'),
});