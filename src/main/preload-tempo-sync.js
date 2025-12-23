const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ preload-tempo-sync.js loaded successfully');

contextBridge.exposeInMainWorld('tempoSyncAPI', {
    /**
     * Sends a message to the main process to start 'synced' playback.
     */
    play: () => ipcRenderer.send('playback:play-synced', { timestamp: performance.timeOrigin + performance.now() }),

    /**
     * ADDED: Sends a message to the main process to pause playback.
     */
    pause: () => ipcRenderer.send('playback:pause', { timestamp: performance.timeOrigin + performance.now() }),

    /**
     * Sends a beat sync message to the main process with the current high-resolution timestamp.
     * @param {number} interpolationDuration - The duration in seconds for tempo interpolation.
     */
    beat: (interpolationDuration) => ipcRenderer.send('playback:sync-beat', {
        timestamp: performance.timeOrigin + performance.now(),
        interpolationDuration
    }),

    /**
     * ADDED: Sends a synced jump signal to the main process.
     */
    jumpBackward: () => ipcRenderer.send('playback:jump-synced', { direction: -1, timestamp: performance.timeOrigin + performance.now() }),
    jumpForward: () => ipcRenderer.send('playback:jump-synced', { direction: 1, timestamp: performance.timeOrigin + performance.now() }),


    /**
     * ADDED: Sends an undo signal to the main process to revert the last beat.
     */
    undo: () => ipcRenderer.send('playback:undo-beat'),

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

