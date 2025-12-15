const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');
const fs = require('fs');
const url = require('url');
const SystemFonts = require('dnm-font-manager').default;
const systemFonts = new SystemFonts();
const crypto = require('crypto');
const archiver = require('archiver');
const extract = require('extract-zip');
const { PlaybackManager } = require('./playbackManager');
const { performance } = require('perf_hooks');
const { ConnectionManager } = require('./connectionManager');
const { machineIdSync } = require('node-machine-id');
const os = require('os');

// --- ADDED: Robust Updater Logging and Configuration ---
// This will create a log file in the app's user data directory
log.transports.file.resolvePath = () => path.join(app.getPath('userData'), 'logs', 'main.log');
log.transports.file.level = 'info';
autoUpdater.logger = log;

// We will manually trigger the download based on user action
autoUpdater.autoDownload = false;
log.info('App starting...');

// Define the path for the temporary project folder
const projectTempPath = path.join(app.getPath('temp'), 'live-lyrics-project');
// ADDED: Define the path for the assets subfolder
const assetsTempPath = path.join(projectTempPath, 'assets');

// ADDED: State for managing cancellable file copy operations
let currentCopyOperation = { cancel: () => {} };

// --- ADDED: File path to open on launch ---
let filePathToOpen = null;


let mainWindow;
let editorWindow;
let playerWindow;
let tempoSyncWindow; // ADDED: Reference for the new Tempo Sync window
// MODIFIED: Use a Map to track multiple audience windows by their display ID.
let audienceWindows = new Map();
// ADDED: Map to store latency per display ID
let displayLatencies = new Map();
// ADDED: Create the central conductor
let playbackManager;
let connectionManager = null;

/**
 * Compares two semantic version strings.
 * @param {string} v1 - The first version string (e.g., "1.2.0").
 * @param {string} v2 - The second version string (e.g., "1.10.0").
 * @returns {number} 1 if v1 > v2, -1 if v1 < v2, 0 if v1 === v2.
 */
function compareVersions(v1, v2) {
    if (!v1 || !v2) {
        return 0;
    }
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    const len = Math.max(parts1.length, parts2.length);

    for (let i = 0; i < len; i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
}

/**
 * Sends an updated list of displays to the player window.
 * It correctly identifies which display the player window is currently on.
 */
function sendDisplaysUpdate() {
    if (playerWindow && !playerWindow.isDestroyed()) {
        const allDisplays = screen.getAllDisplays();
        // Find the display the player window is currently on to use as the reference "internal" display.
        const playerBounds = playerWindow.getBounds();
        const presenterDisplay = screen.getDisplayMatching(playerBounds) || screen.getPrimaryDisplay();

        playerWindow.webContents.send('displays-changed', { allDisplays, presenterDisplay });
    }
}

function createMainWindow() {
    const preloadScriptPath = path.join(app.getAppPath(), 'src', 'main', 'preload.js');
    const htmlPath = path.join(app.getAppPath(), 'src', 'renderer', 'html', 'index.html');
    const iconPath = path.join(app.getAppPath(), 'src', 'renderer', 'assets', 'icon.ico');

    console.log(`[Main] Loading mainWindow. Preload path: ${preloadScriptPath}`);
    console.log(`[Main] Loading mainWindow. HTML path: ${htmlPath}`);

    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 500,
        minHeight: 400,
        frame: false,
        icon: iconPath,
        webPreferences: {
            preload: preloadScriptPath,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadFile(htmlPath);

    // MODIFIED: Check for updates after the window content has fully loaded
    mainWindow.webContents.on('did-finish-load', () => {
        log.info('Main window finished loading. Checking for updates.');
        // Don't check for updates in development
        if (!app.isPackaged) {
            log.info('Skipping update check in development mode.');
            return;
        }
        autoUpdater.checkForUpdates().catch(err => {
            log.error('Error in checkForUpdates:', err);
        });
    });

    const sendMaximizedState = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window-maximized-state', mainWindow.isMaximized());
        }
    }
    mainWindow.on('maximize', sendMaximizedState);
    mainWindow.on('unmaximize', sendMaximizedState);
    mainWindow.on('closed', () => { mainWindow = null; });
}

