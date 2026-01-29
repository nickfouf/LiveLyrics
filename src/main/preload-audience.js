const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ preload-audience.js loaded successfully');

const createSafeListener = (channel, callback) => {
    if (typeof callback !== 'function') return;
    const ipcListener = (_event, ...args) => {
        try { callback(...args); } catch (error) { console.error(`Error in ${channel}:`, error); }
    };
    ipcRenderer.on(channel, ipcListener);
    return () => ipcRenderer.removeListener(channel, ipcListener);
};

contextBridge.exposeInMainWorld('audienceAPI', {
    onPlaybackUpdate: (callback) => createSafeListener('playback:update', callback),
    openProject: (filePath) => ipcRenderer.invoke('project:open', filePath),
    // --- NEW: Mirror/Role API ---
    onSetRole: (callback) => createSafeListener('window:set-role', callback),
});

