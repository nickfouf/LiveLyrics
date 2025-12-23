const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ preload-audience.js loaded successfully');

const createSafeListener = (channel, callback) => {
    if (typeof callback !== 'function') {
        console.error(`[preload-audience] Error: Attempted to register a non-function callback for the "${channel}" channel.`);
        return;
    }
    const ipcListener = (_event, ...args) => {
        try {
            callback(...args);
        } catch (error) {
            console.error(`[preload-audience] An error occurred in the callback for the "${channel}" channel.`);
            console.error('Error:', error);
            console.error('Data received:', ...args);
        }
    };
    ipcRenderer.on(channel, ipcListener);
    return () => {
        ipcRenderer.removeListener(channel, ipcListener);
    };
};

contextBridge.exposeInMainWorld('audienceAPI', {
    // REMOVED: onPlaybackSync is no longer needed.
    
    // --- UNIFIED Playback Event Listener ---
    /**
     * Listens for all playback state changes from the main process.
     * @param {function(object): void} callback - The function to call with the new state.
     * The state object has the shape: { status, type, song, timeAtReference, referenceTime, syncTime }
     */
    onPlaybackUpdate: (callback) => createSafeListener('playback:update', callback),

    // --- File Operations ---
    openProject: (filePath) => ipcRenderer.invoke('project:open', filePath),
});

