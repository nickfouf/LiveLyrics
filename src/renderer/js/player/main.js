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
import { makeDraggable } from '../editor/draggable.js';
import { fontLoader } from '../renderer/fontLoader.js'; // ADDED

// --- REWRITTEN: Device Controller Logic ---

// State
let discoverableDevices = new Map();
let connectingDeviceId = null; 
let pendingPairingDeviceId = null;
let connectedDevice = null;
let isManualDisconnect = false; 

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

function renderRttList(stats = []) {
    if (!DOM.deviceRttList) return;
    stats.sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));

    if (stats.length === 0) {
        DOM.deviceRttList.innerHTML = '---';
        return;
    }

    DOM.deviceRttList.innerHTML = ''; 
    stats.forEach(stat => {
        const statElement = document.createElement('div');
        const avgText = stat.avg > 0 ? `${stat.avg.toFixed(1)}ms` : '---';
        statElement.textContent = `${stat.ip}: ${avgText}`;
        DOM.deviceRttList.appendChild(statElement);
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
        DOM.disconnectDeviceBtn.classList.remove('noneDisplay');
        DOM.openDeviceListBtn.textContent = 'Open Device List';
    } else {
        connectedDevice = null;
        DOM.deviceStatusIndicator.classList.remove('online');
        DOM.deviceStatusIndicator.classList.add('offline');
        DOM.deviceStatusText.textContent = status === 'searching' ? 'Searching...' : 'Offline';
        DOM.deviceNameValue.textContent = 'Not Connected';
        DOM.disconnectDeviceBtn.classList.add('noneDisplay');
        DOM.openDeviceListBtn.textContent = 'Open Device List';
        renderRttList([]); 
    }
}

function handleDisconnectionUI() {
    connectingDeviceId = null;
    isManualDisconnect = false; 
    updateDeviceStatusUI('offline');
    if (DOM.deviceListDialog.classList.contains('visible')) {
        renderDeviceList();
    }
    if (DOM.pairingDialog.classList.contains('visible')) {
        hidePairingDialog();
    }
}

function initDeviceController() {
    updateDeviceStatusUI('searching');
    makeDraggable('device-list-dialog');

    DOM.openDeviceListBtn.addEventListener('click', showDeviceListDialog);
    DOM.disconnectDeviceBtn.addEventListener('click', async () => {
        if (!connectedDevice) return;
        const confirmed = await showConfirmationDialog(
            `Are you sure you want to disconnect from ${connectedDevice.name}?`,
            'Confirm Disconnect'
        );
        if (confirmed) {
            isManualDisconnect = true; 
            sendMessageToMain('disconnectDevice');
        }
    });
    DOM.closeDeviceListBtn.addEventListener('click', hideDeviceListDialog);
    DOM.deviceListDialog.addEventListener('click', (e) => {
        if (e.target === DOM.deviceListDialog) hideDeviceListDialog();
    });

    DOM.deviceList.addEventListener('click', async (e) => {
        const actionButton = e.target.closest('.pair-btn');
        const deviceItem = e.target.closest('.device-list-item');
        if (!actionButton || !deviceItem) return;

        const deviceId = deviceItem.dataset.deviceId;
        const action = actionButton.dataset.action;

        if (action === 'pair') {
            if (connectingDeviceId) return; 
            connectingDeviceId = deviceId;
            renderDeviceList(); 
            sendMessageToMain('initiatePairing', { deviceId });
        } else if (action === 'unpair') {
            const confirmed = await showConfirmationDialog(
                `Are you sure you want to disconnect from ${connectedDevice.name}?`,
                'Confirm Disconnect'
            );
            if (confirmed) {
                isManualDisconnect = true; 
                sendMessageToMain('disconnectDevice');
            }
        } else if (action === 'cancel') {
            sendMessageToMain('cancelPairing', { deviceId });
        }
    });

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

    window.playerAPI.onRttUpdate((stats) => {
        renderRttList(stats);
    });

    window.playerAPI.onPairingRequest(({ deviceId, deviceName }) => {
        showPairingDialog({ deviceId, deviceName });
    });

    window.playerAPI.onConnectionSuccess((device) => {
        connectingDeviceId = null;
        isManualDisconnect = false; 
        hideDeviceListDialog();
        updateDeviceStatusUI('connected', device);
    });

    window.playerAPI.onDisconnect((payload) => {
        connectingDeviceId = null; 
        if (isManualDisconnect) {
            handleDisconnectionUI();
            return;
        }

        handleDisconnectionUI(); 
        if (payload) {
            if (payload.reason === 'remote') {
                showAlertDialog('Device Disconnected', 'The other device has disconnected.');
            } else if (payload.reason === 'network') {
                showAlertDialog('Connection Lost', 'The connection was lost due to a network failure.');
            }
        }
    });

    window.playerAPI.onError((message) => {
        const isPairingError = message && (
            message.toLowerCase().includes('pairing') ||
            message.toLowerCase().includes('rejected') ||
            message.toLowerCase().includes('canceled by user')
        );

        if (isPairingError) {
            console.warn(`[Device Controller] Pairing process failed or was canceled: ${message}`);
            connectingDeviceId = null;
            handleDisconnectionUI();
            showAlertDialog('Pairing Failed', message);
            return;
        }
        console.error(`[Device Controller] Received a non-fatal error from the main process: ${message}`);
    });

    window.playerAPI.readyForDevices();
}

