import { initDOM, DOM } from './dom.js';
import { DomManager } from '../renderer/domManager.js';
import { TimelineManager } from '../renderer/timeline/TimelineManager.js';
import { state, updateState } from '../editor/state.js';
import { initSongsManager, addSongFromPath, songPlaylist } from './songsManager.js';
import { initPlayerPlayback, handlePlaybackUpdate, localPlaybackState } from './playback.js';
import { initAlertDialog, showAlertDialog } from '../editor/alertDialog.js';
import { initConfirmationDialog, showConfirmationDialog } from './confirmationDialog.js';
import { initLoadingDialog } from '../editor/loadingDialog.js';
import { applyViewportScaling } from '../editor/rendering.js';

// --- REWRITTEN: Device Controller Logic ---

// State
let discoverableDevices = new Map();
let connectingDeviceId = null; // MODIFIED: Tracks the device ID currently being paired.
let pendingPairingDeviceId = null;
let connectedDevice = null;
let isManualDisconnect = false; // ADDED: Flag to track user-initiated disconnects

function sendMessageToMain(type, payload) {
    switch(type) {
        case 'initiatePairing':
            window.playerAPI.initiatePairing(payload.deviceId);
            break;
        case 'cancelPairing':
            window.playerAPI.cancelPairing(payload.deviceId);
            break;
        case 'respondToPairingRequest':
            window.playerAPI.respondToPairing(payload.deviceId, payload.accepted);
            break;
        case 'disconnectDevice':
            window.playerAPI.disconnectDevice();
            break;
    }
}

function renderDeviceList() {
    if (!DOM.deviceList) return;
    const devices = Array.from(discoverableDevices.values());
    DOM.deviceList.innerHTML = '';

    if (devices.length === 0) {
        DOM.deviceList.innerHTML = '<li class="device-list-item-empty">No devices found on the network.</li>';
        return;
    }

    devices.forEach(device => {
        const isConnected = connectedDevice && connectedDevice.id === device.deviceId;
        const isConnecting = connectingDeviceId === device.deviceId;
        const li = document.createElement('li');
        li.className = 'device-list-item';
        li.dataset.deviceId = device.deviceId;

        let buttonClass, buttonText, buttonAction;

        if (isConnected) {
            buttonClass = 'danger-btn';
            buttonText = 'Unpair';
            buttonAction = 'unpair';
        } else if (isConnecting) {
            buttonClass = 'danger-btn';
            buttonText = 'Cancel';
            buttonAction = 'cancel';
        } else {
            buttonClass = 'primary-btn';
            buttonText = 'Pair';
            buttonAction = 'pair';
        }

        li.innerHTML = `
            <div class="device-list-details">
                <span class="device-name">${device.deviceName}</span>
                <span class="device-id-secondary">${device.deviceId}</span>
            </div>
            <button class="action-btn pair-btn ${buttonClass}" data-action="${buttonAction}">${buttonText}</button>
        `;
        DOM.deviceList.appendChild(li);
    });
}

function showDeviceListDialog() {
    if (!DOM.deviceListDialog) return;
    renderDeviceList();
    DOM.deviceListDialog.classList.add('visible');
}

function hideDeviceListDialog() {
    if (!DOM.deviceListDialog) return;
    DOM.deviceListDialog.classList.remove('visible');
}

function showPairingDialog({ deviceId, deviceName }) {
    pendingPairingDeviceId = deviceId;
    DOM.pairingDeviceIdEl.textContent = `${deviceName} (${deviceId})`;
    DOM.pairingDialog.classList.add('visible');
}

function hidePairingDialog() {
    DOM.pairingDialog.classList.remove('visible');
    pendingPairingDeviceId = null;
}

function updateDeviceStatusUI(status, device = null) {
    if (status === 'connected' && device) {
        connectedDevice = device;
        DOM.deviceStatusIndicator.classList.remove('offline');
        DOM.deviceStatusIndicator.classList.add('online');
        DOM.deviceStatusText.textContent = 'Connected';
        DOM.deviceNameValue.textContent = device.name;
        DOM.deviceIpValue.textContent = device.ips.join(', ');
        DOM.disconnectDeviceBtn.classList.remove('noneDisplay');
        DOM.openDeviceListBtn.textContent = 'Open Device List';
    } else {
        connectedDevice = null;
        DOM.deviceStatusIndicator.classList.remove('online');
        DOM.deviceStatusIndicator.classList.add('offline');
        DOM.deviceStatusText.textContent = status === 'searching' ? 'Searching...' : 'Offline';
        DOM.deviceNameValue.textContent = 'Not Connected';
        DOM.deviceIpValue.textContent = '---';
        DOM.disconnectDeviceBtn.classList.add('noneDisplay');
        DOM.openDeviceListBtn.textContent = 'Open Device List';
    }
}

