const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ preload-player.js loaded successfully');

contextBridge.exposeInMainWorld('playerAPI', {
    // --- Window Controls ---
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

    // --- Playback Commands (MODIFIED) ---
    loadSong: (song) => ipcRenderer.send('playback:load-song', song),
    unloadSong: () => ipcRenderer.send('playback:unload-song'),
    play: (timestamp) => ipcRenderer.send('playback:play', timestamp),
    pause: (options) => ipcRenderer.send('playback:pause', options), // Now sends an object { timeOverride?, timestamp }
    jumpToTime: (timeInMs, timestamp) => ipcRenderer.send('playback:jump', { timeInMs, timestamp }),
    updateBpm: (bpm, bpmUnit, timestamp) => ipcRenderer.send('playback:update-bpm', { bpm, bpmUnit, timestamp }),

    // --- UNIFIED Playback Event Listener ---
    onPlaybackUpdate: (callback) => ipcRenderer.on('playback:update', (_event, state) => callback(state)),

    // --- File Opening from Main Process ---
    onFileOpen: (callback) => ipcRenderer.on('file:open', (_event, { filePath }) => callback(filePath)),
});