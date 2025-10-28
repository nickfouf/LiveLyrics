// src/renderer/js/player/pageManager.js

import { state, updateState } from '../editor/state.js';
import { DOM } from './dom.js';
import { buildMeasureMap } from '../editor/utils.js';
import { getQuarterNoteDurationMs } from './events.js';

/**
 * Renders the page thumbnails for the player window.
 * This version is simplified and does not include editor-specific features
 * like delete buttons or drag-and-drop.
 */
export function renderPageManager_Player() {
    if (!DOM.pageThumbnailsContainer) return;
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
                // If there are pages, jump to the first one (Page 1).
                if (state.song.pages.length > 0) {
                    jumpToPage_Player(state.song.pages[0]);
                } else {
                    // If there are no musical pages, just jump to the thumbnail itself.
                    jumpToPage_Player(thumbnailPage);
                }
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
        
        const pageName = page.getProperty('name').name;
        thumb.innerHTML = `
            <span class="page-number">${index + 1}</span>
            <span class="page-name" title="${pageName}">${pageName}</span>
        `;

        thumb.addEventListener('click', () => {
            if (!state.playback.isPlaying) {
                jumpToPage_Player(page);
            }
        });

        DOM.pageThumbnailsContainer.appendChild(thumb);
    });
}


/**
 * Sets the active page for the player.
 * This version only updates the page manager thumbnails and does NOT
 * render editor-specific panels like Layers or Properties.
 * @param {VirtualPage} newPage The VirtualPage object to make active.
 */
export function setActivePage_Player(newPage) {
    if (!newPage || state.activePage === newPage) return;

    updateState({
        activePage: newPage,
        selectedElement: newPage, // In the player, the page is always the "selected" element
    });

    // The actual DOM manipulation is handled by `updateVisiblePagesForTime` in playback.js.
    // This function's only responsibility now is to update the state and the UI thumbnails.
    renderPageManager_Player();
}

/**
 * Jumps the timeline to the beginning of a specific page.
 * @param {VirtualPage} newPage The page to jump to.
 */
export function jumpToPage_Player(newPage) {
    const newPageIndex = state.song.pages.indexOf(newPage);
    if (newPageIndex === -1 && newPage !== state.song.thumbnailPage) return;

    setActivePage_Player(newPage);

    const measureMap = buildMeasureMap();
    const firstMeasureOfPage = measureMap.find(m => m.pageIndex === newPageIndex);

    let timeOfNewPageInBeats = 0;
    if (firstMeasureOfPage) {
        timeOfNewPageInBeats = firstMeasureOfPage.startTime;
    } else if (newPageIndex > 0) { // If jumping to a page with no measures, go to the end of the previous page
        const lastMeasureBeforePage = [...measureMap].reverse().find(m => m.pageIndex < newPageIndex);
        if (lastMeasureBeforePage) {
            timeOfNewPageInBeats = lastMeasureBeforePage.startTime + lastMeasureBeforePage.duration;
        }
    }

    const beatDurationMs = getQuarterNoteDurationMs();
    const newTimeAtPause = timeOfNewPageInBeats * beatDurationMs;

    updateState({
        playback: {
            ...state.playback,
            timeAtPause: newTimeAtPause
        }
    });

    // FIXED: Instead of calling the old function, send a command to the main process.
    // The main process will then send a 'tick' event back, which triggers the render.
    window.playerAPI.jumpToTime(newTimeAtPause);
}