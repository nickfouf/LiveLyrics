import { initDOM, DOM } from './dom.js';
import { DomManager } from '../renderer/domManager.js';
import { TimelineManager } from '../renderer/timeline/TimelineManager.js';
import { state, updateState } from '../editor/state.js';
import { initSongsManager, addSongFromPath, songPlaylist } from './songsManager.js';
import { initPlayerPlayback, handlePlaybackUpdate, localPlaybackState, updatePlayerControlsUI, setRenderingActive, forceRefresh, switchVisiblePages } from './playback.js';
import { initAlertDialog, showAlertDialog, hideAlertDialog } from '../editor/alertDialog.js';
import { initConfirmationDialog, showConfirmationDialog } from './confirmationDialog.js';
import { initLoadingDialog } from '../editor/loadingDialog.js';
import { applyViewportScaling } from '../editor/rendering.js';
import { makeDraggable } from '../editor/draggable.js';
import { fontLoader } from '../renderer/fontLoader.js';
import { MirrorManager } from '../mirror.js';

// --- Device Controller Logic ---

let discoverableDevices = new Map();
const connectingDeviceIds = new Set();
const manualDisconnectIds = new Set();
const manualPairIds = new Set();
const autoPairRetries = new Map(); // deviceId -> timeoutId
let pendingPairingDeviceId = null;
let connectedConnector = null; 
let connectedMidiDevices = new Map(); 
let isManualDisconnect = false; 

// NEW: Track which list is currently being viewed to filter the rendered list
let currentDeviceListFilter = 'connector'; 

function scheduleAutoPairRetry(deviceId, deviceType) {
    if (autoPairRetries.has(deviceId)) {
        clearTimeout(autoPairRetries.get(deviceId));
    }
    
    const isConnector = deviceType === 'connector';
    const isMidi = deviceType === 'midi-controller';
    
    if (isConnector && DOM.autoSendPairConnectorToggle && !DOM.autoSendPairConnectorToggle.checked) return;
    if (isMidi && DOM.autoSendPairMidiToggle && !DOM.autoSendPairMidiToggle.checked) return;
    
    // 30 seconds countdown retry
    const timeoutId = setTimeout(() => {
        autoPairRetries.delete(deviceId);
        checkAndAutoPairDevice(deviceId, deviceType);
    }, 30000);
    
    autoPairRetries.set(deviceId, timeoutId);
}    function checkAndAutoPairDevice(deviceId, deviceType) {
    const device = discoverableDevices.get(deviceId);
    if (!device) return;

    const isConnector = deviceType === 'connector';
    const isMidi = deviceType === 'midi-controller';
    
    // Check preferences
    if (isConnector && DOM.autoSendPairConnectorToggle && !DOM.autoSendPairConnectorToggle.checked) return;
    if (isMidi && DOM.autoSendPairMidiToggle && !DOM.autoSendPairMidiToggle.checked) return;
    
    // Check if already fully connected
    if (isConnector && connectedConnector && connectedConnector.id === deviceId) return;
    if (isMidi && connectedMidiDevices.has(deviceId)) return;
    
    // Ensure we only automatically attempt to pair to ONE connector (the most recent one)
    if (isConnector && !connectedConnector) {
        let newerConnectorExists = false;
        for (const d of discoverableDevices.values()) {
            if (d.deviceType === 'connector' && d.deviceId !== deviceId) {
                if ((d.lastSeen || 0) > (device.lastSeen || 0)) {
                    newerConnectorExists = true;
                    break;
                }
            }
        }
        if (newerConnectorExists) return; 
    }

    // Check if it's already attempting to connect
    if (connectingDeviceIds.has(deviceId)) return;
    
    // Also if we are already connecting to ANOTHER connector, ignore this one
    if (isConnector) {
        for (const id of connectingDeviceIds) {
            const d = discoverableDevices.get(id);
            if (d && d.deviceType === 'connector') return;
        }
    }
    
    connectingDeviceIds.add(deviceId);
    renderDeviceList();
    sendMessageToMain('initiatePairing', { deviceId });
}

function handleAutoPairToggled() {
    for (const[deviceId, device] of discoverableDevices.entries()) {
        checkAndAutoPairDevice(deviceId, device.deviceType);
    }
}

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
            window.playerAPI.disconnectDevice(payload ? payload.deviceId : undefined);
            break;
    }
}

