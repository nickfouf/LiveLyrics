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
    // For the initial state dump when a window opens
    onPlaybackSync: (callback) => createSafeListener('playback:sync', callback),
    
    // Dedicated listeners for major state changes
    onSongLoaded: (callback) => createSafeListener('playback:load', callback),
    onSongUnloaded: (callback) => createSafeListener('playback:unload', callback),

    // A single, unified channel for all subsequent timestamped events
    onPlaybackEvent: (callback) => createSafeListener('playback:event', callback),
});