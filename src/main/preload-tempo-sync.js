const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ preload-tempo-sync.js loaded successfully');

contextBridge.exposeInMainWorld('tempoSyncAPI', {
    /**
     * Sends a message to the main process to start 'synced' playback.
     */
    play: () => ipcRenderer.send('playback:play-synced', { timestamp: performance.timeOrigin + performance.now() }),

    /**
     * Sends a beat sync message to the main process with the current high-resolution timestamp.
     * @param {number} interpolationDuration - The duration in seconds for tempo interpolation.
     */
    beat: (interpolationDuration) => ipcRenderer.send('playback:sync-beat', {
        timestamp: performance.timeOrigin + performance.now(),
        interpolationDuration
    }),

    /**
     * ADDED: Listens for playback state updates from the main process.
     * @param {function(object): void} callback - The function to call with the new state.
     */
    onPlaybackUpdate: (callback) => {
        const listener = (_event, state) => callback(state);
        ipcRenderer.on('playback:update', listener);
        // Return a function to remove the listener, good practice for cleanup.
        return () => ipcRenderer.removeListener('playback:update', listener);
    }
});