function createEditorWindow() {
    const preloadScriptPath = path.join(app.getAppPath(), 'src', 'main', 'preload-editor.js');
    const htmlPath = path.join(app.getAppPath(), 'src', 'renderer', 'html', 'editor.html');
    const iconPath = path.join(app.getAppPath(), 'src', 'renderer', 'assets', 'icon.ico');

    console.log(`[Main] Loading editorWindow. Preload path: ${preloadScriptPath}`);

    editorWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 1150,
        minHeight: 700,
        frame: false,
        icon: iconPath,
        webPreferences: {
            preload: preloadScriptPath,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    editorWindow.loadFile(htmlPath);

    const sendMaximizedState = () => {
        if (editorWindow && !editorWindow.isDestroyed()) {
            editorWindow.webContents.send('editor-window-maximized-state', editorWindow.isMaximized());
        }
    };
    editorWindow.on('maximize', sendMaximizedState);
    editorWindow.on('unmaximize', sendMaximizedState);
    editorWindow.on('closed', () => { editorWindow = null; });
    editorWindow.maximize();
}

/**
 * ADDED: Creates the new Tempo Sync window.
 * This window provides controls for the 'synced' playback mode.
 */
function createTempoSyncWindow() {
    const preloadScriptPath = path.join(app.getAppPath(), 'src', 'main', 'preload-tempo-sync.js');
    const htmlPath = path.join(app.getAppPath(), 'src', 'renderer', 'html', 'tempo-sync.html');

    console.log(`[Main] Loading tempoSyncWindow. Preload path: ${preloadScriptPath}`);

    tempoSyncWindow = new BrowserWindow({
        width: 400,
        height: 450, // Increased height for the new button
        title: 'Tempo Sync',
        autoHideMenuBar: true,
        webPreferences: {
            preload: preloadScriptPath,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    tempoSyncWindow.loadFile(htmlPath);

    tempoSyncWindow.on('closed', () => {
        tempoSyncWindow = null;
    });
}

function createPlayerWindow() {
    const preloadScriptPath = path.join(app.getAppPath(), 'src', 'main', 'preload-player.js');
    const htmlPath = path.join(app.getAppPath(), 'src', 'renderer', 'html', 'player.html');
    const iconPath = path.join(app.getAppPath(), 'src', 'renderer', 'assets', 'icon.ico');

    console.log(`[Main] Loading playerWindow. Preload path: ${preloadScriptPath}`);

    playerWindow = new BrowserWindow({
        width: 1300,
        height: 800,
        minWidth: 1300,
        minHeight: 800,
        frame: false,
        title: 'Player',
        icon: iconPath,
        webPreferences: {
            preload: preloadScriptPath,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    playerWindow.loadFile(htmlPath);

    // ADDED: Create the tempo sync window alongside the player
    createTempoSyncWindow();

    if (connectionManager) {
        connectionManager.start();
    }

    playerWindow.webContents.on('did-finish-load', () => {
        sendDisplaysUpdate();
        updateAudienceWindows();
    });

    const sendMaximizedState = () => {
        if (playerWindow && !playerWindow.isDestroyed()) {
            playerWindow.webContents.send('window-maximized-state', playerWindow.isMaximized());
        }
    };
    playerWindow.on('maximize', sendMaximizedState);
    playerWindow.on('unmaximize', sendMaximizedState);
    playerWindow.on('closed', () => {
        for (const window of audienceWindows.values()) {
            window.close();
        }
        // ADDED: Close the tempo sync window when the player closes
        if (tempoSyncWindow && !tempoSyncWindow.isDestroyed()) {
            tempoSyncWindow.close();
        }
        playerWindow = null;
        if (connectionManager) {
            connectionManager.stop();
        }
    });

    playerWindow.on('move', () => {
        updateAudienceWindows();
        sendDisplaysUpdate();
    });
}


function createAudienceWindow(display) {
    const preloadScriptPath = path.join(app.getAppPath(), 'src', 'main', 'preload-audience.js');
    const htmlPath = path.join(app.getAppPath(), 'src', 'renderer', 'html', 'audience.html');

    const audienceWindow = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        fullscreen: true,
        frame: false,
        webPreferences: {
            preload: preloadScriptPath,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    audienceWindow.loadFile(htmlPath);

    audienceWindow.webContents.on('did-finish-load', () => {
        if (playbackManager) {
            // Get the complete, authoritative current state from the manager.
            const syncState = playbackManager.getCurrentSyncState();
            // If a song is loaded/playing/paused, send the state to the new window.
            if (syncState.status !== 'unloaded') {
                console.log(`[Main] Syncing new audience window on display ${display.id}.`);
                // Send the state on the SAME unified channel all windows use.
                // MODIFIED: The broadcast function now handles adding latency, so we call it directly.
                const latency = displayLatencies.get(display.id) || 0;
                const stateForWindow = { ...syncState, latency };
                audienceWindow.webContents.send('playback:update', stateForWindow);
            }
        }
    });

    audienceWindow.on('closed', () => {
        audienceWindows.delete(display.id);
    });

    audienceWindows.set(display.id, audienceWindow);
}

function updateAudienceWindows() {
    if (!playerWindow) return;

    const allDisplays = screen.getAllDisplays();
    const playerBounds = playerWindow.getBounds();
    const presenterDisplay = screen.getDisplayMatching(playerBounds) || screen.getPrimaryDisplay();

    const audienceDisplayIds = new Set(allDisplays.filter(d => d.id !== presenterDisplay.id).map(d => d.id));
    const openWindowIds = new Set(audienceWindows.keys());

    for (const displayId of openWindowIds) {
        if (!audienceDisplayIds.has(displayId)) {
            audienceWindows.get(displayId)?.close();
        }
    }

    for (const displayId of audienceDisplayIds) {
        if (!openWindowIds.has(displayId)) {
            const display = allDisplays.find(d => d.id === displayId);
            if (display) createAudienceWindow(display);
        }
    }
}


// --- App & IPC Logic ---
app.whenReady().then(() => {
    const broadcastToAllWindows = (channel, ...args) => {
        // The state object from PlaybackManager is the first argument.
        const stateObject = args[0];

        // --- Player Window ---
        if (playerWindow && !playerWindow.isDestroyed()) {
            const playerBounds = playerWindow.getBounds();
            const display = screen.getDisplayMatching(playerBounds) || screen.getPrimaryDisplay();
            const latency = displayLatencies.get(display.id) || 0;
            const stateForWindow = { ...stateObject, latency };
            playerWindow.webContents.send(channel, stateForWindow);
        }

        // --- Audience Windows ---
        for (const [displayId, window] of audienceWindows.entries()) {
            if (window && !window.isDestroyed()) {
                const latency = displayLatencies.get(displayId) || 0;
                const stateForWindow = { ...stateObject, latency };
                window.webContents.send(channel, stateForWindow);
            }
        }

        // --- Tempo Sync Window (no display, so latency is 0) ---
        if (tempoSyncWindow && !tempoSyncWindow.isDestroyed()) {
            const stateForWindow = { ...stateObject, latency: 0 };
            tempoSyncWindow.webContents.send(channel, stateForWindow);
        }

        // --- Send to connected Android device ---
        if (connectionManager) {
            connectionManager.sendMessageToPairedDevice({
                type: 'playbackUpdate',
                payload: stateObject
            });
        }
    };

    playbackManager = new PlaybackManager(broadcastToAllWindows);

    // --- REVISED: Device Controller Integration ---
    const pairingRequests = new Map();
    const discoverableDevices = new Map(); // State for discoverable devices

    // MODIFICATION: This function now handles latency compensation.
    const handleRemoteCommand = (command, remoteIp) => {
        if (!command || typeof command !== 'object' || !playbackManager) return;
        console.log(`[Main] Handling remote command from ${remoteIp}:`, command);
    
        // --- ADDED: Latency Compensation ---
        const rttStats = connectionManager.getRttStats();
        const stats = rttStats.get(remoteIp);
        const avgRtt = stats ? stats.average : 0;
        const latency = avgRtt / 2; // One-way latency
        const timestamp = (performance.timeOrigin + performance.now()) - latency;
        // --- END: Latency Compensation ---
    
        switch (command.type) {
            case 'play':
                playbackManager.play(timestamp); // FIX: Default to 'normal' playback
                break;
            case 'play-synced':
                playbackManager.play(timestamp, 'synced');
                break;
            case 'pause':
                playbackManager.pause({ timestamp });
                break;
            case 'beat':
                const duration = command.interpolationDuration || 0.3;
                playbackManager.syncBeat(timestamp, duration);
                break;
            case 'jump-backward':
                playbackManager.jumpSynced(-1, timestamp);
                break;
            case 'jump-forward':
                playbackManager.jumpSynced(1, timestamp);
                break;
            case 'undo':
                playbackManager.undoBeat();
                break;
            case 'jump-to-start':
                playbackManager.jump(0, timestamp);
                break;
            case 'jump':
                playbackManager.jump(command.timeInMs, timestamp);
                break;
            default:
                console.warn(`[Main] Received unknown remote command: ${command.type}`);
        }
    };

    try {
        const uniqueId = machineIdSync();
        connectionManager = new ConnectionManager({
            clientType: 'main',
            deviceId: `LiveLyrics-Presenter-${uniqueId}`,
            deviceName: os.hostname()
        });

        const broadcastDeviceList = () => {
            if (playerWindow && !playerWindow.isDestroyed()) {
                const deviceList = Array.from(discoverableDevices.values());
                playerWindow.webContents.send('device-controller:device-list-update', deviceList);
            }
        };

        connectionManager.on('discoverableDeviceFound', (deviceInfo) => {
            if (!discoverableDevices.has(deviceInfo.deviceId)) {
                discoverableDevices.set(deviceInfo.deviceId, deviceInfo);
                broadcastDeviceList();
            }
        });

        connectionManager.on('discoverableDeviceLost', (deviceInfo) => {
            if (discoverableDevices.has(deviceInfo.deviceId)) {
                discoverableDevices.delete(deviceInfo.deviceId);
                broadcastDeviceList();
            }
        });

        connectionManager.on('pairingRequest', (device, accept, reject) => {
            console.log(`[Main] Incoming pairing request from ${device.deviceName} (${device.deviceId}). Asking UI.`);
            pairingRequests.set(device.deviceId, { accept, reject });
            if (playerWindow && !playerWindow.isDestroyed()) {
                playerWindow.webContents.send('device-controller:pairing-request', { deviceId: device.deviceId, deviceName: device.deviceName });
            }
        });

        connectionManager.on('songSelectionRequest', (songId) => {
            if (playerWindow && !playerWindow.isDestroyed()) {
                playerWindow.webContents.send('playlist:select-song', songId);
            }
        });

        connectionManager.on('remoteBpmUpdate', ({ bpm, bpmUnit }) => {
            if (playbackManager) {
                const timestamp = performance.timeOrigin + performance.now();
                playbackManager.updateBpm(bpm, bpmUnit, timestamp);
            }
        });

        // MODIFICATION: The listener now accepts `remoteIp`.
        connectionManager.on('remoteCommand', (command, remoteIp) => {
            handleRemoteCommand(command, remoteIp);
        });

        connectionManager.on('deviceConnected', (device) => {
            console.log(`[Main] Device fully connected: ${device.deviceName} (${device.deviceId})`);
            if (playerWindow && !playerWindow.isDestroyed()) {
                const remoteInfo = { id: device.deviceId, name: device.deviceName, type: device.deviceType, ips: device.getRemoteAdvertisedIps() };
                playerWindow.webContents.send('device-controller:connection-success', remoteInfo);
                // Request the current playlist from the player window to sync the new device
                playerWindow.webContents.send('playlist:request-sync');
            }
            // ADDED: Send current song data on connect
            if (playbackManager) {
                const currentSongData = playbackManager.getCurrentSongData();
                const currentSyncState = playbackManager.getCurrentSyncState();
                if (currentSongData && currentSyncState.song) {
                    console.log('[Main] Sending current song data and playback state to newly connected device.');
                    // MODIFIED: Send hint message first
                    connectionManager.sendMessageToPairedDevice({
                        type: 'songUpdateHint',
                        payload: { title: currentSyncState.song.title }
                    });
                    connectionManager.sendMessageToPairedDevice({
                        type: 'songUpdate',
                        payload: currentSongData
                    });
                    // Also send the current playback state
                    connectionManager.sendMessageToPairedDevice({
                        type: 'playbackUpdate',
                        payload: currentSyncState
                    });
                }
            }
            
            device.on('infoUpdated', (updatedDevice) => {
                if (playerWindow && !playerWindow.isDestroyed()) {
                    const updatedInfo = { id: updatedDevice.deviceId, name: updatedDevice.deviceName, type: updatedDevice.deviceType, ips: updatedDevice.getRemoteAdvertisedIps() };
                    playerWindow.webContents.send('device-controller:info-update', updatedInfo);
                }
            });
        });

        connectionManager.on('deviceDisconnected', (device, payload) => {
            console.log(`[Main] Device disconnected: ${device.deviceId}, Reason: ${payload.reason}`);
            if (playerWindow && !playerWindow.isDestroyed()) {
                playerWindow.webContents.send('device-controller:disconnect', payload);
            }
        });

        connectionManager.on('pairingFailed', ({ deviceId, reason }) => {
            console.log(`[Main] Pairing failed with ${deviceId}: ${reason}`);
            if (playerWindow && !playerWindow.isDestroyed()) {
                playerWindow.webContents.send('device-controller:error', `Pairing with ${deviceId} failed: ${reason}`);
            }
        });

        connectionManager.on('error', (err) => {
            console.error('[ConnectionManager] Error:', err);
            if (playerWindow && !playerWindow.isDestroyed()) {
                playerWindow.webContents.send('device-controller:error', err.message);
            }
        });

        ipcMain.on('device-controller:initiate-pairing', (event, deviceId) => connectionManager.pairWithDevice(deviceId));
        ipcMain.on('device-controller:cancel-pairing', (event, deviceId) => connectionManager.cancelPairing(deviceId));
        ipcMain.on('device-controller:respond-to-pairing', (event, { deviceId, accepted }) => {
            const callbacks = pairingRequests.get(deviceId);
            if (callbacks) {
                if (accepted) callbacks.accept();
                else callbacks.reject();
                pairingRequests.delete(deviceId);
            }
        });
        ipcMain.on('device-controller:disconnect-device', () => {
            if (connectionManager) {
                connectionManager.disconnectFromPairedDevice();
            }
        });
        ipcMain.on('player:ready-for-devices', () => broadcastDeviceList());

    } catch (error) {
        log.error('Failed to initialize ConnectionManager:', error);
    }
    // --- END: Device Controller Integration ---


    // --- IPC handler for latency updates ---
    // MOVED here to have access to playbackManager and broadcastToAllWindows
    ipcMain.on('player:set-latency', (event, { displayId, latency }) => {
        const parsedLatency = parseInt(latency, 10);
        if (isNaN(parsedLatency)) {
            console.warn(`[Main] Received invalid latency value for display ${displayId}: ${latency}`);
            return;
        }
        console.log(`[Main] Setting latency for display ${displayId} to ${parsedLatency}ms`);
        displayLatencies.set(displayId, parsedLatency);

        // --- FIXED: Trigger a state broadcast after latency change ---
        // This ensures all windows receive the updated latency value immediately
        // and can adjust their rendering.
        if (playbackManager) {
            const currentState = playbackManager.getCurrentSyncState();
            broadcastToAllWindows('playback:update', currentState);
        }
    });

    // ADDED: Handle the 'ready' signal from the editor renderer.
    ipcMain.on('editor:ready', (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        // Check if this window was created with a file to open.
        if (window && window.pendingFileOpen) {
            const { filePath, windowToClose } = window.pendingFileOpen;

            log.info(`[Main] Editor is ready. Sending file: ${filePath}`);
            window.webContents.send('file:open', { filePath });

            // Now that the new window has received its data, it's safe to close the main menu.
            if (windowToClose && !windowToClose.isDestroyed()) {
                windowToClose.close();
            }

            // Clean up the property to prevent re-sending.
            delete window.pendingFileOpen;
        }
    });

    app.on('activate', () => {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) {
            if (filePathToOpen) {
                handleOpenFile(filePathToOpen);
            } else {
                createMainWindow();
            }
        }
    });

    screen.on('display-added', () => {
        sendDisplaysUpdate();
        updateAudienceWindows();
    });
    screen.on('display-removed', () => {
        sendDisplaysUpdate();
        updateAudienceWindows();
    });

    // If a file path was queued from startup, handle it now.
    if (filePathToOpen) {
        handleOpenFile(filePathToOpen);
        filePathToOpen = null; // Clear after handling
    } else {
        // Otherwise, open the main menu as usual.
        createMainWindow();
    }
});

// --- ADDED: Single Instance Lock and File Opening Logic ---

/**
 * Handles the logic for opening a .lyx file, routing it to the correct window.
 * @param {string} filePath The absolute path to the file.
 */
function handleOpenFile(filePath) {
    if (!filePath) {
        return;
    }

    // Scenario 1: Player window is open. Send the file path to it.
    if (playerWindow && !playerWindow.isDestroyed()) {
        log.info(`[Main] Player window is open. Sending file: ${filePath}`);
        playerWindow.webContents.send('file:open', { filePath });
        if (playerWindow.isMinimized()) playerWindow.restore();
        playerWindow.focus();
        return;
    }

    // Scenario 2: Editor window is open. Send the file path to it.
    if (editorWindow && !editorWindow.isDestroyed()) {
        log.info(`[Main] Editor window is open. Sending file: ${filePath}`);
        editorWindow.webContents.send('file:open', { filePath });
        if (editorWindow.isMinimized()) editorWindow.restore();
        editorWindow.focus();
        return;
    }

    // Scenario 3: No specific window is open. Open the editor and load the file.
    log.info(`[Main] No specific window open. Creating editor to load file: ${filePath}`);

    // Keep a reference to the main menu window if it exists.
    const oldMainWindow = mainWindow;

    // Create the new editor window BEFORE closing the old one.
    // This prevents the 'window-all-closed' event from quitting the app prematurely.
    createEditorWindow();

    // MODIFIED: Instead of using 'did-finish-load', we attach the pending file info
    // to the window object. The renderer will send an 'editor:ready' IPC message
    // when it's fully initialized, which we'll handle to send the file path.
    // This avoids the race condition.
    editorWindow.pendingFileOpen = {
        filePath: filePath,
        windowToClose: oldMainWindow
    };
}

// For macOS, the 'open-file' event is the standard.
app.on('open-file', (event, path) => {
    event.preventDefault();
    if (app.isReady()) {
        handleOpenFile(path);
    } else {
        filePathToOpen = path; // Store to handle when app is ready.
    }
});

// For Windows/Linux, check process.argv.
if (process.platform !== 'darwin') {
    const potentialFilePath = app.isPackaged ? process.argv[1] : process.argv[2];
    if (potentialFilePath && path.extname(potentialFilePath) === '.lyx') {
        filePathToOpen = potentialFilePath;
    }
}

// --- REVISED: Auto-updater event handlers and IPC ---

autoUpdater.on('update-available', (info) => {
    log.info('Update available.');
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:update-available', info);
    }
});

autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available.');
});

autoUpdater.on('download-progress', (progressObj) => {
    log.info(`Download progress: ${progressObj.percent.toFixed(2)}%`);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:download-progress', progressObj);
    }
});

autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded.');
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:update-downloaded', info);
    }
});

autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater: ', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:error', err);
    }
});

ipcMain.on('updater:start-download', () => {
    log.info('Renderer requested to start download.');
    autoUpdater.downloadUpdate().catch(err => {
        log.error('Error during manual download: ', err);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('updater:error', err);
        }
    });
});

ipcMain.on('updater:quit-and-install', () => {
    log.info('Renderer requested to quit and install.');
    autoUpdater.quitAndInstall();
});

ipcMain.on('go-to-main-menu', (event) => {
    log.info('[Main] go-to-main-menu IPC received. Opening main window.');
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);

    // Create the main window first to prevent the app from quitting on window-all-closed
    createMainWindow();

    // Now, safely close the source window (editor or player)
    if (sourceWindow) {
        if (sourceWindow === editorWindow) {
            editorWindow = null;
        } else if (sourceWindow === playerWindow) {
            // The 'closed' event on playerWindow already handles closing audience windows
            playerWindow = null;
        }
        // The 'closed' event handlers for each window will correctly nullify the global variables.
        sourceWindow.close();
    }
});


ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.on('open-editor-window', () => {
    log.info('[Main] open-editor-window IPC received.');
    if (!editorWindow) createEditorWindow();
    mainWindow?.close();
});

ipcMain.on('open-player-window', () => {
    if (!playerWindow) createPlayerWindow();
    mainWindow?.close();
});