function setupPanels() {
    DOM.songsManagerPanelHeader.addEventListener('click', () => {
        DOM.songsManagerPanel.classList.toggle('collapsed');
        DOM.songsManagerPanelHandle.classList.toggle('visible');
    });
    DOM.songsManagerPanelHandle.addEventListener('click', () => {
        DOM.songsManagerPanel.classList.remove('collapsed');
        DOM.songsManagerPanelHandle.classList.remove('visible');
    });

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

let lastDisplayInfo = null; 
let viewedDisplayId = null; 
let monitorLatencies = new Map(); 

function renderDisplayTabs({ allDisplays, presenterDisplay }) {
    const tabsContainer = DOM.presenterMonitorTabs;
    const optionsContainer = document.getElementById('monitor-options-container');
    if (!tabsContainer || !optionsContainer) return;

    if (viewedDisplayId === null || !allDisplays.some(d => d.id === viewedDisplayId)) {
        viewedDisplayId = presenterDisplay.id;
    }

    tabsContainer.innerHTML = '';
    optionsContainer.innerHTML = '';

    allDisplays.forEach((display) => {
        const isPresenter = display.id === presenterDisplay.id;
        const isBeingViewed = display.id === viewedDisplayId;

        const displayBtn = document.createElement('button');
        displayBtn.className = 'tab-btn';
        displayBtn.textContent = display.label || `Display ${display.id}`;
        displayBtn.title = `${display.size.width}x${display.size.height}`;
        displayBtn.dataset.displayId = display.id;

        if (isPresenter) {
            displayBtn.classList.add('presenter');
        }

        if (isBeingViewed) {
            displayBtn.classList.add('active');
        }
        tabsContainer.appendChild(displayBtn);

        const optionsPanel = document.createElement('div');
        optionsPanel.className = 'monitor-options';
        optionsPanel.dataset.displayId = display.id;
        if (isBeingViewed) {
            optionsPanel.classList.add('active'); 
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

function initDisplaySettings() {
    const tabsContainer = DOM.presenterMonitorTabs;
    const optionsContainer = document.getElementById('monitor-options-container');
    if (!tabsContainer || !optionsContainer) return;

    window.playerAPI.onDisplaysChanged((displayInfo) => {
        console.log('Displays changed, updating UI.', displayInfo);
        lastDisplayInfo = displayInfo; 
        renderDisplayTabs(displayInfo);
    });

    tabsContainer.addEventListener('click', (e) => {
        const tabTarget = e.target.closest('.tab-btn');
        if (tabTarget) {
            const displayId = Number(tabTarget.dataset.displayId);
            if (displayId === viewedDisplayId) return; 

            viewedDisplayId = displayId;
            if (lastDisplayInfo) {
                renderDisplayTabs(lastDisplayInfo);
            }
        }
    });

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

function initConfigurationPanel() {
    initDisplaySettings();

    DOM.audioOutputDeviceSelect.addEventListener('change', (e) => {
        console.log(`Audio output device changed to: ${e.target.value}`);
    });

    DOM.audioVolumeSlider.addEventListener('input', (e) => {
        const volume = e.target.value;
        DOM.volumeLevelDisplay.textContent = `${volume}%`;
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

        const timestamp = performance.timeOrigin + performance.now();
        window.playerAPI.updateBpm(newBpm, newBpmUnit, timestamp);
    };

    bpmValueInput.addEventListener('change', handleBPMChange);

    document.addEventListener('click', (e) => {
        if (!customSelect.contains(e.target)) {
            items.classList.add('select-hide');
        }
    });

    selected.addEventListener('click', (e) => {
        if (selected.getAttribute('tabindex') === '-1') return; 
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
    initDOM();
    setupTitleBar();

    initAlertDialog();
    initConfirmationDialog();
    initLoadingDialog();
    setupPanels();

    const backToMainMenuBtn = document.getElementById('player-back-to-main-menu-btn');
    if (backToMainMenuBtn) {
        backToMainMenuBtn.addEventListener('click', async () => {
            if (songPlaylist.length > 0) {
                const confirmed = await showConfirmationDialog(
                    'Are you sure you want to return to the main menu? The current playlist will be cleared.',
                    'Return to Menu'
                );
                if (!confirmed) {
                    return; 
                }
            }
            const timestamp = performance.timeOrigin + performance.now();
            window.playerAPI.pause({ timestamp });
            window.playerAPI.goToMainMenu();
        });
    }

    window.playerAPI.onPlaybackUpdate((newState) => {
        console.log('Player received playback update:', newState);
        // ADDED: Load fonts if song changes or initial load
        if (newState.song && newState.song.fonts) {
             // Only load if different from current to avoid unnecessary re-renders?
             // FontLoader handles duplicates gracefully, so we can just call it.
             fontLoader.loadFonts(newState.song.fonts);
        } else if (newState.status === 'unloaded') {
             fontLoader.clear();
        }
        
        handlePlaybackUpdate(newState);
    });

    window.playerAPI.onFileOpen(async (filePath) => {
        console.log(`Player received file to open via IPC: ${filePath}`);
        await addSongFromPath(filePath);
    });

    const domManager = new DomManager(DOM.pageContainer);
    const timelineManager = new TimelineManager();
    timelineManager.setDomManager(domManager);

    updateState({
        domManager,
        timelineManager,
        highlightManager: null,
        presenter: { isOpen: false },
    });

    initSongsManager();
    initPlayerPlayback();
    setupPlayerBPMControls();
    initDeviceController();
    initConfigurationPanel();

    handlePlaybackUpdate({ status: 'unloaded' });

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