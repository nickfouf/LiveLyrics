import { state, updateState } from './state.js';
import { hsvToRgb, hexToRgb, rgbToHex, rgbToHsv, parseColorString, rgbaToHex } from '../renderer/utils.js';
import { makeDraggable } from './draggable.js';

let pickerState = { h: 0, s: 100, v: 100, a: 1 };

let dialog, svPanel, svSelector, hueSlider, hueSelector, alphaSlider, alphaSelector, previewNew, inputs;

function updateFromHSV() {
    const rgb = hsvToRgb(pickerState.h, pickerState.s, pickerState.v);
    Object.assign(pickerState, rgb);
    pickerState.hex = rgbaToHex(rgb.r, rgb.g, rgb.b, pickerState.a);
    updateUI();
}

function updateFromRGB() {
    const hsv = rgbToHsv(pickerState.r, pickerState.g, pickerState.b);
    Object.assign(pickerState, hsv);
    pickerState.hex = rgbaToHex(pickerState.r, pickerState.g, pickerState.b, pickerState.a);
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

    // Update alpha slider UI
    alphaSlider.style.backgroundImage = `
        linear-gradient(to top, rgba(0,0,0,0) 0%, rgb(${pickerState.r}, ${pickerState.g}, ${pickerState.b}) 100%),
        linear-gradient(45deg, #808080 25%, transparent 25%),
        linear-gradient(-45deg, #808080 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #808080 75%),
        linear-gradient(-45deg, transparent 75%, #808080 75%)
    `;
    alphaSelector.style.top = `${100 - (pickerState.a * 100)}%`;

    previewNew.style.backgroundColor = `rgba(${pickerState.r}, ${pickerState.g}, ${pickerState.b}, ${pickerState.a})`;
    inputs.h.value = Math.round(pickerState.h);
    inputs.s.value = Math.round(pickerState.s);
    inputs.v.value = Math.round(pickerState.v);
    inputs.r.value = pickerState.r;
    inputs.g.value = pickerState.g;
    inputs.b.value = pickerState.b;
    inputs.a.value = Math.round(pickerState.a * 100); // ADDED
    inputs.hex.value = pickerState.hex.substring(1);
}