ipcMain.on('minimize-window', () => mainWindow?.minimize());
ipcMain.on('maximize-window', () => {
    if (mainWindow?.isMaximized()) mainWindow?.unmaximize();
    else mainWindow?.maximize();
});
ipcMain.on('close-window', () => mainWindow?.close());

ipcMain.on('minimize-editor-window', () => editorWindow?.minimize());
ipcMain.on('maximize-editor-window', () => {
    if (editorWindow?.isMaximized()) editorWindow?.unmaximize();
    else editorWindow?.maximize();
});
ipcMain.on('close-editor-window', () => app.quit());

ipcMain.on('set-editor-title', (event, title) => {
    if (editorWindow && !editorWindow.isDestroyed()) {
        editorWindow.setTitle(title);
    }
});

ipcMain.on('minimize-player-window', () => playerWindow?.minimize());
ipcMain.on('maximize-player-window', () => {
    if (playerWindow?.isMaximized()) playerWindow?.unmaximize();
    else playerWindow?.maximize();
});
ipcMain.on('close-player-window', () => app.quit());

ipcMain.handle('get-system-fonts', async () => {
    try {
        const fonts = await systemFonts.getFonts();
        return [...new Set(fonts)].sort();
    } catch (error) {
        console.error("Failed to get system fonts:", error);
        return [];
    }
});