function renderDeviceList() {
    if (!DOM.deviceList) return;
    const devices = Array.from(discoverableDevices.values());
    DOM.deviceList.innerHTML = '';

    // MODIFIED: Filter devices based on the active context (connector vs midi)
    const filteredDevices = devices.filter(d => d.deviceType === currentDeviceListFilter);

    if (filteredDevices.length === 0) {
        const typeLabel = currentDeviceListFilter === 'midi-controller' ? 'MIDI devices' : 'remote devices';
        DOM.deviceList.innerHTML = `<li class="device-list-item-empty">No ${typeLabel} found on the network.</li>`;
        return;
    }

    filteredDevices.forEach(device => {
        const isConnectorConnected = device.deviceType === 'connector' && connectedConnector && connectedConnector.id === device.deviceId;
        const isMidiConnected = device.deviceType === 'midi-controller' && connectedMidiDevices.has(device.deviceId);
        const isConnected = isConnectorConnected || isMidiConnected;
        const isConnecting = connectingDeviceIds.has(device.deviceId);
        
        const li = document.createElement('li');
        li.className = 'device-list-item';
        li.dataset.deviceId = device.deviceId;

        let buttonClass, buttonText, buttonAction;

        if (isConnected) {
            buttonClass = 'danger-btn';
            buttonText = 'Disconnect'; 
            buttonAction = 'disconnect';
        } else if (isConnecting) {
            buttonClass = 'danger-btn';
            buttonText = 'Cancel';
            buttonAction = 'cancel';
        } else {
            buttonClass = 'primary-btn';
            buttonText = 'Pair';
            buttonAction = 'pair';
        }                li.innerHTML = `
            <div class="device-list-details">
                <span class="device-name">${device.deviceName}</span>
                <span class="device-id-secondary">${device.deviceId} [${device.deviceType}]</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
                <button class="action-btn pair-btn ${buttonClass}" data-action="${buttonAction}">${buttonText}</button>
                <button class="action-btn secondary-btn forget-btn" data-action="forget" style="padding: 4px 8px; font-size: 14px;" title="Forget Device">✕</button>
            </div>
        `;
        DOM.deviceList.appendChild(li);
    });
}

function renderRttList(stats =[]) {
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

// MODIFIED: Accept filter type to show relevant devices only
function showDeviceListDialog(filterType) {
    if (!DOM.deviceListDialog) return;
    
    currentDeviceListFilter = filterType || 'connector';
    
    // Update dialog title based on context
    const header = DOM.deviceListDialog.querySelector('.dialog-header');
    if (header) {
        header.textContent = currentDeviceListFilter === 'midi-controller' 
            ? 'Available MIDI Controllers' 
            : 'Available Remote Devices';
    }

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
        connectedConnector = device;
        DOM.deviceStatusIndicator.classList.remove('offline');
        DOM.deviceStatusIndicator.classList.add('online');
        DOM.deviceStatusText.textContent = 'Connected';
        DOM.deviceNameValue.textContent = device.name;
        DOM.disconnectDeviceBtn.classList.remove('noneDisplay');
        DOM.openDeviceListBtn.textContent = 'Open Device List';
    } else {
        connectedConnector = null;
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
    isManualDisconnect = false; 
    updateDeviceStatusUI('offline');
    if (DOM.deviceListDialog.classList.contains('visible')) {
        renderDeviceList();
    }
    if (DOM.pairingDialog.classList.contains('visible')) {
        hidePairingDialog();
    }
}

function initMidiController() {
    if (DOM.autoAcceptMidiToggle) {
        const savedAutoMidi = localStorage.getItem('autoAcceptMidi');
        const shouldAutoMidi = savedAutoMidi === null ? true : (savedAutoMidi === 'true');

        DOM.autoAcceptMidiToggle.checked = shouldAutoMidi;
        window.playerAPI.setMidiAutoAccept(shouldAutoMidi);

        DOM.autoAcceptMidiToggle.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            localStorage.setItem('autoAcceptMidi', isChecked);
            window.playerAPI.setMidiAutoAccept(isChecked);
        });
    }
    
    if (DOM.autoSendPairMidiToggle) {
        const savedAutoSendMidi = localStorage.getItem('autoSendPairMidi');
        const shouldAutoSendMidi = savedAutoSendMidi === null ? true : (savedAutoSendMidi === 'true');

        DOM.autoSendPairMidiToggle.checked = shouldAutoSendMidi;

        DOM.autoSendPairMidiToggle.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            localStorage.setItem('autoSendPairMidi', isChecked);
            if (isChecked) handleAutoPairToggled();
        });
    }

    if (DOM.openMidiListBtn) {
        DOM.openMidiListBtn.addEventListener('click', () => {
            // MODIFIED: Pass 'midi-controller' filter
            showDeviceListDialog('midi-controller'); 
        });
    }
}

