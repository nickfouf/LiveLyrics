// src/renderer/js/editor/pageManager.js

import { state, updateState } from './state.js';
import { DOM } from './dom.js';
import { VirtualPage } from '../renderer/elements/page.js';
import { updateTimelineAndEditorView, rebuildAllEventTimelines, reprogramAllPageTransitions, markAsDirty, getQuarterNoteDurationMs } from "./events.js";
import { renderLayersPanel } from "./layersPanel.js";
import { renderPropertiesPanel } from "./propertiesPanel.js";
import { renderEventsPanel } from "./eventsPanel.js";
import { buildMeasureMap, pageHasMeasures, findVirtualElementById, serializeElement, deserializeElement } from './utils.js';
import { updateEmptyPageHintVisibility } from './rendering.js';
import { generateUUID } from '../renderer/utils.js';

/**
 * Renders the page thumbnails at the bottom of the editor.
 */
function renderPageManager() {
    DOM.pageThumbnailsContainer.innerHTML = '';

    // 1. Render Thumbnail Page
    const thumbnailPage = state.song.thumbnailPage;
    if (thumbnailPage) {
        const thumb = document.createElement('div');
        thumb.className = 'page-thumbnail thumbnail-page';
        if (thumbnailPage === state.activePage) {
            thumb.classList.add('active-page');
        }
        
        const pageName = thumbnailPage.getProperty('name').name;
        thumb.innerHTML = `<span class="page-name" title="${pageName}">${pageName}</span>`;

        thumb.addEventListener('click', () => {
            if (!state.playback.isPlaying) {
                jumpToPage(thumbnailPage);
            }
        });
        DOM.pageThumbnailsContainer.appendChild(thumb);
    }

    // 2. Render Divider
    const divider = document.createElement('div');
    divider.className = 'page-manager-divider';
    DOM.pageThumbnailsContainer.appendChild(divider);
    
    // 3. Render Regular Pages
    state.song.pages.forEach((page, index) => {
        const thumb = document.createElement('div');
        thumb.className = 'page-thumbnail';
        thumb.dataset.pageIndex = index;
        if (page === state.activePage) {
            thumb.classList.add('active-page');
        }
        thumb.setAttribute('draggable', 'true');
        
        const pageName = page.getProperty('name').name;
        thumb.innerHTML = `
            <span class="page-number">${index + 1}</span>
            <span class="page-name" title="${pageName}">${pageName}</span>
            <button class="duplicate-page-btn" title="Duplicate Page"><img src="../../icons/duplicate.svg" alt="Duplicate"></button>
            <button class="delete-page-btn">&times;</button>
        `;

        thumb.addEventListener('click', () => {
            if (!state.playback.isPlaying) {
                jumpToPage(page);
            }
        });

        thumb.querySelector('.delete-page-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deletePage(page);
        });

        thumb.querySelector('.duplicate-page-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            duplicatePage(page);
        });

        // Add drag-and-drop listeners
        thumb.addEventListener('dragstart', handlePageDragStart);
        thumb.addEventListener('dragend', handlePageDragEnd);
        thumb.addEventListener('dragover', handlePageDragOver);
        thumb.addEventListener('dragleave', handlePageDragLeave);
        thumb.addEventListener('drop', handlePageDrop);

        DOM.pageThumbnailsContainer.appendChild(thumb);
    });
}


/**
 * The definitive function for navigating between pages in the editor.
 * It sets the active page first, then correctly positions the timeline.
 * @param {VirtualPage} newPage The page to jump to.
 */
