import { state, updateState } from './state.js';
import { hsvToRgb, hexToRgb, rgbToHex, rgbToHsv, parseColorString } from '../renderer/utils.js';
import {makeDraggable} from "./draggable.js";

// Simplified state without alpha
let pickerState = { h: 0, s: 100, v: 100 };

let dialog, svPanel, svSelector, hueSlider, hueSelector, previewNew, inputs;

function updateFromHSV() {
    const rgb = hsvToRgb(pickerState.h, pickerState.s, pickerState.v);
    Object.assign(pickerState, rgb);
    pickerState.hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    updateUI();
}

function updateFromRGB() {
    const hsv = rgbToHsv(pickerState.r, pickerState.g, pickerState.b);
    Object.assign(pickerState, hsv);
    pickerState.hex = rgbToHex(pickerState.r, pickerState.g, pickerState.b);
    updateUI();
}

function updateFromHex() {
    const rgb = hexToRgb(pickerState.hex);
    if(rgb){
        Object.assign(pickerState, rgb);
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        Object.assign(pickerState, hsv);
        updateUI();
    }
}

function updateUI() {
    svPanel.style.backgroundColor = `hsl(${pickerState.h}, 100%, 50%)`;
    svSelector.style.left = `${pickerState.s}%`;
    svSelector.style.top = `${100 - pickerState.v}%`;
    hueSelector.style.top = `${(pickerState.h / 360) * 100}%`;

    // Use rgb() for an opaque color
    previewNew.style.backgroundColor = `rgb(${pickerState.r}, ${pickerState.g}, ${pickerState.b})`;

    inputs.h.value = Math.round(pickerState.h);
    inputs.s.value = Math.round(pickerState.s);
    inputs.v.value = Math.round(pickerState.v);
    inputs.r.value = pickerState.r;
    inputs.g.value = pickerState.g;
    inputs.b.value = pickerState.b;
    inputs.hex.value = pickerState.hex.substring(1);
}