// ADDED: Centralized function to handle the UI and state transition to disconnected.
function handleDisconnectionUI() {
    connectingDeviceId = null;
    isManualDisconnect = false; // Reset the flag here, as this is the final state.
    updateDeviceStatusUI('offline');
    if (DOM.deviceListDialog.classList.contains('visible')) {
        renderDeviceList();
    }
    // ADDED: Also hide the pairing dialog if it was open.
    if (DOM.pairingDialog.classList.contains('visible')) {
        hidePairingDialog();
    }
}

function initDeviceController() {
    // Initial state
    updateDeviceStatusUI('searching');

    // Listeners for UI actions
    DOM.openDeviceListBtn.addEventListener('click', showDeviceListDialog);
    DOM.disconnectDeviceBtn.addEventListener('click', async () => {
        if (!connectedDevice) return;
        const confirmed = await showConfirmationDialog(
            `Are you sure you want to disconnect from ${connectedDevice.name}?`,
            'Confirm Disconnect'
        );
        if (confirmed) {
            isManualDisconnect = true; // MODIFIED: Set flag before sending command
            sendMessageToMain('disconnectDevice');
        }
    });
    DOM.closeDeviceListBtn.addEventListener('click', hideDeviceListDialog);
    DOM.deviceListDialog.addEventListener('click', (e) => {
        if (e.target === DOM.deviceListDialog) hideDeviceListDialog();
    });

    // Event delegation for pair/unpair buttons
    DOM.deviceList.addEventListener('click', async (e) => {
        const actionButton = e.target.closest('.pair-btn');
        const deviceItem = e.target.closest('.device-list-item');
        if (!actionButton || !deviceItem) return;

        const deviceId = deviceItem.dataset.deviceId;
        const action = actionButton.dataset.action;

        if (action === 'pair') {
            if (connectingDeviceId) return; // Prevent multiple pairing attempts at once
            connectingDeviceId = deviceId;
            renderDeviceList(); // Re-render to show the "Cancel" button
            sendMessageToMain('initiatePairing', { deviceId });
        } else if (action === 'unpair') {
            const confirmed = await showConfirmationDialog(
                `Are you sure you want to disconnect from ${connectedDevice.name}?`,
                'Confirm Disconnect'
            );
            if (confirmed) {
                isManualDisconnect = true; // MODIFIED: Set flag before sending command
                sendMessageToMain('disconnectDevice');
            }
        } else if (action === 'cancel') {
            sendMessageToMain('cancelPairing', { deviceId });
            // The onDisconnect event triggered by the cancellation will handle resetting the UI.
        }
    });

    // Pairing dialog buttons
    DOM.acceptPairBtn.addEventListener('click', () => {
        if (pendingPairingDeviceId) {
            sendMessageToMain('respondToPairingRequest', { deviceId: pendingPairingDeviceId, accepted: true });
            hidePairingDialog();
        }
    });
    DOM.rejectPairBtn.addEventListener('click', () => {
        if (pendingPairingDeviceId) {
            sendMessageToMain('respondToPairingRequest', { deviceId: pendingPairingDeviceId, accepted: false });
            hidePairingDialog();
        }
    });

    // Listeners for events from Main process
    window.playerAPI.onDeviceUpdate((devices) => {
        discoverableDevices.clear();
        devices.forEach(d => discoverableDevices.set(d.deviceId, d));
        if (DOM.deviceListDialog.classList.contains('visible')) {
            renderDeviceList();
        }
    });

    window.playerAPI.onInfoUpdate((device) => {
        console.log('Received device info update:', device);
        if (connectedDevice && connectedDevice.id === device.id) {
            updateDeviceStatusUI('connected', device);
        }
    });

    window.playerAPI.onPairingRequest(({ deviceId, deviceName }) => {
        showPairingDialog({ deviceId, deviceName });
    });

    window.playerAPI.onConnectionSuccess((device) => {
        connectingDeviceId = null;
        isManualDisconnect = false; // MODIFIED: Reset flag on successful connection
        hideDeviceListDialog();
        updateDeviceStatusUI('connected', device);
    });

    window.playerAPI.onDisconnect((payload) => {
        connectingDeviceId = null; // Always reset on disconnect
        // MODIFIED: Check the flag to prevent showing a dialog on manual disconnect.
        if (isManualDisconnect) {
            handleDisconnectionUI();
            return;
        }

        handleDisconnectionUI(); // Still update the UI to offline
        if (payload) {
            if (payload.reason === 'remote') {
                showAlertDialog('Device Disconnected', 'The other device has disconnected.');
            } else if (payload.reason === 'network') {
                showAlertDialog('Connection Lost', 'The connection was lost due to a network failure.');
            }
        }
    });

    // REVISED: This is the critical fix. The UI will no longer assume every
    // error means a disconnection.
    window.playerAPI.onError((message) => {
        // Errors related to the pairing process are fatal and should reset the UI.
        const isPairingError = message && (
            message.toLowerCase().includes('pairing') ||
            message.toLowerCase().includes('rejected') ||
            message.toLowerCase().includes('canceled by user')
        );

        if (isPairingError) {
            console.warn(`[Device Controller] Pairing process failed or was canceled: ${message}`);
            // Reset the pairing attempt state and UI to disconnected.
            connectingDeviceId = null;
            handleDisconnectionUI();
            // Show a user-friendly message for these specific failures.
            showAlertDialog('Pairing Failed', message);
            return;
        }

        // For all other errors (like a temporary keep-alive timeout on one of multiple
        // network paths), we should NOT change the UI state to disconnected. The main
        // process is the source of truth for the connection status and will send a
        // dedicated 'onDisconnect' event if the device is truly lost. We just log
        // these non-fatal errors for debugging.
        console.error(`[Device Controller] Received a non-fatal error from the main process: ${message}`);
    });

    // Tell main process we are ready
    window.playerAPI.readyForDevices();
}
// --- End Device Controller Logic ---

