// src/renderer/js/editor/propertyValueEditor.js

import { state } from './state.js';
import { getAvailablePropertiesForElement, getPropertyType } from './utils.js';
import { openColorPicker } from './colorPicker.js';
import { openGradientEditor } from './gradientEditor.js';
import { generateCSSGradient, parseColorString, generateCSSColor } from "../renderer/utils.js";

let dialog, header, body, okBtn, cancelBtn, inheritBtn;
let localState = {
    callback: null,
    propKey: null,
    currentValue: null,
    elementId: null,
};

// --- Helper Constants ---
const COLOR_ONLY_PROPERTIES = new Set([
    'borderColor', 'shadowColor', 'textStrokeColor', 'textShadowColor'
]);

/**
 * Checks if a gradient object represents a single solid color.
 * @param {object} gradient - The gradient object to check.
 * @returns {boolean} True if the gradient is a solid color.
 */
function isSolidColorGradient(gradient) {
    if (!gradient || !gradient.colorStops || gradient.colorStops.length < 1) {
        return false;
    }
    const firstColor = gradient.colorStops[0].color;
    if (typeof firstColor !== 'object' || firstColor === null) return false;

    return gradient.colorStops.every(stop =>
        stop.color &&
        stop.color.r === firstColor.r &&
        stop.color.g === firstColor.g &&
        stop.color.b === firstColor.b &&
        stop.color.a === firstColor.a
    );
}


/**
 * Builds the UI inside the dialog body based on the property type.
 */
