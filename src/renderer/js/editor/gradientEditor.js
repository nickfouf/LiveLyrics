import { state, updateState } from './state.js';
import { lerpColor  } from './utils.js';
import { generateCSSGradient, parseColorString, generateCSSColor } from '../renderer/utils.js';
import { openColorPicker } from './colorPicker.js';
import { openOpaqueColorPicker } from './opaqueColorPicker.js';

let gradientState = {
    useOpaquePicker: false,
};

/**
 * Moves a color stop to a new position and proportionally adjusts the adjacent midpoints.
 * @param {number} index - The index of the color stop to move.
 * @param {number} newPosition - The target position (0-100).
 */
function moveColorStop(index, newPosition) {
    const currentStop = gradientState.colorStops[index];
    const originalPosition = currentStop.position;

    if (newPosition === originalPosition) return;

    // Clamp position to prevent it from crossing over adjacent stops
    let clampedPosition = newPosition;
    if (index > 0) {
        clampedPosition = Math.max(clampedPosition, gradientState.colorStops[index - 1].position);
    }
    if (index < gradientState.colorStops.length - 1) {
        clampedPosition = Math.min(clampedPosition, gradientState.colorStops[index + 1].position);
    }

    // Update midpoint to the left (if it exists)
    if (index > 0) {
        const prevStop = gradientState.colorStops[index - 1];
        const originalRange = originalPosition - prevStop.position;
        if (originalRange > 0) {
            const proportion = (currentStop.midpoint - prevStop.position) / originalRange;
            const newRange = clampedPosition - prevStop.position;
            currentStop.midpoint = prevStop.position + (newRange * proportion);
        } else {
            currentStop.midpoint = prevStop.position; // Snap if range is zero
        }
    }

    // Update midpoint to the right (if it exists)
    if (index < gradientState.colorStops.length - 1) {
        const nextStop = gradientState.colorStops[index + 1];
        const originalRange = nextStop.position - originalPosition;
        if (originalRange > 0) {
            const proportion = (nextStop.midpoint - originalPosition) / originalRange;
            const newRange = nextStop.position - clampedPosition;
            nextStop.midpoint = clampedPosition + (newRange * proportion);
        } else {
            nextStop.midpoint = clampedPosition; // Snap if range is zero
        }
    }

    currentStop.position = clampedPosition;
}


function renderGradientEditor() {
    const dialog = document.getElementById('gradient-editor-dialog');
    const gradientBar = dialog.querySelector('.gradient-bar');
    const stopsArea = dialog.querySelector('.gradient-stops-area');
    const stopDetails = dialog.querySelector('.gradient-stop-details');
    const midpointDetails = dialog.querySelector('.gradient-midpoint-details');
    const colorSwatch = stopDetails.querySelector('.color-swatch-inner');
    const stopPositionInput = stopDetails.querySelector('input');
    const midpointPositionInput = midpointDetails.querySelector('input');

    console.log(gradientState, generateCSSGradient(gradientState));
    gradientBar.style.background = generateCSSGradient(gradientState);
    stopsArea.innerHTML = '';

    gradientState.colorStops.forEach((stop, index) => {
        const stopEl = document.createElement('div');
        stopEl.className = 'gradient-color-stop';
        if(index === gradientState.activeStopIndex) stopEl.classList.add('active');
        stopEl.style.left = `${stop.position}%`;
        stopEl.style.backgroundColor = generateCSSColor(stop.color); // Convert color object to CSS string for display
        stopEl.dataset.index = index;
        stopsArea.appendChild(stopEl);

        // Render midpoint handle if this is not the first stop
        if (index > 0) {
            const midpointEl = document.createElement('div');
            midpointEl.className = 'gradient-midpoint';
            if(index === gradientState.activeMidpointIndex) midpointEl.classList.add('active');
            midpointEl.style.left = `${stop.midpoint}%`;
            midpointEl.dataset.index = index; // The midpoint belongs to the stop at this index
            stopsArea.appendChild(midpointEl);
        }
    });

    stopDetails.style.display = (gradientState.activeStopIndex !== -1) ? 'flex' : 'none';
    midpointDetails.style.display = (gradientState.activeMidpointIndex !== -1) ? 'flex' : 'none';

    if(gradientState.activeStopIndex !== -1) {
        const activeStop = gradientState.colorStops[gradientState.activeStopIndex];
        colorSwatch.style.backgroundColor = generateCSSColor(activeStop.color);
        stopPositionInput.value = activeStop.position;
    }

    if(gradientState.activeMidpointIndex !== -1) {
        const activeMidpointStop = gradientState.colorStops[gradientState.activeMidpointIndex];
        midpointPositionInput.value = activeMidpointStop.midpoint.toFixed(1);
    }
}

