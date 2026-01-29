const { contextBridge, ipcRenderer } = require('electron');

console.log('✅ preload-player.js loaded successfully');

contextBridge.exposeInMainWorld('playerAPI', {
    minimizeWindow: () => ipcRenderer.send('minimize-player-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-player-window'),
    closeWindow: () => ipcRenderer.send('close-player-window'),
    goToMainMenu: () => ipcRenderer.send('go-to-main-menu'),
    onWindowStateChange: (callback) => ipcRenderer.on('window-maximized-state', (_event, value) => callback(value)),
    
    openTempoSync: () => ipcRenderer.send('player:open-tempo-sync'),
    openSong: () => ipcRenderer.invoke('dialog:openSong'),
    openProject: (filePath) => ipcRenderer.invoke('project:open', filePath),
    
    setPresenterDisplay: (displayId) => ipcRenderer.send('player:set-presenter-display', displayId),
    // MODIFIED: Global latency setter
    setGlobalLatency: (latency) => ipcRenderer.send('player:set-global-latency', latency),
    onDisplaysChanged: (callback) => ipcRenderer.on('displays-changed', (_event, data) => callback(data)),
    
    loadSong: (data) => ipcRenderer.send('playback:load-song', data),
    unloadSong: () => ipcRenderer.send('playback:unload-song'),
    play: (timestamp) => ipcRenderer.send('playback:play', timestamp),
    pause: (options) => ipcRenderer.send('playback:pause', options),
    jumpToTime: (timeInMs, timestamp) => ipcRenderer.send('playback:jump', { timeInMs, timestamp }),
    updateBpm: (bpm, bpmUnit, timestamp) => ipcRenderer.send('playback:update-bpm', { bpm, bpmUnit, timestamp }),
    
    onPlaybackUpdate: (callback) => ipcRenderer.on('playback:update', (_event, state) => callback(state)),
    onFileOpen: (callback) => ipcRenderer.on('file:open', (_event, { filePath }) => callback(filePath)),
    
    sendPlaylistUpdate: (data) => ipcRenderer.send('playlist:updated', data),
    onPlaylistRequestSync: (callback) => ipcRenderer.on('playlist:request-sync', (_event) => callback()),
    onSongSelectRequest: (callback) => ipcRenderer.on('playlist:select-song', (_event, songId) => callback(songId)),
    sendSongLoadError: (msg) => ipcRenderer.send('player:song-load-error', msg),
    
    onDeviceUpdate: (callback) => ipcRenderer.on('device-controller:device-list-update', (_event, devices) => callback(devices)),
    onInfoUpdate: (callback) => ipcRenderer.on('device-controller:info-update', (_event, device) => callback(device)),
    onPairingRequest: (callback) => ipcRenderer.on('device-controller:pairing-request', (_event, data) => callback(data)),
    onConnectionSuccess: (callback) => ipcRenderer.on('device-controller:connection-success', (_event, device) => callback(device)),
    onDisconnect: (callback) => ipcRenderer.on('device-controller:disconnect', (_event, payload) => callback(payload)),
    onError: (callback) => ipcRenderer.on('device-controller:error', (_event, message) => callback(message)),
    onRttUpdate: (callback) => ipcRenderer.on('device-controller:rtt-update', (_event, stats) => callback(stats)),
    setAutoAccept: (enabled) => ipcRenderer.send('device-controller:set-auto-accept', enabled),
    
    initiatePairing: (deviceId) => ipcRenderer.send('device-controller:initiate-pairing', deviceId),
    cancelPairing: (deviceId) => ipcRenderer.send('device-controller:cancel-pairing', deviceId),
    respondToPairing: (deviceId, accepted) => ipcRenderer.send('device-controller:respond-to-pairing', { deviceId, accepted }),
    disconnectDevice: () => ipcRenderer.send('device-controller:disconnect-device'),
    readyForDevices: () => ipcRenderer.send('player:ready-for-devices'),

    // --- NEW: Mirror/Role API ---
    onSetRole: (callback) => ipcRenderer.on('window:set-role', (_event, data) => callback(data)),
});

