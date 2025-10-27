// src/renderer/js/editor/orchestraEditor.js

import { state, updateState } from './state.js';
import { showConfirmationDialog, measuresHaveEvents, pageHasMeasures } from './utils.js';
import { generateUUID } from "../renderer/utils.js";
import { jumpToPage } from './pageManager.js';
import {updateTimelineAndEditorView, rebuildAllEventTimelines, reprogramAllPageTransitions, markAsDirty} from './events.js';

// --- Module State ---
let orchestraState = {
    measures: [],
    globalMeasureOffset: 0,
};
let orchestraEditorDialog, addMeasureDialog, measuresContainer;
let draggedMeasureIndex = null;


// --- Rendering Functions ---
function renderMeasures() {
    if (!measuresContainer) return;
    // Clear existing measures before re-rendering
    while (measuresContainer.firstElementChild && !measuresContainer.firstElementChild.matches('#oe-add-measure-btn')) {
        measuresContainer.removeChild(measuresContainer.firstElementChild);
    }
    const addButton = document.getElementById('oe-add-measure-btn');
    let localMeasureCounter = 0;

    orchestraState.measures.forEach((measure, index) => {
        const measureBox = document.createElement('div');
        measureBox.className = 'measure-box';
        measureBox.dataset.index = index;

        const count = measure.count || 1;
        const countDisplay = count > 1 ? `<span class="measure-count-display">×${count}</span>` : '';

        const globalMeasureStartNumber = orchestraState.globalMeasureOffset + localMeasureCounter + 1;
        const globalMeasureEndNumber = globalMeasureStartNumber + count - 1;
        const measureNumberDisplay = count > 1 ? `${globalMeasureStartNumber}-${globalMeasureEndNumber}` : globalMeasureStartNumber;

        const contentHTML = `
            <button class="duplicate-measure-btn" title="Duplicate Measure">
                <img src="../../icons/duplicate.svg" alt="Duplicate">
            </button>
            <button class="delete-measure-btn" title="Delete Measure">
                <img src="../../icons/delete.svg" alt="Delete">
            </button>
            <div class="measure-header" draggable="true">
                <span class="measure-global-number">${measureNumberDisplay}</span>
                <span class="measure-time-signature">${measure.timeSignature.numerator}/${measure.timeSignature.denominator}</span>
            </div>
            <div class="measure-content">
                ${countDisplay}
            </div>
        `;

        measureBox.innerHTML = contentHTML;
        measuresContainer.insertBefore(measureBox, addButton);
        localMeasureCounter += count;
    });
}


// --- Measure Management ---
async function deleteMeasure(index) {
    if (index < 0 || index >= orchestraState.measures.length) return;

    const measureToDelete = orchestraState.measures[index];
    const measureIdsToCheck = [];
    // REVISED: Check all measures within the batch for events
    for (let i = 0; i < (measureToDelete.count || 1); i++) {
        measureIdsToCheck.push(`${measureToDelete.id}-${i}`);
    }

    const hasEvents = measuresHaveEvents(measureIdsToCheck);

    if (hasEvents) {
        const confirmed = await showConfirmationDialog(
            'This measure group has events associated with it. Deleting it will also delete those events. Are you sure?',
            'Confirm Deletion'
        );
        if (!confirmed) {
            return;
        }
    }

    orchestraState.measures.splice(index, 1);
    renderMeasures();
}


function duplicateMeasure(index) {
    if (index < 0 || index >= orchestraState.measures.length) return;

    const originalMeasure = orchestraState.measures[index];
    const newMeasure = JSON.parse(JSON.stringify(originalMeasure));

    newMeasure.id = `measure-${generateUUID()}`;

    orchestraState.measures.splice(index + 1, 0, newMeasure);
    renderMeasures();
}


// --- Drag and Drop Event Handlers ---

function clearDropIndicators() {
    document.querySelectorAll('.measure-box.drag-over-left, .measure-box.drag-over-right').forEach(el => el.classList.remove('drag-over-left', 'drag-over-right'));
}


