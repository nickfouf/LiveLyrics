const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ preload-player.js loaded successfully');

contextBridge.exposeInMainWorld('playerAPI', {
    // --- Window Controls ---
    minimizeWindow: () => ipcRenderer.send('minimize-player-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-player-window'),
    closeWindow: () => ipcRenderer.send('close-player-window'),
    goToMainMenu: () => ipcRenderer.send('go-to-main-menu'),
    onWindowStateChange: (callback) => ipcRenderer.on('window-maximized-state', (_event, value) => callback(value)),

    // --- NEW: Tempo Sync Control ---
    openTempoSync: () => ipcRenderer.send('player:open-tempo-sync'),

    // --- File Operations ---
    openSong: () => ipcRenderer.invoke('dialog:openSong'),
    openProject: (filePath) => ipcRenderer.invoke('project:open', filePath),

    // --- Audience/Display Controls ---
    setPresenterDisplay: (displayId) => ipcRenderer.send('player:set-presenter-display', displayId),
    setLatency: (displayId, latency) => ipcRenderer.send('player:set-latency', { displayId, latency }),
    onDisplaysChanged: (callback) => ipcRenderer.on('displays-changed', (_event, data) => callback(data)),

    // --- Playback Commands (MODIFIED) ---
    // MODIFIED: Now sends an object containing both metadata and the measure map.
    loadSong: (data) => ipcRenderer.send('playback:load-song', data),
    unloadSong: () => ipcRenderer.send('playback:unload-song'),
    play: (timestamp) => ipcRenderer.send('playback:play', timestamp),
    pause: (options) => ipcRenderer.send('playback:pause', options), // Now sends an object { timeOverride?, timestamp }
    jumpToTime: (timeInMs, timestamp) => ipcRenderer.send('playback:jump', { timeInMs, timestamp }),
    updateBpm: (bpm, bpmUnit, timestamp) => ipcRenderer.send('playback:update-bpm', { bpm, bpmUnit, timestamp }),

    // --- UNIFIED Playback Event Listener ---
    /**
     * Listens for all playback state changes from the main process.
     * @param {function(object): void} callback - The function to call with the new state.
     * The state object has the shape: { status, type, song, timeAtReference, referenceTime, syncTime }
     */
    onPlaybackUpdate: (callback) => ipcRenderer.on('playback:update', (_event, state) => callback(state)),

    // --- File Opening from Main Process ---
    onFileOpen: (callback) => ipcRenderer.on('file:open', (_event, { filePath }) => callback(filePath)),

    // --- ADDED: Playlist Sync API ---
    sendPlaylistUpdate: (data) => ipcRenderer.send('playlist:updated', data),
    onPlaylistRequestSync: (callback) => ipcRenderer.on('playlist:request-sync', (_event) => callback()),
    onSongSelectRequest: (callback) => ipcRenderer.on('playlist:select-song', (_event, songId) => callback(songId)),
    // ADDED: Error Reporting to Remote
    sendSongLoadError: (errorMessage) => ipcRenderer.send('player:song-load-error', errorMessage),

    // --- ADDED: Device Controller API ---
    onDeviceUpdate: (callback) => ipcRenderer.on('device-controller:device-list-update', (_event, devices) => callback(devices)),
    onInfoUpdate: (callback) => ipcRenderer.on('device-controller:info-update', (_event, device) => callback(device)),
    onPairingRequest: (callback) => ipcRenderer.on('device-controller:pairing-request', (_event, data) => callback(data)),
    onConnectionSuccess: (callback) => ipcRenderer.on('device-controller:connection-success', (_event, device) => callback(device)),
    onDisconnect: (callback) => ipcRenderer.on('device-controller:disconnect', (_event, payload) => callback(payload)),
    onError: (callback) => ipcRenderer.on('device-controller:error', (_event, message) => callback(message)),
    // NEW: Listener for RTT updates.
    onRttUpdate: (callback) => ipcRenderer.on('device-controller:rtt-update', (_event, stats) => callback(stats)),
    
    // ADDED: Send auto-accept preference
    setAutoAccept: (enabled) => ipcRenderer.send('device-controller:set-auto-accept', enabled),

    initiatePairing: (deviceId) => ipcRenderer.send('device-controller:initiate-pairing', deviceId),
    cancelPairing: (deviceId) => ipcRenderer.send('device-controller:cancel-pairing', deviceId),
    respondToPairing: (deviceId, accepted) => ipcRenderer.send('device-controller:respond-to-pairing', { deviceId, accepted }),
    disconnectDevice: () => ipcRenderer.send('device-controller:disconnect-device'),
    readyForDevices: () => ipcRenderer.send('player:ready-for-devices'),
});



