const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ preload-player.js loaded successfully');

contextBridge.exposeInMainWorld('playerAPI', {
    // --- Window Controls (Restored) ---
    minimizeWindow: () => ipcRenderer.send('minimize-player-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-player-window'),
    closeWindow: () => ipcRenderer.send('close-player-window'),
    goToMainMenu: () => ipcRenderer.send('go-to-main-menu'),
    onWindowStateChange: (callback) => ipcRenderer.on('window-maximized-state', (_event, value) => callback(value)),

    // --- File Operations ---
    openSong: () => ipcRenderer.invoke('dialog:openSong'),
    openProject: (filePath) => ipcRenderer.invoke('project:open', filePath),

    // --- Audience/Display Controls ---
    setPresenterDisplay: (displayId) => ipcRenderer.send('player:set-presenter-display', displayId),
    onDisplaysChanged: (callback) => ipcRenderer.on('displays-changed', (_event, data) => callback(data)),

    // --- Playback Commands ---
    loadSong: (song) => ipcRenderer.send('playback:load-song', song),
    unloadSong: () => ipcRenderer.send('playback:unload-song'),
    play: () => ipcRenderer.send('playback:play'),
    pause: (timeOverride) => ipcRenderer.send('playback:pause', timeOverride),
    jumpToTime: (timeInMs) => ipcRenderer.send('playback:jump', timeInMs),
    updateBpm: (bpm, bpmUnit) => ipcRenderer.send('playback:update-bpm', { bpm, bpmUnit }),

    // --- Unified Playback Event Listener ---
    onSongLoaded: (callback) => ipcRenderer.on('playback:load', (_event, event) => callback(event)),
    onSongUnloaded: (callback) => ipcRenderer.on('playback:unload', (_event, event) => callback(event)),
    onPlaybackEvent: (callback) => ipcRenderer.on('playback:event', (_event, event) => callback(event)),

    // --- MODIFIED: File Opening from Main Process ---
    onFileOpen: (callback) => ipcRenderer.on('file:open', (_event, { filePath }) => callback(filePath)),
});
