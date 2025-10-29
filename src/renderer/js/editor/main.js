import { initDOM, DOM } from './dom.js';
import { initDragDrop } from './dragDrop.js';
import { initLayersPanelInteractions } from './layersPanel.js';
import { initEventsPanelInteractions } from './eventsPanel.js';
import { initColorPicker } from './colorPicker.js';
import { initOpaqueColorPicker } from './opaqueColorPicker.js';
import { initGradientEditor } from './gradientEditor.js';
import { initLyricsEditor } from './lyricsEditor.js';
import { initOrchestraEditor } from './orchestraEditor.js';
import { initEventsEditor } from './eventsEditor.js';
import { initPropertiesDialog } from './propertiesDialog.js';
import { initPropertyValueEditor } from './propertyValueEditor.js';
import { initEasingEditor } from './easingEditor.js';
import { initLoadingDialog } from './loadingDialog.js';
import { initAlertDialog } from './alertDialog.js'; // ADDED
import { initFontPicker } from './fontPicker.js'; // ADDED
import { setupEventListeners, initSlideInteractivity, handleExternalFileOpen } from './events.js';
import { showPage, applyViewportScaling } from './rendering.js';
import { initPropertiesPanelInteractions } from './propertiesPanel.js';
import { HighlightManager } from './highlightManager.js';
import { updateState, state } from './state.js';
import { triggerActivePageRender } from './pageManager.js';

// --- Main Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Populate the DOM object FIRST.
    initDOM();

    if (!window.editorAPI) {
        console.error("editorAPI not found. Check preload script.");
        return;
    }

    // Fetch system fonts and update state
    try {
        const fonts = await window.editorAPI.getSystemFonts();
        updateState({ systemFonts: fonts });
    } catch (error) {
        console.error("Failed to load system fonts:", error);
        updateState({ systemFonts: [] }); // Ensure it's an array on failure
    }

    // Initialize all UI modules and dialogs
    const highlightManager = new HighlightManager();
    initColorPicker();
    initOpaqueColorPicker();
    initGradientEditor();
    initLyricsEditor();
    initOrchestraEditor();
    initEventsEditor();
    initPropertiesDialog();
    initPropertyValueEditor();
    initEasingEditor();
    initLoadingDialog();
    initAlertDialog(); // ADDED
    initFontPicker(); // ADDED
    initDragDrop();
    initLayersPanelInteractions();
    initEventsPanelInteractions();
    initPropertiesPanelInteractions();
    initSlideInteractivity();

    // Set up all core UI event listeners (title bar, panels, timeline, menus etc.)
    setupEventListeners();

    // --- ADDED: Listen for file open requests from the main process ---
    window.editorAPI.onFileOpen(async (filePath) => {
        console.log(`Editor received file to open via IPC: ${filePath}`);
        await handleExternalFileOpen(filePath);
    });

    updateState({ highlightManager });

    // Show the initial page
    showPage('main-menu-page');

    // ADDED: Notify the main process that the renderer is fully loaded and ready.
    // This is crucial for handling file opens on app launch.
    window.editorAPI.notifyReady();

    const slideObserver = new ResizeObserver((entries) => {
        if (!entries || !entries.length) return;
        applyViewportScaling(entries[0].target);

        // During playback, the animation loop handles rendering. In edit mode, we must
        // call a function that correctly overrides transition properties before resizing.
        if (state.playback.isPlaying) {
            // During playback, a simple resize is sufficient as the next animation frame will correct everything.
            state.timelineManager.resize(false);
        } else {
            // In edit mode, triggerActivePageRender correctly applies events,
            // overrides transitions, and then resizes/renders.
            triggerActivePageRender(true);
        }

        if (state.highlightManager) {
            state.highlightManager.update();
        }
    });
    if (DOM.slideViewportWrapper) slideObserver.observe(DOM.slideViewportWrapper);
});