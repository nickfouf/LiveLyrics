import { state, updateState } from './state.js';
import { makeDraggable } from './draggable.js';
import { fontLoader } from '../renderer/fontLoader.js'; // ADDED
import { showLoadingDialog, hideLoadingDialog } from './loadingDialog.js'; // ADDED
import { markAsDirty } from './events.js'; // ADDED: To ensure saving after import

let dialog, searchInput, previewTextInput, list, cancelBtn;
let localState = {
    callback: null,
};

/**
 * Updates the preview text for all font items in the list.
 */
function updatePreviewText() {
    const previewText = previewTextInput.value.trim();
    const defaultText = "Sample";
    const items = list.getElementsByTagName('li');
    for (const item of items) {
        const previewEl = item.querySelector('.font-list-item-preview');
        if (previewEl) {
            previewEl.textContent = previewText || defaultText;
        }
    }
}

/**
 * Filters the font list based on the search input.
 */
function filterFonts() {
    const filterText = searchInput.value.toLowerCase();
    const items = list.getElementsByTagName('li');
    for (const item of items) {
        const fontName = item.querySelector('.font-list-item-name').textContent || item.innerText;
        if (fontName.toLowerCase().indexOf(filterText) > -1) {
            item.style.display = "flex";
        } else {
            item.style.display = "none";
        }
    }
}

/**
 * Initializes the font picker dialog, gets DOM elements, and sets up event listeners.
 */
export function initFontPicker() {
    dialog = document.getElementById('font-picker-dialog');
    searchInput = document.getElementById('font-picker-search');
    previewTextInput = document.getElementById('font-picker-preview-text');
    list = document.getElementById('font-picker-list');
    cancelBtn = document.getElementById('font-picker-cancel');

    if (!dialog || !searchInput || !previewTextInput || !list || !cancelBtn) {
        console.error('Font Picker dialog elements not found in the DOM.');
        return;
    }

    makeDraggable('font-picker-dialog');

    // Event listener for the search bar
    searchInput.addEventListener('input', filterFonts);

    // Event listener for the preview text input
    previewTextInput.addEventListener('input', updatePreviewText);

    // Event listener for clicking on a font in the list
    list.addEventListener('click', async (e) => {
        const item = e.target.closest('.font-list-item');
        if (item && localState.callback) {
            const fontName = item.dataset.fontName;
            
            // --- ADDED: Auto-import logic ---
            // Check if we already have this font asset in our project
            if (state.song.fonts && state.song.fonts[fontName]) {
                localState.callback(fontName);
                dialog.classList.remove('visible');
                return;
            }

            // If not, try to import it from the system
            const hideLoading = showLoadingDialog(`Importing font "${fontName}"...`);
            try {
                const result = await window.editorAPI.importSystemFont(fontName);
                
                if (result && result.src) {
                    // Update State with the new font mapping
                    const newFonts = { ...state.song.fonts, [fontName]: result.src };
                    updateState({ song: { ...state.song, fonts: newFonts } });
                    
                    // Load into DOM immediately via FontLoader
                    fontLoader.loadFonts(newFonts);
                    
                    // Mark project as dirty so the new asset reference is saved
                    markAsDirty();
                }
                
                localState.callback(fontName);
                dialog.classList.remove('visible');
            } catch (error) {
                console.error("Font import failed:", error);
                alert(`Could not automatically import font file for "${fontName}".\nThe song will use the system font, but it may not display correctly on other computers.`);
                
                // Fallback: Select it anyway, relying on system font
                localState.callback(fontName); 
                dialog.classList.remove('visible');
            } finally {
                hideLoading();
            }
        }
    });

    // Event listener for the cancel button
    cancelBtn.addEventListener('click', () => {
        dialog.classList.remove('visible');
    });
}

/**
 * Opens the font picker dialog.
 * @param {string} currentFont - The currently selected font to highlight.
 * @param {function} callback - The function to call when a font is selected.
 * @param {string} [initialPreviewText=''] - The initial text to use for the preview.
 */
export function openFontPicker(currentFont, callback, initialPreviewText = '') {
    localState.callback = callback;
    list.innerHTML = ''; // Clear previous list

    // Process initial preview text with character limit
    let previewText = (initialPreviewText || '').trim();
    if (previewText.length > 20) {
        previewText = previewText.substring(0, 17) + '...';
    }
    previewTextInput.value = previewText;

    const displayText = previewText || "Sample";

    // Populate the list with system fonts
    (state.systemFonts || []).forEach(font => {
        const listItem = document.createElement('li');
        listItem.className = 'font-list-item';
        listItem.dataset.fontName = font;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'font-list-item-name';
        nameSpan.textContent = font;

        const previewSpan = document.createElement('span');
        previewSpan.className = 'font-list-item-preview';
        previewSpan.textContent = displayText;
        previewSpan.style.fontFamily = `"${font}"`;

        listItem.appendChild(nameSpan);
        listItem.appendChild(previewSpan);

        if (font === currentFont) {
            listItem.classList.add('selected');
        }
        list.appendChild(listItem);
    });

    // Reset search and scroll to the selected font
    searchInput.value = '';
    filterFonts();

    const selectedItem = list.querySelector('.selected');
    if (selectedItem) {
        // Use a timeout to ensure the dialog is visible before scrolling
        setTimeout(() => {
            selectedItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 10);
    }

    dialog.classList.add('visible');
}

