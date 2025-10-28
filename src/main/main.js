const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');
const fs = require('fs');
const url = require('url');
const SystemFonts = require('dnm-font-manager').default;
const systemFonts = new SystemFonts();
const crypto = require('crypto');
const archiver = 'archiver';
const extract = require('extract-zip');
const { PlaybackManager } = require('./playbackManager');

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


let mainWindow;
let editorWindow;
let playerWindow;
// MODIFIED: Use a Map to track multiple audience windows by their display ID.
let audienceWindows = new Map();
// ADDED: Create the central conductor
let playbackManager;

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
    const iconPath = path.join(app.getAppPath(), 'src', 'renderer', 'assets', 'icon.png');

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
    const iconPath = path.join(app.getAppPath(), 'src', 'renderer', 'assets', 'icon.png');

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

function createPlayerWindow() {
    const preloadScriptPath = path.join(app.getAppPath(), 'src', 'main', 'preload-player.js');
    const htmlPath = path.join(app.getAppPath(), 'src', 'renderer', 'html', 'player.html');
    const iconPath = path.join(app.getAppPath(), 'src', 'renderer', 'assets', 'icon.png');

    console.log(`[Main] Loading playerWindow. Preload path: ${preloadScriptPath}`);

    playerWindow = new BrowserWindow({
        width: 1200,
        height: 600,
        minWidth: 1200,
        minHeight: 600,
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
        playerWindow = null;
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
            const syncState = playbackManager.getCurrentSyncState();
            if (syncState.currentSong) {
                console.log(`[Main] Syncing new audience window on display ${display.id} with ${syncState.eventHistory.length} events.`);
                audienceWindow.webContents.send('playback:sync', syncState);
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
    createMainWindow();

    const broadcastToAllWindows = (channel, ...args) => {
        const windows = [playerWindow, ...audienceWindows.values()];
        for (const window of windows) {
            if (window && !window.isDestroyed()) {
                window.webContents.send(channel, ...args);
            }
        }
    };

    playbackManager = new PlaybackManager(broadcastToAllWindows);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });

    screen.on('display-added', () => {
        sendDisplaysUpdate();
        updateAudienceWindows();
    });
    screen.on('display-removed', () => {
        sendDisplaysUpdate();
        updateAudienceWindows();
    });
});

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
        return songData;

    } catch (error) {
        console.error(`[Main] Error opening project: ${error.message}`);
        throw new Error(`Failed to open project file. Reason: ${error.message}`);
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


ipcMain.on('playback:load-song', (event, song) => {
    playbackManager.loadSong(song);
});

ipcMain.on('playback:unload-song', () => {
    playbackManager.unloadSong();
});

ipcMain.on('playback:update-bpm', (event, { bpm, bpmUnit }) => {
    playbackManager.updateBpm(bpm, bpmUnit);
});

ipcMain.on('playback:play', () => {
    playbackManager.play();
});

ipcMain.on('playback:pause', (event, timeOverride) => {
    playbackManager.pause(timeOverride);
});

ipcMain.on('playback:jump', (event, timeInMs) => {
    playbackManager.jump(timeInMs);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});