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
    // Device Controller (now inside Configuration)
    DOM.openDeviceListBtn = document.getElementById('open-device-list-btn');

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

    // Device Controller
    DOM.openDeviceListBtn = document.getElementById('open-device-list-btn');
    DOM.deviceListDialog = document.getElementById('device-list-dialog');
    DOM.closeDeviceListBtn = document.getElementById('close-device-list-btn');
    DOM.deviceList = document.getElementById('device-list');
}