export function initColorPicker() {
    const dialogHTML = `
        <div id="color-picker-dialog" class="dialog-overlay">
            <div class="dialog-content">
                <div class="dialog-header">Color Picker</div>
                <div class="dialog-body">
                    <div class="color-picker-layout">
                        <div class="color-picker-top">
                            <div class="color-picker-main">
                                <div class="color-picker-sv-panel" id="cp-sv-panel">
                                    <div class="color-picker-selector"></div>
                                </div>
                                <div class="color-picker-hue-slider" id="cp-hue-slider">
                                    <div class="color-picker-selector"></div>
                                </div>
                                <div class="color-picker-alpha-slider" id="cp-alpha-slider">
                                    <div class="color-picker-selector"></div>
                                </div>
                            </div>
                            <div class="color-picker-side">
                                <div class="color-picker-previews">
                                    <div id="color-picker-preview-new" class="color-picker-preview"></div>
                                    <div id="color-picker-preview-current" class="color-picker-preview"></div>
                                </div>
                                <div class="color-picker-inputs">
                                    <div class="color-picker-inputs-grid">
                                        <label>H</label><input type="number" id="cp-h-in" min="0" max="360" class="form-input"><span>°</span>
                                        <label>S</label><input type="number" id="cp-s-in" min="0" max="100" class="form-input"><span>%</span>
                                        <label>B</label><input type="number" id="cp-v-in" min="0" max="100" class="form-input"><span>%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="color-picker-bottom-inputs">
                             <div class="color-input-group">
                                <label>R</label><input type="number" id="cp-r-in" min="0" max="255" class="form-input">
                            </div>
                            <div class="color-input-group">
                                <label>G</label><input type="number" id="cp-g-in" min="0" max="255" class="form-input">
                            </div>
                            <div class="color-input-group">
                                <label>B</label><input type="number" id="cp-b-in" min="0" max="255" class="form-input">
                            </div>
                            <div class="color-input-group">
                                <label>A</label><input type="number" id="cp-a-in" min="0" max="100" class="form-input">
                            </div>
                            <div class="color-input-group hex-rgba-group">
                                <label>#</label><input type="text" id="cp-hex-in" class="form-input hex-input" maxlength="8">
                            </div>
                        </div>
                    </div>
                </div>
                <div class="dialog-footer">
                    <button id="cp-cancel-btn" class="action-btn secondary-btn">Cancel</button>
                    <button id="cp-ok-btn" class="action-btn primary-btn">OK</button>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    dialog = document.getElementById('color-picker-dialog');
    svPanel = document.getElementById('cp-sv-panel');
    svSelector = svPanel.querySelector('.color-picker-selector');
    hueSlider = document.getElementById('cp-hue-slider');
    hueSelector = hueSlider.querySelector('.color-picker-selector');
    alphaSlider = document.getElementById('cp-alpha-slider');
    alphaSelector = alphaSlider.querySelector('.color-picker-selector');
    previewNew = document.getElementById('color-picker-preview-new');
    inputs = {
        h: document.getElementById('cp-h-in'), s: document.getElementById('cp-s-in'), v: document.getElementById('cp-v-in'),
        r: document.getElementById('cp-r-in'), g: document.getElementById('cp-g-in'), b: document.getElementById('cp-b-in'),
        a: document.getElementById('cp-a-in'), // ADDED
        hex: document.getElementById('cp-hex-in')
    };

    makeDraggable('color-picker-dialog');

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

    alphaSlider.addEventListener('mousedown', (e) => {
        const moveHandler = (moveEvent) => {
            const rect = alphaSlider.getBoundingClientRect();
            let y = Math.max(0, Math.min(rect.height, moveEvent.clientY - rect.top));
            pickerState.a = 1 - (y / rect.height);
            updateFromHSV(); // Update hex with new alpha
        };
        moveHandler(e);
        handleDrag(alphaSlider, moveHandler);
    });

    // --- NEW EVENT HANDLING LOGIC ---

    // Handles live preview updates as the user types in H, S, B, R, G, or B fields.
    function handleRgbHsvInput(e) {
        const isHsv = ['cp-h-in', 'cp-s-in', 'cp-v-in'].includes(e.target.id);
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
        previewNew.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${pickerState.a})`;
    }

    // Handles live preview for the Hex field.
    function handleHexInput(e) {
        const hexValue = '#' + e.target.value;
        if (/^#([0-9A-F]{6}|[0-9A-F]{8})$/i.test(hexValue)) {
            const rgba = hexToRgb(hexValue);
            if (rgba) {
                previewNew.style.backgroundColor = `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${rgba.a})`;
            }
        } else {
            previewNew.style.backgroundColor = 'transparent'; // Show invalid state
        }
    }

    // Commits the final state when the user clicks away from an H, S, B, R, G, or B field.
    function handleRgbHsvBlur(e) {
        const isHsv = ['cp-h-in', 'cp-s-in', 'cp-v-in'].includes(e.target.id);
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

    // Commits the final state for the Hex field.
    function handleHexBlur(e) {
        let hexValue = e.target.value;
        if (hexValue.length === 6 || hexValue.length === 8) {
            hexValue = '#' + hexValue;
            if (/^#([0-9A-F]{6}|[0-9A-F]{8})$/i.test(hexValue)) {
                pickerState.hex = hexValue.toUpperCase();
                updateFromHex();
            } else {
                inputs.hex.value = pickerState.hex.substring(1);
            }
        } else {
            inputs.hex.value = pickerState.hex.substring(1);
        }
    }


    // ADDED: Handle Alpha Input
    function handleAlphaBlur() {
        pickerState.a = Math.max(0, Math.min(100, parseFloat(inputs.a.value) || 0)) / 100;
        updateFromRGB(); // Update hex value with new alpha
    }

    ['r', 'g', 'b', 'h', 's', 'v'].forEach(key => {
        inputs[key].addEventListener('input', handleRgbHsvInput);
        inputs[key].addEventListener('blur', handleRgbHsvBlur);
    });

    inputs.hex.addEventListener('input', handleHexInput);
    inputs.hex.addEventListener('blur', handleHexBlur);
    inputs.a.addEventListener('blur', handleAlphaBlur); // ADDED


    document.getElementById('cp-ok-btn').addEventListener('click', () => {
        if(state.colorPickerCallback) {
            const rgbaString = `rgba(${pickerState.r}, ${pickerState.g}, ${pickerState.b}, ${pickerState.a.toFixed(3)})`;
            state.colorPickerCallback(rgbaString);
        }
        dialog.classList.remove('visible');
    });
    document.getElementById('cp-cancel-btn').addEventListener('click', () => {
        dialog.classList.remove('visible');
    });
}

export function openColorPicker(initialColor, callback) {
    const previewCurrent = document.getElementById('color-picker-preview-current');
    const parsed = parseColorString(initialColor);

    previewCurrent.style.backgroundColor = `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${parsed.a})`;

    // Initialize state fully from the parsed color
    const hsv = rgbToHsv(parsed.r, parsed.g, parsed.b);
    pickerState = {
        ...hsv,
        r: parsed.r,
        g: parsed.g,
        b: parsed.b,
        a: parsed.a,
        hex: rgbaToHex(parsed.r, parsed.g, parsed.b, parsed.a)
    };
    updateUI();

    updateState({ colorPickerCallback: callback });
    dialog.classList.add('visible');
}
