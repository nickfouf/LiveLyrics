// src/renderer/js/editor/eventsPanel.js

import { state, updateState } from './state.js';
import { DOM } from './dom.js';
import { getIconForElementType, findMusicElementsRecursively, buildMeasureMap, calculateGlobalMeasureOffsetForElement, getPageMeasuresStructure } from './utils.js';
import { openEventsEditor } from './eventsEditor.js';
import { updateTimelineAndEditorView, rebuildAllEventTimelines, reprogramAllPageTransitions, markAsDirty } from "./events.js";
import { renderPropertiesPanel } from './propertiesPanel.js';
import { VirtualLyrics } from '../renderer/elements/lyrics.js';
import { VirtualOrchestra } from '../renderer/elements/orchestra.js';
import { VirtualAudio } from '../renderer/elements/audio.js';

/**
 * Renders the Events Panel. The content changes based on whether the
 * active page or a specific element is selected.
 */
export function renderEventsPanel() {
    if (!DOM.eventsPanel) return;
    const drawerBody = DOM.eventsPanel.querySelector('.drawer-body');
    drawerBody.innerHTML = ''; // Clear previous content

    const selectedElement = state.selectedElement;
    const activePage = state.activePage;

    if (!selectedElement || !activePage) return;

    // --- RENDER "ELEMENTS ORDER" & "TRANSITION" VIEW (When Page is Selected) ---
    if (selectedElement.type === 'page') {
        drawerBody.innerHTML = `
            <div class="drawer-group">
                <h4>ELEMENTS ORDER</h4>
                <ul id="music-elements-list" class="music-elements-list"></ul>
                <div id="total-measures-display" class="total-measures-display">Total measures: 0</div>
            </div>
        `;
        const musicElementsList = drawerBody.querySelector('#music-elements-list');
        const totalMeasuresDisplay = drawerBody.querySelector('#total-measures-display');

        const allMusicChildren = findMusicElementsRecursively(activePage);
        const orderedElements = activePage.getMusicElementsOrder();
        const orderedIds = new Set(orderedElements.map(el => el.id));
        const unorderedElements = allMusicChildren.filter(el => !orderedIds.has(el.id));
        const musicElements = [...orderedElements, ...unorderedElements];

        let totalMeasures = 0;

        musicElements.forEach(element => {
            let measureCount = 0;
            if (element instanceof VirtualLyrics) {
                const lyricsProp = element.getProperty('lyricsContent');
                if (lyricsProp) {
                    measureCount = lyricsProp.getLyricsValue().getLyricsObject().measures.length;
                }
            } else if (element instanceof VirtualOrchestra) {
                const orchestraProp = element.getProperty('orchestraContent');
                if (orchestraProp) {
                    measureCount = orchestraProp.getMeasures().reduce((total, measure) => total + (measure.count || 1), 0);
                }
            }

            totalMeasures += measureCount;

            const li = document.createElement('li');
            li.className = 'music-element-item';
            li.dataset.targetId = element.id;
            li.setAttribute('draggable', 'true');

            const elementName = element.getProperty('name').name;
            li.innerHTML = `
                <div class="element-icon">${getIconForElementType(element.type)}</div>
                <span class="element-label">${elementName}</span>
                <span class="measure-count">(${measureCount})</span>
            `;
            musicElementsList.appendChild(li);
        });
        totalMeasuresDisplay.textContent = `Total measures: ${totalMeasures}`;

        // --- RENDER "TRANSITION" VIEW ---
        const initialTransition = activePage.transition || { type: 'fade', duration: 2, durationUnit: 'beats', direction: 'left', perspective: { value: 2000, unit: 'px' } };

        const transitionGroup = document.createElement('div');
        transitionGroup.className = 'drawer-group';
        transitionGroup.innerHTML = `
            <h4>TRANSITION</h4>
            <div class="form-group">
                <label for="page-transition-type">Type</label>
                <select id="page-transition-type" class="form-select">
                    <option value="fade" ${initialTransition.type === 'fade' ? 'selected' : ''}>Fade</option>
                    <option value="dip-to-black" ${initialTransition.type === 'dip-to-black' ? 'selected' : ''}>Dip to Black</option>
                    <option value="push" ${initialTransition.type === 'push' ? 'selected' : ''}>Push</option>
                    <option value="flip" ${initialTransition.type === 'flip' ? 'selected' : ''}>Flip</option>
                    <option value="cube" ${initialTransition.type === 'cube' ? 'selected' : ''}>Cube</option>
                    <option value="instant" ${initialTransition.type === 'instant' ? 'selected' : ''}>Instant</option>
                </select>
            </div>
            <div id="page-transition-properties"></div>
        `;
        drawerBody.appendChild(transitionGroup);

        const transitionPropertiesContainer = drawerBody.querySelector('#page-transition-properties');

        function renderTransitionProperties() {
            transitionPropertiesContainer.innerHTML = '';
            const currentType = drawerBody.querySelector('#page-transition-type').value;
            const transition = activePage.transition; // FIX: Read the latest transition state
            transition.type = currentType;

            if (currentType === 'fade' || currentType === 'dip-to-black' || currentType === 'push' || currentType === 'flip' || currentType === 'cube') {
                transitionPropertiesContainer.innerHTML += `
                    <div class="form-group">
                        <label for="page-transition-duration">Duration</label>
                        <div class="input-with-unit">
                            <input type="number" id="page-transition-duration" class="form-input" min="0.1" step="0.01" value="${transition.duration || 1}">
                            <select id="page-transition-unit" class="form-select">
                                <option value="measures" ${transition.durationUnit === 'measures' ? 'selected' : ''}>Measures</option>
                                <option value="beats" ${transition.durationUnit === 'beats' ? 'selected' : ''}>Beats</option>
                            </select>
                        </div>
                    </div>
                `;
            }

            if (currentType === 'push' || currentType === 'flip' || currentType === 'cube') {
                transitionPropertiesContainer.innerHTML += `
                     <div class="form-group">
                        <label for="page-transition-direction">Direction</label>
                        <select id="page-transition-direction" class="form-select">
                            <option value="left" ${transition.direction === 'left' ? 'selected' : ''}>Left</option>
                            <option value="right" ${transition.direction === 'right' ? 'selected' : ''}>Right</option>
                            <option value="up" ${transition.direction === 'up' ? 'selected' : ''}>Up</option>
                            <option value="down" ${transition.direction === 'down' ? 'selected' : ''}>Down</option>
                        </select>
                    </div>
                `;
            }

            if (currentType === 'flip' || currentType === 'cube') {
                const perspective = transition.perspective || { value: 2000, unit: 'px' };
                transitionPropertiesContainer.innerHTML += `
                    <div class="form-group">
                        <label for="page-transition-perspective">Perspective</label>
                        <div class="input-with-unit">
                            <input type="number" id="page-transition-perspective" class="form-input" value="${perspective.value}">
                            <select id="page-transition-perspective-unit" class="form-select">
                                <option value="px" ${perspective.unit === 'px' ? 'selected' : ''}>px</option>
                                <option value="%" ${perspective.unit === '%' ? 'selected' : ''}>%</option>
                            </select>
                        </div>
                    </div>
                `;
            }

            // Add event listeners to the newly created elements
            const durationInput = document.getElementById('page-transition-duration');
            const unitSelect = document.getElementById('page-transition-unit');

            if (durationInput && unitSelect) {
                const updateDuration = () => {
                    activePage.transition.duration = parseFloat(durationInput.value) || 1;
                    activePage.transition.durationUnit = unitSelect.value;
                    markAsDirty();
                    reprogramAllPageTransitions();
                };
                durationInput.addEventListener('change', updateDuration);
                unitSelect.addEventListener('change', updateDuration);
            }

            const directionSelect = document.getElementById('page-transition-direction');
            if (directionSelect) {
                directionSelect.addEventListener('change', () => {
                    activePage.transition.direction = directionSelect.value;
                    markAsDirty();
                    reprogramAllPageTransitions();
                });
            }

            const perspectiveInput = document.getElementById('page-transition-perspective');
            const perspectiveUnitSelect = document.getElementById('page-transition-perspective-unit');
            if (perspectiveInput && perspectiveUnitSelect) {
                const updatePerspective = () => {
                    const parsedValue = parseFloat(perspectiveInput.value);
                    activePage.transition.perspective = {
                        value: isFinite(parsedValue) ? parsedValue : 1000,
                        unit: perspectiveUnitSelect.value
                    };
                    markAsDirty();
                    reprogramAllPageTransitions();
                };
                perspectiveInput.addEventListener('change', updatePerspective);
                perspectiveUnitSelect.addEventListener('change', updatePerspective);
            }
        }

        drawerBody.querySelector('#page-transition-type').addEventListener('change', () => {
            renderTransitionProperties();
            markAsDirty();
            reprogramAllPageTransitions();
        });

        renderTransitionProperties();


    } else {
        // --- RENDER "EVENTS" VIEW (When a specific Element is Selected) ---
        const isThumbnailPage = activePage === state.song.thumbnailPage;
        const disabledAttr = isThumbnailPage ? 'disabled' : '';
        const titleAttr = isThumbnailPage ? 'title="Events cannot be added to elements on the Thumbnail page."' : '';

        drawerBody.innerHTML = `
            <div class="drawer-group">
                <h4>EVENTS</h4>
                <button id="edit-element-events-btn" class="action-btn secondary-btn" style="width: 100%;" ${disabledAttr} ${titleAttr}>Edit Events</button>
            </div>
        `;
        const editBtn = document.getElementById('edit-element-events-btn');
        if (editBtn && !editBtn.disabled) {
            editBtn.addEventListener('click', () => {
                const currentData = selectedElement.getEventsData();
                const measureMap = buildMeasureMap();
                
                const pageIndex = state.song.pages.indexOf(state.activePage);
                const firstMeasureOfPage = measureMap.find(m => m.pageIndex === pageIndex);
                const globalMeasureOffset = firstMeasureOfPage ? firstMeasureOfPage.globalIndex : 0;

                openEventsEditor(selectedElement.id, currentData, globalMeasureOffset, (newState) => {
                    let finalState = newState;

                    // Compatibility Layer: Convert new map format back to the array format
                    // that the legacy setEventsData method expects.
                    if (newState.format === 'map') {
                        const pageMeasures = getPageMeasuresStructure(state.activePage);
                        const contentArray = pageMeasures.map(measure => newState.content[measure.id] || []);
                        finalState = { content: contentArray };
                    }

                    window.elementSC = selectedElement;
                    console.log('Updated events data:', finalState);
                    const newMeasureMap = buildMeasureMap();
                    const newGlobalMeasureOffset = calculateGlobalMeasureOffsetForElement(selectedElement.id, newMeasureMap);
                    selectedElement.setEventsData(finalState, newGlobalMeasureOffset, newMeasureMap);

                    renderPropertiesPanel();
                    updateTimelineAndEditorView();
                });
            });
        }
    }
}

