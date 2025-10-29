// src/renderer/js/editor/lyricsEditor.js

import { state, updateState } from './state.js';
import { getNoteIconHTML, showConfirmationDialog, measuresHaveEvents, pageHasMeasures } from './utils.js';
import { generateUUID } from "../renderer/utils.js";
import { jumpToPage } from "./pageManager.js";
import {updateTimelineAndEditorView, rebuildAllEventTimelines, reprogramAllPageTransitions, markAsDirty} from './events.js';

// --- Constants and Helpers ---
const NOTE_DURATIONS = {
    w_note: 1.0,
    h_note: 0.5,
    q_note: 0.25,
    e_note: 0.125,
    s_note: 0.0625,
    w_note_dotted: 1.5,
    h_note_dotted: 0.75,
    q_note_dotted: 0.375,
    e_note_dotted: 0.1875,
};

function getMeasureCapacity(timeSignature) {
    try {
        const { numerator, denominator } = timeSignature;
        return numerator * (1.0 / denominator);
    } catch (e) {
        return 1.0; // Default to 4/4 capacity on error
    }
}

function getNoteIcon(noteType) {
    if (!noteType || typeof noteType !== 'string' || !noteType.endsWith('_note') && !noteType.endsWith('_note_dotted')) {
        return `<img src="../../icons/delete_red.svg" alt="Invalid Note">`;
    }
    return `<img src="../../icons/${noteType}.svg" alt="${noteType}">`;
}


// --- Module State ---
let lyricsState = {
    measures: [],
    selectedNoteId: null,
    globalMeasureOffset: 0,
};
let lyricsEditorDialog, addMeasureDialog, measuresContainer, toolPalette, deleteNoteBtn, dotBtn, sNoteBtn;
let draggedNoteType = null;
let currentlyEditingInput = null;
let noteTextSizer = null;
let draggedMeasureIndex = null;


// --- Data Helper ---
function findNoteById(noteId) {
    for (let m = 0; m < lyricsState.measures.length; m++) {
        const measure = lyricsState.measures[m];
        for (let n = 0; n < measure.content.length; n++) {
            const note = measure.content[n];
            if (note.id === noteId) {
                return { note, measure, noteIndex: n, measureIndex: m };
            }
        }
    }
    return null;
}


// --- Rendering and State Update Functions ---

function updateDeleteButtonState() {
    if (deleteNoteBtn) {
        deleteNoteBtn.disabled = lyricsState.selectedNoteId === null;
    }
}

function renderMeasureContent(measureBox, measure) {
    const contentDiv = measureBox.querySelector('.measure-content');
    contentDiv.innerHTML = '';
    measure.content.forEach(note => {
        const noteEl = document.createElement('div');
        noteEl.className = 'note-element';
        noteEl.dataset.noteId = note.id;
        if (note.id === lyricsState.selectedNoteId) {
            noteEl.classList.add('selected');
        }

        const hasLineBreak = note.lineBreakAfter === true;

        noteEl.innerHTML = `
            ${getNoteIconHTML(note.type)}
            <div class="note-text-wrapper">
                <div class="note-text ${hasLineBreak ? 'has-line-break' : ''}">${note.text || '∅'}</div>
                ${note.isConnectedToNext ? '<span class="note-text-connector">-</span>' : ''}
            </div>
            <button class="line-break-btn ${hasLineBreak ? 'active' : ''}" title="Toggle Line Break">
                <img class="line-break-icon-default" src="../../icons/line_break.svg" alt="Line Break">
                <img class="line-break-icon-active" src="../../icons/line_break_hover.svg" alt="Line Break Active">
            </button>
        `;
        contentDiv.appendChild(noteEl);
    });
}

