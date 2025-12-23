// Initialize DOM with placeholder null values.
export const DOM = {
    // Title Bar
    minimizeBtn: null,
    maximizeBtn: null,
    closeBtn: null,
    windowTitle: null,

    // Pages
    mainMenuPage: null,
    newSongPage: null,
    editorPage: null,

    // Main Menu
    newSongBtn: null,
    openSongBtn: null,
    editorBackToMainBtn: null,
    exitBtn: null,

    // New Song
    songTitleInput: null,
    backToMenuBtn: null,
    createSongBtn: null,

    // Editor Header
    backToMainMenuBtn: null,
    closeProjectBtn: null,
    bpmValueInput: null,
    playPauseBtn: null,
    backwardBtn: null,
    forwardBtn: null,

    // Editor Layout
    editorLayout: null,
    elementsPanel: null,
    eventsPanel: null,
    mainEditorArea: null,
    propertiesPanel: null,
    layersPanel: null,

    // Drawers & Handles
    elementsPanelHeader: null,
    eventsPanelHeader: null,
    propertiesDrawerHeader: null,
    layersDrawerHeader: null,
    elementsPanelHandle: null,
    eventsPanelHandle: null,
    propertiesPanelHandle: null,
    layersPanelHandle: null,

    // Properties & Layers Content
    propertiesPanelTitle: null,
    propertiesPanelBody: null,
    layerTree: null,

    // Events Panel Content
    musicElementsList: null,
    totalMeasuresDisplay: null,

    // Main Viewport
    slideViewportWrapper: null, // ADDED
    presentationSlide: null,
    pageContainer: null,
    stagingPageContainer: null,
    emptyPageHint: null,
    dropHint: null,

    // Page Manager
    pageManager: null,
    pageThumbnailsContainer: null,
    addPageBtn: null,
};

/**
 * Populates the DOM object with references to actual DOM elements.
 * This MUST be called after the DOM is fully loaded.
 */
export function initDOM() {
    // Title Bar
    DOM.minimizeBtn = document.getElementById('minimize-btn');
    DOM.maximizeBtn = document.getElementById('maximize-btn');
    DOM.closeBtn = document.getElementById('close-btn');
    DOM.windowTitle = document.getElementById('window-title');

    // Pages
    DOM.mainMenuPage = document.getElementById('main-menu-page');
    DOM.newSongPage = document.getElementById('new-song-page');
    DOM.editorPage = document.getElementById('editor-page');

    // Main Menu
    DOM.newSongBtn = document.getElementById('new-song-btn');
    DOM.openSongBtn = document.getElementById('open-song-btn');
    DOM.editorBackToMainBtn = document.getElementById('editor-back-to-main-btn');
    DOM.exitBtn = document.getElementById('exit-btn');

    // New Song
    DOM.songTitleInput = document.getElementById('song-title');
    DOM.backToMenuBtn = document.getElementById('back-to-menu-btn');
    DOM.createSongBtn = document.getElementById('create-song-btn');

    // Editor Header
    DOM.backToMainMenuBtn = document.getElementById('back-to-main-menu-btn');
    DOM.closeProjectBtn = document.getElementById('close-project-btn');
    DOM.bpmValueInput = document.getElementById('bpm-value-input');
    DOM.playPauseBtn = document.getElementById('play-pause-btn');
    DOM.backwardBtn = document.getElementById('backward-btn');
    DOM.forwardBtn = document.getElementById('forward-btn');

    // Editor Layout & Panels
    DOM.editorLayout = document.querySelector('.editor-layout');
    DOM.elementsPanel = document.querySelector('.elements-panel');
    DOM.eventsPanel = document.querySelector('.events-panel');
    DOM.mainEditorArea = document.querySelector('.main-editor-area');
    DOM.propertiesPanel = document.querySelector('.properties-panel');
    DOM.layersPanel = document.querySelector('.layers-panel');

    // Panel Headers & Handles
    DOM.elementsPanelHeader = document.getElementById('elements-panel-header');
    DOM.eventsPanelHeader = document.getElementById('events-panel-header');
    DOM.propertiesDrawerHeader = document.getElementById('properties-drawer-header');
    DOM.layersDrawerHeader = document.getElementById('layers-drawer-header');
    DOM.elementsPanelHandle = document.getElementById('elements-panel-handle');
    DOM.eventsPanelHandle = document.getElementById('events-panel-handle');
    DOM.propertiesPanelHandle = document.getElementById('properties-panel-handle');
    DOM.layersPanelHandle = document.getElementById('layers-panel-handle');

    // Panel Content Areas
    DOM.propertiesPanelTitle = document.getElementById('properties-title');
    DOM.propertiesPanelBody = document.getElementById('properties-body-content');
    DOM.layerTree = document.querySelector('.layer-tree');
    DOM.musicElementsList = document.getElementById('music-elements-list');
    DOM.totalMeasuresDisplay = document.getElementById('total-measures-display');

    // Main Viewport
    DOM.slideViewportWrapper = document.getElementById('slide-viewport-wrapper'); // ADDED
    DOM.presentationSlide = document.getElementById('slide-viewport');
    DOM.pageContainer = document.getElementById('page-container');
    DOM.stagingPageContainer = document.getElementById('staging-page-container');
    DOM.emptyPageHint = document.getElementById('empty-page-hint');
    DOM.dropHint = document.getElementById('drop-hint');

    // Page Manager
    DOM.pageManager = document.querySelector('.page-manager');
    DOM.pageThumbnailsContainer = document.getElementById('page-thumbnails-container');
    DOM.addPageBtn = document.querySelector('.add-page-btn');
}