function generateFileChecksum(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('error', err => reject(err));
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}


ipcMain.handle('project:init-temp-folder', async () => {
    try {
        await fs.promises.rm(projectTempPath, { recursive: true, force: true });
        await fs.promises.mkdir(assetsTempPath, { recursive: true });
        return true;
    } catch (error) {
        console.error("Failed to initialize temp project folder:", error);
        return false;
    }
});

ipcMain.on('project:cancel-copy', () => {
    if (currentCopyOperation && typeof currentCopyOperation.cancel === 'function') {
        currentCopyOperation.cancel();
    }
});


ipcMain.handle('dialog:openSong', async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(parentWindow, { properties: ['openFile'], filters: [{ name: 'LiveLyrics Project', extensions: ['lyx'] }] });
    if (!canceled) return filePaths[0];
});

ipcMain.handle('dialog:showOpenDialog', async (event, options) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(parentWindow, options);
    if (!canceled && filePaths.length > 0) {
        return filePaths[0];
    }
    return null;
});

ipcMain.handle('project:addAsset', async (event, originalPath) => {
    if (!originalPath || !fs.existsSync(originalPath)) {
        throw new Error('File does not exist at the provided path.');
    }

    try {
        // Ensure the target directory exists before proceeding.
        await fs.promises.mkdir(assetsTempPath, { recursive: true });

        const checksum = await generateFileChecksum(originalPath);
        const extension = path.extname(originalPath);
        const newFileName = `${checksum}${extension}`;
        const destPath = path.join(assetsTempPath, newFileName);

        if (fs.existsSync(destPath)) {
            console.log(`[Main] Asset already exists, skipping copy: ${newFileName}`);
            const finalUrl = url.format({ pathname: destPath, protocol: 'file:', slashes: true });
            const alias = path.basename(originalPath);

            if (extension.toLowerCase() === '.json') {
                const content = await fs.promises.readFile(originalPath, 'utf-8');
                return { filePath: finalUrl, content, alias };
            }
            return { filePath: finalUrl, alias };
        }

        console.log(`[Main] Copying new asset: ${originalPath} -> ${newFileName}`);
        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(originalPath);
            const writeStream = fs.createWriteStream(destPath);

            const cleanup = () => {
                currentCopyOperation.cancel = () => {};
                readStream.destroy();
                writeStream.destroy();
            };

            const cancel = () => {
                cleanup();
                fs.unlink(destPath, (err) => {
                    if (err && err.code !== 'ENOENT') console.warn(`Could not clean up partially copied file: ${destPath}`);
                    reject(new Error('Copy operation was canceled.'));
                });
            };

            currentCopyOperation.cancel = cancel;

            readStream.on('error', (err) => { cleanup(); reject(err); });
            writeStream.on('error', (err) => { cleanup(); reject(err); });

            writeStream.on('finish', async () => {
                cleanup();
                const finalUrl = url.format({ pathname: destPath, protocol: 'file:', slashes: true });
                const alias = path.basename(originalPath);

                if (extension.toLowerCase() === '.json') {
                    try {
                        const content = await fs.promises.readFile(originalPath, 'utf-8');
                        resolve({ filePath: finalUrl, content, alias });
                    } catch (readErr) {
                        reject(readErr);
                    }
                } else {
                    resolve({ filePath: finalUrl, alias });
                }
            });

            readStream.pipe(writeStream);
        });

    } catch (error) {
        console.error(`[Main] Failed to add asset: ${error}`);
        throw error;
    }
});