function jumpToPage(newPage) {
    const newPageIndex = state.song.pages.indexOf(newPage);
    if (newPageIndex === -1 && newPage !== state.song.thumbnailPage) return;

    // 1. Set the active page first. This is the user's intent.
    // This function will handle moving the page between renderers if needed.
    setActivePage(newPage);

    // 2. Now, calculate where the timeline should be.
    const measureMap = buildMeasureMap();
    const firstMeasureOfPage = measureMap.find(m => m.pageIndex === newPageIndex);

    let timeOfNewPageInBeats = 0;
    if (firstMeasureOfPage) {
        // If the page has measures, jump to its beginning.
        timeOfNewPageInBeats = firstMeasureOfPage.startTime;
    } else {
        // If it's a static page (like the thumbnail), find the end of the previous musical page.
        const lastMeasureBeforePage = [...measureMap].reverse().find(m => m.pageIndex < newPageIndex);
        if (lastMeasureBeforePage) {
            timeOfNewPageInBeats = lastMeasureBeforePage.startTime + lastMeasureBeforePage.duration;
        }
    }

    // 3. Update the timeline's time state.
    const beatDurationMs = getQuarterNoteDurationMs();
    updateState({
        playback: {
            ...state.playback,
            timeAtPause: timeOfNewPageInBeats * beatDurationMs
        }
    });

    // 4. Finally, update the view.
    // Instead of calling the old function which has side-effects,
    // we now trigger a render of the current state and then update the timeline display.
    // This prevents the active page from being incorrectly switched back.
    triggerActivePageRender(false);
    updateTimelineAndEditorView();
}

/**
 * Sets the active page, handling which renderer should display it.
 * This function ensures that pages with measures are in the main DOM manager,
 * and pages without measures are in the staging DOM manager, and that the
 * staging manager only ever contains the single active static page.
 * @param {VirtualPage} newPage The VirtualPage object to make active.
 */
function setActivePage(newPage) {
    if (!newPage) return;

    const oldPage = state.activePage;

    // In edit mode, we manually control which single page is visible.
    // Remove the old page from the DOM if it's different from the new one.
    if (!state.playback.isPlaying && oldPage && oldPage !== newPage) {
        state.domManager.removeFromDom(oldPage);
        state.stagingDomManager.removeFromDom(oldPage);
    }

    // Try to find and select the last selected element for this page
    const lastSelectedId = state.ui.lastSelectedElementIdByPageId[newPage.id];
    let elementToSelect = findVirtualElementById(newPage, lastSelectedId) || newPage;

    // Update the central state to reflect the new active page and selection
    updateState({
        activePage: newPage,
        selectedElement: elementToSelect,
    });

    // --- Page DOM Management Logic ---
    const newPageIsMusical = pageHasMeasures(newPage);

    if (newPageIsMusical) {
        // --- Target is a MUSICAL page ---

        // 1. Ensure the staging container is completely empty.
        const currentlyStagedPages = [...state.stagingDomManager.getManagedPages()];
        for (const stagedPage of currentlyStagedPages) {
            state.stagingDomManager.removeFromDom(stagedPage);
            state.stagingDomManager.removePage(stagedPage);
        }

        // 2. Add the new page to the main manager.
        state.domManager.addPage(newPage);
        state.domManager.addToDom(newPage);

        // 3. Set the timeline to use the main manager.
        if (state.timelineManager) {
            state.timelineManager.setDomManager(state.domManager);
        }

    } else {
        // --- Target is a STATIC page ---

        // 1. Ensure the main container is empty.
        const currentMusicalPages = [...state.domManager.getManagedPages()];
        for (const musicalPage of currentMusicalPages) {
             state.domManager.removeFromDom(musicalPage);
             // We don't remove from the list, as they might be needed later.
        }

        // 2. Clean the staging manager of any *other* pages.
        const currentlyStagedPages = [...state.stagingDomManager.getManagedPages()];
        for (const stagedPage of currentlyStagedPages) {
            if (stagedPage !== newPage) {
                state.stagingDomManager.removeFromDom(stagedPage);
                state.stagingDomManager.removePage(stagedPage);
            }
        }

        // 3. Add the new page to the staging manager.
        state.stagingDomManager.addPage(newPage);
        state.stagingDomManager.addToDom(newPage);

        // 4. Set the timeline to use the staging manager.
        if (state.timelineManager) {
            state.timelineManager.setDomManager(state.stagingDomManager);
        }
    }

    // --- Final Rendering Updates ---
    if (state.timelineManager) {
        state.timelineManager.resize(true);
    }
    renderLayersPanel();
    renderPropertiesPanel();
    renderEventsPanel();
    renderPageManager();
    updateEmptyPageHintVisibility();
}


