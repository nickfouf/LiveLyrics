// renderer/js/editor/dragDrop.js
import { state, updateState } from './state.js';
import { DOM } from './dom.js';
import { getNameForElementType, findVirtualElementById } from './utils.js';
import { renderLayersPanel, selectLayer } from './layersPanel.js';
import { updateZIndex, updateContainerPlaceholder, showHint, updateEmptyPageHintVisibility } from './rendering.js';
import { renderEventsPanel } from './eventsPanel.js';
import { buildMeasureMap, buildLyricsTimingMap, findDeepestAtPoint } from './utils.js';
import { triggerActivePageRender } from './pageManager.js';
import { markAsDirty } from './events.js';

// --- Import Virtual Element Classes ---
import { VirtualContainer } from '../renderer/elements/container.js';
import { VirtualImage } from '../renderer/elements/image.js';
import { VirtualLyrics } from '../renderer/elements/lyrics.js';
import { VirtualTitle } from '../renderer/elements/title.js';
import { VirtualText } from '../renderer/elements/text.js';
import { VirtualOrchestra } from '../renderer/elements/orchestra.js';
import { VirtualSmartEffect } from '../renderer/elements/smartEffect.js';
import { VirtualVideo } from '../renderer/elements/video.js';
import { VirtualAudio } from '../renderer/elements/audio.js';

// --- MODULE STATE ---
let currentDropAction = null;

// --- VIRTUAL ELEMENT HELPERS ---

function createVirtualElementByType(elementType) {
    const name = getNameForElementType(elementType);
    switch (elementType) {
        case 'vcontainer': return new VirtualContainer({ name, alignment: 'vertical' });
        case 'hcontainer': return new VirtualContainer({ name, alignment: 'horizontal' });
        case 'acontainer': return new VirtualContainer({ name, alignment: 'absolute' });
        case 'image': return new VirtualImage({ name });
        case 'lyrics': return new VirtualLyrics({ name });
        case 'title': return new VirtualTitle({}, name);
        case 'text': return new VirtualText({ name });
        case 'orchestra': return new VirtualOrchestra({ name });
        case 'smart-effect': return new VirtualSmartEffect({ name });
        case 'video': return new VirtualVideo({ name });
        case 'audio': return new VirtualAudio({ name });
        default: throw new Error(`Unknown element type: ${elementType}`);
    }
}

/**
 * Checks if a potential target element is a descendant of the dragged element.
 * This prevents dropping a parent element into one of its own children.
 * @param {VirtualElement} draggedElement The element being dragged.
 * @param {VirtualElement} potentialTarget The element being dropped onto.
 * @returns {boolean} True if the target is a descendant of the dragged element.
 */
function isDescendant(draggedElement, potentialTarget) {
    if (!draggedElement || !potentialTarget) return false;
    let current = potentialTarget.parent;
    while (current) {
        if (current === draggedElement) return true;
        current = current.parent;
    }
    return false;
}

// --- CORE DRAG & DROP LOGIC ---

/**
 * Determines if a drop is valid and where it should occur (before, after, or inside).
 * This function now correctly handles invalid drops (onto self or descendants) and
 * calculates the drop position for the layers panel.
 * @param {DragEvent} e The drag event.
 * @param {VirtualElement} targetVirtualElement The virtual element being targeted.
 * @returns {object} An object describing the validity and mode of the drop action.
 */
