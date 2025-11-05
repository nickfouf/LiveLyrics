// src/renderer/js/player/pageManager.js

import { state, updateState } from '../editor/state.js';
import { DOM } from './dom.js';
import { jumpToPage_Player } from './playback.js';

/**
 * Renders the page thumbnails for the player window.
 * This version is simplified and does not include editor-specific features
 * like delete buttons or drag-and-drop.
 */
export function renderPageManager_Player() {
    if (!DOM.pageThumbnailsContainer) return;
    DOM.pageThumbnailsContainer.innerHTML = '';

    // FIXED: Add a guard clause to handle the case where no song is loaded.
    if (!state.song) {
        return;
    }

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

    // ADDED: Scroll the active page into view if it's not fully visible
    const activeThumbnail = DOM.pageThumbnailsContainer.querySelector('.page-thumbnail.active-page');
    if (activeThumbnail) {
        activeThumbnail.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest'
        });
    }
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