function renderMeasures() {
    if (!measuresContainer) return;
    while (measuresContainer.firstElementChild && !measuresContainer.firstElementChild.matches('#le-add-measure-btn')) {
        measuresContainer.removeChild(measuresContainer.firstElementChild);
    }
    const addButton = document.getElementById('le-add-measure-btn');
    let localMeasureCounter = 0;

    lyricsState.measures.forEach((measure, index) => {
        const measureBox = document.createElement('div');
        measureBox.className = 'measure-box';
        measureBox.dataset.index = index;

        const globalMeasureNumber = lyricsState.globalMeasureOffset + localMeasureCounter + 1;

        const contentHTML = `
            <button class="duplicate-measure-btn" title="Duplicate Measure">
                <img src="../../icons/duplicate.svg" alt="Duplicate">
            </button>
            <button class="delete-measure-btn" title="Delete Measure">
                <img src="../../icons/delete.svg" alt="Delete">
            </button>
            <div class="measure-header" draggable="true">
                <span class="measure-global-number">${globalMeasureNumber}</span>
                <span class="measure-time-signature">${measure.timeSignature.numerator}/${measure.timeSignature.denominator}</span>
            </div>
            <div class="measure-content"></div>
        `;

        measureBox.innerHTML = contentHTML;
        renderMeasureContent(measureBox, measure);
        measuresContainer.insertBefore(measureBox, addButton);
        localMeasureCounter++;
    });
}


// --- Note Selection and Deletion ---

function deselectNote() {
    if (lyricsState.selectedNoteId) {
        const currentlySelected = lyricsEditorDialog.querySelector('.note-element.selected');
        if (currentlySelected) {
            currentlySelected.classList.remove('selected');
        }
        lyricsState.selectedNoteId = null;
        updateDeleteButtonState();
    }
}

function selectNote(noteElement) {
    const noteId = noteElement.dataset.noteId;
    if (lyricsState.selectedNoteId === noteId) return;

    deselectNote();
    lyricsState.selectedNoteId = noteId;
    noteElement.classList.add('selected');
    updateDeleteButtonState();
}

function deleteSelectedNote() {
    if (!lyricsState.selectedNoteId) return;

    const findResult = findNoteById(lyricsState.selectedNoteId);
    if (!findResult) return;

    const { measure, noteIndex, measureIndex } = findResult;

    if (noteIndex === 0 && measureIndex > 0) {
        const prevMeasure = lyricsState.measures[measureIndex - 1];
        if (prevMeasure && prevMeasure.content.length > 0) {
            const lastNoteOfPrevMeasure = prevMeasure.content[prevMeasure.content.length - 1];
            if (lastNoteOfPrevMeasure.isConnectedToNext) {
                lastNoteOfPrevMeasure.isConnectedToNext = false;
                const prevMeasureBox = measuresContainer.querySelector(`.measure-box[data-index="${measureIndex - 1}"]`);
                if (prevMeasureBox) {
                    renderMeasureContent(prevMeasureBox, prevMeasure);
                }
            }
        }
    }

    if (noteIndex > 0) {
        const previousNote = measure.content[noteIndex - 1];
        if (previousNote) {
            previousNote.isConnectedToNext = false;
        }
    }

    measure.content.splice(noteIndex, 1);

    const measureBox = measuresContainer.querySelector(`.measure-box[data-index="${measureIndex}"]`);
    if (measureBox) {
        renderMeasureContent(measureBox, measure);
    }

    lyricsState.selectedNoteId = null;
    updateDeleteButtonState();
}

async function deleteMeasure(index) {
    if (index < 0 || index >= lyricsState.measures.length) return;

    const measureIdToDelete = lyricsState.measures[index].id;
    const hasEvents = measuresHaveEvents([measureIdToDelete]);

    if (hasEvents) {
        const confirmed = await showConfirmationDialog(
            'This measure has events associated with it in one or more elements on the page. Deleting it will also delete those events. Are you sure you want to continue?',
            'Confirm Deletion'
        );
        if (!confirmed) {
            return; // User canceled the deletion
        }
    }

    lyricsState.measures.splice(index, 1);
    renderMeasures();
}

