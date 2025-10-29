const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ preload-editor.js loaded successfully');

contextBridge.exposeInMainWorld('editorAPI', {
    // Window Controls
    minimizeWindow: () => ipcRenderer.send('minimize-editor-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-editor-window'),
    closeWindow: () => ipcRenderer.send('close-editor-window'),
    goToMainMenu: () => ipcRenderer.send('go-to-main-menu'),
    setTitle: (title) => ipcRenderer.send('set-editor-title', title),
    onWindowStateChange: (callback) => ipcRenderer.on('editor-window-maximized-state', (_event, value) => callback(value)),

    // Project & File Operations
    initTempFolder: () => ipcRenderer.invoke('project:init-temp-folder'),
    cancelFileCopy: () => ipcRenderer.send('project:cancel-copy'),
    openSong: () => ipcRenderer.invoke('dialog:openSong'),
    showOpenDialog: (options) => ipcRenderer.invoke('dialog:showOpenDialog', options),
    showSaveAsDialog: (options) => ipcRenderer.invoke('dialog:showSaveAsDialog', options),
    addAsset: (filePath) => ipcRenderer.invoke('project:addAsset', filePath),
    getSystemFonts: () => ipcRenderer.invoke('get-system-fonts'),
    cleanUnusedAssets: (usedAssets) => ipcRenderer.invoke('project:cleanUnusedAssets'),
    saveProject: (filePath, data) => ipcRenderer.invoke('project:save', filePath, data),
    openProject: (filePath) => ipcRenderer.invoke('project:open', filePath),
    onFileOpen: (callback) => ipcRenderer.on('file:open', (_event, { filePath }) => callback(filePath)),
    notifyReady: () => ipcRenderer.send('editor:ready'),
});