function determineDropAction(e, targetVirtualElement) {
    const draggedElement = state.currentDragOperation?.type === 'move'
        ? findVirtualElementById(state.activePage, state.currentDragOperation.elementId)
        : null;

    // Dropping on self is an ignored action.
    if (draggedElement && targetVirtualElement === draggedElement) {
        return { isValid: false, isIgnored: true, targetElement: targetVirtualElement };
    }

    // Dropping on a descendant is an invalid action that should be highlighted.
    if (!targetVirtualElement || (draggedElement && isDescendant(draggedElement, targetVirtualElement))) {
        return { isValid: false, targetElement: targetVirtualElement };
    }

    const isPage = targetVirtualElement.type === 'page';

    if (isPage) {
        return {
            isValid: true,
            targetElement: targetVirtualElement,
            parentElement: targetVirtualElement,
            mode: 'inside',
        };
    }

    const isTargetContainer = targetVirtualElement instanceof VirtualContainer;

    // If the drag is over the layers panel, use precise y-coordinate logic
    if (e.target.closest('.layer-tree')) {
        const targetLi = e.target.closest('.layer-item');
        if (!targetLi || targetLi.dataset.targetId !== targetVirtualElement.id) {
            return { isValid: false, targetElement: targetVirtualElement };
        }

        const rect = targetLi.querySelector('.layer-content').getBoundingClientRect();
        const y = e.clientY - rect.top;
        const topZone = rect.height * 0.25;
        const bottomZone = rect.height * 0.75;

        if (isTargetContainer && y > topZone && y < bottomZone) {
            return { isValid: true, targetElement: targetVirtualElement, parentElement: targetVirtualElement, mode: 'inside' };
        } else if (y <= topZone) {
            return { isValid: true, targetElement: targetVirtualElement, parentElement: targetVirtualElement.parent, mode: 'before' };
        } else {
            return { isValid: true, targetElement: targetVirtualElement, parentElement: targetVirtualElement.parent, mode: 'after' };
        }
    }

    // Fallback for viewport drag: only allow dropping inside containers
    if (isTargetContainer) {
        return {
            isValid: true,
            targetElement: targetVirtualElement,
            parentElement: targetVirtualElement,
            mode: 'inside',
        };
    }

    return { isValid: false, targetElement: targetVirtualElement };
}

/**
 * Applies visual feedback during a drag operation.
 * @param {object} action The drop action object from determineDropAction.
 */
function applyHighlighting(action) {
    // --- Part 1: Clear all previous layer panel highlights ---
    document.querySelectorAll('.layer-content.drag-over-before, .layer-content.drag-over-after, .layer-content.drag-over-inside, .layer-content.drag-invalid').forEach(el => el.classList.remove('drag-over-before', 'drag-over-after', 'drag-over-inside', 'drag-invalid'));

    // If no action or target, hide everything and exit.
    if (!action || !action.targetElement) {
        if (state.highlightManager) state.highlightManager.hide();
        return;
    }

    // --- Part 2: Handle viewport highlighting via HighlightManager ---
    const targetIsInViewport = action.targetElement.domElement && action.targetElement.domElement.closest('.main-editor-area');

    if (targetIsInViewport) {
        if (action.isValid) {
            state.highlightManager.highlight(action.targetElement, 'drag-valid');
        } else if (!action.isIgnored) {
            state.highlightManager.highlight(action.targetElement, 'drag-invalid');
        } else {
            // Ignored action (e.g. drop on self), hide highlight.
            state.highlightManager.hide();
        }
    } else {
        // If we are not dragging over the viewport, ensure the highlight is hidden.
        state.highlightManager.hide();
    }

    // --- Part 3: Handle Layers Panel Highlighting ---
    const targetLiContent = DOM.layerTree.querySelector(`.layer-item[data-target-id="${action.targetElement.id}"] .layer-content`);
    if (targetLiContent) {
        if (action.isValid) {
            const { mode } = action;
            if (mode === 'inside') {
                targetLiContent.classList.add('drag-over-inside');
            } else if (mode === 'before') {
                targetLiContent.classList.add('drag-over-before');
            } else if (mode === 'after') {
                targetLiContent.classList.add('drag-over-after');
            }
        } else if (!action.isIgnored) {
            // It's an invalid drop on a layer item.
            targetLiContent.classList.add('drag-invalid');
        }
    }
}

