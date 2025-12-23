import { state, updateState } from './state.js';
import { DOM } from './dom.js';
import { pageHasMeasures } from './utils.js';

export function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const pageToShow = document.getElementById(pageId);
    if (pageToShow) {
        pageToShow.classList.add('active');
    }
}

export function showHint(message) {
    if (state.highlightTimeout) clearTimeout(state.highlightTimeout);
    DOM.dropHint.textContent = message;
    DOM.dropHint.classList.add('visible');
    const newTimeout = setTimeout(() => {
        DOM.dropHint.classList.remove('visible');
    }, 2000);
    updateState({ highlightTimeout: newTimeout });
}

export function updateZIndex(container) {
    if (!container) return;
    const targetContainer = container.classList.contains('slide-wrapper') ? container : container;
    if (!targetContainer.matches('.slide-wrapper, .a-container')) return;

    const children = Array.from(targetContainer.children).filter(child => child.dataset.elementType);
    children.forEach((child, index) => child.style.zIndex = children.length - index);
}

export function updateEmptyPageHintVisibility() {
    const hint = document.getElementById('empty-page-hint');
    const activePage = state.activePage;
    if (hint && activePage) {
        const isThumbnailPage = activePage === state.song.thumbnailPage;
        const hasMeasures = pageHasMeasures(activePage);
        hint.classList.toggle('visible', !isThumbnailPage && !hasMeasures);
    }
}

export function updateContainerPlaceholder(container) {
    if (!container) return;
    const hasRealChildren = Array.from(container.children).some(child => child.dataset.elementType);
    // Further logic would go here if needed.
}

export function applyViewportScaling(wrapperElement) {
    if (!wrapperElement) return;

    const viewportElement = wrapperElement.querySelector('#slide-viewport');
    if (!viewportElement) return;

    const availableWidth = wrapperElement.clientWidth;
    const availableHeight = wrapperElement.clientHeight;

    if (availableHeight <= 0 || availableWidth <= 0) return;

    const targetHeight = 1080;
    
    // --- START: MODIFICATION ---
    // Calculate the aspect ratio of the available space (the wrapper).
    const aspectRatio = availableWidth / availableHeight;
    // Calculate the target width based on the wrapper's aspect ratio to maintain proportions.
    const targetWidth = targetHeight * aspectRatio;

    // The scale factor is simply the ratio of the available height to our target height.
    const scale = availableHeight / targetHeight;
    // --- END: MODIFICATION ---

    const transformString = `translate(-50%, -50%) scale(${scale})`;

    viewportElement.style.width = `${targetWidth}px`;
    viewportElement.style.height = `${targetHeight}px`;
    viewportElement.style.transform = transformString;

    // The inner containers should just fill the viewport
    const pageContainer = viewportElement.querySelector('#page-container');
    const stagingContainer = viewportElement.querySelector('#staging-page-container');

    if (pageContainer) {
        pageContainer.style.width = '100%';
        pageContainer.style.height = '100%';
        pageContainer.style.transform = 'none';
    }
    if (stagingContainer) {
        stagingContainer.style.width = '100%';
        stagingContainer.style.height = '100%';
        stagingContainer.style.transform = 'none';
    }
}

