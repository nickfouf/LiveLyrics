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