function updateMidiSidebar(device, isDisconnecting) {
    if (!DOM.midiInfoContainer) return;

    const safeId = device.id.replace(/[^a-zA-Z0-9-_]/g, '');
    const itemId = `midi-dev-${safeId}`;
    const existingItem = document.getElementById(itemId);

    if (isDisconnecting) {
        if (existingItem) existingItem.remove();
    } else {
        if (!existingItem) {
            const item = document.createElement('div');
            item.id = itemId;
            item.className = 'info-item';
            item.style.marginBottom = '5px';
            item.innerHTML = `
                <span class="info-label" style="max-width: 65%; font-weight: normal;">${device.name}</span>
                <span class="status-indicator online"></span>
            `;
            DOM.midiInfoContainer.appendChild(item);
        }
    }

    const activeItems = DOM.midiInfoContainer.querySelectorAll('div[id^="midi-dev-"]');
    if (DOM.noMidiMsg) {
        DOM.noMidiMsg.style.display = activeItems.length > 0 ? 'none' : 'block';
    }
}

function initDeviceController() {
    updateDeviceStatusUI('searching');
    makeDraggable('device-list-dialog');

    initMidiController();

    // MODIFIED: Pass 'connector' filter
    DOM.openDeviceListBtn.addEventListener('click', () => showDeviceListDialog('connector'));
    
    if (DOM.openTempoSyncBtn) {
        DOM.openTempoSyncBtn.addEventListener('click', () => {
            window.playerAPI.openTempoSync();
        });
    }

    if (DOM.autoAcceptToggle) {
        const savedAutoAccept = localStorage.getItem('autoAcceptConnections');
        const shouldAutoAccept = savedAutoAccept === null ? true : (savedAutoAccept === 'true');

        DOM.autoAcceptToggle.checked = shouldAutoAccept;
        window.playerAPI.setAutoAccept(shouldAutoAccept);

        DOM.autoAcceptToggle.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            localStorage.setItem('autoAcceptConnections', isChecked);
            window.playerAPI.setAutoAccept(isChecked);
        });
    }
    
    if (DOM.autoSendPairConnectorToggle) {
        const savedAutoSendConnector = localStorage.getItem('autoSendPairConnector');
        const shouldAutoSendConnector = savedAutoSendConnector === null ? true : (savedAutoSendConnector === 'true');

        DOM.autoSendPairConnectorToggle.checked = shouldAutoSendConnector;

        DOM.autoSendPairConnectorToggle.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            localStorage.setItem('autoSendPairConnector', isChecked);
            if (isChecked) handleAutoPairToggled();
        });
    }

    DOM.disconnectDeviceBtn.addEventListener('click', async () => {
        if (!connectedConnector) return;
        const confirmed = await showConfirmationDialog(
            `Are you sure you want to disconnect from ${connectedConnector.name}?`,
            'Confirm Disconnect'
        );
        if (confirmed) {
            manualDisconnectIds.add(connectedConnector.id);
            sendMessageToMain('disconnectDevice', { deviceId: connectedConnector.id });
        }
    });

    DOM.closeDeviceListBtn.addEventListener('click', hideDeviceListDialog);
    DOM.deviceListDialog.addEventListener('click', (e) => {
        if (e.target === DOM.deviceListDialog) hideDeviceListDialog();
    });        DOM.deviceList.addEventListener('click', async (e) => {
        const actionButton = e.target.closest('.action-btn');
        const deviceItem = e.target.closest('.device-list-item');
        if (!actionButton || !deviceItem) return;

        const deviceId = deviceItem.dataset.deviceId;
        const action = actionButton.dataset.action;

        if (action === 'pair') {
            if (connectingDeviceIds.has(deviceId)) return; 
            connectingDeviceIds.add(deviceId);
            manualPairIds.add(deviceId); // Mark as manually requested by the user
            renderDeviceList(); 
            sendMessageToMain('initiatePairing', { deviceId });
        } else if (action === 'disconnect') {
            const confirmed = await showConfirmationDialog(
                `Are you sure you want to disconnect?`,
                'Confirm Disconnect'
            );
            if (confirmed) {
                manualDisconnectIds.add(deviceId);
                sendMessageToMain('disconnectDevice', { deviceId });
            }
        } else if (action === 'cancel') {
            manualDisconnectIds.add(deviceId);
            sendMessageToMain('cancelPairing', { deviceId });
        } else if (action === 'forget') {
            window.playerAPI.forgetDevice(deviceId);
            discoverableDevices.delete(deviceId);
            renderDeviceList();
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
        devices.forEach(d => {
            discoverableDevices.set(d.deviceId, d);
            checkAndAutoPairDevice(d.deviceId, d.deviceType); // Attempt auto-pair initially
        });
        if (DOM.deviceListDialog.classList.contains('visible')) {
            renderDeviceList();
        }
    });

    window.playerAPI.onInfoUpdate((device) => {
        console.log('Received device info update:', device);
        if (connectedConnector && connectedConnector.id === device.id) {
            updateDeviceStatusUI('connected', device);
        }
    });
    
    // [NEW] Triggered when dynamic info is updated bypassing the 30-sec timer
    if (window.playerAPI.onDiscoverableInfoUpdate) {
        window.playerAPI.onDiscoverableInfoUpdate((deviceInfo) => {
            if (autoPairRetries.has(deviceInfo.deviceId)) {
                clearTimeout(autoPairRetries.get(deviceInfo.deviceId));
                autoPairRetries.delete(deviceInfo.deviceId);
            }
            checkAndAutoPairDevice(deviceInfo.deviceId, deviceInfo.deviceType);
        });
    }

    // [NEW] Graceful silent handling of rejections
    if (window.playerAPI.onPairingFailed) {
        window.playerAPI.onPairingFailed((payload) => {
            if (payload && payload.deviceId) {
                const wasManualCancel = manualDisconnectIds.has(payload.deviceId);
                manualDisconnectIds.delete(payload.deviceId);
                
                const wasManualPair = manualPairIds.has(payload.deviceId);
                manualPairIds.delete(payload.deviceId);

                connectingDeviceIds.delete(payload.deviceId);
                if (DOM.deviceListDialog.classList.contains('visible')) renderDeviceList();
                
                if (!wasManualCancel) {
                    const device = discoverableDevices.get(payload.deviceId);
                    if (device) {
                        scheduleAutoPairRetry(payload.deviceId, device.deviceType);
                    }
                    
                    if (wasManualPair) {
                        showAlertDialog('Pairing Failed', `Pairing with ${payload.deviceId} failed: ${payload.reason}`);
                    }
                }
            }
        });
    }

    window.playerAPI.onRttUpdate((stats) => {
        renderRttList(stats);
    });

    window.playerAPI.onPairingRequest(({ deviceId, deviceName }) => {
        showPairingDialog({ deviceId, deviceName });
    });

    window.playerAPI.onConnectionSuccess((device) => {
        // Strictly clear the connecting ID when successful
        connectingDeviceIds.delete(device.id);

        if (autoPairRetries.has(device.id)) {
            clearTimeout(autoPairRetries.get(device.id));
            autoPairRetries.delete(device.id);
        }

        if (device.type === 'midi-controller') {
            connectedMidiDevices.set(device.id, device);
            updateMidiSidebar(device, false);
            if (DOM.deviceListDialog.classList.contains('visible')) renderDeviceList();
        } else {
            connectedConnector = device;
            isManualDisconnect = false; 
            hideDeviceListDialog();
            hideAlertDialog();
            updateDeviceStatusUI('connected', device);
        }
    });

    window.playerAPI.onDisconnect((payload) => {
        if (!payload) {
            handleDisconnectionUI();
            return;
        }
        
        const wasManual = manualDisconnectIds.has(payload.deviceId);
        manualDisconnectIds.delete(payload.deviceId);

        if (connectingDeviceIds.has(payload.deviceId)) {
            connectingDeviceIds.delete(payload.deviceId);
        }

        if (payload.deviceType === 'midi-controller') {
            connectedMidiDevices.delete(payload.deviceId);
            updateMidiSidebar({ id: payload.deviceId }, true);
            if (DOM.deviceListDialog.classList.contains('visible')) renderDeviceList();
            
            if (!wasManual) scheduleAutoPairRetry(payload.deviceId, payload.deviceType);
        } else {
            connectedConnector = null;
            if (payload.deviceType === 'connector') {
                handleDisconnectionUI(); 
                if (!wasManual) {
                    if (payload.reason === 'remote') showAlertDialog('Device Disconnected', 'The other device has disconnected.');
                    else if (payload.reason === 'network') showAlertDialog('Connection Lost', 'The connection was lost due to a network failure.');
                    
                    scheduleAutoPairRetry(payload.deviceId, payload.deviceType);
                }
            }
        }
    });

    window.playerAPI.onError((message) => {
        const isPairingError = message && (
            message.toLowerCase().includes('pairing') ||
            message.toLowerCase().includes('rejected') ||
            message.toLowerCase().includes('canceled by user')
        );

        // Failures are now handled gracefully by onPairingFailed without spamming the error dialogs
        if (isPairingError) return;
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

let lastDisplayInfo = null; 
let viewedDisplayId = null; 

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

        optionsPanel.innerHTML = `
            <div class="monitor-role-info">
                <span class="monitor-role-label">Role:</span>
                <span>${role}</span>
            </div>
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
        
        if (DOM.globalLatencyInput && displayInfo.globalLatency !== undefined) {
             DOM.globalLatencyInput.value = displayInfo.globalLatency;
        }
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
}

function initConfigurationPanel() {
    initDisplaySettings();

    if (DOM.globalLatencyInput) {
        DOM.globalLatencyInput.addEventListener('input', (e) => {
            const latency = Math.max(0, parseInt(e.target.value, 10) || 0);
            window.playerAPI.setGlobalLatency(latency);
        });
    }

    // Safety Options Logic
    if (DOM.minBpmInput && DOM.maxBpmInput) {
        const savedMin = localStorage.getItem('minBpm');
        const savedMax = localStorage.getItem('maxBpm');

        if (savedMin !== null) DOM.minBpmInput.value = savedMin;
        if (savedMax !== null) DOM.maxBpmInput.value = savedMax;

        const updateBpmLimits = () => {
            let min = parseInt(DOM.minBpmInput.value, 10);
            let max = parseInt(DOM.maxBpmInput.value, 10);

            // Fallbacks
            if (isNaN(min)) min = 10;
            if (isNaN(max)) max = 220;

            // Sanity correction to prevent max from being lower than min
            if (min > max) {
                let temp = min;
                min = max;
                max = temp;
            }

            localStorage.setItem('minBpm', min);
            localStorage.setItem('maxBpm', max);

            window.playerAPI.setBpmLimits(min, max);
        };

        DOM.minBpmInput.addEventListener('change', updateBpmLimits);
        DOM.maxBpmInput.addEventListener('change', updateBpmLimits);

        // Set limits immediately on launch
        updateBpmLimits();
    }

    DOM.audioOutputDeviceSelect.addEventListener('change', (e) => {
        console.log(`Audio output device changed to: ${e.target.value}`);
    });

    DOM.audioVolumeSlider.addEventListener('input', (e) => {
        const volume = e.target.value;
        DOM.volumeLevelDisplay.textContent = `${volume}%`;
    });

    document.querySelectorAll('.drawer-group-header').forEach(header => {
        header.addEventListener('click', () => {
            const group = header.closest('.drawer-group');
            if (group) {
                group.classList.toggle('collapsed');
            }
        });
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

function handleRoleUpdate({ role, sourceId }) {
    console.log(`[Player] Role changed to: ${role}`, sourceId ? `Source: ${sourceId}` : '');
    
    if (role === 'mirror') {
        setRenderingActive(false);

        if (state.song) {
            switchVisiblePages(new Set());
        } else if (state.domManager) {
            state.domManager.clear();
        }

        if (DOM.pageContainer) DOM.pageContainer.style.visibility = 'hidden';
        if (sourceId) {
            MirrorManager.startStream(sourceId, 'mirror-video');
        }

    } else {
        MirrorManager.stopStream('mirror-video');

        if (DOM.pageContainer) DOM.pageContainer.style.visibility = 'visible';
        
        setRenderingActive(true);
        forceRefresh();
        
        if (state.timelineManager) {
            state.timelineManager.resize(true);
        }
    }
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
        if (newState.song && newState.song.fonts) {
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

    window.playerAPI.onSetRole((data) => handleRoleUpdate(data));

    const domManager = new DomManager(DOM.pageContainer);
    const timelineManager = new TimelineManager();
    timelineManager.setDomManager(domManager);

    updateState({
        domManager,
        timelineManager,
        highlightManager: null,
        presenter: { isOpen: false },
    });

    fontLoader.onFontsLoaded(() => {
        console.log('[Player] Fonts loaded. Triggering re-render to update metrics.');
        if (state.timelineManager) {
            state.timelineManager.resize(true);
        }
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





