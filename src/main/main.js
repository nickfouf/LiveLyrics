const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');
const SystemFonts = require('dnm-font-manager').default;
const systemFonts = new SystemFonts();
const crypto = require('crypto');
const archiver = require('archiver');
const extract = require('extract-zip');
const { PlaybackManager } = require('./playbackManager'); // ADDED

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
    // Construct absolute paths from the application's root directory
    const preloadScriptPath = path.join(app.getAppPath(), 'src', 'main', 'preload.js');
    const htmlPath = path.join(app.getAppPath(), 'src', 'renderer', 'html', 'index.html');
    const iconPath = path.join(app.getAppPath(), 'src', 'renderer', 'assets', 'icon.png');

    // DEBUG: This will show in your terminal/command prompt
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

    // MODIFIED: Call both functions once the window has loaded.
    playerWindow.webContents.on('did-finish-load', () => {
        sendDisplaysUpdate();
        updateAudienceWindows(); // This will create audience windows on startup.
    });

    const sendMaximizedState = () => {
        if (playerWindow && !playerWindow.isDestroyed()) {
            playerWindow.webContents.send('window-maximized-state', playerWindow.isMaximized());
        }
    };
    playerWindow.on('maximize', sendMaximizedState);
    playerWindow.on('unmaximize', sendMaximizedState);
    playerWindow.on('closed', () => {
        // Close all audience windows when the main player is closed.
        for (const window of audienceWindows.values()) {
            window.close();
        }
        playerWindow = null;
    });

    // When the player window moves to a new display, we need to update the audience windows.
    playerWindow.on('move', () => {
        updateAudienceWindows();
        sendDisplaysUpdate(); // Also update the UI to show the new active display
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

    // REWRITTEN: This logic is now much more robust for syncing new windows.
    audienceWindow.webContents.on('did-finish-load', () => {
        if (playbackManager) {
            const syncState = playbackManager.getCurrentSyncState();
            // Only send the sync state if a song is actually loaded.
            if (syncState.currentSong) {
                console.log(`[Main] Syncing new audience window on display ${display.id} with ${syncState.eventHistory.length} events.`);
                // Send the full song data and the entire event history. The renderer
                // will replay the history to get to the current state.
                audienceWindow.webContents.send('playback:sync', syncState);
            }
        }
    });

    // When an audience window is closed (e.g., display disconnected), remove it from our map.
    audienceWindow.on('closed', () => {
        audienceWindows.delete(display.id);
    });

    // Store the new window in the map.
    audienceWindows.set(display.id, audienceWindow);
}

/**
 * NEW: Central function to synchronize audience windows.
 * It ensures an audience window exists on every display except the presenter's.
 */
function updateAudienceWindows() {
    if (!playerWindow) return;

    const allDisplays = screen.getAllDisplays();
    const playerBounds = playerWindow.getBounds();
    const presenterDisplay = screen.getDisplayMatching(playerBounds) || screen.getPrimaryDisplay();

    const audienceDisplayIds = new Set(allDisplays.filter(d => d.id !== presenterDisplay.id).map(d => d.id));
    const openWindowIds = new Set(audienceWindows.keys());

    // Close windows on displays that are no longer for the audience
    for (const displayId of openWindowIds) {
        if (!audienceDisplayIds.has(displayId)) {
            audienceWindows.get(displayId)?.close();
        }
    }

    // Open windows on new audience displays
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

    // MODIFIED: Function to broadcast to all relevant windows
    const broadcastToAllWindows = (channel, ...args) => {
        const windows = [playerWindow, ...audienceWindows.values()];
        for (const window of windows) {
            if (window && !window.isDestroyed()) {
                window.webContents.send(channel, ...args);
            }
        }
    };

    // ADDED: Initialize the playback manager with our broadcast function
    playbackManager = new PlaybackManager(broadcastToAllWindows);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });

    // MODIFIED: This logic now automatically manages audience windows when displays are added/removed while "live".
    const manageAudienceWindows = () => {
        // This function should only run if we are "live" (i.e., audienceWindows has entries).
        if (audienceWindows.size === 0 || !playerWindow) {
            return;
        }

        const allDisplays = screen.getAllDisplays();
        const playerBounds = playerWindow.getBounds();
        const presenterDisplay = screen.getDisplayMatching(playerBounds) || screen.getPrimaryDisplay();

        const currentDisplayIds = new Set(allDisplays.map(d => d.id));
        const openWindowIds = new Set(audienceWindows.keys());

        // Close windows for displays that have been removed
        for (const displayId of openWindowIds) {
            if (!currentDisplayIds.has(displayId)) {
                const windowToClose = audienceWindows.get(displayId);
                windowToClose?.close(); // The 'closed' event will handle deletion from the map
            }
        }

        // Open windows for new displays
        for (const display of allDisplays) {
            // Don't open on the presenter's display or if a window already exists.
            if (display.id !== presenterDisplay.id && !openWindowIds.has(display.id)) {
                createAudienceWindow(display);
            }
        }
    };

    // MODIFIED: Always send display updates to the player, and also manage live windows if active.
    screen.on('display-added', () => {
        sendDisplaysUpdate();
        updateAudienceWindows();
    });
    screen.on('display-removed', () => {
        sendDisplaysUpdate();
        updateAudienceWindows();
    });
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