// --- NEW Panel Collapse/Expand Logic ---
function setupPanels() {
    // Left Panel: Songs Manager
    DOM.songsManagerPanelHeader.addEventListener('click', () => {
        DOM.songsManagerPanel.classList.toggle('collapsed');
        DOM.songsManagerPanelHandle.classList.toggle('visible');
    });
    DOM.songsManagerPanelHandle.addEventListener('click', () => {
        DOM.songsManagerPanel.classList.remove('collapsed');
        DOM.songsManagerPanelHandle.classList.remove('visible');
    });

    // Right Panel: Configuration
    DOM.configurationPanelHeader.addEventListener('click', () => {
        DOM.configurationPanel.classList.toggle('collapsed');
        DOM.configurationPanelHandle.classList.toggle('visible');
    });
    DOM.configurationPanelHandle.addEventListener('click', () => {
        DOM.configurationPanel.classList.remove('collapsed');
        DOM.configurationPanelHandle.classList.remove('visible');
    });
}

// --- REVISED: Display Settings Logic ---

let lastDisplayInfo = null; // Cache for UI updates
let viewedDisplayId = null; // Which monitor's details are being viewed.
let monitorLatencies = new Map(); // Store latency per display ID

/**
 * REVISED: Renders monitor tabs and their corresponding option panels.
 * @param {object} displayInfo - The display info object from the main process.
 * @param {Electron.Display[]} displayInfo.allDisplays - An array of all display objects.
 * @param {Electron.Display} displayInfo.presenterDisplay - The display the player window is currently on.
 */