/**
 * Creates a new page and adds it to the song.
 */
function addPage() {
    const newPage = new VirtualPage();
    state.song.pages.push(newPage);
    updateState({ song: { ...state.song } });
    markAsDirty();
    // The new page is added to the correct manager by the jumpToPage -> setActivePage flow.
    rebuildAllEventTimelines();
    reprogramAllPageTransitions();
    jumpToPage(newPage);
}

/**
 * Deletes a page from the song.
 */
function deletePage(pageToDelete) {
    if (pageToDelete === state.song.thumbnailPage) {
        console.warn("Cannot delete the thumbnail page.");
        return;
    }
    if (state.song.pages.length <= 1) {
        console.warn("Cannot delete the last page.");
        return;
    }

    const indexToDelete = state.song.pages.indexOf(pageToDelete);
    if (indexToDelete === -1) return;

    let newActiveIndex;
    if (state.activePage === pageToDelete) {
        // If we are deleting the active page, the new active index will be the one before it.
        newActiveIndex = Math.max(0, indexToDelete - 1);
    } else {
        const currentActiveIndex = state.song.pages.indexOf(state.activePage);
        if (currentActiveIndex === -1) {
            // If the active page is not a regular page (e.g., thumbnail),
            // we'll also select the page before the one being deleted as a safe fallback.
            newActiveIndex = Math.max(0, indexToDelete - 1);
        } else {
            // The active page is a regular page that is not being deleted.
            // If it came after the deleted page, its index will shift down by one.
            if (indexToDelete < currentActiveIndex) {
                newActiveIndex = currentActiveIndex - 1;
            } else {
                newActiveIndex = currentActiveIndex;
            }
        }
    }

    // Clean up the per-page selection state for the deleted page
    delete state.ui.lastSelectedElementIdByPageId[pageToDelete.id];

    state.domManager.removeFromDom(pageToDelete);
    state.stagingDomManager.removeFromDom(pageToDelete);
    state.domManager.removePage(pageToDelete);
    state.stagingDomManager.removePage(pageToDelete);

    state.song.pages.splice(indexToDelete, 1);
    updateState({ song: { ...state.song } });
    markAsDirty();

    // Update all indices before jumping to the new active page
    rebuildAllEventTimelines();
    reprogramAllPageTransitions();
    jumpToPage(state.song.pages[newActiveIndex]);
}

/**
 * Duplicates a page and inserts it after the original.
 * @param {VirtualPage} pageToDuplicate The page to copy.
 */
function duplicatePage(pageToDuplicate) {
    const serializedPage = serializeElement(pageToDuplicate);

    const idMap = new Map();

    // Recursively create new IDs for the duplicated element and all its children.
    function remapIds(data) {
        const oldId = data.id;
        const newId = `ve-${generateUUID()}`;
        idMap.set(oldId, newId);
        data.id = newId;

        // Remap children IDs
        if (data.children) {
            data.children.forEach(remapIds);
        }

        // Remap music elements order if it's a page
        if (data.type === 'page' && data.musicElementsOrder) {
            data.musicElementsOrder = data.musicElementsOrder.map(oldElId => idMap.get(oldElId)).filter(Boolean);
        }
    }

    remapIds(serializedPage);

    const newPage = deserializeElement(serializedPage);

    // Insert the new page into the song's page array
    const indexToInsert = state.song.pages.indexOf(pageToDuplicate) + 1;
    state.song.pages.splice(indexToInsert, 0, newPage);

    updateState({ song: { ...state.song } });
    markAsDirty();

    // Rebuild timelines and jump to the new page
    rebuildAllEventTimelines();
    reprogramAllPageTransitions();
    jumpToPage(newPage);
}