ipcMain.handle('project:cleanUnusedAssets', async (event, usedAssets) => {
    if (!Array.isArray(usedAssets)) {
        console.error('[Main] cleanUnusedAssets: provided usedAssets is not an array.');
        return;
    }

    try {
        const usedFileNames = new Set(usedAssets.map(assetUrl => {
            try {
                const filePath = url.fileURLToPath(assetUrl);
                return path.basename(filePath);
            } catch (e) {
                console.warn(`[Main] Could not parse asset URL: ${assetUrl}`);
                return null;
            }
        }).filter(Boolean));

        console.log('[Main] Cleaning unused assets. Used files:', usedFileNames);

        const filesInTemp = await fs.promises.readdir(assetsTempPath);

        for (const fileName of filesInTemp) {
            if (!usedFileNames.has(fileName)) {
                const filePathToDelete = path.join(assetsTempPath, fileName);
                console.log(`[Main] Deleting unused asset: ${fileName}`);
                try {
                    await fs.promises.unlink(filePathToDelete);
                } catch (deleteError) {
                    console.error(`[Main] Failed to delete unused asset ${filePathToDelete}:`, deleteError);
                }
            }
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('[Main] Assets temp directory does not exist, skipping cleanup.');
            return;
        }
        console.error('[Main] Error cleaning unused assets:', error);
    }
});