// New IPC handler to set the editor window title
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
        console.log(fonts);
        // Create a sorted list of unique font family names
        return [...new Set(fonts)].sort();
    } catch (error) {
        console.error("Failed to get system fonts:", error);
        return [];
    }
});

// --- ADDED: Project Temp Folder and File Copying Logic ---

/**
 * Generates a SHA-256 checksum for a file.
 * @param {string} filePath The path to the file.
 * @returns {Promise<string>} A promise that resolves with the hex checksum.
 */
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

// ADDED: Generic handler for showing any "open file" dialog
ipcMain.handle('dialog:showOpenDialog', async (event, options) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(parentWindow, options);
    if (!canceled && filePaths.length > 0) {
        return filePaths[0];
    }
    return null;
});

// MODIFIED: Handler to process assets, with checksum logic
ipcMain.handle('project:addAsset', async (event, originalPath) => {
    if (!originalPath || !fs.existsSync(originalPath)) {
        throw new Error('File does not exist at the provided path.');
    }

    try {
        const checksum = await generateFileChecksum(originalPath);
        const extension = path.extname(originalPath);
        const newFileName = `${checksum}${extension}`;
        const destPath = path.join(assetsTempPath, newFileName);

        // Check if file with this checksum already exists
        if (fs.existsSync(destPath)) {
            console.log(`[Main] Asset already exists, skipping copy: ${newFileName}`);
            const finalUrl = url.format({ pathname: destPath, protocol: 'file:', slashes: true });
            const alias = path.basename(originalPath);

            // For smart effects, we still need to read and return the content
            if (extension.toLowerCase() === '.json') {
                const content = await fs.promises.readFile(originalPath, 'utf-8');
                return { filePath: finalUrl, content, alias };
            }
            return { filePath: finalUrl, alias };
        }

        // If it doesn't exist, perform a cancellable copy
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
        throw error; // Re-throw to be caught by the renderer
    }
});

