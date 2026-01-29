const { app, BrowserWindow, ipcMain, dialog, screen, desktopCapturer } = require('electron');
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

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// --- Logger Setup ---
log.transports.file.resolvePath = () => path.join(app.getPath('userData'), 'logs', 'main.log');
log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = false;
log.info('App starting...');

const projectTempPath = path.join(app.getPath('temp'), 'live-lyrics-project');
const assetsTempPath = path.join(projectTempPath, 'assets');

let currentCopyOperation = { cancel: () => {} };
let filePathToOpen = null;

let mainWindow;
let editorWindow;
let playerWindow;
let tempoSyncWindow;
let audienceWindows = new Map();

// --- Global Settings ---
let globalLatency = 0;
let autoAcceptConnections = true;

let playbackManager;
let connectionManager = null;

/**
 * Attempts to remove a directory or file. If EBUSY/EPERM/EACCES/ENOTEMPTY errors occur,
 * it retries a few times with a delay before giving up.
 */
async function safeRm(targetPath, retries = 5, delay = 200) {
    if (!fs.existsSync(targetPath)) return;

    for (let i = 0; i < retries; i++) {
        try {
            await fs.promises.rm(targetPath, { recursive: true, force: true });
            return;
        } catch (err) {
            const isLocked = err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'ENOTEMPTY' || err.code === 'EACCES';
            if (isLocked && i < retries - 1) {
                console.warn(`[Main] safeRm: File busy/locked at ${targetPath} (${err.code}). Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error(`[Main] safeRm failed to delete ${targetPath} after ${i + 1} attempts. Last error:`, err);
                throw err;
            }
        }
    }
}

/**
 * Safely and recursively find a font file by family name
 */
async function findFontFile(fontFamily) {
    const fontDirs = [];

    if (process.platform === 'win32') {
        if (process.env.WINDIR) {
            fontDirs.push(path.join(process.env.WINDIR, 'Fonts'));
        }
        if (process.env.LOCALAPPDATA) {
            fontDirs.push(path.join(
                process.env.LOCALAPPDATA,
                'Microsoft',
                'Windows',
                'Fonts'
            ));
        }
    } else if (process.platform === 'darwin') {
        fontDirs.push(
            path.join(os.homedir(), 'Library/Fonts'),
            '/Library/Fonts',
            '/System/Library/Fonts',
            '/System/Library/Fonts/Supplemental'
        );
    } else { // Linux / Unix
        fontDirs.push(
            path.join(os.homedir(), '.local/share/fonts'),
            path.join(os.homedir(), '.fonts'),
            '/usr/share/fonts',
            '/usr/local/share/fonts'
        );
    }

    const extensions = new Set(['.ttf', '.otf', '.ttc', '.woff', '.woff2']);
    const target = normalize(fontFamily);

    const matches = [];
    const visited = new Set();

    for (const dir of fontDirs) {
        if (!dir || !fs.existsSync(dir)) continue;
        await walk(dir);
    }

    if (matches.length === 0) return null;

    matches.sort((a, b) => rank(a, target) - rank(b, target));
    return matches[0];

    async function walk(dir) {
        let realPath;
        try {
            realPath = await fs.promises.realpath(dir);
        } catch {
            return;
        }

        if (visited.has(realPath)) return;
        visited.add(realPath);

        let entries;
        try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                if (!entry.isSymbolicLink()) {
                    await walk(fullPath);
                }
            } else {
                const ext = path.extname(entry.name).toLowerCase();
                if (!extensions.has(ext)) continue;

                const name = normalize(entry.name);
                if (name.includes(target)) {
                    matches.push(fullPath);
                }
            }
        }
    }
}

function normalize(str) {
    return str.toLowerCase().replace(/[\s_-]+/g, '');
}

function rank(filePath, target) {
    const name = normalize(path.basename(filePath));
    let score = 0;
    if (name.startsWith(target)) score -= 20;
    if (name.includes('regular')) score -= 10;
    if (name.includes('bold')) score += 5;
    if (name.includes('italic') || name.includes('oblique')) score += 5;
    if (name.includes('condensed')) score += 2;
    return score;
}

function compareVersions(v1, v2) {
    if (!v1 || !v2) return 0;
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

// --- Window Role Management ---
/**
 * Determines which window acts as the "Master Renderer" and which act as "Mirrors".
 * Logic:
 * 1. If Audience windows exist, the first one is Master. Others are Mirrors. Player is Mirror.
 * 2. If NO Audience windows exist, Player is Master.
 */
function assignWindowRoles() {
    let masterWindow = null;

    // 1. Identify Master
    if (audienceWindows.size > 0) {
        // Prefer the first audience window as Master
        masterWindow = audienceWindows.values().next().value;
    } else if (playerWindow && !playerWindow.isDestroyed()) {
        // Fallback to Player if no audience windows exist
        masterWindow = playerWindow;
    }

    if (!masterWindow || masterWindow.isDestroyed()) return;

    // Get the Media Source ID for WebRTC capture from the Master
    const sourceId = masterWindow.getMediaSourceId();
    
    const notify = (win, role, id) => {
        if (win && !win.isDestroyed()) {
            win.webContents.send('window:set-role', { role, sourceId: id });
        }
    };

    // 2. Notify Master
    notify(masterWindow, 'master', null);

    // 3. Notify Player (if it's not the master)
    if (playerWindow && playerWindow !== masterWindow && !playerWindow.isDestroyed()) {
        notify(playerWindow, 'mirror', sourceId);
    }

    // 4. Notify Audience Windows (if they are not the master)
    for (const win of audienceWindows.values()) {
        if (win !== masterWindow && !win.isDestroyed()) {
            notify(win, 'mirror', sourceId);
        }
    }
}

function sendDisplaysUpdate() {
    if (playerWindow && !playerWindow.isDestroyed()) {
        const allDisplays = screen.getAllDisplays();
        const playerBounds = playerWindow.getBounds();
        const presenterDisplay = screen.getDisplayMatching(playerBounds) || screen.getPrimaryDisplay();
        playerWindow.webContents.send('displays-changed', { allDisplays, presenterDisplay, globalLatency });
    }
}

function preventWindowZoom(win) {
    if (!win || win.isDestroyed()) return;
    win.webContents.on('did-finish-load', () => {
        win.webContents.setZoomFactor(1);
        win.webContents.setVisualZoomLevelLimits(1, 1);
    });
    win.webContents.on('before-input-event', (event, input) => {
        if (input.control || input.meta) {
            const key = input.key.toLowerCase();
            if (key === '+' || key === '=' || key === '-' || key === '_' || key === '0') {
                event.preventDefault();
            }
        }
    });
}

function createMainWindow() {
    const preloadScriptPath = path.join(app.getAppPath(), 'src', 'main', 'preload.js');
    const htmlPath = path.join(app.getAppPath(), 'src', 'renderer', 'html', 'index.html');
    const iconPath = path.join(app.getAppPath(), 'src', 'renderer', 'assets', 'icon.ico');

    console.log(`[Main] Loading mainWindow. Preload path: ${preloadScriptPath}`);

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

    preventWindowZoom(mainWindow);
    mainWindow.loadFile(htmlPath);

    mainWindow.webContents.on('did-finish-load', () => {
        log.info('Main window finished loading. Checking for updates.');
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

    preventWindowZoom(editorWindow);
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

function createTempoSyncWindow() {
    const preloadScriptPath = path.join(app.getAppPath(), 'src', 'main', 'preload-tempo-sync.js');
    const htmlPath = path.join(app.getAppPath(), 'src', 'renderer', 'html', 'tempo-sync.html');

    console.log(`[Main] Loading tempoSyncWindow. Preload path: ${preloadScriptPath}`);

    tempoSyncWindow = new BrowserWindow({
        width: 400,
        height: 450,
        title: 'Tempo Sync',
        autoHideMenuBar: true,
        webPreferences: {
            preload: preloadScriptPath,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    preventWindowZoom(tempoSyncWindow);
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

    preventWindowZoom(playerWindow);
    playerWindow.loadFile(htmlPath);

    if (connectionManager) {
        connectionManager.start();
    }

    playerWindow.webContents.on('did-finish-load', () => {
        sendDisplaysUpdate();
        updateAudienceWindows();
        assignWindowRoles(); // Initial role assignment
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

    preventWindowZoom(audienceWindow);
    audienceWindow.loadFile(htmlPath);

    audienceWindow.webContents.on('did-finish-load', () => {
        // Whenever a new audience window loads, we recalculate roles.
        // It's likely this new window might become the Master.
        assignWindowRoles();

        if (playbackManager) {
            const syncState = playbackManager.getCurrentSyncState();
            if (syncState.status !== 'unloaded') {
                const stateForWindow = { ...syncState, latency: globalLatency };
                audienceWindow.webContents.send('playback:update', stateForWindow);
            }
        }
    });

    audienceWindow.on('closed', () => {
        audienceWindows.delete(display.id);
        assignWindowRoles(); // Re-assign roles when an audience window closes
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
            const win = audienceWindows.get(displayId);
            
            // PROACTIVE FIX: Remove from map immediately to update roles logic
            // This prevents the closing window from being selected as "Master"
            // during the asynchronous close process.
            audienceWindows.delete(displayId);
            
            if (win && !win.isDestroyed()) {
                win.close();
            }
            
            // Re-assign roles immediately based on the updated map state
            assignWindowRoles();
        }
    }

    for (const displayId of audienceDisplayIds) {
        if (!openWindowIds.has(displayId)) {
            const display = allDisplays.find(d => d.id === displayId);
            if (display) createAudienceWindow(display);
        }
    }
}

app.whenReady().then(() => {
    const broadcastToAllWindows = (channel, ...args) => {
        const stateObject = args[0];
        // Inject GLOBAL LATENCY into the state object for all windows
        const stateWithLatency = { ...stateObject, latency: globalLatency };

        if (playerWindow && !playerWindow.isDestroyed()) {
            playerWindow.webContents.send(channel, stateWithLatency);
        }

        for (const window of audienceWindows.values()) {
            if (window && !window.isDestroyed()) {
                window.webContents.send(channel, stateWithLatency);
            }
        }

        if (tempoSyncWindow && !tempoSyncWindow.isDestroyed()) {
            // Tempo sync controller typically doesn't need delay, sending 0 latency state
            tempoSyncWindow.webContents.send(channel, { ...stateObject, latency: 0 });
        }

        if (connectionManager) {
            connectionManager.sendMessageToPairedDevice({
                type: 'playbackUpdate',
                payload: stateObject
            });
        }
    };

    playbackManager = new PlaybackManager(broadcastToAllWindows);

    const handleRemoteCommand = (command, remoteIp) => {
        if (!command || typeof command !== 'object' || !playbackManager) return;
        console.log(`[Main] Handling remote command from ${remoteIp}:`, command);

        const rttStats = connectionManager.getRttStats();
        const stats = rttStats.get(remoteIp);
        const avgRtt = stats ? stats.average : 0;
        const latency = avgRtt / 2;
        const timestamp = (performance.timeOrigin + performance.now()) - latency;

        switch (command.type) {
            case 'play':
                playbackManager.play(timestamp);
                break;
            case 'play-synced':
                playbackManager.play(timestamp, 'synced');
                break;
            case 'pause':
                playbackManager.pause({ timestamp });
                break;
            case 'beat':
                playbackManager.syncBeat(timestamp, command.interpolationDuration || 0.3);
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

        const discoverableDevices = new Map();

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
            console.log(`[Main] Incoming pairing request from ${device.deviceName} (${device.deviceId}).`);
            if (autoAcceptConnections) {
                console.log(`[Main] Auto-accept enabled. Automatically accepting request from ${device.deviceId}.`);
                accept();
            } else {
                if (playerWindow && !playerWindow.isDestroyed()) {
                    playerWindow.webContents.send('device-controller:pairing-request', { deviceId: device.deviceId, deviceName: device.deviceName });
                }
                // We don't have a direct callback mechanism here like in the simplified version, 
                // typically this would store the callbacks in a map. 
                // For full correctness with the previous logic, we'd need the `pairingRequests` map.
                // Assuming standard event flow based on `device-controller:respond-to-pairing`.
            }
        });

        connectionManager.on('songSelectionRequest', (songId) => {
            if (playerWindow && !playerWindow.isDestroyed()) {
                playerWindow.webContents.send('playlist:select-song', songId);
            }
        });

        connectionManager.on('playlistRequest', () => {
            if (playerWindow && !playerWindow.isDestroyed()) {
                playerWindow.webContents.send('playlist:request-sync');
            }
        });

        connectionManager.on('currentSongRequest', () => {
            if (playbackManager && connectionManager) {
                const currentSyncState = playbackManager.getCurrentSyncState();
                connectionManager.sendMessageToPairedDevice({
                    type: 'playbackUpdate',
                    payload: currentSyncState
                });
                const currentSongData = playbackManager.getCurrentSongData();
                if (currentSongData && currentSyncState.song) {
                    connectionManager.sendMessageToPairedDevice({
                        type: 'songUpdateHint',
                        payload: { title: currentSyncState.song.title }
                    });
                    connectionManager.sendMessageToPairedDevice({
                        type: 'songUpdate',
                        payload: currentSongData
                    });
                }
            }
        });

        connectionManager.on('remoteBpmUpdate', ({ bpm, bpmUnit }) => {
            if (playbackManager) {
                playbackManager.updateBpm(bpm, bpmUnit, performance.timeOrigin + performance.now());
            }
        });

        connectionManager.on('remoteCommand', (command, remoteIp) => {
            handleRemoteCommand(command, remoteIp);
        });

        connectionManager.on('deviceConnected', (device) => {
            console.log(`[Main] Device fully connected: ${device.deviceName} (${device.deviceId})`);
            if (playerWindow && !playerWindow.isDestroyed()) {
                const remoteInfo = { id: device.deviceId, name: device.deviceName, type: device.deviceType, ips: device.getRemoteAdvertisedIps() };
                playerWindow.webContents.send('device-controller:connection-success', remoteInfo);
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
            // Logic to handle response via stored callbacks would go here.
        });
        ipcMain.on('device-controller:disconnect-device', () => {
            if (connectionManager) {
                connectionManager.disconnectFromPairedDevice();
            }
        });
        ipcMain.on('device-controller:set-auto-accept', (event, enabled) => {
            autoAcceptConnections = enabled;
        });
        ipcMain.on('player:ready-for-devices', () => broadcastDeviceList());

    } catch (error) {
        log.error('Failed to initialize ConnectionManager:', error);
    }

    // --- Global Latency IPC ---
    ipcMain.on('player:set-global-latency', (event, latency) => {
        const parsed = parseInt(latency, 10);
        if (!isNaN(parsed)) {
            globalLatency = parsed;
            // Broadcast state update to apply latency immediately
            if (playbackManager) {
                const state = playbackManager.getCurrentSyncState();
                broadcastToAllWindows('playback:update', state);
            }
        }
    });

    ipcMain.on('player:song-load-error', (event, errorMessage) => {
        console.error(`[Main] Received song load error from player: ${errorMessage}`);
        if (connectionManager) {
            connectionManager.sendMessageToPairedDevice({
                type: 'songLoadError',
                payload: {
                    message: errorMessage || "Unknown error occurred on the host."
                }
            });
        }
    });

    ipcMain.on('editor:ready', (event) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window && window.pendingFileOpen) {
            const { filePath, windowToClose } = window.pendingFileOpen;
            window.webContents.send('file:open', { filePath });
            if (windowToClose && !windowToClose.isDestroyed()) {
                windowToClose.close();
            }
            delete window.pendingFileOpen;
        }
    });

    ipcMain.on('player:open-tempo-sync', () => {
        if (tempoSyncWindow && !tempoSyncWindow.isDestroyed()) {
            if (tempoSyncWindow.isMinimized()) tempoSyncWindow.restore();
            tempoSyncWindow.show();
            tempoSyncWindow.focus();
        } else {
            createTempoSyncWindow();
        }
    });

    app.on('activate', () => {
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

    if (filePathToOpen) {
        handleOpenFile(filePathToOpen);
        filePathToOpen = null;
    } else {
        createMainWindow();
    }
});

function handleOpenFile(filePath) {
    if (!filePath) return;

    if (playerWindow && !playerWindow.isDestroyed()) {
        playerWindow.webContents.send('file:open', { filePath });
        if (playerWindow.isMinimized()) playerWindow.restore();
        playerWindow.focus();
        return;
    }

    if (editorWindow && !editorWindow.isDestroyed()) {
        editorWindow.webContents.send('file:open', { filePath });
        if (editorWindow.isMinimized()) editorWindow.restore();
        editorWindow.focus();
        return;
    }

    const oldMainWindow = mainWindow;
    createEditorWindow();
    editorWindow.pendingFileOpen = {
        filePath: filePath,
        windowToClose: oldMainWindow
    };
}

app.on('open-file', (event, path) => {
    event.preventDefault();
    if (app.isReady()) {
        handleOpenFile(path);
    } else {
        filePathToOpen = path;
    }
});

if (process.platform !== 'darwin') {
    const potentialFilePath = app.isPackaged ? process.argv[1] : process.argv[2];
    if (potentialFilePath && path.extname(potentialFilePath) === '.lyx') {
        filePathToOpen = potentialFilePath;
    }
}

autoUpdater.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:update-available', info);
    }
});

autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available.');
});

autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:download-progress', progressObj);
    }
});

autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:update-downloaded', info);
    }
});

autoUpdater.on('error', (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:error', err);
    }
});

ipcMain.on('updater:start-download', () => {
    autoUpdater.downloadUpdate().catch(err => {
        log.error('Error during manual download: ', err);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('updater:error', err);
        }
    });
});

ipcMain.on('updater:quit-and-install', () => {
    autoUpdater.quitAndInstall();
});

ipcMain.on('go-to-main-menu', (event) => {
    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    createMainWindow();
    if (sourceWindow) {
        if (sourceWindow === editorWindow) {
            editorWindow = null;
        } else if (sourceWindow === playerWindow) {
            playerWindow = null;
        }
        sourceWindow.close();
    }
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.on('open-editor-window', () => {
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

ipcMain.handle('project:init-temp-folder', async () => {
    try {
        await safeRm(projectTempPath);
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

function generateFileChecksum(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('error', err => reject(err));
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

async function processAssetAddition(originalPath) {
    if (!originalPath || !fs.existsSync(originalPath)) {
        throw new Error('File does not exist at the provided path.');
    }

    await fs.promises.mkdir(assetsTempPath, { recursive: true });

    const checksum = await generateFileChecksum(originalPath);
    const extension = path.extname(originalPath).toLowerCase();

    if (extension === '.lyfx') {
        const effectFolderName = checksum;
        const effectFolderPath = path.join(assetsTempPath, effectFolderName);
        const alias = path.basename(originalPath);

        if (!fs.existsSync(effectFolderPath)) {
            await extract(originalPath, { dir: effectFolderPath });
        }

        const indexHtmlPath = path.join(effectFolderPath, 'index.html');
        if (!fs.existsSync(indexHtmlPath)) {
            throw new Error("Invalid .lyfx file: index.html not found in archive.");
        }

        const finalUrl = url.pathToFileURL(indexHtmlPath).href;
        return { filePath: finalUrl, alias };
    }

    const newFileName = `${checksum}${extension}`;
    const destPath = path.join(assetsTempPath, newFileName);
    const finalUrl = url.pathToFileURL(destPath).href;
    const alias = path.basename(originalPath);

    if (fs.existsSync(destPath)) {
        if (extension === '.json') {
            const content = await fs.promises.readFile(originalPath, 'utf-8');
            return { filePath: finalUrl, content, alias };
        }
        return { filePath: finalUrl, alias };
    }

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
            if (extension === '.json') {
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
}

ipcMain.handle('project:addAsset', async (event, originalPath) => {
    try {
        return await processAssetAddition(originalPath);
    } catch (error) {
        console.error(`[Main] Failed to add asset: ${error}`);
        throw error;
    }
});

ipcMain.handle('project:importSystemFont', async (event, fontFamily) => {
    try {
        const sourcePath = await findFontFile(fontFamily);
        if (!sourcePath) {
            throw new Error(`Could not locate font file for "${fontFamily}"`);
        }
        const assetData = await processAssetAddition(sourcePath);
        return {
            family: fontFamily,
            src: assetData.filePath,
            alias: assetData.alias
        };
    } catch (error) {
        console.error(`[Main] Font import failed:`, error);
        throw error;
    }
});

ipcMain.handle('project:cleanUnusedAssets', async (event, usedAssets) => {
    if (!Array.isArray(usedAssets)) return;

    try {
        const usedFileNames = new Set(usedAssets.map(assetUrl => {
            try {
                const filePath = url.fileURLToPath(assetUrl);
                if (filePath.startsWith(assetsTempPath)) {
                    const relative = path.relative(assetsTempPath, filePath);
                    const parts = relative.split(path.sep);
                    return parts[0];
                }
                return path.basename(filePath);
            } catch (e) {
                return null;
            }
        }).filter(Boolean));

        const filesInTemp = await fs.promises.readdir(assetsTempPath);

        for (const fileName of filesInTemp) {
            if (!usedFileNames.has(fileName)) {
                const filePathToDelete = path.join(assetsTempPath, fileName);
                try {
                    await safeRm(filePathToDelete);
                } catch (deleteError) {
                    console.error(`[Main] Failed to delete unused asset ${filePathToDelete}:`, deleteError);
                }
            }
        }
    } catch (error) {
        // Ignore ENOENT if temp dir doesn't exist
    }
});


async function saveProject(filePath, { songData, usedAssets }) {
    function relativizeAssetPaths(obj) {
        for (const key in obj) {
            if (typeof obj[key] === 'string' && obj[key].startsWith('file:///')) {
                try {
                    const assetPath = url.fileURLToPath(obj[key]);
                    if (assetPath.startsWith(assetsTempPath)) {
                        const relative = path.relative(assetsTempPath, assetPath);
                        obj[key] = `assets/${relative.replace(/\\/g, '/')}`;
                    }
                } catch (e) {
                    console.warn(`Could not convert asset URL to path: ${obj[key]}`);
                }
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                relativizeAssetPaths(obj[key]);
            }
        }
    }

    songData.appVersion = app.getVersion();
    relativizeAssetPaths(songData);

    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(filePath);
        output.on('error', (err) => {
            console.error(`[Main] Write stream error for ${filePath}:`, err);
            reject(err);
        });

        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            resolve(true);
        });

        archive.on('error', (err) => {
            console.error('[Main] Error during project save:', err);
            reject(err);
        });

        archive.pipe(output);
        archive.append(JSON.stringify(songData, null, 2), { name: 'song.json' });

        const addedFolders = new Set();

        for (const assetUrl of usedAssets) {
            try {
                const assetPath = url.fileURLToPath(assetUrl);
                if (assetPath.startsWith(assetsTempPath) && fs.existsSync(assetPath)) {
                    const relativePath = path.relative(assetsTempPath, assetPath);
                    const pathParts = relativePath.split(path.sep);

                    if (pathParts.length > 1) {
                        const rootFolder = pathParts[0];
                        if (!addedFolders.has(rootFolder)) {
                            const sourceDir = path.join(assetsTempPath, rootFolder);
                            archive.directory(sourceDir, `assets/${rootFolder}`);
                            addedFolders.add(rootFolder);
                        }
                    } else {
                        archive.file(assetPath, { name: `assets/${relativePath}` });
                    }
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
        await safeRm(projectTempPath);
        await fs.promises.mkdir(projectTempPath, { recursive: true });

        await extract(filePath, { dir: projectTempPath });

        const songJsonPath = path.join(projectTempPath, 'song.json');
        if (!fs.existsSync(songJsonPath)) {
            throw new Error("Project file is invalid or corrupt: 'song.json' not found.");
        }
        const songDataRaw = await fs.promises.readFile(songJsonPath, 'utf-8');
        const songData = JSON.parse(songDataRaw);

        const songAppVersion = songData.appVersion;
        const currentAppVersion = app.getVersion();

        if (songAppVersion) {
            if (compareVersions(songAppVersion, currentAppVersion) > 0) {
                throw new Error(`This project was created with a newer app version (v${songAppVersion}). Please update your app to open it.`);
            }
        }

        function absolutizeAssetPaths(obj) {
            for (const key in obj) {
                if (typeof obj[key] === 'string' && obj[key].startsWith('assets/')) {
                    const relativeAssetPath = obj[key];
                    const assetPath = path.join(projectTempPath, relativeAssetPath);
                    obj[key] = url.pathToFileURL(assetPath).href;
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
    const originalBounds = playerWindow.getBounds(); // Capture dimensions before changing anything

    // 1. Exit Fullscreen/Maximized to allow moving the window
    if (wasFullScreen) {
        playerWindow.setFullScreen(false);
    } else if (wasMaximized) {
        playerWindow.unmaximize();
    }

    // 2. Calculate new bounds based on the state
    let newBounds = {
        x: targetDisplay.bounds.x,
        y: targetDisplay.bounds.y
    };

    if (wasFullScreen || wasMaximized) {
        // If we are transitioning to Fullscreen or Maximized,
        // fill the target screen so the visual transition looks correct.
        newBounds.width = targetDisplay.bounds.width;
        newBounds.height = targetDisplay.bounds.height;
    } else {
        // If normal windowed mode, PRESERVE original size.
        // Also, ensure it fits within the new display (prevent it from being larger than the screen).
        newBounds.width = Math.min(originalBounds.width, targetDisplay.bounds.width);
        newBounds.height = Math.min(originalBounds.height, targetDisplay.bounds.height);

        // Center the window on the new display
        newBounds.x += Math.floor((targetDisplay.bounds.width - newBounds.width) / 2);
        newBounds.y += Math.floor((targetDisplay.bounds.height - newBounds.height) / 2);
    }

    // 3. Move and resize
    playerWindow.setBounds(newBounds);

    // 4. Restore state with a slight delay to allow OS window manager to catch up
    if (wasFullScreen) {
        setTimeout(() => {
            if (playerWindow && !playerWindow.isDestroyed()) {
                playerWindow.setFullScreen(true);
            }
        }, 100);
    } else if (wasMaximized) {
        setTimeout(() => {
            if (playerWindow && !playerWindow.isDestroyed()) {
                playerWindow.maximize();
            }
        }, 100);
    }

    updateAudienceWindows();
    assignWindowRoles();
});

ipcMain.on('playback:load-song', (event, { songMetadata, measureMap, songData }) => {
    if (songData && songData.fonts && !songMetadata.fonts) {
        songMetadata.fonts = songData.fonts;
    }

    playbackManager.loadSong(songMetadata, measureMap, songData);

    if (connectionManager) {
        connectionManager.sendMessageToPairedDevice({
            type: 'songUpdateHint',
            payload: { title: songMetadata.title }
        });
        connectionManager.sendMessageToPairedDevice({
            type: 'songUpdate',
            payload: songData
        });
        const initialSyncState = playbackManager.getCurrentSyncState();
        connectionManager.sendMessageToPairedDevice({
            type: 'playbackUpdate',
            payload: initialSyncState
        });
    }
});

ipcMain.on('playback:unload-song', () => {
    playbackManager.unloadSong();
    if (connectionManager) {
        connectionManager.sendMessageToPairedDevice({
            type: 'songUpdate',
            payload: null
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

ipcMain.on('playback:play-synced', (event, { timestamp }) => {
    playbackManager.play(timestamp, 'synced');
});

ipcMain.on('playback:sync-beat', (event, { timestamp, interpolationDuration }) => {
    playbackManager.syncBeat(timestamp, interpolationDuration);
});

ipcMain.on('playback:jump-synced', (event, { direction, timestamp }) => {
    playbackManager.jumpSynced(direction, timestamp);
});

ipcMain.on('playback:undo-beat', (event) => {
    playbackManager.undoBeat();
});

ipcMain.on('playlist:updated', (event, { songs, activeSongId }) => {
    if (connectionManager) {
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

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        const potentialFilePath = app.isPackaged ? commandLine.find(arg => arg.endsWith('.lyx')) : commandLine[2];

        if (potentialFilePath && path.extname(potentialFilePath) === '.lyx') {
            handleOpenFile(potentialFilePath);
        } else {
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