async function saveProject(filePath, { songData, usedAssets }) {
    function relativizeAssetPaths(obj) {
        for (const key in obj) {
            if (typeof obj[key] === 'string' && obj[key].startsWith('file:///')) {
                try {
                    const assetPath = url.fileURLToPath(obj[key]);
                    const assetFilename = path.basename(assetPath);
                    obj[key] = `assets/${assetFilename}`;
                } catch (e) {
                    console.warn(`Could not convert asset URL to path: ${obj[key]}`);
                }
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                relativizeAssetPaths(obj[key]);
            }
        }
    }

    // Stamp the current app version into the song data.
    songData.appVersion = app.getVersion();

    relativizeAssetPaths(songData);

    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(filePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            console.log(`[Main] Project saved successfully to ${filePath}. Total bytes: ${archive.pointer()}`);
            resolve(true);
        });

        archive.on('error', (err) => {
            console.error('[Main] Error during project save:', err);
            reject(err);
        });

        archive.pipe(output);
        archive.append(JSON.stringify(songData, null, 2), { name: 'song.json' });

        for (const assetUrl of usedAssets) {
            try {
                const assetPath = url.fileURLToPath(assetUrl);
                const assetFilename = path.basename(assetPath);
                if (fs.existsSync(assetPath)) {
                    archive.file(assetPath, { name: `assets/${assetFilename}` });
                } else {
                    console.warn(`[Main] Asset not found in temp folder, skipping: ${assetFilename}`);
                }
            } catch (e) {
                console.warn(`[Main] Could not process asset URL for saving: ${assetUrl}`);
            }
        }

        archive.finalize();
    });
}

ipcMain.handle('project:save', async (event, filePath, data) => {
    return saveProject(filePath, data);
});

ipcMain.handle('dialog:showSaveAsDialog', async (event, options) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(parentWindow, options);
    if (canceled) {
        return null;
    }
    return filePath;
});

ipcMain.handle('project:open', async (event, filePath) => {
    try {
        await fs.promises.rm(projectTempPath, { recursive: true, force: true });
        await fs.promises.mkdir(projectTempPath, { recursive: true });

        await extract(filePath, { dir: projectTempPath });

        const songJsonPath = path.join(projectTempPath, 'song.json');
        if (!fs.existsSync(songJsonPath)) {
            throw new Error("Project file is invalid or corrupt: 'song.json' not found.");
        }
        const songDataRaw = await fs.promises.readFile(songJsonPath, 'utf-8');
        const songData = JSON.parse(songDataRaw);

        // --- Smart Effect Hydration ---
        async function hydrateSmartEffects(elementObject) {
            if (!elementObject || typeof elementObject !== 'object') {
                return;
            }

            // If this is a smart effect, load its data from the src path
            if (elementObject.type === 'smart-effect' && elementObject.properties?.src?.src) {
                const relativePath = elementObject.properties.src.src; // e.g., 'assets/checksum.json'
                const absolutePath = path.join(projectTempPath, relativePath);
                if (fs.existsSync(absolutePath)) {
                    try {
                        const content = await fs.promises.readFile(absolutePath, 'utf-8');
                        const effectData = JSON.parse(content);
                        // Inject the loaded data back into the object
                        if (elementObject.properties.src) {
                            elementObject.properties.src.effectData = effectData;
                        }
                    } catch (e) {
                        console.error(`[Main] Failed to read or parse smart effect JSON at ${absolutePath}:`, e);
                    }
                }
            }

            // Recurse into children if they exist
            if (elementObject.children && Array.isArray(elementObject.children)) {
                for (const child of elementObject.children) {
                    await hydrateSmartEffects(child);
                }
            }
        }

        if (songData.thumbnailPage) {
            await hydrateSmartEffects(songData.thumbnailPage);
        }
        if (songData.pages && Array.isArray(songData.pages)) {
            for (const page of songData.pages) {
                await hydrateSmartEffects(page);
            }
        }
        // --- END: Smart Effect Hydration ---

        // --- Version Check ---
        const songAppVersion = songData.appVersion;
        const currentAppVersion = app.getVersion();

        // Only check if the song file has a version stamp. Older files will not.
        if (songAppVersion) {
            if (compareVersions(songAppVersion, currentAppVersion) > 0) {
                throw new Error(`This project was created with a newer app version (v${songAppVersion}). Please update your app to open it.`);
            }
        }
        // --- END: Version Check ---

        function absolutizeAssetPaths(obj) {
            for (const key in obj) {
                if (typeof obj[key] === 'string' && obj[key].startsWith('assets/')) {
                    const relativeAssetPath = obj[key];
                    const assetPath = path.join(projectTempPath, relativeAssetPath);
                    obj[key] = url.format({
                        pathname: assetPath,
                        protocol: 'file:',
                        slashes: true
                    });
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    absolutizeAssetPaths(obj[key]);
                }
            }
        }

        absolutizeAssetPaths(songData);
        return { success: true, data: songData };

    } catch (error) {
        console.error(`[Main] Error opening project: ${error.message}`);
        return { success: false, error: error.message };
    }
});