function duplicateMeasure(index) {
    if (index < 0 || index >= lyricsState.measures.length) return;

    const originalMeasure = lyricsState.measures[index];
    const newMeasure = JSON.parse(JSON.stringify(originalMeasure));

    newMeasure.id = `measure-${generateUUID()}`;

    newMeasure.content.forEach(note => {
        note.id = `note-${generateUUID()}`;
    });

    lyricsState.measures.splice(index + 1, 0, newMeasure);
    renderMeasures();
}


// --- Text Editing Logic ---

function stopEditingNoteText(saveChanges = true) {
    if (!currentlyEditingInput || !document.body.contains(currentlyEditingInput)) {
        return;
    }

    const input = currentlyEditingInput;
    currentlyEditingInput = null;

    const noteElement = input.closest('.note-element');
    if (!noteElement) return;

    const noteId = noteElement.dataset.noteId;
    const findResult = findNoteById(noteId);
    if (!findResult) return;

    const { note } = findResult;

    if (saveChanges) {
        note.text = input.value.trim() === '' ? '∅' : input.value;
    }
}


function startEditingNoteText(textElement) {
    if (currentlyEditingInput) {
        stopEditingNoteText();
    }
    deselectNote();

    const noteElement = textElement.closest('.note-element');
    const noteId = noteElement.dataset.noteId;
    const { note } = findNoteById(noteId);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'note-text-input';
    input.value = note.text === '∅' ? '' : note.text;
    input.placeholder = '∅';

    textElement.replaceWith(input);
    input.focus();
    input.select();

    currentlyEditingInput = input;

    const updateInputWidth = () => {
        if (!noteTextSizer) return;
        noteTextSizer.textContent = input.value || input.placeholder;
        input.style.width = `${noteTextSizer.scrollWidth}px`;
    };

    input.addEventListener('input', updateInputWidth);
    updateInputWidth();

    const handleBlur = () => {
        if (!currentlyEditingInput) return;
        stopEditingNoteText(true);
        const findResult = findNoteById(noteId);
        if (findResult) {
            const { measure, measureIndex } = findResult;
            const measureBox = measuresContainer.querySelector(`.measure-box[data-index="${measureIndex}"]`);
            if (measureBox) {
                renderMeasureContent(measureBox, measure);
            }
        }
    };

    input.addEventListener('blur', handleBlur);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            input.removeEventListener('blur', handleBlur);
            stopEditingNoteText(e.key !== 'Escape');
            const { measure, measureIndex } = findNoteById(noteId);
            const measureBox = measuresContainer.querySelector(`.measure-box[data-index="${measureIndex}"]`);
            renderMeasureContent(measureBox, measure);

        } else if (e.key === '-') {
            e.preventDefault();
            input.removeEventListener('blur', handleBlur);

            const { note, noteIndex, measure, measureIndex } = findNoteById(noteId);
            const hasNextNoteInMeasure = noteIndex < measure.content.length - 1;

            if (hasNextNoteInMeasure) {
                note.isConnectedToNext = true;
                stopEditingNoteText();
                const measureBox = measuresContainer.querySelector(`.measure-box[data-index="${measureIndex}"]`);
                renderMeasureContent(measureBox, measure);

                const nextNoteId = measure.content[noteIndex + 1].id;
                const nextNoteElement = measureBox.querySelector(`.note-element[data-note-id="${nextNoteId}"]`);
                if (nextNoteElement) {
                    startEditingNoteText(nextNoteElement.querySelector('.note-text'));
                }
            } else {
                const currentDuration = measure.content.reduce((sum, n) => sum + NOTE_DURATIONS[n.type], 0);
                const capacity = getMeasureCapacity(measure.timeSignature);
                const isMeasureFull = currentDuration >= capacity;

                const hasNextMeasure = measureIndex < lyricsState.measures.length - 1;
                const nextMeasure = hasNextMeasure ? lyricsState.measures[measureIndex + 1] : null;
                const nextMeasureHasNotes = nextMeasure && nextMeasure.content.length > 0;

                if (isMeasureFull && hasNextMeasure && nextMeasureHasNotes) {
                    note.isConnectedToNext = true;
                    stopEditingNoteText();
                    const measureBox = measuresContainer.querySelector(`.measure-box[data-index="${measureIndex}"]`);
                    renderMeasureContent(measureBox, measure);

                    const nextMeasureBox = measuresContainer.querySelector(`.measure-box[data-index="${measureIndex + 1}"]`);
                    const firstNoteOfNextMeasureId = nextMeasure.content[0].id;
                    const nextNoteElement = nextMeasureBox.querySelector(`.note-element[data-note-id="${firstNoteOfNextMeasureId}"]`);
                    if (nextNoteElement) {
                        startEditingNoteText(nextNoteElement.querySelector('.note-text'));
                    }
                } else {
                    stopEditingNoteText();
                    const measureBox = measuresContainer.querySelector(`.measure-box[data-index="${measureIndex}"]`);
                    renderMeasureContent(measureBox, measure);
                }
            }

        } else if (e.key === ' ') {
            e.preventDefault();
            note.isConnectedToNext = false;
            input.removeEventListener('blur', handleBlur);
            stopEditingNoteText();

            const { noteIndex, measure, measureIndex } = findNoteById(noteId);
            const measureBox = measuresContainer.querySelector(`.measure-box[data-index="${measureIndex}"]`);
            renderMeasureContent(measureBox, measure);

            const hasNextNote = noteIndex < measure.content.length - 1;
            if (hasNextNote) {
                const nextNoteId = measure.content[noteIndex + 1].id;
                const nextNoteElement = measureBox.querySelector(`.note-element[data-note-id="${nextNoteId}"]`);
                if (nextNoteElement) {
                    startEditingNoteText(nextNoteElement.querySelector('.note-text'));
                }
            }
        }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            const isAtStart = input.selectionStart === 0 && input.selectionEnd === 0;
            const isAtEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;

            if ((e.key === 'ArrowRight' && isAtEnd) || (e.key === 'ArrowLeft' && isAtStart)) {
                e.preventDefault();
                input.removeEventListener('blur', handleBlur);
                stopEditingNoteText();

                const { noteIndex, measure, measureIndex } = findNoteById(noteId);
                const currentMeasureBox = measuresContainer.querySelector(`.measure-box[data-index="${measureIndex}"]`);
                renderMeasureContent(currentMeasureBox, measure);

                let targetNote = null;
                let targetMeasureBox = null;

                if (e.key === 'ArrowRight') {
                    if (noteIndex < measure.content.length - 1) {
                        targetNote = measure.content[noteIndex + 1];
                        targetMeasureBox = currentMeasureBox;
                    } else if (measureIndex < lyricsState.measures.length - 1) {
                        const nextMeasure = lyricsState.measures[measureIndex + 1];
                        if (nextMeasure.content.length > 0) {
                            targetNote = nextMeasure.content[0];
                            targetMeasureBox = measuresContainer.querySelector(`.measure-box[data-index="${measureIndex + 1}"]`);
                        }
                    }
                } else { // ArrowLeft
                    if (noteIndex > 0) {
                        targetNote = measure.content[noteIndex - 1];
                        targetMeasureBox = currentMeasureBox;
                    } else if (measureIndex > 0) {
                        const prevMeasure = lyricsState.measures[measureIndex - 1];
                        if (prevMeasure.content.length > 0) {
                            targetNote = prevMeasure.content[prevMeasure.content.length - 1];
                            targetMeasureBox = measuresContainer.querySelector(`.measure-box[data-index="${measureIndex - 1}"]`);
                        }
                    }
                }

                if (targetNote && targetMeasureBox) {
                    const targetElement = targetMeasureBox.querySelector(`.note-element[data-note-id="${targetNote.id}"]`);
                    if (targetElement) {
                        startEditingNoteText(targetElement.querySelector('.note-text'));
                    }
                }
            }
        }
    });
}