function executeDrop() {
    if (!currentDropAction || !currentDropAction.isValid) {
        // Only show the hint if the action was not an "ignored" one.
        if (currentDropAction && !currentDropAction.isIgnored) {
            showHint("Invalid drop location.");
        }
        return;
    }

    const { parentElement, targetElement, mode } = currentDropAction;
    let elementToDrop;
    let oldParent = null;

    if (state.currentDragOperation.type === 'create') {
        elementToDrop = createVirtualElementByType(state.currentDragOperation.elementType);
    } else { // 'move'
        elementToDrop = findVirtualElementById(state.activePage, state.currentDragOperation.elementId);
        oldParent = elementToDrop?.parent;
    }

    if (!elementToDrop || !parentElement) return; // Add guard for parentElement
    if (oldParent) {
        oldParent.removeElement(elementToDrop);
    }

    let index = parentElement.getChildren().length;
    if (mode === 'before') {
        index = parentElement.getChildren().indexOf(targetElement);
    } else if (mode === 'after') {
        index = parentElement.getChildren().indexOf(targetElement) + 1;
    }

    parentElement.addElementAt(elementToDrop, index);

    // If a new music element was created, add it to the page's music order.
    if (state.currentDragOperation.type === 'create' && (elementToDrop instanceof VirtualLyrics || elementToDrop instanceof VirtualOrchestra || elementToDrop instanceof VirtualAudio)) {
        if (state.activePage) {
            state.activePage.addMusicElementToOrder(elementToDrop);
        }
    }

    if (oldParent) updateContainerPlaceholder(oldParent.domElement);
    updateContainerPlaceholder(parentElement.domElement);
    if (oldParent && oldParent !== parentElement) updateZIndex(oldParent.domElement);
    updateZIndex(parentElement.domElement);

    triggerActivePageRender(true);
    renderLayersPanel();
    selectLayer(elementToDrop);
    renderEventsPanel();
    updateEmptyPageHintVisibility();
    markAsDirty();

    const newMeasureMap = buildMeasureMap();
    const newLyricsTimingMap = buildLyricsTimingMap(newMeasureMap);
    updateState({ playback: { ...state.playback, measureMap: newMeasureMap, lyricsTimingMap: newLyricsTimingMap } });
}

// --- DOM EVENT HANDLERS ---

/**
 * Removes all visual drag-and-drop indicators from the UI.
 */
function clearAllDropIndicators() {
    currentDropAction = null;

    // Hide the viewport highlight
    if (state.highlightManager) {
        state.highlightManager.hide();
    }

    // Clear highlights from the layers panel
    document.querySelectorAll('.layer-content.drag-over-before, .layer-content.drag-over-after, .layer-content.drag-over-inside, .layer-content.drag-invalid').forEach(el => el.classList.remove('drag-over-before', 'drag-over-after', 'drag-over-inside', 'drag-invalid'));
}

function findTargetVirtualElementFromEvent(e) {
    let draggedDomElement = null;
    if (state.currentDragOperation.type === 'move') {
        const virtualElement = findVirtualElementById(state.activePage, state.currentDragOperation.elementId);
        if (virtualElement) draggedDomElement = virtualElement.domElement;
    }

    if (draggedDomElement) draggedDomElement.style.pointerEvents = 'none';

    const currentPage = state.activePage;
    if (currentPage) {
        const pageRect = currentPage.domElement.getBoundingClientRect();
        if (e.clientX < pageRect.left || e.clientX > pageRect.right ||
            e.clientY < pageRect.top || e.clientY > pageRect.bottom) {
            if (draggedDomElement) draggedDomElement.style.pointerEvents = '';
            return null;
        }
        const targetElement = findDeepestAtPoint(currentPage.domElement, e.clientX, e.clientY, (el) => {
            return el.dataset && el.dataset.elementType && el.dataset.elementType === 'container';
        });
        if(targetElement) {
            const virtualElement = findVirtualElementById(currentPage, targetElement.id);
            if (draggedDomElement) draggedDomElement.style.pointerEvents = '';
            return virtualElement || null;
        }
    }

    if (draggedDomElement) draggedDomElement.style.pointerEvents = '';
    return state.activePage; // Fallback to the page itself
}