// Renamed and modified
export function initOpaqueColorPicker() {
    const dialogHTML = `
        <div id="opaque-color-picker-dialog" class="dialog-overlay">
            <div class="dialog-content">
                <div class="dialog-header">Color Picker (Opaque)</div>
                <div class="dialog-body">
                    <div class="color-picker-layout">
                        <div class="color-picker-top">
                            <div class="color-picker-main">
                                <div class="color-picker-sv-panel" id="ocp-sv-panel">
                                    <div class="color-picker-selector"></div>
                                </div>
                                <div class="color-picker-hue-slider" id="ocp-hue-slider">
                                    <div class="color-picker-selector"></div>
                                </div>
                                <!-- Alpha slider removed -->
                            </div>
                            <div class="color-picker-side">
                                <div class="color-picker-previews">
                                    <div id="opaque-color-picker-preview-new" class="color-picker-preview"></div>
                                    <div id="opaque-color-picker-preview-current" class="color-picker-preview"></div>
                                </div>
                                <div class="color-picker-inputs">
                                    <div class="color-picker-inputs-grid">
                                        <label>H</label><input type="number" id="ocp-h-in" min="0" max="360" class="form-input"><span>°</span>
                                        <label>S</label><input type="number" id="ocp-s-in" min="0" max="100" class="form-input"><span>%</span>
                                        <label>B</label><input type="number" id="ocp-v-in" min="0" max="100" class="form-input"><span>%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="color-picker-bottom-inputs">
                             <div class="color-input-group">
                                <label>R</label><input type="number" id="ocp-r-in" min="0" max="255" class="form-input">
                            </div>
                            <div class="color-input-group">
                                <label>G</label><input type="number" id="ocp-g-in" min="0" max="255" class="form-input">
                            </div>
                            <div class="color-input-group">
                                <label>B</label><input type="number" id="ocp-b-in" min="0" max="255" class="form-input">
                            </div>
                            <div class="color-input-group hex-rgb-group">
                                <label>#</label><input type="text" id="ocp-hex-in" class="form-input hex-input" maxlength="6">
                            </div>
                            <!-- Alpha input removed -->
                        </div>
                    </div>
                </div>
                <div class="dialog-footer">
                    <button id="ocp-cancel-btn" class="action-btn secondary-btn">Cancel</button>
                    <button id="ocp-ok-btn" class="action-btn primary-btn">OK</button>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    dialog = document.getElementById('opaque-color-picker-dialog');
    svPanel = document.getElementById('ocp-sv-panel');
    svSelector = svPanel.querySelector('.color-picker-selector');
    hueSlider = document.getElementById('ocp-hue-slider');
    hueSelector = hueSlider.querySelector('.color-picker-selector');
    previewNew = document.getElementById('opaque-color-picker-preview-new');
    inputs = {
        h: document.getElementById('ocp-h-in'), s: document.getElementById('ocp-s-in'), v: document.getElementById('ocp-v-in'),
        r: document.getElementById('ocp-r-in'), g: document.getElementById('ocp-g-in'), b: document.getElementById('ocp-b-in'),
        hex: document.getElementById('ocp-hex-in')
    };

    makeDraggable('opaque-color-picker-dialog');

    function handleDrag(element, onMove) {
        const onMouseMove = (e) => { e.preventDefault(); onMove(e); };
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    svPanel.addEventListener('mousedown', (e) => {
        const moveHandler = (moveEvent) => {
            const rect = svPanel.getBoundingClientRect();
            let x = Math.max(0, Math.min(rect.width, moveEvent.clientX - rect.left));
            let y = Math.max(0, Math.min(rect.height, moveEvent.clientY - rect.top));
            pickerState.s = (x / rect.width) * 100;
            pickerState.v = 100 - (y / rect.height) * 100;
            updateFromHSV();
        };
        moveHandler(e);
        handleDrag(svPanel, moveHandler);
    });

    hueSlider.addEventListener('mousedown', (e) => {
        const moveHandler = (moveEvent) => {
            const rect = hueSlider.getBoundingClientRect();
            let y = Math.max(0, Math.min(rect.height, moveEvent.clientY - rect.top));
            pickerState.h = (y / rect.height) * 360;
            updateFromHSV();
        };
        moveHandler(e);
        handleDrag(hueSlider, moveHandler);
    });

    function handleRgbHsvInput(e) {
        const isHsv = ['ocp-h-in', 'ocp-s-in', 'ocp-v-in'].includes(e.target.id);
        let rgb;
        if (isHsv) {
            const h = parseFloat(inputs.h.value) || 0;
            const s = parseFloat(inputs.s.value) || 0;
            const v = parseFloat(inputs.v.value) || 0;
            rgb = hsvToRgb(h, s, v);
        } else {
            rgb = {
                r: parseInt(inputs.r.value, 10) || 0,
                g: parseInt(inputs.g.value, 10) || 0,
                b: parseInt(inputs.b.value, 10) || 0
            };
        }
        previewNew.style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    }

    function handleHexInput(e) {
        const hexValue = '#' + e.target.value;
        if (/^#[0-9A-F]{6}$/i.test(hexValue)) {
            previewNew.style.backgroundColor = hexValue;
        } else {
            previewNew.style.backgroundColor = 'transparent';
        }
    }

    function handleRgbHsvBlur(e) {
        const isHsv = ['ocp-h-in', 'ocp-s-in', 'ocp-v-in'].includes(e.target.id);
        if (isHsv) {
            pickerState.h = Math.max(0, Math.min(360, parseFloat(inputs.h.value) || 0));
            pickerState.s = Math.max(0, Math.min(100, parseFloat(inputs.s.value) || 0));
            pickerState.v = Math.max(0, Math.min(100, parseFloat(inputs.v.value) || 0));
            updateFromHSV();
        } else {
            pickerState.r = Math.max(0, Math.min(255, parseInt(inputs.r.value, 10) || 0));
            pickerState.g = Math.max(0, Math.min(255, parseInt(inputs.g.value, 10) || 0));
            pickerState.b = Math.max(0, Math.min(255, parseInt(inputs.b.value, 10) || 0));
            updateFromRGB();
        }
    }

    function handleHexBlur(e) {
        const hexValue = '#' + e.target.value;
        if (/^#[0-9A-F]{6}$/i.test(hexValue)) {
            pickerState.hex = hexValue.toUpperCase();
            updateFromHex();
        } else {
            inputs.hex.value = pickerState.hex.substring(1);
        }
    }

    ['r', 'g', 'b', 'h', 's', 'v'].forEach(key => {
        inputs[key].addEventListener('input', handleRgbHsvInput);
        inputs[key].addEventListener('blur', handleRgbHsvBlur);
    });

    inputs.hex.addEventListener('input', handleHexInput);
    inputs.hex.addEventListener('blur', handleHexBlur);

    document.getElementById('ocp-ok-btn').addEventListener('click', () => {
        if(state.opaqueColorPickerCallback) {
            const rgbString = `rgb(${pickerState.r}, ${pickerState.g}, ${pickerState.b})`;
            state.opaqueColorPickerCallback(rgbString);
        }
        dialog.classList.remove('visible');
    });
    document.getElementById('ocp-cancel-btn').addEventListener('click', () => {
        dialog.classList.remove('visible');
    });
}

export function openOpaqueColorPicker(initialColor, callback) {
    const previewCurrent = document.getElementById('opaque-color-picker-preview-current');
    const parsed = parseColorString(initialColor);

    previewCurrent.style.backgroundColor = `rgb(${parsed.r}, ${parsed.g}, ${parsed.b})`;

    const hsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
    pickerState = {
        ...hsv,
        r: parsed.r,
        g: parsed.g,
        b: parsed.b,
        hex: rgbToHex(parsed.r, parsed.g, parsed.b)
    };
    updateUI();

    updateState({ opaqueColorPickerCallback: callback });
    dialog.classList.add('visible');
}