ipcMain.on('player:set-presenter-display', (event, displayId) => {
    if (!playerWindow) return;

    const targetDisplay = screen.getAllDisplays().find(d => d.id.toString() === displayId.toString());
    if (!targetDisplay) return;

    const wasFullScreen = playerWindow.isFullScreen();
    const wasMaximized = playerWindow.isMaximized();
    const currentBounds = playerWindow.getBounds();
    const sourceDisplay = screen.getDisplayMatching(currentBounds);

    const relativeXProportion = sourceDisplay?.bounds.width > 0
        ? (currentBounds.x - sourceDisplay.bounds.x) / sourceDisplay.bounds.width
        : 0;
    const relativeYProportion = sourceDisplay?.bounds.height > 0
        ? (currentBounds.y - sourceDisplay.bounds.y) / sourceDisplay.bounds.height
        : 0;

    if (wasFullScreen) {
        playerWindow.setFullScreen(false);
    } else if (wasMaximized) {
        playerWindow.unmaximize();
    }

    const newX = Math.round(targetDisplay.bounds.x + (relativeXProportion * targetDisplay.bounds.width));
    const newY = Math.round(targetDisplay.bounds.y + (relativeYProportion * targetDisplay.bounds.height));

    playerWindow.setBounds({
        x: newX,
        y: newY,
        width: currentBounds.width,
        height: currentBounds.height
    });

    if (wasFullScreen) {
        playerWindow.setFullScreen(true);
    } else if (wasMaximized) {
        playerWindow.maximize();
    }
});

ipcMain.on('audience:update', (event, data) => {
    for (const window of audienceWindows.values()) {
        if (window && !window.isDestroyed()) {
            window.webContents.send('audience:render', data);
        }
    }
});

// MODIFIED: The 'playback:load-song' handler now accepts the songData.
ipcMain.on('playback:load-song', (event, { songMetadata, measureMap, songData }) => {
    playbackManager.loadSong(songMetadata, measureMap, songData);
    // ADDED: Send the new song data to the connected device.
    if (connectionManager) {
        console.log('[Main] Sending new song data to connected device.');
        // MODIFIED: Send hint message first
        connectionManager.sendMessageToPairedDevice({
            type: 'songUpdateHint',
            payload: { title: songMetadata.title }
        });
        connectionManager.sendMessageToPairedDevice({
            type: 'songUpdate',
            payload: songData
        });
        // Also send the initial playback state after loading
        const initialSyncState = playbackManager.getCurrentSyncState();
        connectionManager.sendMessageToPairedDevice({
            type: 'playbackUpdate',
            payload: initialSyncState
        });
    }
});

ipcMain.on('playback:unload-song', () => {
    playbackManager.unloadSong();
    // ADDED: Send an unload message to the connected device.
    if (connectionManager) {
        console.log('[Main] Sending unload signal to connected device.');
        connectionManager.sendMessageToPairedDevice({
            type: 'songUpdate',
            payload: null // null payload signifies unload
        });
    }
});

ipcMain.on('playback:update-bpm', (event, { bpm, bpmUnit, timestamp }) => {
    playbackManager.updateBpm(bpm, bpmUnit, timestamp);
});

ipcMain.on('playback:play', (event, timestamp) => {
    playbackManager.play(timestamp);
});

ipcMain.on('playback:pause', (event, options) => {
    playbackManager.pause(options);
});

ipcMain.on('playback:jump', (event, { timeInMs, timestamp }) => {
    playbackManager.jump(timeInMs, timestamp);
});

// ADDED: IPC handlers for the new 'synced' playback mode
ipcMain.on('playback:play-synced', (event, { timestamp }) => {
    playbackManager.play(timestamp, 'synced');
});

ipcMain.on('playback:sync-beat', (event, { timestamp, interpolationDuration }) => {
    playbackManager.syncBeat(timestamp, interpolationDuration);
});

// ADDED: IPC handler for synced jumps
ipcMain.on('playback:jump-synced', (event, { direction, timestamp }) => {
    playbackManager.jumpSynced(direction, timestamp);
});

// ADDED: IPC handler for the new 'undo' signal
ipcMain.on('playback:undo-beat', (event) => {
    playbackManager.undoBeat();
});

// ADDED: IPC handler for playlist updates from the player renderer
ipcMain.on('playlist:updated', (event, { songs, activeSongId }) => {
    if (connectionManager) {
        console.log(`[Main] Playlist updated. Active song: ${activeSongId}. Sending to device.`);
        const payload = {
            songs: songs.map(s => ({ id: s.id, title: s.title })),
            activeSongId: activeSongId
        };
        connectionManager.sendMessageToPairedDevice({
            type: 'playlistUpdate',
            payload: payload
        });
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Enforce a single instance of the application.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance. We should focus our window
        // and handle the file they tried to open.
        const potentialFilePath = app.isPackaged ? commandLine.find(arg => arg.endsWith('.lyx')) : commandLine[2];

        if (potentialFilePath && path.extname(potentialFilePath) === '.lyx') {
            handleOpenFile(potentialFilePath);
        } else {
            // If no file, just focus an existing window.
            if (playerWindow) {
                if (playerWindow.isMinimized()) playerWindow.restore();
                playerWindow.focus();
            } else if (editorWindow) {
                if (editorWindow.isMinimized()) editorWindow.restore();
                editorWindow.focus();
            } else if (mainWindow) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.focus();
            }
        }
    });
}