function renderDisplayTabs({ allDisplays, presenterDisplay }) {
    const tabsContainer = DOM.presenterMonitorTabs;
    const optionsContainer = document.getElementById('monitor-options-container');
    if (!tabsContainer || !optionsContainer) return;

    // If no display is being viewed, or the viewed one was removed, default to the presenter display.
    if (viewedDisplayId === null || !allDisplays.some(d => d.id === viewedDisplayId)) {
        viewedDisplayId = presenterDisplay.id;
    }

    tabsContainer.innerHTML = '';
    optionsContainer.innerHTML = '';

    allDisplays.forEach((display) => {
        const isPresenter = display.id === presenterDisplay.id;
        const isBeingViewed = display.id === viewedDisplayId;

        // 1. Create the tab button
        const displayBtn = document.createElement('button');
        displayBtn.className = 'tab-btn';
        displayBtn.textContent = display.label || `Display ${display.id}`;
        displayBtn.title = `${display.size.width}x${display.size.height}`;
        displayBtn.dataset.displayId = display.id;

        // Apply class for presenter (underline)
        if (isPresenter) {
            displayBtn.classList.add('presenter');
        }

        // Apply class for the currently selected/viewed tab (blue background)
        if (isBeingViewed) {
            displayBtn.classList.add('active');
        }
        tabsContainer.appendChild(displayBtn);

        // 2. Create the options panel for this monitor
        const optionsPanel = document.createElement('div');
        optionsPanel.className = 'monitor-options';
        optionsPanel.dataset.displayId = display.id;
        if (isBeingViewed) {
            optionsPanel.classList.add('active'); // This class makes it visible (display: flex)
        }

        const role = isPresenter ? 'Presenter' : 'Audience';
        let makePresenterBtnHtml = '';
        if (!isPresenter) {
            makePresenterBtnHtml = `<button class="action-btn secondary-btn make-presenter-btn" data-display-id="${display.id}">Make Presenter</button>`;
        }

        const currentLatency = monitorLatencies.get(display.id) || 0;
        const latencyControlHtml = `
            <div class="latency-control">
                <label for="latency-input-${display.id}">Latency:</label>
                <input type="number" id="latency-input-${display.id}" class="form-input" value="${currentLatency}" min="0" step="1" data-display-id="${display.id}">
                <span class="unit-label">ms</span>
            </div>
        `;

        optionsPanel.innerHTML = `
            <div class="monitor-role-info">
                <span class="monitor-role-label">Role:</span>
                <span>${role}</span>
            </div>
            ${latencyControlHtml}
            ${makePresenterBtnHtml}
        `;
        optionsContainer.appendChild(optionsPanel);
    });
}


/**
 * REVISED: Sets up event listeners for the new display settings UI.
 */
function initDisplaySettings() {
    const tabsContainer = DOM.presenterMonitorTabs;
    const optionsContainer = document.getElementById('monitor-options-container');
    if (!tabsContainer || !optionsContainer) return;

    // Listen for display changes from the main process.
    window.playerAPI.onDisplaysChanged((displayInfo) => {
        console.log('Displays changed, updating UI.', displayInfo);
        lastDisplayInfo = displayInfo; // Cache the latest info
        renderDisplayTabs(displayInfo);
    });

    // Event listener for clicking on tabs
    tabsContainer.addEventListener('click', (e) => {
        const tabTarget = e.target.closest('.tab-btn');
        if (tabTarget) {
            const displayId = Number(tabTarget.dataset.displayId);
            if (displayId === viewedDisplayId) return; // Already viewing this one.

            viewedDisplayId = displayId;
            // Re-render with the cached data to update which options panel is visible.
            if (lastDisplayInfo) {
                renderDisplayTabs(lastDisplayInfo);
            }
        }
    });

    // Event listener for actions inside the options panels
    optionsContainer.addEventListener('click', (e) => {
        const buttonTarget = e.target.closest('.make-presenter-btn');
        if (buttonTarget) {
            const displayId = buttonTarget.dataset.displayId;
            viewedDisplayId = Number(displayId);
            window.playerAPI.setPresenterDisplay(displayId);
        }
    });

    optionsContainer.addEventListener('input', (e) => {
        const latencyInput = e.target;
        if (latencyInput.type === 'number' && latencyInput.id.startsWith('latency-input-')) {
            const displayId = Number(latencyInput.dataset.displayId);
            const latency = Math.max(0, parseInt(latencyInput.value, 10) || 0);
            monitorLatencies.set(displayId, latency);
            window.playerAPI.setLatency(displayId, latency);
        }
    });
}


// --- NEW Configuration Panel Logic ---
function initConfigurationPanel() {
    // 1. Display Settings
    initDisplaySettings();

    // 2. Audio Settings: Output Device
    DOM.audioOutputDeviceSelect.addEventListener('change', (e) => {
        // TODO: Add logic to change audio output device
        console.log(`Audio output device changed to: ${e.target.value}`);
    });

    // 3. Audio Settings: Volume Slider
    DOM.audioVolumeSlider.addEventListener('input', (e) => {
        const volume = e.target.value;
        DOM.volumeLevelDisplay.textContent = `${volume}%`;
        // TODO: Add logic to change system volume
    });
}

function setupTitleBar() {
    DOM.minimizeBtn.addEventListener('click', () => window.playerAPI.minimizeWindow());
    DOM.maximizeBtn.addEventListener('click', () => window.playerAPI.maximizeWindow());
    DOM.closeBtn.addEventListener('click', () => window.playerAPI.closeWindow());

    window.playerAPI.onWindowStateChange((isMaximized) => {
        DOM.maximizeBtn.classList.toggle('is-maximized', isMaximized);
    });
}