// ADDED: Handler to clean up unused assets from the temp folder
ipcMain.handle('project:cleanUnusedAssets', async (event, usedAssets) => {
    if (!Array.isArray(usedAssets)) {
        console.error('[Main] cleanUnusedAssets: provided usedAssets is not an array.');
        return;
    }

    try {
        // Convert file URLs to file paths and get just the filename
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

// --- REFACTORED: Save Logic ---

/**
 * Core logic to save the project data and assets to a .lyx zip file.
 * @param {string} filePath The absolute path to save the file to.
 * @param {object} data The project data from the renderer.
 * @param {object} data.songData The serialized song object.
 * @param {string[]} data.usedAssets An array of file URLs for all used assets.
 * @returns {Promise<boolean>} A promise that resolves to true on success.
 */
async function saveProject(filePath, { songData, usedAssets }) {
    // 1. Create a recursive function to replace asset paths in songData
    function relativizeAssetPaths(obj) {
        for (const key in obj) {
            if (typeof obj[key] === 'string' && obj[key].startsWith('file:///')) {
                try {
                    const assetPath = url.fileURLToPath(obj[key]);
                    const assetFilename = path.basename(assetPath);
                    obj[key] = `assets/${assetFilename}`; // The new relative path
                } catch (e) {
                    console.warn(`Could not convert asset URL to path: ${obj[key]}`);
                }
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                relativizeAssetPaths(obj[key]);
            }
        }
    }

    relativizeAssetPaths(songData);

    // 2. Create and write the zip file
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

        // Add song.json
        archive.append(JSON.stringify(songData, null, 2), { name: 'song.json' });

        // Add used assets
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

// This handler now simply calls the reusable saveProject function.
ipcMain.handle('project:save', async (event, filePath, data) => {
    return saveProject(filePath, data);
});

// This handler now only shows the dialog and returns the chosen path.
ipcMain.handle('dialog:showSaveAsDialog', async (event, options) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(parentWindow, options);
    if (canceled) {
        return null;
    }
    return filePath;
});

// --- ADDED: Load Logic ---
ipcMain.handle('project:open', async (event, filePath) => {
    try {
        // 1. Clean and create temp directory
        await fs.promises.rm(projectTempPath, { recursive: true, force: true });
        await fs.promises.mkdir(projectTempPath, { recursive: true });

        // 2. Unzip the project
        await extract(filePath, { dir: projectTempPath });

        // 3. Read and parse song.json
        const songJsonPath = path.join(projectTempPath, 'song.json');
        if (!fs.existsSync(songJsonPath)) {
            throw new Error("Project file is invalid or corrupt: 'song.json' not found.");
        }
        const songDataRaw = await fs.promises.readFile(songJsonPath, 'utf-8');
        const songData = JSON.parse(songDataRaw);

        // 4. Convert asset paths to absolute file URLs
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
        // Re-throw the error so the renderer's catch block can display it
        throw new Error(`Failed to open project file. Reason: ${error.message}`);
    }
});

// --- REFACTORED: Audience Window IPC ---

// NEW: This handler moves the player window and updates audience windows accordingly.
ipcMain.on('player:set-presenter-display', (event, displayId) => {
    if (!playerWindow) return;

    const targetDisplay = screen.getAllDisplays().find(d => d.id.toString() === displayId.toString());
    if (!targetDisplay) return;

    // MODIFIED: Get the current window state and bounds before changing them.
    const wasFullScreen = playerWindow.isFullScreen();
    const wasMaximized = playerWindow.isMaximized();
    const currentBounds = playerWindow.getBounds();
    const sourceDisplay = screen.getDisplayMatching(currentBounds);

    // Calculate the window's proportional position on the source display.
    // Fallback to 0 if the source display can't be found or has no width/height.
    const relativeXProportion = sourceDisplay?.bounds.width > 0
        ? (currentBounds.x - sourceDisplay.bounds.x) / sourceDisplay.bounds.width
        : 0;
    const relativeYProportion = sourceDisplay?.bounds.height > 0
        ? (currentBounds.y - sourceDisplay.bounds.y) / sourceDisplay.bounds.height
        : 0;

    // Exit fullscreen or maximized state before moving to ensure setBounds works reliably.
    if (wasFullScreen) {
        playerWindow.setFullScreen(false);
    } else if (wasMaximized) {
        playerWindow.unmaximize();
    }

    // Calculate the new top-left coordinates on the target display.
    const newX = Math.round(targetDisplay.bounds.x + (relativeXProportion * targetDisplay.bounds.width));
    const newY = Math.round(targetDisplay.bounds.y + (relativeYProportion * targetDisplay.bounds.height));

    // Set the new bounds, preserving the original size and applying the new proportional position.
    playerWindow.setBounds({
        x: newX,
        y: newY,
        width: currentBounds.width,
        height: currentBounds.height
    });

    // Restore the window state on the new display.
    if (wasFullScreen) {
        playerWindow.setFullScreen(true);
    } else if (wasMaximized) {
        playerWindow.maximize();
    }
});

// This handler broadcasts updates to all open audience windows.
ipcMain.on('audience:update', (event, data) => {
    for (const window of audienceWindows.values()) {
        if (window && !window.isDestroyed()) {
            window.webContents.send('audience:render', data);
        }
    }
});

// --- REFACTORED: Playback IPC Broadcasting ---

// MODIFIED: All playback controls now just call the manager's methods.
// The manager is responsible for creating and broadcasting the events.

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

// MODIFIED: The pause handler can now receive an optional time.
ipcMain.on('playback:pause', (event, timeOverride) => {
    playbackManager.pause(timeOverride);
});

ipcMain.on('playback:jump', (event, timeInMs) => {
    playbackManager.jump(timeInMs);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});