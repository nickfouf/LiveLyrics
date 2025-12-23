import { state, updateState } from './state.js';
import { makeDraggable } from './draggable.js';

let dialog, okBtn, cancelBtn, optionsContainer;
let localState = {
    callback: null,
    currentSelection: 'linear',
    isInstantChange: false, // ADDED
};

const EASING_TYPES = [
    { id: 'linear', name: 'Linear', icon: 'linear_ease.svg' },
    { id: 'fast', name: 'Ease In (Fast start)', icon: 'fast_ease.svg' },
    { id: 'slow', name: 'Ease Out (Slow start)', icon: 'slow_ease.svg' },
    { id: 'instant', name: 'Instant', icon: 'instant_ease.svg' },
];

function renderOptions() {
    optionsContainer.innerHTML = '';
    EASING_TYPES.forEach(ease => {
        const btn = document.createElement('button');
        btn.className = 'easing-option-btn';
        if (ease.id === localState.currentSelection) {
            btn.classList.add('active');
        }
        btn.dataset.easeId = ease.id;
        btn.title = ease.name;
        btn.innerHTML = `<img src="../../icons/${ease.icon}" alt="${ease.name}">`;

        // ADDED: Disable non-instant options if required
        if (localState.isInstantChange && ease.id !== 'instant') {
            btn.disabled = true;
        }

        optionsContainer.appendChild(btn);
    });
}

export function initEasingEditor() {
    const dialogHTML = `
        <div id="easing-editor-dialog" class="dialog-overlay">
            <div class="dialog-content" style="min-width: 400px;">
                <div class="dialog-header">Select Easing Function</div>
                <div class="dialog-body">
                    <div id="easing-options-container" class="easing-options-container">
                        <!-- Easing options will be rendered here -->
                    </div>
                </div>
                <div class="dialog-footer">
                    <button id="ee-dialog-cancel-btn" class="action-btn secondary-btn">Cancel</button>
                    <button id="ee-dialog-ok-btn" class="action-btn primary-btn">OK</button>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    dialog = document.getElementById('easing-editor-dialog');
    okBtn = document.getElementById('ee-dialog-ok-btn');
    cancelBtn = document.getElementById('ee-dialog-cancel-btn');
    optionsContainer = document.getElementById('easing-options-container');

    makeDraggable('easing-editor-dialog');

    okBtn.addEventListener('click', () => {
        if (localState.callback) {
            localState.callback(localState.currentSelection);
        }
        dialog.classList.remove('visible');
    });

    cancelBtn.addEventListener('click', () => {
        dialog.classList.remove('visible');
    });

    optionsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.easing-option-btn');
        if (!btn || btn.disabled) return;
        localState.currentSelection = btn.dataset.easeId;
        renderOptions(); // Re-render to update the active state
    });
}

export function openEasingEditor(currentEasing, callback, isInstantChange = false) {
    localState.callback = callback;
    localState.isInstantChange = isInstantChange;

    if (isInstantChange) {
        localState.currentSelection = 'instant';
    } else {
        localState.currentSelection = EASING_TYPES.some(e => e.id === currentEasing) ? currentEasing : 'linear';
    }

    renderOptions();
    dialog.classList.add('visible');
}




