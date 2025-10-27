import { initDOM, DOM } from './dom.js';
import { DomManager } from '../renderer/domManager.js';
import { TimelineManager } from '../renderer/timeline/TimelineManager.js';
import { state, updateState } from '../editor/state.js';
import { initSongsManager, handleSongLoaded, handleSongUnloaded } from './songsManager.js';
import { initPlayerPlayback, handlePlaybackEvent } from './playback.js';
import { initAlertDialog } from '../editor/alertDialog.js';
import { initLoadingDialog } from '../editor/loadingDialog.js';
// MODIFIED: Import from the new, leaner player-specific events file.
import { getQuarterNoteDurationMs, rebuildAllEventTimelines, reprogramAllPageTransitions } from './events.js';
import { deserializeElement, findVirtualElementById } from '../editor/utils.js';

// --- Device Controller Logic ---

function getFakeDevices() {
    return [
        { id: 'dev-1', name: 'Studio Macbook Pro', ips: ['192.168.1.101', 'fe80::1c12:43ff:fe6e:8a2b'], paired: true },
        { id: 'dev-2', name: 'Living Room PC', ips: ['192.168.1.150'], paired: false },
        { id: 'dev-3', name: 'Sound_Board_iPad', ips: ['192.168.1.125'], paired: false },
        { id: 'dev-4', name: 'Galaxy S23 Ultra', ips: ['192.168.1.204'], paired: false },
    ].sort((a, b) => b.paired - a.paired); // Sort paired devices to the top
}

function renderDeviceList() {
    if (!DOM.deviceList) return;
    const devices = getFakeDevices();
    DOM.deviceList.innerHTML = '';

    if (devices.length === 0) {
        DOM.deviceList.innerHTML = '<li class="device-list-item-empty">No devices found on the network.</li>';
        return;
    }

    devices.forEach(device => {
        const li = document.createElement('li');
        li.className = 'device-list-item';
        li.dataset.deviceId = device.id;

        const isPaired = device.paired;
        const buttonState = isPaired ? 'disabled' : '';
        const buttonText = isPaired ? 'Paired' : 'Pair';
        const buttonClass = isPaired ? 'secondary-btn' : 'primary-btn';

        li.innerHTML = `
            <div class="device-list-details">
                <span class="device-name">${device.name}</span>
                <span class="device-ips">${device.ips.join(' / ')}</span>
            </div>
            <button class="action-btn pair-btn ${buttonClass}" ${buttonState}>${buttonText}</button>
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

function initDeviceController() {
    if (!DOM.openDeviceListBtn) return; // Exit if the new elements aren't on the page

    DOM.openDeviceListBtn.addEventListener('click', showDeviceListDialog);
    DOM.closeDeviceListBtn.addEventListener('click', hideDeviceListDialog);
    DOM.deviceListDialog.addEventListener('click', (e) => {
        // Close dialog if overlay is clicked
        if (e.target === DOM.deviceListDialog) {
            hideDeviceListDialog();
        }
    });

    // Event delegation for pair buttons
    DOM.deviceList.addEventListener('click', (e) => {
        const pairButton = e.target.closest('.pair-btn');
        if (pairButton && !pairButton.disabled) {
            // Fake pairing logic
            pairButton.disabled = true;
            pairButton.textContent = 'Paired';
            pairButton.classList.remove('primary-btn');
            pairButton.classList.add('secondary-btn');
            // Here you would add real pairing logic
        }
    });
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

// --- RE-IMPLEMENTED: Display Settings Logic ---

/**
 * Renders the segmented buttons for display selection.
 * @param {object} displayInfo - The display info object from the main process.
 * @param {Electron.Display[]} displayInfo.allDisplays - An array of all display objects.
 * @param {Electron.Display} displayInfo.presenterDisplay - The display the player window is currently on.
 */
function renderDisplayTabs({ allDisplays, presenterDisplay }) {
    const tabsContainer = DOM.presenterMonitorTabs;
    if (!tabsContainer) return;

    tabsContainer.innerHTML = ''; // Clear existing buttons

    allDisplays.forEach((display) => {
        const displayBtn = document.createElement('button');
        displayBtn.className = 'tab-btn';
        displayBtn.textContent = display.label || `Display ${display.id}`;
        displayBtn.title = `${display.size.width}x${display.size.height}`;
        displayBtn.dataset.displayId = display.id;

        if (display.id === presenterDisplay.id) {
            displayBtn.classList.add('active');
        }

        tabsContainer.appendChild(displayBtn);
    });
}

function initDisplaySettings() {
    const tabsContainer = DOM.presenterMonitorTabs;
    if (!tabsContainer) return;

    // Listen for display changes from the main process.
    window.playerAPI.onDisplaysChanged((displayInfo) => {
        console.log('Displays changed, updating UI.', displayInfo);
        renderDisplayTabs(displayInfo);
    });

    // Add event listener for the whole container.
    tabsContainer.addEventListener('click', (e) => {
        const targetBtn = e.target.closest('.tab-btn');
        if (!targetBtn || targetBtn.classList.contains('active')) return;

        const displayId = targetBtn.dataset.displayId;
        window.playerAPI.setPresenterDisplay(displayId);
        // The main process will move the window, which triggers a 'move' event.
        // The 'move' event handler in main.js will then call sendDisplaysUpdate,
        // which will cause the UI to update with the correct active button.
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
        window.playerAPI.updateBpm(newBpm, newBpmUnit);
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
    initLoadingDialog();
    setupPanels();

    // --- REWRITTEN IPC Listeners ---
    window.playerAPI.onSongLoaded((event) => {
        handleSongLoaded(event.song);
        handlePlaybackEvent(event); // Also process it as a playback event to reset timeline
    });

    window.playerAPI.onSongUnloaded(() => {
        handleSongUnloaded();
        handlePlaybackEvent({ type: 'unload' }); // Also process it as a playback event
    });

    window.playerAPI.onPlaybackEvent((event) => {
        // Forward all other events to the playback engine.
        handlePlaybackEvent(event);
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
    handleSongUnloaded(); // This now just resets the UI

    // 7. Setup Resize Observer for the player viewport
    const slideObserver = new ResizeObserver(() => {
        if (state.timelineManager) {
            state.timelineManager.resize(false);
        }
    });
    if (DOM.presentationSlide) {
        slideObserver.observe(DOM.presentationSlide);
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