// --- Drag and Drop Event Handlers ---

function handleNoteDragStart(e) {
    const toolBtn = e.target.closest('.tool-btn');
    if (!toolBtn || toolBtn.disabled) {
        e.preventDefault();
        return;
    }

    draggedNoteType = toolBtn.dataset.tool;
    e.dataTransfer.setData('text/plain', draggedNoteType);
    e.dataTransfer.effectAllowed = 'copy';
    setTimeout(() => toolBtn.classList.add('dragging'), 0);
    lyricsEditorDialog.classList.add('is-dragging-note');
}

function handleNoteDragEnd(e) {
    const toolBtn = e.target.closest('.tool-btn');
    if (toolBtn) toolBtn.classList.remove('dragging');
    draggedNoteType = null;
    lyricsEditorDialog.classList.remove('is-dragging-note');
    clearDropIndicators();
}

function handleNoteDrop(e) {
    const measureBox = e.target.closest('.measure-box');
    const measureContent = measureBox ? measureBox.querySelector('.measure-content') : null;
    if (!measureBox || !measureContent || measureContent.classList.contains('drag-invalid')) {
        clearDropIndicators();
        return;
    }

    const noteType = e.dataTransfer.getData('text/plain');
    const measureIndex = parseInt(measureBox.dataset.index, 10);
    const measure = lyricsState.measures[measureIndex];

    const isDottedActive = dotBtn.classList.contains('active');
    const finalNoteType = isDottedActive ? `${noteType}_dotted` : noteType;

    const newNote = {
        id: `note-${generateUUID()}`,
        type: finalNoteType,
        text: '∅',
        isConnectedToNext: false
    };

    const indicatorBefore = measureBox.querySelector('.drop-indicator-before');
    const indicatorAfter = measureBox.querySelector('.drop-indicator-after');

    let insertIndex = measure.content.length;
    if (indicatorBefore) {
        const targetNoteId = indicatorBefore.dataset.noteId;
        insertIndex = measure.content.findIndex(n => n.id === targetNoteId);
    } else if (indicatorAfter) {
        const targetNoteId = indicatorAfter.dataset.noteId;
        const targetIndex = measure.content.findIndex(n => n.id === targetNoteId);
        insertIndex = targetIndex + 1;
    }

    measure.content.splice(insertIndex, 0, newNote);
    renderMeasureContent(measureBox, measure);
    clearDropIndicators();
}

