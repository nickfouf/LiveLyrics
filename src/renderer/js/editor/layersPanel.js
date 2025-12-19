// src/renderer/js/editor/layersPanel.js

import { state, updateState } from './state.js';
import { DOM } from './dom.js';
import { getNameForElementType, getIconForElementType, findVirtualElementById, getAllUsedAssets, serializeElement, deserializeElement, duplicateAndRemap } from './utils.js';
import { renderPropertiesPanel } from './propertiesPanel.js';
import { renderEventsPanel } from './eventsPanel.js';
import { updateTimelineAndEditorView, setPropertyAsDefaultValue, markAsDirty, rebuildAllEventTimelines, reprogramAllPageTransitions } from './events.js';
import { VirtualContainer } from '../renderer/elements/container.js';
import { triggerActivePageRender } from './pageManager.js';
import { updateEmptyPageHintVisibility } from './rendering.js';
import { generateUUID } from '../renderer/utils.js';


/**
 * Duplicates a virtual element and its entire subtree, reassigning all necessary IDs.
 * @param {VirtualElement} elementToDuplicate The element to copy.
 */
function duplicateLayer(elementToDuplicate) {
    if (!elementToDuplicate || !elementToDuplicate.parent) {
        console.error("Cannot duplicate root element or element without a parent.");
        return;
    }

    const parent = elementToDuplicate.parent;
    const originalIndex = parent.getChildren().indexOf(elementToDuplicate);

    // 1. Serialize the element and its children
    const serializedElement = serializeElement(elementToDuplicate);

    // 2. Use the robust remapping utility
    const remappedElementData = duplicateAndRemap(serializedElement);

    // 3. Deserialize back into a new VirtualElement tree
    const newElement = deserializeElement(remappedElementData);

    // 4. Add the new element to the parent
    parent.addElementAt(newElement, originalIndex + 1);

    // 5. Update UI
    markAsDirty();
    triggerActivePageRender(true);
    renderLayersPanel();
    selectLayer(newElement);
    rebuildAllEventTimelines();
    reprogramAllPageTransitions();
}

/**
 * Recursively builds the layer tree UI from the virtual element hierarchy.
 * Order is REVERSED so that front-most elements appear at the top of the list.
 */
function buildLayerTree(element, parentListElement) {
    const li = document.createElement('li');
    li.className = 'layer-item';
    li.dataset.targetId = element.id;
    li.setAttribute('draggable', 'true');

    const isContainer = element instanceof VirtualContainer;
    const children = isContainer ? element.getChildren() : [];
    if (children.length > 0) {
        li.classList.add('has-children');
    }

    const displayName = element.getProperty('name').name;
    const isVisible = element.getProperty('visible')?.getVisible().getDefaultValue();

    li.innerHTML = `
    <div class="layer-content">
        <button class="layer-toggle-btn ${children.length === 0 ? 'is-hidden' : ''}"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M7,10L12,15L17,10H7Z" /></svg></button>
        <div class="layer-info">
            <button class="layer-action-btn layer-visibility-btn ${!isVisible ? 'is-hidden' : ''}" title="${isVisible ? 'Hide' : 'Show'}">
                <img class="icon-visible" src="../../icons/eye-open.svg" alt="Visible">
                <img class="icon-hidden" src="../../icons/eye-closed.svg" alt="Hidden">
            </button>
            <span class="layer-type-icon">${getIconForElementType(element.type)}</span>
            <span class="layer-name">${displayName}</span>
        </div>
        <div class="layer-actions">
            <button class="layer-action-btn" title="Duplicate"><img src="../../icons/duplicate_gray.svg" alt="Duplicate"></button>
            <button class="layer-action-btn" title="Delete"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" /></svg></button>
        </div>
    </div>`;

    parentListElement.appendChild(li);

    if (children.length > 0) {
        const childrenUl = document.createElement('ul');
        childrenUl.className = 'layer-children';
        li.appendChild(childrenUl);

        // --- REVERSED ITERATION ---
        // Higher index in array = visually "front" = top of list
        [...children].reverse().forEach(child => buildLayerTree(child, childrenUl));
    }
}

/**
 * Renders the entire layers panel.
 */