export function initEventsPanelInteractions() {
    if (!DOM.eventsPanel) return;
    const drawerBody = DOM.eventsPanel.querySelector('.drawer-body');
    let draggedItem = null;

    drawerBody.addEventListener('dragstart', (e) => {
        draggedItem = e.target.closest('.music-element-item');
        if (!draggedItem) return;
        updateState({ currentDragOperation: { type: 'reorder-music-element' } });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedItem.dataset.targetId);
        setTimeout(() => draggedItem.classList.add('dragging'), 0);
    });

    drawerBody.addEventListener('dragend', () => {
        if (draggedItem) draggedItem.classList.remove('dragging');
        draggedItem = null;
        updateState({ currentDragOperation: null });
        drawerBody.querySelectorAll('.music-element-item').forEach(item => {
            item.classList.remove('drag-over-before', 'drag-over-after');
        });
    });

    drawerBody.addEventListener('dragover', (e) => {
        e.preventDefault();
        // This check correctly ignores any drag operation that isn't from this list.
        if (state.currentDragOperation?.type !== 'reorder-music-element') return;
        const targetItem = e.target.closest('.music-element-item');
        if (!targetItem || targetItem === draggedItem) return;

        const rect = targetItem.getBoundingClientRect();
        const y = e.clientY - rect.top;
        drawerBody.querySelectorAll('.music-element-item').forEach(item => {
            item.classList.remove('drag-over-before', 'drag-over-after');
        });
        targetItem.classList.add(y < rect.height / 2 ? 'drag-over-before' : 'drag-over-after');
    });

    drawerBody.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetItem = e.target.closest('.music-element-item');
        // This check correctly ignores any drop that isn't from within this list.
        if (!targetItem || !draggedItem || state.currentDragOperation?.type !== 'reorder-music-element') {
            drawerBody.querySelectorAll('.music-element-item').forEach(item => item.classList.remove('drag-over-before', 'drag-over-after'));
            return;
        }

        const activePage = state.activePage;
        if (!activePage) return;

        const allMusicElements = findMusicElementsRecursively(activePage);
        const childrenMap = new Map(allMusicElements.map(c => [c.id, c]));

        // --- START: REVISED LOGIC ---
        // Get the initial order of IDs from the DOM.
        const allIds = Array.from(drawerBody.querySelectorAll('.music-element-item')).map(li => li.dataset.targetId);
        const draggedId = draggedItem.dataset.targetId;
        const targetId = targetItem.dataset.targetId;

        // Create a new array without the dragged item.
        const itemsWithoutDragged = allIds.filter(id => id !== draggedId);

        // Find where the target item is in the new array.
        let targetIndex = itemsWithoutDragged.indexOf(targetId);

        // If dropping after the target, increment the index.
        if (targetItem.classList.contains('drag-over-after')) {
            targetIndex++;
        }

        // Insert the dragged item at its new position.
        itemsWithoutDragged.splice(targetIndex, 0, draggedId);

        const newOrderElements = itemsWithoutDragged.map(id => childrenMap.get(id)).filter(Boolean);
        activePage.setMusicElementsOrder(newOrderElements);

        markAsDirty();
        renderEventsPanel();
        rebuildAllEventTimelines();
        reprogramAllPageTransitions();
    });

    // --- ADDED: Click listener for highlighting layers ---
    drawerBody.addEventListener('click', (e) => {
        const musicItem = e.target.closest('.music-element-item');
        if (!musicItem || draggedItem) return; // Ignore clicks during a drag operation

        const targetId = musicItem.dataset.targetId;
        if (!targetId || !DOM.layerTree) return;

        const layerItem = DOM.layerTree.querySelector(`.layer-item[data-target-id="${targetId}"]`);
        if (layerItem) {
            // Apply a highlight class
            layerItem.classList.add('highlight-from-events');

            // Remove the class after 1 second
            setTimeout(() => {
                layerItem.classList.remove('highlight-from-events');
            }, 1000);
        }
    });
}