/**
 * Triggers a re-render on the correct DOM manager for the active page.
 * @param {boolean} useResize - If true, calls .resize(). Otherwise, calls .render().
 */
export function triggerActivePageRender(useResize = true) {
    if (!state.activePage || !state.timelineManager) return;

    // During playback, the animation loop is the source of truth. Do nothing.
    if (state.playback.isPlaying) {
        return;
    }

    // --- Replicate time calculation from updateTimelineAndEditorView ---
    const measureMap = buildMeasureMap();
    const beatDurationMs = getQuarterNoteDurationMs();
    const currentMusicalTimeInBeats = beatDurationMs > 0 ? state.playback.timeAtPause / beatDurationMs : 0;
    const totalDuration = measureMap.length > 0 ? measureMap.at(-1).startTime + measureMap.at(-1).duration : 0;

    let currentMeasureIndex = measureMap.findIndex(m => currentMusicalTimeInBeats >= m.startTime && currentMusicalTimeInBeats < m.startTime + m.duration);
    if (currentMeasureIndex === -1) {
        currentMeasureIndex = totalDuration > 0 && currentMusicalTimeInBeats >= totalDuration ? measureMap.length - 1 : 0;
    }
    if (measureMap.length === 0) currentMeasureIndex = 0;

    const currentMeasure = measureMap[currentMeasureIndex] || { startTime: 0, duration: 0 };
    const timeIntoMeasure = currentMusicalTimeInBeats - currentMeasure.startTime;
    const measureProgress = currentMeasure.duration > 0 ? timeIntoMeasure / currentMeasure.duration : 0;

    // 1. Apply events to calculate virtual property values, including transitions.
    state.timelineManager.applyEventsAt(currentMeasureIndex, measureProgress);

    // 2. Override transition properties on the virtual elements before rendering.
    const managers = [state.domManager, state.stagingDomManager].filter(Boolean);
    for (const manager of managers) {
        const pagesInDom = manager.getManagedPages().filter(p => p.addedInDom);
        for (const page of pagesInDom) {
            // Reset Effects (Opacity)
            const opacityValue = page.getProperty('effects').getOpacity();
            opacityValue.setValue(opacityValue.getDefaultValue());

            // Reset Transform properties
            const transform = page.getProperty('transform');
            if (transform) {
                transform.getEnabled().setValue(transform.getEnabled().getDefaultValue());
                transform.getTranslateX().batchUpdate(transform.getTranslateX().getDefaultValue());
                transform.getTranslateY().batchUpdate(transform.getTranslateY().getDefaultValue());
                transform.getTranslateZ().batchUpdate(transform.getTranslateZ().getDefaultValue());
                transform.getScaleX().setValue(transform.getScaleX().getDefaultValue());
                transform.getScaleY().setValue(transform.getScaleY().getDefaultValue());
                transform.getScaleZ().setValue(transform.getScaleZ().getDefaultValue());
                transform.getRotate().setValue(transform.getRotate().getDefaultValue());
                transform.getRotateX().setValue(transform.getRotateX().getDefaultValue());
                transform.getRotateY().setValue(transform.getRotateY().getDefaultValue());
                transform.getRotateZ().setValue(transform.getRotateZ().getDefaultValue());
                transform.getSkewX().setValue(transform.getSkewX().getDefaultValue());
                transform.getSkewY().setValue(transform.getSkewY().getDefaultValue());
                transform.getSelfPerspective().batchUpdate(transform.getSelfPerspective().getDefaultValue());
            }

            // Reset ParentPerspective properties
            const parentPerspective = page.getProperty('parentPerspective');
            if (parentPerspective) {
                parentPerspective.getEnabled().setValue(parentPerspective.getEnabled().getDefaultValue());
                parentPerspective.getPerspective().batchUpdate(parentPerspective.getPerspective().getDefaultValue());
                parentPerspective.getTransformStyle().setValue(parentPerspective.getTransformStyle().getDefaultValue());
                parentPerspective.getRotateX().setValue(parentPerspective.getRotateX().getDefaultValue());
                parentPerspective.getRotateY().setValue(parentPerspective.getRotateY().getDefaultValue());
                parentPerspective.getRotateZ().setValue(parentPerspective.getRotateZ().getDefaultValue());
                parentPerspective.getScale().setValue(parentPerspective.getScale().getDefaultValue());
            }
        }
    }

    // 3. Render the final state, calling resize if needed.
    if (useResize) {
        if (state.domManager) state.domManager.resize(true);
        if (state.stagingDomManager) state.stagingDomManager.resize(true);
    } else {
        if (state.domManager) state.domManager.render();
        if (state.stagingDomManager) state.stagingDomManager.render();
    }

    // Update the highlight overlay after the final render.
    if (state.highlightManager) {
        setTimeout(() => state.highlightManager.update(), 0);
    }
}