export function initDragDrop() {
    let draggedLayerItem = null;
    // --- Palette Drag Start ---
    document.querySelectorAll('.drawer-element[draggable="true"]').forEach(draggable => {
        draggable.addEventListener('dragstart', (e) => {
            document.body.classList.add('is-dragging');
            updateState({ currentDragOperation: { type: 'create', elementType: e.currentTarget.dataset.elementType } });
            e.dataTransfer.setData('text/plain', e.currentTarget.dataset.elementType);
            e.dataTransfer.effectAllowed = 'copy';
        });
        draggable.addEventListener('dragend', () => {
            document.body.classList.remove('is-dragging');
            clearAllDropIndicators();
            updateState({ currentDragOperation: null });
        });
    });

    // --- Layers Panel Drag Start ---
    DOM.layerTree.addEventListener('dragstart', (e) => {
        const draggedLi = e.target.closest('.layer-item');
        if (!draggedLi || draggedLi.dataset.targetId === state.activePage.id) {
            e.preventDefault(); return;
        }
        document.body.classList.add('is-dragging');
        updateState({ currentDragOperation: { type: 'move', elementId: draggedLi.dataset.targetId } });
        draggedLayerItem = draggedLi;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedLi.dataset.targetId);
    });

    DOM.layerTree.addEventListener('dragend', () => {
        document.body.classList.remove('is-dragging');
        draggedLayerItem = null;
        clearAllDropIndicators();
        updateState({ currentDragOperation: null });
    });

    // --- UNIFIED DRAG OVER (for both main view and layers) ---
    const handleDragOver = (e) => {
        // Ignore drags from the music elements order list OR the page manager
        if (state.currentDragOperation?.type === 'reorder-music-element' || state.currentDragOperation?.type === 'reorder-page') {
            return;
        }

        if (!state.currentDragOperation) return;
        e.preventDefault();

        let targetVirtualElement;
        const layerItem = e.target.closest('.layer-item');

        if (layerItem) {
            targetVirtualElement = findVirtualElementById(state.activePage, layerItem.dataset.targetId);
        } else {
            targetVirtualElement = findTargetVirtualElementFromEvent(e);
        }

        if (targetVirtualElement) {
            currentDropAction = determineDropAction(e, targetVirtualElement);
            applyHighlighting(currentDropAction);
        } else {
            clearAllDropIndicators();
        }
    };

    DOM.mainEditorArea.addEventListener('dragover', handleDragOver);
    DOM.layerTree.addEventListener('dragover', handleDragOver);

    // --- UNIFIED DROP (for both main view and layers) ---
    const handleDrop = (e) => {
        // Ignore drops from the music elements order list OR the page manager
        if (state.currentDragOperation?.type === 'reorder-music-element' || state.currentDragOperation?.type === 'reorder-page') {
            return;
        }

        if (!state.currentDragOperation) return;
        e.preventDefault();

        // Re-determine the target and action on drop, instead of relying on the last dragover state,
        // which can be cleared by an errant dragleave event.
        let targetVirtualElement;
        const layerItem = e.target.closest('.layer-item');

        if (layerItem) {
            targetVirtualElement = findVirtualElementById(state.activePage, layerItem.dataset.targetId);
        } else {
            targetVirtualElement = findTargetVirtualElementFromEvent(e);
        }

        if (targetVirtualElement) {
            // We have a target, so determine the final drop action now.
            currentDropAction = determineDropAction(e, targetVirtualElement);
        } else {
            // If we can't find a target on drop, the action is invalid.
            currentDropAction = null;
        }

        executeDrop(); // This will now use the freshly calculated currentDropAction
        clearAllDropIndicators();
    };

    DOM.mainEditorArea.addEventListener('drop', handleDrop);
    DOM.layerTree.addEventListener('drop', handleDrop);

    // --- Cleanup on Drag Leave ---
    const handleDragLeave = (e, container) => {
        if (!container.contains(e.relatedTarget)) {
            clearAllDropIndicators();
        }
    };
    DOM.mainEditorArea.addEventListener('dragleave', (e) => handleDragLeave(e, DOM.mainEditorArea));
    DOM.layerTree.addEventListener('dragleave', (e) => handleDragLeave(e, DOM.layerTree));
}