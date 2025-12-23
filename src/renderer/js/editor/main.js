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
import { initAlertDialog } from './alertDialog.js';
import { initFontPicker } from './fontPicker.js';
import { setupEventListeners, initSlideInteractivity, handleExternalFileOpen } from './events.js';
import { showPage, applyViewportScaling } from './rendering.js';
import { initPropertiesPanelInteractions } from './propertiesPanel.js';
import { HighlightManager } from './highlightManager.js';
import { updateState, state } from './state.js';
import { triggerActivePageRender } from './pageManager.js';
import { fontLoader } from '../renderer/fontLoader.js'; // Ensure imported

// --- Main Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Populate the DOM object FIRST.
    initDOM();

    if (!window.editorAPI) {
        console.error("editorAPI not found. Check preload script.");
        return;
    }

    window.editorAPI.getSystemFonts()
        .then(fonts => {
            updateState({ systemFonts: fonts });
        })
        .catch(error => {
            console.error("Failed to load system fonts:", error);
            updateState({ systemFonts: [] });
        });

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
    initAlertDialog(); 
    initFontPicker(); 
    initDragDrop();
    initLayersPanelInteractions();
    initEventsPanelInteractions();
    initPropertiesPanelInteractions();
    initSlideInteractivity();

    // --- ADDED: Listen for font load completion to trigger re-render ---
    fontLoader.onFontsLoaded(() => {
        console.log('[Editor] Fonts loaded. Triggering re-render to update metrics.');
        // Force a resize calculation (true) to ensure text wrapping and lyrics metrics are recalculated
        triggerActivePageRender(true); 
    });

    setupEventListeners();

    window.editorAPI.onFileOpen(async (filePath) => {
        console.log(`Editor received file to open via IPC: ${filePath}`);
        await handleExternalFileOpen(filePath);
    });

    updateState({ highlightManager });

    showPage('main-menu-page');

    window.editorAPI.notifyReady();

    const slideObserver = new ResizeObserver((entries) => {
        if (!entries || !entries.length) return;
        applyViewportScaling(entries[0].target);

        if (state.playback.isPlaying) {
            state.timelineManager.resize(false);
        } else {
            triggerActivePageRender(true);
        }

        if (state.highlightManager) {
            state.highlightManager.update();
        }
    });
    if (DOM.slideViewportWrapper) slideObserver.observe(DOM.slideViewportWrapper);
});

