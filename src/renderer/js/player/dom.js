// src/renderer/js/player/dom.js

/**
 * A centralized object to hold references to all frequently accessed DOM elements for the Player window.
 * @namespace
 */
export const DOM = {};

/**
 * Initializes the DOM object by querying and storing references to key elements in the Player window.
 * This should be called once the DOM is fully loaded.
 */
export function initDOM() {
    // Main Window Controls
    DOM.minimizeBtn = document.getElementById('minimize-btn');
    DOM.maximizeBtn = document.getElementById('maximize-btn');
    DOM.closeBtn = document.getElementById('close-btn');

    // Player Layout
    DOM.windowTitle = document.getElementById('window-title');
    DOM.pageContainer = document.getElementById('page-container');
    DOM.slideViewportWrapper = document.getElementById('slide-viewport-wrapper'); // ADDED
    DOM.presentationSlide = document.getElementById('slide-viewport');
    DOM.pageThumbnailsContainer = document.getElementById('page-thumbnails-container');
    DOM.pageManager = document.querySelector('.page-manager');

    // Songs Manager Panel (Left)
    DOM.songsManagerPanel = document.getElementById('songs-manager-panel');
    DOM.songsManagerPanelHeader = document.getElementById('songs-manager-panel-header');
    DOM.songsManagerPanelHandle = document.getElementById('songs-manager-panel-handle');
    DOM.songPlaylist = document.getElementById('song-playlist');
    DOM.addSongBtn = document.getElementById('add-song-btn');

    // Configuration Panel (Right)
    DOM.configurationPanel = document.getElementById('configuration-panel');
    DOM.configurationPanelHeader = document.getElementById('configuration-panel-header');
    DOM.configurationPanelHandle = document.getElementById('configuration-panel-handle');

    // -- Configuration Controls --
    // Display Settings
    DOM.presenterMonitorTabs = document.getElementById('presenter-monitor-tabs');

    // Audio Settings
    DOM.audioOutputDeviceSelect = document.getElementById('audio-output-device');
    DOM.audioVolumeSlider = document.getElementById('audio-volume-slider');
    DOM.volumeLevelDisplay = document.getElementById('volume-level-display');

    // Timeline & Playback
    DOM.playPauseBtn = document.getElementById('play-pause-btn');
    DOM.forwardBtn = document.getElementById('forward-btn');
    DOM.backwardBtn = document.getElementById('backward-btn');

    // Dialogs
    DOM.alertDialog = document.getElementById('alert-dialog');
    DOM.alertDialogHeader = document.getElementById('alert-dialog-header');
    DOM.alertDialogMessage = document.getElementById('alert-dialog-message');
    DOM.alertDialogOk = document.getElementById('alert-dialog-ok');
    DOM.loadingDialog = document.getElementById('loading-dialog');
    DOM.loadingDialogMessage = document.getElementById('loading-dialog-message');

    // --- MODIFIED: Device Controller Elements ---
    DOM.openDeviceListBtn = document.getElementById('open-device-list-btn');
    DOM.openTempoSyncBtn = document.getElementById('open-tempo-sync-btn'); // ADDED
    DOM.disconnectDeviceBtn = document.getElementById('disconnect-device-btn');
    DOM.deviceListDialog = document.getElementById('device-list-dialog');
    DOM.closeDeviceListBtn = document.getElementById('close-device-list-btn');
    DOM.deviceList = document.getElementById('device-list');
    
    // ADDED: Auto-Accept Toggle
    DOM.autoAcceptToggle = document.getElementById('auto-accept-connections');

    // Pairing Dialog
    DOM.pairingDialog = document.getElementById('pairing-dialog');
    DOM.pairingDeviceIdEl = document.getElementById('pairing-device-id');
    DOM.acceptPairBtn = document.getElementById('accept-pair-btn');
    DOM.rejectPairBtn = document.getElementById('reject-pair-btn');

    // Status Display
    DOM.deviceStatusValue = document.getElementById('device-status-value');
    DOM.deviceStatusIndicator = document.getElementById('device-status-indicator');
    DOM.deviceStatusText = document.getElementById('device-status-text');
    DOM.deviceNameValue = document.getElementById('device-name-value');
    DOM.deviceRttList = document.getElementById('device-rtt-list'); // MODIFIED
}