export function renderLayersPanel() {
    DOM.layerTree.innerHTML = '';
    const activePage = state.activePage;
    if (!activePage) return;

    const rootLi = document.createElement('li');
    rootLi.className = 'layer-item has-children';
    rootLi.dataset.targetId = activePage.id;

    const pageName = activePage.getProperty('name').name;
    rootLi.innerHTML = `
    <div class="layer-content">
        <button class="layer-toggle-btn"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M7,10L12,15L17,10H7Z" /></svg></button>
        <div class="layer-info">
            <span class="layer-type-icon"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 16L6 10L7.41 8.58L12 13.17L16.59 8.58L18 10M12 20.5L3 11.5L12 2.5L21 11.5L12 20.5Z"/></svg></span>
            <span class="layer-name">${pageName}</span>
        </div>
    </div>`;

    const childrenContainer = document.createElement('ul');
    childrenContainer.className = 'layer-children';
    rootLi.appendChild(childrenContainer);

    // --- REVERSED ITERATION ---
    [...activePage.getChildren()].reverse().forEach(element => buildLayerTree(element, childrenContainer));

    DOM.layerTree.appendChild(rootLi);

    if (state.selectedElement) {
        const selectedItem = DOM.layerTree.querySelector(`.layer-item[data-target-id="${state.selectedElement.id}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
    } else {
        selectLayer(activePage);
    }
}

/**
 * Selects a layer (a virtual element).
 * @param {VirtualElement} elementToSelect The virtual element to select.
 */
export function selectLayer(elementToSelect) {
    if (!elementToSelect) return;

    updateState({ selectedElement: elementToSelect });

    // Remember this selection for the current page in the central UI state
    if (state.activePage) {
        state.ui.lastSelectedElementIdByPageId[state.activePage.id] = elementToSelect.id;
    }

    // Update UI selection state
    document.querySelectorAll('.layer-item.selected').forEach(el => el.classList.remove('selected'));
    const selectedLayerItem = DOM.layerTree.querySelector(`.layer-item[data-target-id="${elementToSelect.id}"]`);
    if (selectedLayerItem) {
        selectedLayerItem.classList.add('selected');
    }

    // Highlight in the main view using the new manager
    if (state.highlightManager) {
        // CHANGED: Pass the whole virtual element to the manager
        state.highlightManager.highlight(elementToSelect);
    }

    // Update other panels
    renderPropertiesPanel();
    renderEventsPanel();
}

export function initLayersPanelInteractions() {
    DOM.layerTree.addEventListener('click', async (e) => {
        const layerItem = e.target.closest('.layer-item');
        if (!layerItem) return;

        const targetId = layerItem.dataset.targetId;
        const targetElement = findVirtualElementById(state.activePage, targetId);
        if (!targetElement) return;

        // --- Handle Toggle Button Click ---
        const toggleButton = e.target.closest('.layer-toggle-btn');
        if (toggleButton) {
            e.stopPropagation();
            layerItem.classList.toggle('collapsed');
            return;
        }

        // --- Handle Visibility Button Click ---
        const visibilityButton = e.target.closest('.layer-visibility-btn');
        if (visibilityButton) {
            e.stopPropagation();
            const visibleProp = targetElement.getProperty('visible');
            if (visibleProp) {
                const isCurrentlyVisible = visibleProp.getVisible().getDefaultValue();
                setPropertyAsDefaultValue(targetElement, 'visible', !isCurrentlyVisible);
                renderLayersPanel();
            }
            return;
        }

        // --- Handle Delete Button Click ---
        const deleteButton = e.target.closest('.layer-action-btn[title="Delete"]');
        if (deleteButton) {
            e.stopPropagation();
            // Confirmation for elements with events might be needed here
            // const confirmed = await showConfirmationDialog("...");
            // if (!confirmed) return;

            const parent = targetElement.parent;
            if (parent && parent instanceof VirtualContainer) {
                const elementType = targetElement.type;
                const hasSrcProperty = ['image', 'video', 'audio', 'smart-effect'].includes(elementType);

                // ADDED: Clean up UI state for the deleted element
                delete state.ui.propertiesPanelState.scrollPositionByElementId[targetId];
                delete state.ui.propertiesPanelState.collapsedGroupsByElementId[targetId];

                // If the deleted element is a music element, remove it from the page's order.
                if (state.activePage) {
                    state.activePage.removeMusicElementFromOrder(targetElement);
                }

                parent.removeElement(targetElement);
                markAsDirty();

                // If the deleted element had a source, trigger asset cleanup.
                if (hasSrcProperty) {
                    (async () => {
                        const usedAssets = getAllUsedAssets();
                        if (window.editorAPI && window.editorAPI.cleanUnusedAssets) {
                            try {
                                await window.editorAPI.cleanUnusedAssets(usedAssets);
                                console.log('Asset cleanup process completed.');
                            } catch (error) {
                                console.error('Asset cleanup process failed:', error);
                            }
                        }
                    })();
                }

                // Re-render and select parent
                triggerActivePageRender(true);
                renderLayersPanel();
                selectLayer(parent);
                renderEventsPanel();
                updateTimelineAndEditorView();
                updateEmptyPageHintVisibility();
            }
            return;
        }

        // --- Handle Duplicate Button Click ---
        const duplicateButton = e.target.closest('.layer-action-btn[title="Duplicate"]');
        if (duplicateButton) {
            e.stopPropagation();
            duplicateLayer(targetElement);
            return;
        }

        // --- Handle layer selection ---
        selectLayer(targetElement);
    });
}