function clearDropIndicators() {
    document.querySelectorAll('.measure-content.drag-over, .measure-content.drag-invalid').forEach(el => el.classList.remove('drag-over', 'drag-invalid'));
    document.querySelectorAll('.note-element.drop-indicator-before, .note-element.drop-indicator-after').forEach(el => el.classList.remove('drop-indicator-before', 'drop-indicator-after'));
    document.querySelectorAll('.measure-box.drag-over-left, .measure-box.drag-over-right').forEach(el => el.classList.remove('drag-over-left', 'drag-over-right'));
}


// --- Dialog Management ---

function handleAddMeasure() {
    addMeasureDialog.classList.add('visible');
}

function handleConfirmAddMeasure() {
    const timeSigSelect = document.getElementById('le-time-signature');
    const splits = timeSigSelect.value.split('/');
    const measureCountInput = document.getElementById('le-measure-count');
    const count = parseInt(measureCountInput.value, 10) || 1;

    for (let i = 0; i < count; i++) {
        const newMeasure = {
            id: `measure-${generateUUID()}`,
            timeSignature: {
                numerator: parseInt(splits[0], 10),
                denominator: parseInt(splits[1], 10)
            },
            content: []
        };
        lyricsState.measures.push(newMeasure);
    }

    renderMeasures();
    addMeasureDialog.classList.remove('visible');
    measureCountInput.value = '1';
}

