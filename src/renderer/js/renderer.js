console.log('✅ renderer.js loaded successfully');

window.addEventListener('DOMContentLoaded', () => {
    // This check is crucial for debugging
    if (!window.electronAPI) {
        console.error('❌ electronAPI is NOT available. Check main.js webPreferences and preload.js script path.');
        return;
    }
    console.log('✅ electronAPI is available on window object.');

    // --- Window Elements ---
    const editorBtn = document.getElementById('editor-btn');
    const playerBtn = document.getElementById('player-btn');
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');
    const versionSpan = document.getElementById('app-version');

    // --- Updater UI Elements ---
    const updaterOverlay = document.getElementById('updater-dialog-overlay');
    const updateAvailableDialog = document.getElementById('update-available-dialog');
    const downloadProgressDialog = document.getElementById('download-progress-dialog');
    const downloadFailedDialog = document.getElementById('download-failed-dialog');
    const updateReadyDialog = document.getElementById('update-ready-dialog');
    const updateLaterBtn = document.getElementById('update-later-btn');
    const updateDownloadBtn = document.getElementById('update-download-btn');
    const downloadFailedOkBtn = document.getElementById('download-failed-ok-btn');
    const updateRestartLaterBtn = document.getElementById('update-restart-later-btn');
    const updateRestartNowBtn = document.getElementById('update-restart-now-btn');
    const newVersionSpan = document.getElementById('new-version-span');
    const currentVersionSpan = document.getElementById('current-version-span');
    const progressBar = document.getElementById('download-progress-bar');
    const progressText = document.getElementById('download-progress-text');

    let updateInfoCache = null; // Cache the info in case of download failure

    // --- App Version Display ---
    const displayAppVersion = async () => {
        try {
            const version = await window.electronAPI.getAppVersion();
            if (versionSpan) versionSpan.textContent = `v${version}`;
            if (currentVersionSpan) currentVersionSpan.textContent = `v${version}`;
        } catch (error) {
            console.error('Failed to get app version:', error);
            if (versionSpan) versionSpan.textContent = 'v?.?.?';
        }
    };

    // --- Dialog Management ---
    const showDialog = (dialogElement) => {
        if (!updaterOverlay || !dialogElement) {
            console.error('Could not find updater overlay or dialog element.');
            return;
        }
        // Hide all dialogs first to be safe
        updaterOverlay.querySelectorAll('.dialog-content').forEach(d => d.style.display = 'none');
        // Show the specific dialog
        dialogElement.style.display = 'flex';
        // Show the overlay
        updaterOverlay.classList.add('visible');
    };

    const hideAllDialogs = () => {
        if (updaterOverlay) {
            updaterOverlay.classList.remove('visible');
        }
    };

    // --- Main Logic ---

    // Initial setup
    displayAppVersion();

    // Menu Buttons
    editorBtn.addEventListener('click', () => window.electronAPI.openEditor());
    playerBtn.addEventListener('click', () => window.electronAPI.openPlayer());

    // Window Controls
    minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
    maximizeBtn.addEventListener('click', () => window.electronAPI.maximizeWindow());
    closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());
    window.electronAPI.onWindowStateChange((isMaximized) => {
        maximizeBtn.classList.toggle('is-maximized', isMaximized);
    });

    // --- Updater Event Listeners ---
    window.electronAPI.onUpdateAvailable((info) => {
        console.log('Renderer received: update-available', info);
        updateInfoCache = info;
        if (newVersionSpan) newVersionSpan.textContent = `v${info.version}`;
        showDialog(updateAvailableDialog);
    });

    window.electronAPI.onDownloadProgress((progress) => {
        console.log('Renderer received: download-progress', progress);
        if (progressBar) progressBar.style.width = `${progress.percent.toFixed(2)}%`;
        if (progressText) {
            const downloadedMb = (progress.transferred / 1024 / 1024).toFixed(2);
            const totalMb = (progress.total / 1024 / 1024).toFixed(2);
            progressText.textContent = `${progress.percent.toFixed(0)}% (${downloadedMb}MB / ${totalMb}MB)`;
        }
        // Ensure the progress dialog is visible
        if (!updaterOverlay.classList.contains('visible') || downloadProgressDialog.style.display === 'none') {
            showDialog(downloadProgressDialog);
        }
    });

    window.electronAPI.onUpdateDownloaded(() => {
        console.log('Renderer received: update-downloaded');
        showDialog(updateReadyDialog);
    });

    window.electronAPI.onUpdaterError((err) => {
        console.error('Renderer received: updater-error', err);
        showDialog(downloadFailedDialog);
    });

    // --- Updater Button Click Handlers ---
    updateDownloadBtn.addEventListener('click', () => {
        if (progressBar) progressBar.style.width = '0%';
        if (progressText) progressText.textContent = 'Starting download...';
        showDialog(downloadProgressDialog);
        window.electronAPI.startDownload();
    });

    updateLaterBtn.addEventListener('click', hideAllDialogs);

    downloadFailedOkBtn.addEventListener('click', () => {
        // Re-show the initial update available dialog using cached info
        if (updateInfoCache) {
            showDialog(updateAvailableDialog);
        } else {
            hideAllDialogs();
        }
    });

    updateRestartLaterBtn.addEventListener('click', hideAllDialogs);

    updateRestartNowBtn.addEventListener('click', () => {
        window.electronAPI.quitAndInstall();
    });
});



