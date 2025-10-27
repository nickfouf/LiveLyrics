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
});