function buildDialogUI() {
    body.innerHTML = '';
    const mainElement = document.getElementById(localState.elementId);
    const isSmartEffect = mainElement?.dataset.elementType === 'smart-effect';
    let propConfig = null;
    if (isSmartEffect) {
        try {
            const effectData = JSON.parse(mainElement.dataset.effectJson);
            propConfig = effectData.parameters?.[localState.propKey];
        } catch (e) {}
    }

    const propType = propConfig ? propConfig.type : getPropertyType(localState.propKey, mainElement);
    const value = localState.currentValue;

    switch (propType) {
        case 'boolean':
            body.innerHTML = `
                <div class="form-group">
                    <div class="toggle-switch-container">
                        <label for="eep-boolean-input">Enabled</label>
                        <label class="toggle-switch">
                            <input type="checkbox" id="eep-boolean-input" ${value === true || value === 'true' ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>`;
            break;

        case 'number':
            if (localState.propKey.toLowerCase().includes('opacity')) {
                const opacityValue = value !== undefined && value !== null ? parseFloat(value) : 1.0;
                body.innerHTML = `
                    <div class="form-group">
                        <label>Opacity</label>
                        <div class="input-with-unit">
                             <input type="range" id="eep-opacity-slider" class="form-input" min="0" max="1" step="0.01" value="${opacityValue}" style="padding: 0;">
                             <input type="number" id="eep-opacity-number" class="form-input" min="0" max="100" step="1" value="${Math.round(opacityValue * 100)}" style="max-width: 80px;">
                             <span class="unit-label">%</span>
                        </div>
                    </div>`;
                const slider = body.querySelector('#eep-opacity-slider');
                const numberInput = body.querySelector('#eep-opacity-number');
                slider.addEventListener('input', () => { numberInput.value = Math.round(slider.value * 100); });
                numberInput.addEventListener('input', () => { slider.value = Math.max(0, Math.min(100, parseInt(numberInput.value, 10) || 0)) / 100; });
            } else if (localState.propKey === 'audioVolume') {
                const volumeValue = value !== undefined && value !== null ? parseFloat(value) : 1.0;
                body.innerHTML = `
                    <div class="form-group">
                        <label>Volume</label>
                        <div class="input-with-unit">
                             <input type="range" id="eep-volume-slider" class="form-input" min="0" max="1" step="0.01" value="${volumeValue}" style="padding: 0;">
                             <input type="number" id="eep-volume-number" class="form-input" min="0" max="100" step="1" value="${Math.round(volumeValue * 100)}" style="max-width: 80px;">
                             <span class="unit-label">%</span>
                        </div>
                    </div>`;
                const slider = body.querySelector('#eep-volume-slider');
                const numberInput = body.querySelector('#eep-volume-number');
                slider.addEventListener('input', () => { numberInput.value = Math.round(slider.value * 100); });
                numberInput.addEventListener('input', () => { slider.value = Math.max(0, Math.min(100, parseInt(numberInput.value, 10) || 0)) / 100; });
            } else if (localState.propKey === 'videoSpeed') {
                const speedValue = value !== undefined && value !== null ? parseFloat(value) : 1.0;
                body.innerHTML = `
                    <div class="form-group">
                        <label>Speed</label>
                        <div class="input-with-unit">
                            <input type="range" id="eep-speed-slider" class="form-input" min="0.1" max="4" step="0.1" value="${speedValue}" style="padding: 0;">
                            <input type="number" id="eep-speed-number" class="form-input" min="0.1" max="4" step="0.1" value="${speedValue.toFixed(1)}" style="max-width: 80px;">
                            <span class="unit-label">x</span>
                        </div>
                    </div>`;
                const slider = body.querySelector('#eep-speed-slider');
                const numberInput = body.querySelector('#eep-speed-number');
                slider.addEventListener('input', () => { numberInput.value = parseFloat(slider.value).toFixed(1); });
                numberInput.addEventListener('input', () => { slider.value = Math.max(0.1, Math.min(4, parseFloat(numberInput.value) || 1)); });
            } else if (['rotate', 'rotateX', 'rotateY', 'rotateZ', 'skewX', 'skewY'].includes(localState.propKey)) {
                const numericValue = parseFloat(value) || 0;
                body.innerHTML = `
                    <div class="form-group">
                        <label for="eep-number-input-deg">Value</label>
                        <div class="input-with-unit">
                            <input type="number" id="eep-number-input-deg" class="form-input" value="${numericValue}">
                            <span class="unit-label">deg</span>
                        </div>
                    </div>`;
            } else {
                body.innerHTML = `
                    <div class="form-group">
                        <label for="eep-number-input">Value</label>
                        <input type="number" id="eep-number-input" class="form-input" value="${value || 0}">
                    </div>`;
            }
            break;

        case 'dynamic-string':
        case 'string':
            if (localState.propKey === 'audioState' || localState.propKey === 'videoState') {
                body.innerHTML = `
                    <div class="form-group">
                        <label>State</label>
                        <div class="segmented-tabs" id="eep-state-tabs">
                            <button class="tab-btn ${value === 'paused' ? 'active' : ''}" data-state="paused">Paused</button>
                            <button class="tab-btn ${value === 'playing' ? 'active' : ''}" data-state="playing">Playing</button>
                            <button class="tab-btn ${value === 'resume' ? 'active' : ''}" data-state="resume">Resume</button>
                        </div>
                    </div>`;
                body.querySelector('#eep-state-tabs').addEventListener('click', e => {
                    const btn = e.target.closest('.tab-btn');
                    if (!btn) return;
                    body.querySelectorAll('#eep-state-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                });
            } else if (localState.propKey === 'transform-style') {
                body.innerHTML = `
                    <div class="form-group">
                        <label for="eep-string-select">Value</label>
                        <select id="eep-string-select" class="form-select">
                            <option value="flat" ${value === 'flat' ? 'selected' : ''}>Flat</option>
                            <option value="preserve-3d" ${value === 'preserve-3d' ? 'selected' : ''}>Preserve 3D</option>
                        </select>
                    </div>`;
            } else if (localState.propKey === 'backface-visibility') {
                body.innerHTML = `
                    <div class="form-group">
                        <label for="eep-string-select">Value</label>
                        <select id="eep-string-select" class="form-select">
                            <option value="visible" ${value === 'visible' ? 'selected' : ''}>Visible</option>
                            <option value="hidden" ${value === 'hidden' ? 'selected' : ''}>Hidden</option>
                        </select>
                    </div>`;
            } else {
                body.innerHTML = `
                    <div class="form-group">
                        <label for="eep-string-input">Value</label>
                        <input type="text" id="eep-string-input" class="form-input" value="${value || ''}">
                    </div>`;
            }
            break;

        case 'size':
            let unitOptionsArray = ['px', 'pw', 'ph', 'vw', 'vh'];
            if (localState.propKey.includes('origin')) {
                unitOptionsArray.push('%');
            }
            const unitOptions = unitOptionsArray.map(u => `<option value="${u}" ${value?.unit === u ? 'selected' : ''}>${u}</option>`).join('');
            body.innerHTML = `
                <div class="form-group">
                    <label for="eep-size-input">Value</label>
                    <div class="input-with-unit">
                        <input type="number" id="eep-size-input" class="form-input" value="${value?.value || 0}">
                        <select id="eep-size-unit" class="form-select">${unitOptions}</select>
                    </div>
                </div>`;
            break;

        case 'fontFamily': {
            let fontOptionsHTML = (state.systemFonts || []).map(fontFamily =>
                `<option value="${fontFamily}" ${fontFamily === value ? 'selected' : ''}>${fontFamily}</option>`
            ).join('');
            if (!(state.systemFonts || []).includes(value) && value) {
                fontOptionsHTML = `<option value="${value}" selected>${value}</option>${fontOptionsHTML}`;
            }
            body.innerHTML = `
                <div class="form-group">
                    <label for="eep-font-family-select">Font Family</label>
                    <select id="eep-font-family-select" class="form-select">${fontOptionsHTML}</select>
                </div>`;
            break;
        }

        case 'fontWeight': {
            const weights = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
            const weightOptions = weights.map(w => `<option value="${w}" ${value === w ? 'selected' : ''}>${w}</option>`).join('');
            body.innerHTML = `
                <div class="form-group">
                    <label for="eep-font-weight-select">Font Weight</label>
                    <select id="eep-font-weight-select" class="form-select">${weightOptions}</select>
                </div>`;
            break;
        }

        case 'fontStyle': {
            body.innerHTML = `
                <div class="form-group">
                    <label for="eep-font-style-select">Font Style</label>
                    <select id="eep-font-style-select" class="form-select">
                        <option value="normal" ${value === 'normal' ? 'selected' : ''}>Normal</option>
                        <option value="italic" ${value === 'italic' ? 'selected' : ''}>Italic</option>
                    </select>
                </div>`;
            break;
        }

        case 'alignment': { // For containers
            body.innerHTML = `
                <div class="form-group">
                    <label>Direction</label>
                    <div class="segmented-tabs" id="eep-alignment-tabs">
                        <button class="tab-btn ${value === 'vertical' ? 'active' : ''}" data-align="vertical">Vertical</button>
                        <button class="tab-btn ${value === 'horizontal' ? 'active' : ''}" data-align="horizontal">Horizontal</button>
                        <button class="tab-btn ${value === 'absolute' ? 'active' : ''}" data-align="absolute">Absolute</button>
                    </div>
                </div>`;
            body.querySelector('#eep-alignment-tabs').addEventListener('click', e => {
                const btn = e.target.closest('.tab-btn');
                if (!btn) return;
                body.querySelectorAll('#eep-alignment-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            break;
        }

        case 'textAlign': { // For text
            body.innerHTML = `
                <div class="form-group">
                    <label>Alignment</label>
                    <div class="segmented-tabs" id="eep-text-align-tabs">
                        <button class="tab-btn ${value === 'left' ? 'active' : ''}" data-align="left" title="Align Left"><img src="../../icons/left_alignment.svg"></button>
                        <button class="tab-btn ${value === 'center' ? 'active' : ''}" data-align="center" title="Align Center"><img src="../../icons/center_alignment.svg"></button>
                        <button class="tab-btn ${value === 'right' ? 'active' : ''}" data-align="right" title="Align Right"><img src="../../icons/right_alignment.svg"></button>
                    </div>
                </div>`;
            body.querySelector('#eep-text-align-tabs').addEventListener('click', e => {
                const btn = e.target.closest('.tab-btn');
                if (!btn) return;
                body.querySelectorAll('#eep-text-align-tabs .tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
            break;
        }

        case 'justifyContent': {
            body.innerHTML = `
                <div class="form-group">
                    <label for="eep-justify-content-select">Justify Content</label>
                    <select id="eep-justify-content-select" class="form-select">
                        <option value="flex-start" ${value === 'flex-start' ? 'selected' : ''}>Start</option>
                        <option value="center" ${value === 'center' ? 'selected' : ''}>Center</option>
                        <option value="flex-end" ${value === 'flex-end' ? 'selected' : ''}>End</option>
                        <option value="space-between" ${value === 'space-between' ? 'selected' : ''}>Space Between</option>
                        <option value="space-around" ${value === 'space-around' ? 'selected' : ''}>Space Around</option>
                    </select>
                </div>`;
            break;
        }

        case 'alignItems': {
            body.innerHTML = `
                <div class="form-group">
                    <label for="eep-align-items-select">Align Items</label>
                    <select id="eep-align-items-select" class="form-select">
                        <option value="flex-start" ${value === 'flex-start' ? 'selected' : ''}>Start</option>
                        <option value="center" ${value === 'center' ? 'selected' : ''}>Center</option>
                        <option value="flex-end" ${value === 'flex-end' ? 'selected' : ''}>End</option>
                        <option value="stretch" ${value === 'stretch' ? 'selected' : ''}>Stretch</option>
                    </select>
                </div>`;
            break;
        }

        case 'color/gradient':
        case 'color':
        case 'svg_color':
        case 'gradient':
        case 'svg_gradient': {
            const isSvg = propType.startsWith('svg_');
            const isColorOnly = COLOR_ONLY_PROPERTIES.has(localState.propKey) || localState.propKey === 'textColor' || propType === 'color' || propType === 'svg_color';

            let isColor = (isSmartEffect && value?.type?.includes('color')) ||
                (!isSmartEffect && typeof value === 'object' && value !== null && !value.hasOwnProperty('colorStops'));

            if (!isColor && typeof value === 'object' && value !== null && value.hasOwnProperty('colorStops')) {
                const gradientObject = isSmartEffect && value.value ? value.value : value;
                if (isSolidColorGradient(gradientObject)) {
                    isColor = true;
                }
            }

            let gradientForUI;
            if (isColor || !value) {
                gradientForUI = {
                    type: 'linear',
                    angle: 90,
                    scale: 100,
                    colorStops: [
                        { color: { r: 255, g: 0, b: 255, a: 1 }, position: 0 },
                        { color: { r: 0, g: 255, b: 224, a: 1 }, position: 100 }
                    ]
                };
            } else {
                gradientForUI = isSmartEffect && value.value ? value.value : value;
            }

            const gradientCSS = generateCSSGradient(gradientForUI);
            const gradientType = gradientForUI?.type || 'linear';
            const gradientAngle = gradientForUI?.angle ?? 90;
            let gradientScale = gradientForUI?.scale;
            if (!isFinite(parseFloat(gradientScale))) {
                gradientScale = 100;
            }

            let initialSwatchColor = '#000000';
            if (isColor) {
                const colorValue = isSmartEffect ? localState.currentValue.value : localState.currentValue;
                if (typeof colorValue === 'object' && colorValue !== null) {
                    initialSwatchColor = generateCSSColor(colorValue);
                }
            } else {
                const gradientObject = isSmartEffect ? localState.currentValue.value : localState.currentValue;
                if (gradientObject && gradientObject.colorStops && gradientObject.colorStops.length > 0) {
                    initialSwatchColor = generateCSSColor(gradientObject.colorStops[0].color);
                }
            }

            const colorPickerHTML = `
                <div class="form-group">
                    <label>Color</label>
                    <div class="color-swatch" id="eep-color-swatch"><div class="color-swatch-inner" style="background-color: ${initialSwatchColor}"></div></div>
                </div>`;

            if (isColorOnly) {
                body.innerHTML = colorPickerHTML;
            } else {
                body.innerHTML = `
                    <div class="segmented-tabs">
                        <button class="tab-btn ${isColor ? 'active' : ''}" data-tab="color">Color</button>
                        <button class="tab-btn ${!isColor ? 'active' : ''}" data-tab="gradient">Gradient</button>
                    </div>
                    <div class="tab-content ${isColor ? 'active' : ''}" data-tab-content="color">${colorPickerHTML}</div>
                    <div class="tab-content ${!isColor ? 'active' : ''}" data-tab-content="gradient">
                         <div class="form-group">
                            <label>Gradient</label>
                            <div class="gradient-preview" id="eep-gradient-preview" style="background-image: ${gradientCSS}"></div>
                        </div>
                        <div class="form-group">
                            <label for="eep-gradient-type">Type</label>
                            <select id="eep-gradient-type" class="form-select">
                                <option value="linear" ${gradientType === 'linear' ? 'selected' : ''}>Linear</option>
                                <option value="radial" ${gradientType === 'radial' ? 'selected' : ''}>Radial</option>
                            </select>
                        </div>
                        <div class="form-group" id="eep-gradient-angle-group" style="display: ${gradientType === 'linear' ? 'flex' : 'none'};">
                            <label for="eep-gradient-angle">Angle</label>
                            <div class="input-with-unit"><input type="number" id="eep-gradient-angle" class="form-input" value="${gradientAngle}"><span class="unit-label">deg</span></div>
                        </div>
                        <div class="form-group" id="eep-gradient-scale-group" style="display: ${gradientType === 'linear' || gradientType === 'radial' ? 'flex' : 'none'};">
                            <label for="eep-gradient-scale">Scale</label>
                            <div class="input-with-unit"><input type="number" id="eep-gradient-scale" class="form-input" min="0" max="100" value="${gradientScale}"><span class="unit-label">%</span></div>
                        </div>
                    </div>`;

                body.querySelectorAll('.tab-btn').forEach(tab => {
                    tab.addEventListener('click', () => {
                        const newTabType = tab.dataset.tab;
                        const isCurrentlyGradient = typeof localState.currentValue === 'object' && localState.currentValue !== null && localState.currentValue.hasOwnProperty('colorStops');

                        if ((newTabType === 'color' && !isCurrentlyGradient) || (newTabType === 'gradient' && isCurrentlyGradient)) {
                            return;
                        }

                        body.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
                        tab.classList.add('active');
                        body.querySelector(`.tab-content[data-tab-content="${newTabType}"]`).classList.add('active');

                        if (newTabType === 'gradient') {
                            const newGradient = {
                                type: 'linear', angle: 90, scale: 100,
                                colorStops: [
                                    { color: { r: 255, g: 0, b: 255, a: 1 }, position: 0 },
                                    { color: { r: 0, g: 255, b: 224, a: 1 }, position: 100 }
                                ]
                            };
                            if (isSmartEffect) {
                                const finalType = isSvg ? 'svg_gradient' : 'gradient';
                                localState.currentValue = { type: finalType, value: newGradient };
                            } else {
                                localState.currentValue = newGradient;
                            }
                        } else {
                            const gradientObject = isSmartEffect ? localState.currentValue.value : localState.currentValue;
                            const representativeColor = gradientObject?.colorStops?.[0]?.color || { r: 0, g: 0, b: 0, a: 1 };
                            if (isSmartEffect) {
                                const finalType = isSvg ? 'svg_color' : 'color';
                                localState.currentValue = { type: finalType, value: representativeColor };
                            } else {
                                localState.currentValue = representativeColor;
                            }
                        }
                    });
                });

                const gradientTypeSelect = body.querySelector('#eep-gradient-type');
                const gradientAngleInput = body.querySelector('#eep-gradient-angle');
                const gradientScaleInput = body.querySelector('#eep-gradient-scale');
                const gradientAngleGroup = body.querySelector('#eep-gradient-angle-group');
                const gradientScaleGroup = body.querySelector('#eep-gradient-scale-group');
                const toggleGradientControls = (type) => { gradientAngleGroup.style.display = type === 'linear' ? 'flex' : 'none'; gradientScaleGroup.style.display = (type === 'radial' || type === 'linear') ? 'flex' : 'none'; };
                const updateGradientObject = (prop, val) => {
                    let target = isSmartEffect ? localState.currentValue.value : localState.currentValue;
                    if (typeof target !== 'object' || target === null || !target.hasOwnProperty('colorStops')) {
                        target = { type: 'linear', angle: 90, scale: 100, colorStops: [] };
                        if (isSmartEffect) localState.currentValue.value = target; else localState.currentValue = target;
                    }
                    target[prop] = val;
                    body.querySelector('#eep-gradient-preview').style.backgroundImage = generateCSSGradient(target);
                };
                gradientTypeSelect.addEventListener('change', () => { const newType = gradientTypeSelect.value; toggleGradientControls(newType); updateGradientObject('type', newType); });
                gradientAngleInput.addEventListener('input', () => updateGradientObject('angle', parseInt(gradientAngleInput.value, 10)));
                gradientScaleInput.addEventListener('input', () => updateGradientObject('scale', parseInt(gradientScaleInput.value, 10)));

                body.querySelector('#eep-gradient-preview').addEventListener('click', () => {
                    const currentValue = localState.currentValue;
                    const isGradient = typeof currentValue === 'object' && currentValue !== null && currentValue.hasOwnProperty('colorStops');
                    let initialGradient;
                    if (isGradient) {
                        initialGradient = isSmartEffect ? currentValue.value : currentValue;
                    } else {
                        initialGradient = {
                            type: 'linear', angle: 90, scale: 100,
                            colorStops: [
                                { color: { r: 255, g: 0, b: 255, a: 1 }, position: 0, midpoint: 50 },
                                { color: { r: 0, g: 255, b: 224, a: 1 }, position: 100 }
                            ]
                        };
                    }
                    openGradientEditor(initialGradient, (newGradientFromEditor) => {
                        if (isSmartEffect) {
                            localState.currentValue.value = newGradientFromEditor;
                        } else {
                            localState.currentValue = newGradientFromEditor;
                        }
                        body.querySelector('#eep-gradient-preview').style.backgroundImage = generateCSSGradient(newGradientFromEditor);
                    });
                });
            }

            body.querySelector('#eep-color-swatch').addEventListener('click', () => {
                const swatchInner = body.querySelector('#eep-color-swatch .color-swatch-inner');
                openColorPicker(swatchInner.style.backgroundColor, (newColor) => {
                    swatchInner.style.backgroundColor = newColor;
                    const newColorRgba = parseColorString(newColor);
                    if (isSmartEffect) {
                        const propType = propConfig.type.startsWith('svg_') ? 'svg_color' : 'color';
                        localState.currentValue = { type: propType, value: newColorRgba };
                    } else {
                        localState.currentValue = newColorRgba;
                    }
                });
            });
            break;
        }
    }
}


/**
 * Retrieves the final value from the dialog's UI controls.
 * @returns {*} The value to be saved.
 */
function getValueFromUI() {
    const mainElement = document.getElementById(localState.elementId);
    if (!mainElement) return null;

    const isSmartEffect = mainElement.dataset.elementType === 'smart-effect';
    let propConfig = null;
    if (isSmartEffect) {
        try {
            const effectData = JSON.parse(mainElement.dataset.effectJson);
            propConfig = effectData.parameters?.[localState.propKey];
        } catch (e) {}
    }

    const propType = propConfig ? propConfig.type : getPropertyType(localState.propKey, mainElement);
    const isColorOnly = COLOR_ONLY_PROPERTIES.has(localState.propKey) || localState.propKey === 'textColor' || propType === 'color' || propType === 'svg_color';

    switch (propType) {
        case 'boolean':
            return body.querySelector('#eep-boolean-input').checked;
        case 'number':
            if (localState.propKey.toLowerCase().includes('opacity')) {
                return parseFloat(body.querySelector('#eep-opacity-slider').value);
            } else if (localState.propKey === 'audioVolume') {
                return parseFloat(body.querySelector('#eep-volume-slider').value);
            } else if (localState.propKey === 'videoSpeed') {
                return parseFloat(body.querySelector('#eep-speed-slider').value);
            } else if (['rotate', 'rotateX', 'rotateY', 'rotateZ', 'skewX', 'skewY'].includes(localState.propKey)) {
                return parseFloat(body.querySelector('#eep-number-input-deg').value) || 0;
            } else {
                return parseFloat(body.querySelector('#eep-number-input').value);
            }
        case 'size':
            return {
                value: parseFloat(body.querySelector('#eep-size-input').value),
                unit: body.querySelector('#eep-size-unit').value
            };
        case 'fontFamily':
            return body.querySelector('#eep-font-family-select').value;
        case 'fontWeight':
            return body.querySelector('#eep-font-weight-select').value;
        case 'fontStyle':
            return body.querySelector('#eep-font-style-select').value;
        case 'alignment': {
            const activeBtn = body.querySelector('#eep-alignment-tabs .tab-btn.active');
            return activeBtn ? activeBtn.dataset.align : 'vertical';
        }
        case 'textAlign': {
            const activeBtn = body.querySelector('#eep-text-align-tabs .tab-btn.active');
            return activeBtn ? activeBtn.dataset.align : 'left';
        }
        case 'justifyContent':
            return body.querySelector('#eep-justify-content-select').value;
        case 'alignItems':
            return body.querySelector('#eep-align-items-select').value;

        case 'dynamic-string':
        case 'string':
            if (localState.propKey === 'audioState' || localState.propKey === 'videoState') {
                const activeBtn = body.querySelector('#eep-state-tabs .tab-btn.active');
                return activeBtn ? activeBtn.dataset.state : 'paused';
            } else if (localState.propKey === 'transform-style' || localState.propKey === 'backface-visibility') {
                const selectInput = body.querySelector('#eep-string-select');
                return selectInput ? selectInput.value : '';
            }
            // Fallback for other string types
            const stringInput = body.querySelector('#eep-string-input');
            return stringInput ? stringInput.value : '';

        case 'color/gradient':
        case 'color':
        case 'svg_color':
        case 'gradient':
        case 'svg_gradient': {
            const isSvg = propType.startsWith('svg_');
            const activeTabIsColor = isColorOnly || (body.querySelector('.tab-btn.active') && body.querySelector('.tab-btn.active').dataset.tab === 'color');

            if (activeTabIsColor) {
                const colorStr = body.querySelector('#eep-color-swatch .color-swatch-inner').style.backgroundColor;
                const colorVal = parseColorString(colorStr);
                if (isSmartEffect) {
                    const finalType = isSvg ? 'svg_color' : 'color';
                    return { type: finalType, value: colorVal };
                }
                return colorVal;
            } else { // Gradient tab is active
                return localState.currentValue;
            }
        }
    }
}



// --- Public API ---

export function initPropertyValueEditor() {
    dialog = document.getElementById('edit-event-property-dialog');
    header = document.getElementById('eep-dialog-header');
    body = document.getElementById('eep-dialog-body');
    okBtn = document.getElementById('eep-dialog-ok');
    cancelBtn = document.getElementById('eep-dialog-cancel');
    inheritBtn = document.createElement('button');
    inheritBtn.id = 'eep-dialog-inherit';
    inheritBtn.className = 'action-btn inherit-btn';
    inheritBtn.textContent = 'Inherit';
    cancelBtn.parentElement.insertBefore(inheritBtn, cancelBtn);

    okBtn.addEventListener('click', () => {
        if (localState.callback) {
            const finalValue = getValueFromUI();
            localState.callback(finalValue);
        }
        dialog.classList.remove('visible');
    });
    cancelBtn.addEventListener('click', () => { dialog.classList.remove('visible'); });
    inheritBtn.addEventListener('click', () => {
        if (localState.callback) {
            localState.callback(undefined); // Using undefined to signify inheritance
        }
        dialog.classList.remove('visible');
    });
}

export function openPropertyValueEditor(elementId, propKey, currentEffectiveValue, callback) {
    const mainElement = document.getElementById(elementId);
    if (!mainElement) return;

    let valueToEdit = (typeof currentEffectiveValue === 'object' && currentEffectiveValue !== null)
        ? JSON.parse(JSON.stringify(currentEffectiveValue))
        : currentEffectiveValue;

    if (typeof valueToEdit === 'string' && (valueToEdit.startsWith('#') || valueToEdit.startsWith('rgb'))) {
        valueToEdit = parseColorString(valueToEdit);
    }

    const allProps = getAvailablePropertiesForElement(mainElement);
    const flatProps = Object.values(allProps).reduce((acc, val) => ({ ...acc, ...val }), {});
    const propName = flatProps[propKey] || propKey;

    if (mainElement.dataset.elementType === 'smart-effect') {
        try {
            const effectData = JSON.parse(mainElement.dataset.effectJson);
            const paramConfig = effectData.parameters?.[propKey];
            if (paramConfig && (paramConfig.type.includes('gradient') || paramConfig.type.includes('color'))) {
                if (valueToEdit && valueToEdit.hasOwnProperty('colorStops') && !valueToEdit.hasOwnProperty('value')) {
                    valueToEdit = { type: paramConfig.type, value: valueToEdit };
                }
                else if (typeof valueToEdit !== 'object' || !valueToEdit.hasOwnProperty('colorStops')) {
                    if (!valueToEdit.hasOwnProperty('type')) {
                        valueToEdit = { type: paramConfig.type, value: valueToEdit };
                    }
                }
            }
        } catch (e) {}
    }

    localState = {
        callback,
        propKey,
        elementId,
        currentValue: valueToEdit,
    };

    header.textContent = `Edit '${propName}'`;
    buildDialogUI();
    dialog.classList.add('visible');
}