// --- Drag and Drop Handlers ---

function handlePageDragStart(e) {
    if (e.target.classList.contains('delete-page-btn') || e.currentTarget.classList.contains('thumbnail-page')) {
        e.preventDefault();
        return;
    }
    const pageIndex = parseInt(e.currentTarget.dataset.pageIndex, 10);
    updateState({
        draggedPageIndex: pageIndex,
        currentDragOperation: { type: 'reorder-page' }
    });

    setTimeout(() => e.target.classList.add('dragging-page'), 0);
}

function handlePageDragEnd() {
    document.querySelectorAll('.page-thumbnail.dragging-page, .drag-over-left, .drag-over-right')
        .forEach(t => t.classList.remove('dragging-page', 'drag-over-left', 'drag-over-right'));
    updateState({ draggedPageIndex: null, currentDragOperation: null });
}

function handlePageDragOver(e) {
    e.preventDefault();
    if (state.currentDragOperation?.type !== 'reorder-page' || e.currentTarget.classList.contains('thumbnail-page')) return;

    const targetThumb = e.currentTarget;
    const targetIndex = parseInt(targetThumb.dataset.pageIndex, 10);
    if (state.draggedPageIndex === targetIndex) return;

    document.querySelectorAll('.page-thumbnail.drag-over-left, .page-thumbnail.drag-over-right')
        .forEach(t => t.classList.remove('drag-over-left', 'drag-over-right'));

    const rect = targetThumb.getBoundingClientRect();
    const isLeft = e.clientX < (rect.left + rect.width / 2);
    targetThumb.classList.add(isLeft ? 'drag-over-left' : 'drag-over-right');
}

function handlePageDragLeave(e) {
    e.currentTarget.classList.remove('drag-over-left', 'drag-over-right');
}

function handlePageDrop(e) {
    e.preventDefault();
    if (state.currentDragOperation?.type !== 'reorder-page' || state.draggedPageIndex === null || e.currentTarget.classList.contains('thumbnail-page')) return;

    const dropTarget = e.currentTarget;
    let dropIndex = parseInt(dropTarget.dataset.pageIndex, 10);
    const draggedIndex = state.draggedPageIndex;

    if (draggedIndex === dropIndex) return;

    const rect = dropTarget.getBoundingClientRect();
    const isLeft = e.clientX < (rect.left + rect.width / 2);

    const [movedPage] = state.song.pages.splice(draggedIndex, 1);
    if (!isLeft) dropIndex++;
    if (draggedIndex < dropIndex) dropIndex--;
    state.song.pages.splice(dropIndex, 0, movedPage);

    updateState({ song: { ...state.song } });
    markAsDirty();

    // Update indices after reordering
    rebuildAllEventTimelines();
    reprogramAllPageTransitions();
    renderPageManager();
    updateTimelineAndEditorView();
}

export { setActivePage, renderPageManager, addPage, jumpToPage, deletePage };