// --- Dialog Management ---

function handleAddMeasure() {
    addMeasureDialog.classList.add('visible');
}

function handleConfirmAddMeasure() {
    const timeSigSelect = document.getElementById('oe-time-signature');
    const splits = timeSigSelect.value.split('/');
    const measureCountInput = document.getElementById('oe-measure-count');
    const count = parseInt(measureCountInput.value, 10) || 1;

    // REVERTED: Create a single measure object with a count
    const newMeasure = {
        id: `measure-${generateUUID()}`,
        timeSignature: {
            numerator: parseInt(splits[0], 10),
            denominator: parseInt(splits[1], 10)
        },
        count: count,
        content: []
    };
    orchestraState.measures.push(newMeasure);
    renderMeasures();
    addMeasureDialog.classList.remove('visible');
    measureCountInput.value = '1';
}

// --- Initialization and Public API ---

export function initOrchestraEditor() {
    const mainDialogHTML = `
        <div id="orchestra-editor-dialog" class="dialog-overlay">
            <div class="dialog-content">
                <div class="dialog-header">Orchestra Measures Editor</div>
                <div class="dialog-body">
                    <div class="measure-manager">
                        <div id="oe-measures-container" class="measures-container">
                            <!-- Measures will be rendered here -->
                            <button id="oe-add-measure-btn" class="add-measure-btn">+</button>
                        </div>
                    </div>
                     <!-- No tool palettes needed -->
                </div>
                <div class="dialog-footer">
                    <button id="oe-cancel-btn" class="action-btn secondary-btn">Cancel</button>
                    <button id="oe-ok-btn" class="action-btn primary-btn">OK</button>
                </div>
            </div>
        </div>`;

    const addMeasureDialogHTML = `
        <div id="add-orchestra-measure-dialog" class="dialog-overlay">
            <div class="dialog-content">
                <div class="dialog-header">Add Measure</div>
                <div class="dialog-body">
                    <div class="form-group">
                        <label for="oe-time-signature">Time Signature</label>
                        <select id="oe-time-signature" class="form-select">
                            <option value="2/4">2/4</option>
                            <option value="3/4">3/4</option>
                            <option value="4/4" selected>4/4</option>
                            <option value="5/8">5/8</option>
                            <option value="7/8">7/8</option>
                            <option value="10/8">10/8</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="oe-measure-count">Measures</label>
                        <input type="number" id="oe-measure-count" class="form-input" value="1" min="1">
                    </div>
                </div>
                <div class="dialog-footer">
                    <button id="oe-add-measure-cancel-btn" class="action-btn secondary-btn">Cancel</button>
                    <button id="oe-add-measure-ok-btn" class="action-btn primary-btn">OK</button>
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', mainDialogHTML);
    document.body.insertAdjacentHTML('beforeend', addMeasureDialogHTML);

    orchestraEditorDialog = document.getElementById('orchestra-editor-dialog');
    addMeasureDialog = document.getElementById('add-orchestra-measure-dialog');
    measuresContainer = document.getElementById('oe-measures-container');

    document.getElementById('oe-ok-btn').addEventListener('click', () => {
        if (state.orchestraEditorCallback) {
            const activePage = state.activePage;
            const hadMeasuresBefore = pageHasMeasures(activePage);

            state.orchestraEditorCallback(orchestraState);
            markAsDirty();

            const hasMeasuresAfter = pageHasMeasures(activePage);

            if (hadMeasuresBefore !== hasMeasuresAfter) {
                jumpToPage(activePage);
            } else {
                rebuildAllEventTimelines();
            }
            reprogramAllPageTransitions();
        }
        orchestraEditorDialog.classList.remove('visible');
    });
    document.getElementById('oe-cancel-btn').addEventListener('click', () => {
        orchestraEditorDialog.classList.remove('visible');
    });
    document.getElementById('oe-add-measure-btn').addEventListener('click', handleAddMeasure);


    measuresContainer.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.delete-measure-btn');
        if (deleteBtn) {
            const measureBox = deleteBtn.closest('.measure-box');
            const measureIndex = parseInt(measureBox.dataset.index, 10);
            deleteMeasure(measureIndex);
            return;
        }

        const duplicateBtn = e.target.closest('.duplicate-measure-btn');
        if (duplicateBtn) {
            const measureBox = duplicateBtn.closest('.measure-box');
            const measureIndex = parseInt(measureBox.dataset.index, 10);
            duplicateMeasure(measureIndex);
            return;
        }
    });

    measuresContainer.addEventListener('dragstart', (e) => {
        if (!e.target.classList.contains('measure-header')) return;
        const measureBox = e.target.closest('.measure-box');
        if (!measureBox) return;

        draggedMeasureIndex = parseInt(measureBox.dataset.index, 10);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `measure-index:${draggedMeasureIndex}`);

        const clone = measureBox.cloneNode(true);
        clone.id = 'measure-drag-clone';
        clone.style.position = 'absolute';
        clone.style.top = '-9999px';
        clone.style.left = '-9999px';
        clone.style.width = `${measureBox.offsetWidth}px`;
        clone.style.height = `${measureBox.offsetHeight}px`;
        document.body.appendChild(clone);
        e.dataTransfer.setDragImage(clone, e.offsetX, e.offsetY);

        setTimeout(() => measureBox.classList.add('dragging'), 0);
    });

    measuresContainer.addEventListener('dragend', () => {
        if (draggedMeasureIndex === null) return;
        const clone = document.getElementById('measure-drag-clone');
        if (clone) clone.remove();
        const draggedElement = measuresContainer.querySelector('.measure-box.dragging');
        if (draggedElement) draggedElement.classList.remove('dragging');
        clearDropIndicators();
        draggedMeasureIndex = null;
    });

    measuresContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (draggedMeasureIndex === null) return;

        const targetMeasure = e.target.closest('.measure-box');
        clearDropIndicators();
        if (!targetMeasure || parseInt(targetMeasure.dataset.index, 10) === draggedMeasureIndex) {
            return;
        }
        const rect = targetMeasure.getBoundingClientRect();
        const isLeft = e.clientX < rect.left + rect.width / 2;
        targetMeasure.classList.add(isLeft ? 'drag-over-left' : 'drag-over-right');
    });

    measuresContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        if (draggedMeasureIndex === null) return;

        const dropTarget = e.target.closest('.measure-box');
        clearDropIndicators();
        if (!dropTarget || parseInt(dropTarget.dataset.index, 10) === draggedMeasureIndex) return;

        const dropIndex = parseInt(dropTarget.dataset.index, 10);
        const rect = dropTarget.getBoundingClientRect();
        const isLeft = e.clientX < rect.left + rect.width / 2;

        const [movedMeasure] = orchestraState.measures.splice(draggedMeasureIndex, 1);
        let newIndex = isLeft ? dropIndex : dropIndex + 1;
        if (draggedMeasureIndex < newIndex) {
            newIndex--;
        }
        orchestraState.measures.splice(newIndex, 0, movedMeasure);
        renderMeasures();
    });

    document.getElementById('oe-add-measure-ok-btn').addEventListener('click', handleConfirmAddMeasure);
    document.getElementById('oe-add-measure-cancel-btn').addEventListener('click', () => {
        addMeasureDialog.classList.remove('visible');
    });
}

export function openOrchestraEditor(initialData, globalMeasureOffset, callback) {
    let parsedData = {};
    try {
        parsedData = JSON.parse(initialData);
    } catch (e) {
        console.error("Could not parse orchestra data. Falling back to default.", e);
        parsedData = {};
    }

    orchestraState = {
        measures: (parsedData.measures || []).map(m => ({
            ...m,
            id: m.id || `measure-${generateUUID()}`,
        })),
        globalMeasureOffset: globalMeasureOffset || 0,
    };

    updateState({ orchestraEditorCallback: callback });
    renderMeasures();
    orchestraEditorDialog.classList.add('visible');
}