function setupPlayerBPMControls() {
    const bpmValueInput = document.getElementById('bpm-value-input');
    const customSelect = document.getElementById('bpm-note-select-custom');
    if (!bpmValueInput || !customSelect) return;

    const selected = customSelect.querySelector('.select-selected');
    const items = customSelect.querySelector('.select-items');

    const handleBPMChange = () => {
        const newBpm = parseInt(bpmValueInput.value, 10);
        const newBpmUnit = selected.dataset.value;

        if (isNaN(newBpm) || newBpm <= 0 || !state.song) return;

        // Send a single command to the main process. The main process will handle
        // creating the timestamped event and broadcasting it to all windows.
        const timestamp = performance.timeOrigin + performance.now();
        window.playerAPI.updateBpm(newBpm, newBpmUnit, timestamp);
    };

    // --- BPM Input Listener ---
    bpmValueInput.addEventListener('change', handleBPMChange);

    // --- Custom Select Logic ---
    document.addEventListener('click', (e) => {
        if (!customSelect.contains(e.target)) {
            items.classList.add('select-hide');
        }
    });

    selected.addEventListener('click', (e) => {
        if (selected.getAttribute('tabindex') === '-1') return; // Disabled
        e.stopPropagation();
        items.classList.toggle('select-hide');
    });

    items.querySelectorAll('div').forEach(option => {
        option.addEventListener('click', function() {
            const value = this.dataset.value;
            const content = this.innerHTML;
            selected.innerHTML = content;
            selected.dataset.value = value;
            items.classList.add('select-hide');
            handleBPMChange();
        });
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize DOM references and Title Bar controls
    initDOM();
    setupTitleBar();

    // 2. Initialize UI Modules (Dialogs)
    initAlertDialog();
    initConfirmationDialog();
    initLoadingDialog();
    setupPanels();

    // ADDED: Back to main menu button
    const backToMainMenuBtn = document.getElementById('player-back-to-main-menu-btn');
    if (backToMainMenuBtn) {
        backToMainMenuBtn.addEventListener('click', async () => {
            // Check if there are songs in the playlist
            if (songPlaylist.length > 0) {
                const confirmed = await showConfirmationDialog(
                    'Are you sure you want to return to the main menu? The current playlist will be cleared.',
                    'Return to Menu'
                );
                if (!confirmed) {
                    return; // User clicked "No", so do nothing.
                }
            }
            // When going back from player, we should tell the main process to pause playback
            // so audience windows don't keep playing.
            const timestamp = performance.timeOrigin + performance.now();
            window.playerAPI.pause({ timestamp });
            window.playerAPI.goToMainMenu();
        });
    }

    // --- UNIFIED IPC Listener ---
    // All playback logic is now handled by this single function.
    window.playerAPI.onPlaybackUpdate((newState) => {
        console.log('Player received playback update:', newState);
        handlePlaybackUpdate(newState);
    });

    // --- ADDED: Listen for file open requests from the main process ---
    window.playerAPI.onFileOpen(async (filePath) => {
        console.log(`Player received file to open via IPC: ${filePath}`);
        await addSongFromPath(filePath);
    });

    // 3. Initialize Core Rendering Managers
    const domManager = new DomManager(DOM.pageContainer);
    const timelineManager = new TimelineManager();
    timelineManager.setDomManager(domManager);

    // 4. Update the global state with these managers
    updateState({
        domManager,
        timelineManager,
        highlightManager: null,
        presenter: { isOpen: false },
    });

    // 5. Initialize Player-Specific UI Modules
    initSongsManager();
    initPlayerPlayback();
    setupPlayerBPMControls();
    initDeviceController();
    initConfigurationPanel();

    // 6. Show the default view initially
    handlePlaybackUpdate({ status: 'unloaded' });

    // 7. Setup Resize Observer for the player viewport
    const slideObserver = new ResizeObserver((entries) => {
        if (!entries || !entries.length) return;
        applyViewportScaling(entries[0].target);

        if (state.timelineManager) {
            state.timelineManager.resize(false);
        }
    });
    if (DOM.slideViewportWrapper) {
        slideObserver.observe(DOM.slideViewportWrapper);
    }

    document.addEventListener('keydown', (e) => {
        const isDialogVisible = document.querySelector('.dialog-overlay.visible');
        if (isDialogVisible) return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
        if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            if (DOM.playPauseBtn && !DOM.playPauseBtn.disabled) {
                DOM.playPauseBtn.click();
            }
        }
    });

    console.log("Player UI Initialized");
});