// --- Initialization and Public API ---

export function initLyricsEditor() {
    const mainDialogHTML = `
        <div id="lyrics-editor-dialog" class="dialog-overlay">
            <div class="dialog-content lyrics-editor-dialog">
                <div class="dialog-header">Lyrics Editor</div>
                <div class="dialog-body">
                    <div class="measure-manager">
                        <div id="le-measures-container" class="measures-container">
                            <!-- Measures will be rendered here -->
                            <button id="le-add-measure-btn" class="add-measure-btn">+</button>
                        </div>
                    </div>
                    <div class="lyrics-editor-bottom">
                        <div id="le-tool-palette" class="tool-palette">
                            <div class="tool-row">
                                <button class="tool-btn" data-tool="w_note" title="Whole Note" draggable="true"><img src="../../icons/w_note.svg"></button>
                                <button class="tool-btn" data-tool="h_note" title="Half Note" draggable="true"><img src="../../icons/h_note.svg"></button>
                                <button class="tool-btn" data-tool="q_note" title="Quarter Note" draggable="true"><img src="../../icons/q_note.svg"></button>
                                <button class="tool-btn" data-tool="e_note" title="Eighth Note" draggable="true"><img src="../../icons/e_note.svg"></button>
                                <button class="tool-btn" data-tool="s_note" title="Sixteenth Note" draggable="true"><img src="../../icons/s_note.svg"></button>
                                <button id="le-dot-btn" class="tool-btn" data-tool="dot" title="Dotted Note" draggable="false"><img src="../../icons/dot.svg"></button>
                            </div>
                        </div>
                        <div id="le-action-palette" class="tool-palette">
                             <div class="tool-row">
                                <button id="le-delete-note-btn" class="tool-btn" title="Delete Note" disabled>
                                     <img src="../../icons/delete_red.svg" alt="Delete Note">
                                </button>
                             </div>
                        </div>
                    </div>
                </div>
                <div class="dialog-footer">
                    <button id="le-cancel-btn" class="action-btn secondary-btn">Cancel</button>
                    <button id="le-ok-btn" class="action-btn primary-btn">OK</button>
                </div>
            </div>
        </div>`;

    const addMeasureDialogHTML = `
        <div id="add-measure-dialog" class="dialog-overlay">
            <div class="dialog-content">
                <div class="dialog-header">Add Measure</div>
                <div class="dialog-body">
                    <div class="form-group">
                        <label for="le-time-signature">Time Signature</label>
                        <select id="le-time-signature" class="form-select">
                            <option value="2/4">2/4</option>
                            <option value="3/4">3/4</option>
                            <option value="4/4" selected>4/4</option>
                            <option value="5/8">5/8</option>
                            <option value="7/8">7/8</option>
                            <option value="10/8">10/8</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="le-measure-count">Measures</label>
                        <input type="number" id="le-measure-count" class="form-input" value="1" min="1">
                    </div>
                </div>
                <div class="dialog-footer">
                    <button id="le-add-measure-cancel-btn" class="action-btn secondary-btn">Cancel</button>
                    <button id="le-add-measure-ok-btn" class="action-btn primary-btn">OK</button>
                </div>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', mainDialogHTML);
    document.body.insertAdjacentHTML('beforeend', addMeasureDialogHTML);

    if (!noteTextSizer) {
        noteTextSizer = document.createElement('span');
        noteTextSizer.className = 'note-text-sizer';
        document.body.appendChild(noteTextSizer);
    }


    lyricsEditorDialog = document.getElementById('lyrics-editor-dialog');
    addMeasureDialog = document.getElementById('add-measure-dialog');
    measuresContainer = document.getElementById('le-measures-container');
    toolPalette = document.getElementById('le-tool-palette');
    deleteNoteBtn = document.getElementById('le-delete-note-btn');
    dotBtn = document.getElementById('le-dot-btn');
    sNoteBtn = toolPalette.querySelector('[data-tool="s_note"]');

    document.getElementById('le-ok-btn').addEventListener('click', () => {
        if (state.lyricsEditorCallback) {
            const activePage = state.activePage;
            const hadMeasuresBefore = pageHasMeasures(activePage);

            state.lyricsEditorCallback(lyricsState);
            markAsDirty();

            const hasMeasuresAfter = pageHasMeasures(activePage);

            if (hadMeasuresBefore !== hasMeasuresAfter) {
                jumpToPage(activePage);
            } else {
                rebuildAllEventTimelines();
            }
            reprogramAllPageTransitions();
        }
        lyricsEditorDialog.classList.remove('visible');
    });
    document.getElementById('le-cancel-btn').addEventListener('click', () => {
        lyricsEditorDialog.classList.remove('visible');
    });
    document.getElementById('le-add-measure-btn').addEventListener('click', handleAddMeasure);
    deleteNoteBtn.addEventListener('click', deleteSelectedNote);

    dotBtn.addEventListener('click', () => {
        dotBtn.classList.toggle('active');
        const isDottedActive = dotBtn.classList.contains('active');
        sNoteBtn.disabled = isDottedActive;
        sNoteBtn.draggable = !isDottedActive;
        if (sNoteBtn.disabled) {
            sNoteBtn.classList.remove('dragging');
        }
    });

    lyricsEditorDialog.addEventListener('click', (e) => {
        if (!e.target.closest('.note-element') && !e.target.closest('#le-delete-note-btn') && !e.target.closest('.delete-measure-btn') && !e.target.closest('.duplicate-measure-btn') && !e.target.closest('.note-text-input')) {
            deselectNote();
        }
    });

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

        const lineBreakBtn = e.target.closest('.line-break-btn');
        if (lineBreakBtn) {
            const noteElement = lineBreakBtn.closest('.note-element');
            const noteId = noteElement.dataset.noteId;
            const findResult = findNoteById(noteId);
            if (findResult) {
                const { note, measure, measureIndex } = findResult;
                note.lineBreakAfter = !note.lineBreakAfter; // Toggle the property
                markAsDirty(); // <-- ADDED
        
                // Re-render just the affected measure
                const measureBox = measuresContainer.querySelector(`.measure-box[data-index="${measureIndex}"]`);
                if (measureBox) {
                    renderMeasureContent(measureBox, measure);
                }
            }
            return;
        }

        const textElement = e.target.closest('.note-text');
        if (textElement) {
            startEditingNoteText(textElement);
            return;
        }

        const noteElement = e.target.closest('.note-element');
        if (noteElement) {
            selectNote(noteElement);
        }
    });

    toolPalette.addEventListener('dragstart', handleNoteDragStart);
    toolPalette.addEventListener('dragend', handleNoteDragEnd);

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
        clone.style.backgroundColor = 'rgba(60, 60, 60, 0.7)';
        clone.style.boxSizing = 'border-box';
        document.body.appendChild(clone);
        e.dataTransfer.setDragImage(clone, e.offsetX, e.offsetY);

        setTimeout(() => measureBox.classList.add('dragging'), 0);
    });

    measuresContainer.addEventListener('dragend', (e) => {
        if (draggedMeasureIndex === null) return;

        const clone = document.getElementById('measure-drag-clone');
        if (clone) {
            clone.remove();
        }

        const draggedElement = measuresContainer.querySelector('.measure-box.dragging');
        if (draggedElement) draggedElement.classList.remove('dragging');
        clearDropIndicators();
        draggedMeasureIndex = null;
    });

    measuresContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (draggedNoteType) {
            const measureBox = e.target.closest('.measure-box');
            const measureContent = measureBox ? measureBox.querySelector('.measure-content') : null;
            if (!measureBox || !measureContent) return;

            const isDottedActive = dotBtn.classList.contains('active');
            const finalNoteType = isDottedActive ? `${draggedNoteType}_dotted` : draggedNoteType;
            const newNoteDuration = NOTE_DURATIONS[finalNoteType];

            const measureIndex = parseInt(measureBox.dataset.index, 10);
            const measure = lyricsState.measures[measureIndex];
            const capacity = getMeasureCapacity(measure.timeSignature);
            const currentDuration = measure.content.reduce((sum, note) => sum + NOTE_DURATIONS[note.type], 0);

            clearDropIndicators();

            if (currentDuration + newNoteDuration > capacity) {
                measureContent.classList.add('drag-invalid');
                return;
            }

            measureContent.classList.add('drag-over');

            const noteElements = Array.from(measureBox.querySelectorAll('.note-element'));
            const dropTargetNote = noteElements.find(el => {
                const rect = el.getBoundingClientRect();
                return e.clientX < rect.left + rect.width / 2;
            });

            if (dropTargetNote) {
                dropTargetNote.classList.add('drop-indicator-before');
            } else if (noteElements.length > 0) {
                noteElements[noteElements.length - 1].classList.add('drop-indicator-after');
            }
        } else if (draggedMeasureIndex !== null) {
            const targetMeasure = e.target.closest('.measure-box');
            clearDropIndicators();
            if (!targetMeasure || parseInt(targetMeasure.dataset.index, 10) === draggedMeasureIndex) {
                return;
            }
            const rect = targetMeasure.getBoundingClientRect();
            const isLeft = e.clientX < rect.left + rect.width / 2;
            targetMeasure.classList.add(isLeft ? 'drag-over-left' : 'drag-over-right');
        }
    });

    measuresContainer.addEventListener('dragleave', (e) => {
        const measureContent = e.target.closest('.measure-content');
        if (measureContent) {
            measureContent.classList.remove('drag-over', 'drag-invalid');
        }
    });

    measuresContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        if (draggedNoteType) {
            handleNoteDrop(e);
        } else if (draggedMeasureIndex !== null) {
            const dropTarget = e.target.closest('.measure-box');
            clearDropIndicators();
            if (!dropTarget || parseInt(dropTarget.dataset.index, 10) === draggedMeasureIndex) return;

            const dropIndex = parseInt(dropTarget.dataset.index, 10);
            const rect = dropTarget.getBoundingClientRect();
            const isLeft = e.clientX < rect.left + rect.width / 2;

            const [movedMeasure] = lyricsState.measures.splice(draggedMeasureIndex, 1);
            let newIndex = isLeft ? dropIndex : dropIndex + 1;
            if (draggedMeasureIndex < newIndex) {
                newIndex--;
            }
            lyricsState.measures.splice(newIndex, 0, movedMeasure);
            renderMeasures();
        }
    });

    document.getElementById('le-add-measure-ok-btn').addEventListener('click', handleConfirmAddMeasure);
    document.getElementById('le-add-measure-cancel-btn').addEventListener('click', () => {
        addMeasureDialog.classList.remove('visible');
    });
}

export function openLyricsEditor(initialData, globalMeasureOffset, callback) {
    let parsedData = {};
    try {
        parsedData = JSON.parse(initialData);
    } catch (e) {
        console.error("Could not parse lyrics data. Falling back to default.", e);
        parsedData = {};
    }

    lyricsState = {
        measures: (parsedData.measures || []).map(m => ({
            ...m,
            id: m.id || `measure-${generateUUID()}`
        })),
        selectedNoteId: null,
        globalMeasureOffset: globalMeasureOffset || 0,
    };

    if (dotBtn) dotBtn.classList.remove('active');
    if (sNoteBtn) {
        sNoteBtn.disabled = false;
        sNoteBtn.draggable = true;
    }

    updateState({ lyricsEditorCallback: callback });
    renderMeasures();
    updateDeleteButtonState();
    lyricsEditorDialog.classList.add('visible');
}