export function initGradientEditor() {
    const dialogHTML = `
    <div id="gradient-editor-dialog" class="dialog-overlay">
        <div class="dialog-content">
            <div class="dialog-header">Gradient Editor</div>
            <div class="dialog-body gradient-editor-body">
                <div class="gradient-bar-container">
                    <div class="gradient-bar-bg"><div class="gradient-bar"></div></div>
                    <div class="gradient-stops-area"></div>
                </div>
                <div class="gradient-stop-details">
                    <div class="form-group">
                        <label>Color:</label>
                        <div class="color-swatch"><div class="color-swatch-inner"></div></div>
                    </div>
                    <div class="form-group">
                        <label>Position:</label>
                        <input type="number" min="0" max="100" class="form-input">
                        <span>%</span>
                    </div>
                    <button id="ge-delete-stop-btn" class="action-btn secondary-btn">Delete</button>
                </div>
                <div class="gradient-midpoint-details">
                     <div class="form-group">
                        <label>Midpoint Position:</label>
                        <input type="number" min="0" max="100" step="0.1" class="form-input">
                        <span>%</span>
                    </div>
                </div>
            </div>
            <div class="dialog-footer">
                <button id="ge-cancel-btn" class="action-btn secondary-btn">Cancel</button>
                <button id="ge-ok-btn" class="action-btn primary-btn">OK</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    const dialog = document.getElementById('gradient-editor-dialog');
    const okBtn = document.getElementById('ge-ok-btn');
    const cancelBtn = document.getElementById('ge-cancel-btn');
    const deleteBtn = document.getElementById('ge-delete-stop-btn');
    const stopsArea = dialog.querySelector('.gradient-stops-area');
    const stopDetails = dialog.querySelector('.gradient-stop-details');
    const midpointDetails = dialog.querySelector('.gradient-midpoint-details');
    const colorSwatch = stopDetails.querySelector('.color-swatch');
    const stopPositionInput = stopDetails.querySelector('input');
    const midpointPositionInput = midpointDetails.querySelector('input');

    okBtn.addEventListener('click', () => {
        if(state.gradientEditorCallback) state.gradientEditorCallback(gradientState);
        dialog.classList.remove('visible');
    });
    cancelBtn.addEventListener('click', () => dialog.classList.remove('visible'));
    deleteBtn.addEventListener('click', () => {
        if (gradientState.colorStops.length > 2 && gradientState.activeStopIndex !== -1) {
            const deletedIndex = gradientState.activeStopIndex;
            gradientState.colorStops.splice(deletedIndex, 1);

            if (deletedIndex < gradientState.colorStops.length) {
                const prevStop = gradientState.colorStops[deletedIndex - 1];
                const currentStop = gradientState.colorStops[deletedIndex];
                currentStop.midpoint = prevStop.position + (currentStop.position - prevStop.position) / 2;
            }

            gradientState.activeStopIndex = -1;
            gradientState.activeMidpointIndex = -1;
            renderGradientEditor();
        }
    });

    stopsArea.onmousedown = (e) => {
        const target = e.target;

        if (target.classList.contains('gradient-color-stop')) {
            const index = parseInt(target.dataset.index, 10);
            gradientState.activeStopIndex = index;
            gradientState.activeMidpointIndex = -1;
            renderGradientEditor();

            const rect = stopsArea.getBoundingClientRect();
            const onMouseMove = (moveEvent) => {
                let x = Math.max(0, Math.min(rect.width, moveEvent.clientX - rect.left));
                let newPosition = Math.round((x / rect.width) * 100);
                moveColorStop(index, newPosition);
                renderGradientEditor();
            };
            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        } else if (target.classList.contains('gradient-midpoint')) {
            const index = parseInt(target.dataset.index, 10);
            gradientState.activeStopIndex = -1;
            gradientState.activeMidpointIndex = index;
            renderGradientEditor();

            const rect = stopsArea.getBoundingClientRect();
            const prevStop = gradientState.colorStops[index - 1];
            const currentStop = gradientState.colorStops[index];

            const onMouseMove = (moveEvent) => {
                let x = moveEvent.clientX - rect.left;
                let newPosition = (x / rect.width) * 100;
                newPosition = Math.max(prevStop.position, Math.min(currentStop.position, newPosition));
                gradientState.colorStops[index].midpoint = newPosition;
                renderGradientEditor();
            };
            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        } else if (target === stopsArea) {
            const rect = stopsArea.getBoundingClientRect();
            let x = e.clientX - rect.left;
            let newPosition = Math.round((x / rect.width) * 100);
            const insertAtIndex = gradientState.colorStops.findIndex(stop => stop.position > newPosition);
            const finalInsertIndex = insertAtIndex === -1 ? gradientState.colorStops.length : insertAtIndex;
            const prevStop = gradientState.colorStops[finalInsertIndex - 1] || { color: {r:0,g:0,b:0,a:1}, position: 0 };
            const nextStop = gradientState.colorStops[finalInsertIndex] || { color: {r:255,g:255,b:255,a:1}, position: 100 };
            const range = nextStop.position - prevStop.position;
            const t = range === 0 ? 0 : (newPosition - prevStop.position) / range;
            const newColorObject = lerpColor(prevStop.color, nextStop.color, t);

            const newStop = { color: newColorObject, position: newPosition };
            gradientState.colorStops.splice(finalInsertIndex, 0, newStop);

            const prevForNew = gradientState.colorStops[finalInsertIndex - 1];
            newStop.midpoint = prevForNew.position + (newStop.position - prevForNew.position) / 2;

            const nextForNew = gradientState.colorStops[finalInsertIndex + 1];
            if (nextForNew) {
                nextForNew.midpoint = newStop.position + (nextForNew.position - newStop.position) / 2;
            }

            gradientState.activeStopIndex = finalInsertIndex;
            gradientState.activeMidpointIndex = -1;
            renderGradientEditor();
        }
    };

    colorSwatch.onclick = () => {
        if(gradientState.activeStopIndex === -1) return;
        const currentColorObject = gradientState.colorStops[gradientState.activeStopIndex].color;
        const currentColorString = generateCSSColor(currentColorObject);

        const picker = gradientState.useOpaquePicker ? openOpaqueColorPicker : openColorPicker;
        picker(currentColorString, (newColorString) => {
            gradientState.colorStops[gradientState.activeStopIndex].color = parseColorString(newColorString);
            renderGradientEditor();
        });
    };

    stopPositionInput.onchange = (e) => {
        if(gradientState.activeStopIndex === -1) return;
        const newPosition = parseInt(e.target.value, 10);
        moveColorStop(gradientState.activeStopIndex, newPosition);
        renderGradientEditor();
    };

    midpointPositionInput.onchange = (e) => {
        if (gradientState.activeMidpointIndex === -1) return;
        const index = gradientState.activeMidpointIndex;
        const prevStop = gradientState.colorStops[index - 1];
        const currentStop = gradientState.colorStops[index];

        let newPosition = parseFloat(e.target.value);
        newPosition = Math.max(prevStop.position, Math.min(currentStop.position, newPosition));

        gradientState.colorStops[index].midpoint = newPosition;
        renderGradientEditor();
    };
}

export function openGradientEditor(initialGradient, callback, useOpaquePicker = false) {
    const dialog = document.getElementById('gradient-editor-dialog');
    gradientState = JSON.parse(JSON.stringify(initialGradient)); // Deep copy
    gradientState.activeStopIndex = -1;
    gradientState.activeMidpointIndex = -1;
    gradientState.useOpaquePicker = useOpaquePicker;

    // Ensure all incoming color strings are parsed into objects
    gradientState.colorStops.forEach(stop => {
        if (typeof stop.color === 'string') {
            stop.color = parseColorString(stop.color);
        }
    });

    if (gradientState.colorStops.length > 1) {
        for (let i = 1; i < gradientState.colorStops.length; i++) {
            if (gradientState.colorStops[i].midpoint === undefined) {
                const prevStop = gradientState.colorStops[i-1];
                const currentStop = gradientState.colorStops[i];
                gradientState.colorStops[i].midpoint = prevStop.position + (currentStop.position - prevStop.position) / 2;
            }
        }
    }

    updateState({ gradientEditorCallback: callback });
    renderGradientEditor();
    dialog.classList.add('visible');
}