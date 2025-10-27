// src/renderer/js/editor/propertiesPanel.js

import {state} from './state.js';
import {DOM} from './dom.js';
import {openColorPicker} from './colorPicker.js';
import {openOpaqueColorPicker} from './opaqueColorPicker.js';
import {openGradientEditor} from './gradientEditor.js';
import {renderLayersPanel} from './layersPanel.js';
import {openLyricsEditor} from "./lyricsEditor.js";
import {openOrchestraEditor} from "./orchestraEditor.js";
import {renderEventsPanel} from "./eventsPanel.js";
import {setPropertyAsDefaultValue, rebuildAllEventTimelines, markAsDirty} from "./events.js";
import {generateCSSColor, parseColorString, generateCSSGradient} from '../renderer/utils.js';
import {VirtualLyrics} from '../renderer/elements/lyrics.js';
import {VirtualOrchestra} from '../renderer/elements/orchestra.js';
import {triggerActivePageRender, renderPageManager} from './pageManager.js';
import {updateEmptyPageHintVisibility} from './rendering.js';
import { buildMeasureMap, calculateGlobalMeasureOffsetForElement } from './utils.js';
import { showLoadingDialog } from './loadingDialog.js';

let scrollTimeout = null;

/**
 * Initializes event listeners for the properties panel to save its UI state.
 */
export function initPropertiesPanelInteractions() {
    if (!DOM.propertiesPanelBody) return;

    // Handle saving scroll position with a debounce
    DOM.propertiesPanelBody.addEventListener('scroll', () => {
        if (!state.selectedElement) return;

        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            state.ui.propertiesPanelState.scrollPositionByElementId[state.selectedElement.id] = DOM.propertiesPanelBody.scrollTop;
        }, 100);
    });

    // Handle saving the collapsed/expanded state of property groups
    DOM.propertiesPanelBody.addEventListener('click', e => {
        const header = e.target.closest('.prop-group-header');
        if (header && !e.target.closest('button, .prop-reset-btn')) {
            const propGroup = header.closest('.prop-group');
            const groupId = propGroup.id;
            const elementId = state.selectedElement?.id;

            if (!groupId || !elementId) return;

            // Toggle the class for the visual change
            const isCollapsing = !propGroup.classList.contains('collapsed');
            propGroup.classList.toggle('collapsed', isCollapsing);

            // Update the central state
            if (!state.ui.propertiesPanelState.collapsedGroupsByElementId[elementId]) {
                state.ui.propertiesPanelState.collapsedGroupsByElementId[elementId] = {};
            }
            // This line now saves true for collapsed, false for expanded.
            state.ui.propertiesPanelState.collapsedGroupsByElementId[elementId][groupId] = isCollapsing;
        }
    });
}


/**
 * Creates the standard header for a property group.
 * @param {string} title - The title of the group.
 * @returns {string} The HTML string for the header.
 */
function createPropHeader(title) {
    return `
    <div class="prop-group-header">
        <h4>${title}</h4>
        <div class="prop-group-header-buttons">
            <button class="prop-reset-btn" title="Reset to default">
                <img src="../../icons/undo.svg" alt="Reset">
            </button>
            <button class="prop-toggle-btn">
                <img src="../../icons/chevron-down.svg" alt="Toggle">
            </button>
        </div>
    </div>`;
}

/**
 * Checks if a value is controlled by an event and applies a visual indicator.
 * A property is considered "controlled" if it has more than one event,
 * or if its single event is not at the absolute start (measure 0, progress 0).
 * @param {HTMLElement} formGroup - The .form-group container.
 * @param {object} valueObject - The virtual value object (e.g., UnitValue, ColorValue).
 */
function checkAndSetEventControl(formGroup, valueObject) {
    if (!valueObject || typeof valueObject.getEvents !== 'function') return;

    const events = valueObject.getEvents();
    const eventCount = events.length;

    if (eventCount === 0) {
        return; // Not controlled if there are no events.
    }

    let isControlled = true; // Assume controlled if events exist.

    // If there's only one event, check its position.
    // If it's at the very beginning, we treat it as a user-editable "initial value".
    if (eventCount === 1) {
        const firstEvent = events.at(0);
        if (firstEvent.getMeasureIndex() === 0 && firstEvent.getMeasureProgress() === 0) {
            isControlled = false; // This is just an initial value, not a complex animation.
        }
    }
    // If eventCount > 1, isControlled remains true.

    if (isControlled) {
        formGroup.classList.add('is-event-controlled');
        formGroup.title = 'This property is controlled by events. Changing this value will set the default (starting) value.';
    }
}

// --- MODIFIED: Generic Builder for UnitValue Properties ---
// Now uses setPropertyAsDefaultValue and reads from getDefaultValue.
function buildUnitValueUI(propGroupBody, propKey, label, valueObject) {
    const defaultValue = valueObject.getDefaultValue();
    const unitOptions = ['px', 'pw', 'ph', 'vw', 'vh', '%'].map(u => `<option value="${u}" ${defaultValue.unit === u ? 'selected' : ''}>${u}</option>`).join('');
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    formGroup.dataset.propKey = propKey;
    formGroup.innerHTML = `
        <label>${label}</label>
        <div class="input-with-unit">
            <input type="number" class="form-input" value="${defaultValue.value}">
            <select class="form-select">${unitOptions}</select>
        </div>
    `;
    propGroupBody.appendChild(formGroup);

    checkAndSetEventControl(formGroup, valueObject);

    const input = formGroup.querySelector('input');
    const select = formGroup.querySelector('select');
    const update = () => {
        const newValue = { value: parseFloat(input.value) || 0, unit: select.value };
        setPropertyAsDefaultValue(state.selectedElement, propKey, newValue);
    };
    input.addEventListener('input', update);
    select.addEventListener('input', update);
}

function buildNumberInputUI(propGroupBody, propKey, label, valueObject, { min = -Infinity, max = Infinity, step = 1 } = {}) {
    const defaultValue = valueObject.getDefaultValue();
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    formGroup.dataset.propKey = propKey;
    formGroup.innerHTML = `
        <label>${label}</label>
        <input type="number" class="form-input" value="${defaultValue}" min="${min}" max="${max}" step="${step}">
    `;
    propGroupBody.appendChild(formGroup);

    checkAndSetEventControl(formGroup, valueObject);

    const input = formGroup.querySelector('input');
    input.addEventListener('input', () => {
        setPropertyAsDefaultValue(state.selectedElement, propKey, parseFloat(input.value));
    });
}

function buildStringWithUnitUI(propGroupBody, propKey, label, valueObject) {
    const defaultValue = valueObject.getDefaultValue();
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    formGroup.dataset.propKey = propKey;
    formGroup.innerHTML = `
        <label>${label}</label>
        <input type="text" class="form-input" value="${defaultValue}">
    `;
    propGroupBody.appendChild(formGroup);

    checkAndSetEventControl(formGroup, valueObject);

    const input = formGroup.querySelector('input');
    input.addEventListener('input', () => {
        setPropertyAsDefaultValue(state.selectedElement, propKey, input.value);
    });
}

function buildNumberWithStaticUnitUI(propGroupBody, propKey, label, valueObject, unit) {
    const defaultValue = valueObject.getDefaultValue();
    const numericValue = parseFloat(defaultValue) || 0;

    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    formGroup.dataset.propKey = propKey;
    formGroup.innerHTML = `
        <label>${label}</label>
        <div class="input-with-unit">
            <input type="number" class="form-input" value="${numericValue}">
            <span class="unit-label">${unit}</span>
        </div>
    `;
    propGroupBody.appendChild(formGroup);

    checkAndSetEventControl(formGroup, valueObject);

    const input = formGroup.querySelector('input');
    input.addEventListener('input', () => {
        const newValue = parseFloat(input.value) || 0;
        setPropertyAsDefaultValue(state.selectedElement, propKey, newValue);
    });
}

function buildSelectUI(propGroupBody, propKey, label, valueObject, options) {
    const defaultValue = valueObject.getDefaultValue();
    const optionsHTML = options.map(opt => `<option value="${opt.value}" ${defaultValue === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('');
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    formGroup.dataset.propKey = propKey;
    formGroup.innerHTML = `
        <label>${label}</label>
        <select class="form-select">${optionsHTML}</select>
    `;
    propGroupBody.appendChild(formGroup);

    checkAndSetEventControl(formGroup, valueObject);

    const select = formGroup.querySelector('select');
    select.addEventListener('input', () => {
        setPropertyAsDefaultValue(state.selectedElement, propKey, select.value);
    });
}


// --- Property Builders ---

function buildNameProperty(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-name';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const nameProp = element.getProperty('name');

    propGroup.innerHTML = `
        ${createPropHeader('Name')}
        <div class="prop-group-body">
            <div class="form-group">
                <input type="text" id="prop-name" class="form-input" value="${nameProp.name}">
            </div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    propGroup.querySelector('#prop-name').addEventListener('input', (e) => {
        nameProp.setName(e.target.value);
        markAsDirty();
        DOM.propertiesPanelTitle.textContent = e.target.value;
        renderLayersPanel();
        if (element instanceof VirtualLyrics || element instanceof VirtualOrchestra) {
            renderEventsPanel();
        }
        if (element.type === 'page') {
            renderPageManager();
        }
    });
}

function buildParentPerspectiveProperties(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-parent-perspective';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const perspectiveProp = element.getProperty('parentPerspective');
    const isEnabled = perspectiveProp.getEnabled().getDefaultValue();

    propGroup.innerHTML = `${createPropHeader("Parent's Perspective")} <div class="prop-group-body"></div>`;
    const body = propGroup.querySelector('.prop-group-body');
    DOM.propertiesPanelBody.appendChild(propGroup);

    const enabledGroup = document.createElement('div');
    enabledGroup.className = 'form-group';
    enabledGroup.innerHTML = `
        <div class="toggle-switch-container">
            <label for="prop-parent-perspective-enabled">Enabled</label>
            <label class="toggle-switch">
                <input type="checkbox" id="prop-parent-perspective-enabled" ${isEnabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>
    `;
    body.appendChild(enabledGroup);

    buildUnitValueUI(body, 'perspective', 'Perspective', perspectiveProp.getPerspective());
    buildNumberWithStaticUnitUI(body, 'parent-rotateX', 'Rotate X', perspectiveProp.getRotateX(), 'deg');
    buildNumberWithStaticUnitUI(body, 'parent-rotateY', 'Rotate Y', perspectiveProp.getRotateY(), 'deg');
    buildNumberWithStaticUnitUI(body, 'parent-rotateZ', 'Rotate Z', perspectiveProp.getRotateZ(), 'deg');
    buildNumberInputUI(body, 'parent-scale', 'Scale', perspectiveProp.getScale(), { step: 0.01 });
    buildSelectUI(body, 'parent-transform-style', 'Transform Style', perspectiveProp.getTransformStyle(), [
        { value: 'flat', label: 'Flat' },
        { value: 'preserve-3d', label: 'Preserve 3D' }
    ]);

    body.querySelector('#prop-parent-perspective-enabled').addEventListener('change', (e) => {
        setPropertyAsDefaultValue(state.selectedElement, 'parentPerspectiveEnabled', e.target.checked);
    });

    if (!isEnabled) {
        [...body.children].forEach(child => {
            if (child !== enabledGroup) {
                child.querySelectorAll('input, select').forEach(el => el.disabled = true);
                child.classList.add('is-disabled');
            }
        });
    }
}

function buildSmartEffectSrcProperty(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-smart-effect-src';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const srcProp = element.getProperty('src');
    const currentPath = srcProp.getSrc().getValue();
    const alias = srcProp.getAlias().getValue();
    const fileName = alias || (currentPath ? currentPath.split(/[\\/]/).pop() : 'No file selected');

    propGroup.innerHTML = `
        ${createPropHeader('Effect Source')}
        <div class="prop-group-body">
            <div class="form-group">
                <div class="input-with-button">
                    <span class="form-input readonly-input" title="${currentPath}">${fileName}</span>
                    <button id="prop-effect-src-choose" class="action-btn secondary-btn">Choose...</button>
                </div>
            </div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    propGroup.querySelector('#prop-effect-src-choose').addEventListener('click', async () => {
        if (!window.editorAPI) {
            console.warn('editorAPI is not available.');
            return;
        }

        const originalPath = await window.editorAPI.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Smart Effects', extensions: ['json'] }]
        });
        if (!originalPath) return;

        const hideLoading = showLoadingDialog('Importing effect...');
        try {
            const result = await window.editorAPI.addAsset(originalPath);
            if (result && result.filePath && result.content) {
                srcProp.setSrc(result, true);
                markAsDirty();
                triggerActivePageRender(true);
                renderPropertiesPanel();
            }
        } catch (error) {
            console.error("Failed to add smart effect asset:", error);
        } finally {
            hideLoading();
        }
    });
}

function buildImageSrcProperty(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-imagesrc';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const srcProp = element.getProperty('src');
    const currentPath = srcProp.getSrc().getValue();
    const alias = srcProp.getAlias().getValue();
    const fileName = alias || (currentPath ? currentPath.split(/[\\/]/).pop() : 'No file selected');

    propGroup.innerHTML = `
        ${createPropHeader('Source')}
        <div class="prop-group-body">
            <div class="form-group">
                <div class="input-with-button">
                    <span class="form-input readonly-input" title="${currentPath}">${fileName}</span>
                    <button id="prop-src-choose" class="action-btn secondary-btn">Choose...</button>
                </div>
            </div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    propGroup.querySelector('#prop-src-choose').addEventListener('click', async () => {
        if (!window.editorAPI) {
            console.warn('editorAPI is not available.');
            return;
        }

        const originalPath = await window.editorAPI.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]
        });
        if (!originalPath) return;

        const hideLoading = showLoadingDialog('Importing image...');
        try {
            const assetData = await window.editorAPI.addAsset(originalPath);
            if (assetData && assetData.filePath) {
                srcProp.setSrc(assetData.filePath, true);
                srcProp.setAlias(assetData.alias, true);
                markAsDirty();
                triggerActivePageRender(false);
                renderPropertiesPanel();
            }
        } catch (error) {
            console.error("Failed to add image asset:", error);
        } finally {
            hideLoading();
        }
    });
}

function buildVideoSrcProperty(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-videosrc';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const srcProp = element.getProperty('src');
    const currentPath = srcProp.getSrc().getValue();
    const alias = srcProp.getAlias().getValue();
    const fileName = alias || (currentPath ? currentPath.split(/[\\/]/).pop() : 'No file selected');

    propGroup.innerHTML = `
        ${createPropHeader('Source')}
        <div class="prop-group-body">
            <div class="form-group">
                <div class="input-with-button">
                    <span class="form-input readonly-input" title="${currentPath}">${fileName}</span>
                    <button id="prop-video-src-choose" class="action-btn secondary-btn">Choose...</button>
                </div>
            </div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    propGroup.querySelector('#prop-video-src-choose').addEventListener('click', async () => {
        if (!window.editorAPI) {
            console.warn('editorAPI is not available.');
            return;
        }

        const originalPath = await window.editorAPI.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Videos', extensions: ['mp4', 'webm', 'mov'] }]
        });
        if (!originalPath) return;

        const hideLoading = showLoadingDialog('Importing video...');
        try {
            const assetData = await window.editorAPI.addAsset(originalPath);
            if (assetData && assetData.filePath) {
                srcProp.setSrc(assetData.filePath, true);
                srcProp.setAlias(assetData.alias, true);
                markAsDirty();
                triggerActivePageRender(false);
                renderPropertiesPanel();
            }
        } catch (error) {
            console.error("Failed to add video asset:", error);
        } finally {
            hideLoading();
        }
    });
}

function buildAudioSrcProperty(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-audiosrc';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const srcProp = element.getProperty('src');
    const currentPath = srcProp.getSrc().getValue();
    const alias = srcProp.getAlias().getValue();
    const fileName = alias || (currentPath ? currentPath.split(/[\\/]/).pop() : 'No file selected');

    propGroup.innerHTML = `
        ${createPropHeader('Source')}
        <div class="prop-group-body">
            <div class="form-group">
                <div class="input-with-button">
                    <span class="form-input readonly-input" title="${currentPath}">${fileName}</span>
                    <button id="prop-audio-src-choose" class="action-btn secondary-btn">Choose...</button>
                </div>
            </div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    propGroup.querySelector('#prop-audio-src-choose').addEventListener('click', async () => {
        if (!window.editorAPI) {
            console.warn('editorAPI is not available.');
            return;
        }

        const originalPath = await window.editorAPI.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'aac', 'flac'] }]
        });
        if (!originalPath) return;

        const hideLoading = showLoadingDialog('Importing audio...');
        try {
            const assetData = await window.editorAPI.addAsset(originalPath);
            if (assetData && assetData.filePath) {
                srcProp.setSrc(assetData.filePath, true);
                srcProp.setAlias(assetData.alias, true);
                markAsDirty();
                triggerActivePageRender(false);
                renderPropertiesPanel();
            }
        } catch (error) {
            console.error("Failed to add audio asset:", error);
        } finally {
            hideLoading();
        }
    });
}

function buildVideoPlaybackProperties(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-videoplayback';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const playbackProp = element.getProperty('playback');
    const stateVal = playbackProp.getState();
    const speedVal = playbackProp.getSpeed();
    const loopVal = playbackProp.getLoop();
    const defaultState = stateVal.getDefaultValue().value;
    const defaultSpeed = speedVal.getDefaultValue();
    const defaultLoop = loopVal.getDefaultValue();

    propGroup.innerHTML = `
        ${createPropHeader('Playback')}
        <div class="prop-group-body">
             <div class="form-group form-group-grid-2">
                <div data-prop-key="videoState">
                    <label>State</label>
                    <div class="segmented-tabs">
                        <button class="tab-btn ${defaultState === 'paused' ? 'active' : ''}" data-state="paused">Paused</button>
                        <button class="tab-btn ${defaultState === 'playing' ? 'active' : ''}" data-state="playing">Playing</button>
                    </div>
                </div>
                <div class="toggle-switch-container" data-prop-key="videoLoop">
                    <label for="prop-video-loop">Loop</label>
                    <label class="toggle-switch">
                        <input type="checkbox" id="prop-video-loop" ${defaultLoop ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
            <div class="form-group" data-prop-key="videoSpeed">
                <label>Speed</label>
                <div class="input-with-unit">
                    <input type="range" class="form-input" min="0.1" max="4" step="0.1" value="${defaultSpeed}" style="padding: 0;">
                    <input type="number" class="form-input" min="0.1" max="4" step="0.1" value="${defaultSpeed}" style="max-width: 80px;">
                    <span class="unit-label">x</span>
                </div>
            </div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    checkAndSetEventControl(propGroup.querySelector('[data-prop-key="videoState"]'), stateVal);
    checkAndSetEventControl(propGroup.querySelector('[data-prop-key="videoSpeed"]'), speedVal);
    checkAndSetEventControl(propGroup.querySelector('[data-prop-key="videoLoop"]'), loopVal);

    const stateTabs = propGroup.querySelector('[data-prop-key="videoState"] .segmented-tabs');
    stateTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        const newState = btn.dataset.state;
        setPropertyAsDefaultValue(state.selectedElement, 'videoState', newState);
        renderPropertiesPanel();
    });

    const slider = propGroup.querySelector('input[type="range"]');
    const numberInput = propGroup.querySelector('input[type="number"]');
    const loopToggle = propGroup.querySelector('#prop-video-loop');

    loopToggle.addEventListener('change', (e) => {
        setPropertyAsDefaultValue(state.selectedElement, 'videoLoop', e.target.checked);
    });

    const updateSpeed = (val) => {
        setPropertyAsDefaultValue(state.selectedElement, 'videoSpeed', val);
    };

    slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        numberInput.value = val.toFixed(1);
        updateSpeed(val);
    });
    numberInput.addEventListener('input', () => {
        const val = Math.max(0.1, Math.min(4, parseFloat(numberInput.value) || 1));
        slider.value = val;
        updateSpeed(val);
    });
}

function buildAudioPlaybackProperties(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-audioplayback';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const playbackProp = element.getProperty('playback');
    const stateVal = playbackProp.getState();
    const volumeVal = playbackProp.getVolume();
    const loopVal = playbackProp.getLoop();

    const defaultState = stateVal.getDefaultValue().value;
    const defaultVolume = volumeVal.getDefaultValue();
    const defaultLoop = loopVal.getDefaultValue();

    propGroup.innerHTML = `
        ${createPropHeader('Playback')}
        <div class="prop-group-body">
             <div class="form-group form-group-grid-2">
                <div data-prop-key="audioState">
                    <label>State</label>
                    <div class="segmented-tabs">
                        <button class="tab-btn ${defaultState === 'paused' ? 'active' : ''}" data-state="paused">Paused</button>
                        <button class="tab-btn ${defaultState === 'playing' ? 'active' : ''}" data-state="playing">Playing</button>
                    </div>
                </div>
                <div class="toggle-switch-container" data-prop-key="audioLoop">
                    <label for="prop-audio-loop">Loop</label>
                    <label class="toggle-switch">
                        <input type="checkbox" id="prop-audio-loop" ${defaultLoop ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
            <div class="form-group" data-prop-key="audioVolume">
                <label>Volume</label>
                <div class="input-with-unit">
                    <input type="range" class="form-input" min="0" max="1" step="0.01" value="${defaultVolume}" style="padding: 0;">
                    <input type="number" class="form-input" min="0" max="100" step="1" value="${Math.round(defaultVolume * 100)}" style="max-width: 80px;">
                    <span class="unit-label">%</span>
                </div>
            </div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    checkAndSetEventControl(propGroup.querySelector('[data-prop-key="audioState"]'), stateVal);
    checkAndSetEventControl(propGroup.querySelector('[data-prop-key="audioVolume"]'), volumeVal);
    checkAndSetEventControl(propGroup.querySelector('[data-prop-key="audioLoop"]'), loopVal);

    const stateTabs = propGroup.querySelector('[data-prop-key="audioState"] .segmented-tabs');
    stateTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        const newState = btn.dataset.state;
        setPropertyAsDefaultValue(state.selectedElement, 'audioState', newState);
        renderPropertiesPanel();
    });

    const loopToggle = propGroup.querySelector('#prop-audio-loop');
    const volumeSlider = propGroup.querySelector('input[type="range"]');
    const volumeNumber = propGroup.querySelector('input[type="number"]');

    loopToggle.addEventListener('change', (e) => {
        setPropertyAsDefaultValue(state.selectedElement, 'audioLoop', e.target.checked);
    });

    const updateVolume = (val) => {
        setPropertyAsDefaultValue(state.selectedElement, 'audioVolume', val);
    };

    volumeSlider.addEventListener('input', () => {
        const val = parseFloat(volumeSlider.value);
        volumeNumber.value = Math.round(val * 100);
        updateVolume(val);
    });
    volumeNumber.addEventListener('input', () => {
        const val = Math.max(0, Math.min(100, parseInt(volumeNumber.value, 10) || 0)) / 100;
        volumeSlider.value = val;
        updateVolume(val);
    });
}

function buildObjectFitProperty(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-objectfit';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const objectFitProp = element.getProperty('objectFit');
    const currentValue = objectFitProp.getObjectFit().getValue();
    const options = ['cover', 'contain', 'fill', 'none', 'scale-down'];

    const optionsHTML = options.map(opt =>
        `<option value="${opt}" ${currentValue === opt ? 'selected' : ''}>${opt.charAt(0).toUpperCase() + opt.slice(1)}</option>`
    ).join('');

    propGroup.innerHTML = `
        ${createPropHeader('Object Fit')}
        <div class="prop-group-body">
            <div class="form-group">
                <label>Fit</label>
                <select id="prop-object-fit" class="form-select">
                    ${optionsHTML}
                </select>
            </div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    const select = propGroup.querySelector('#prop-object-fit');
    select.addEventListener('input', (e) => {
        objectFitProp.setObjectFit(e.target.value, true);
        markAsDirty();
        triggerActivePageRender(false);
    });
}


function buildContentProperty(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-content';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const contentProp = element.getProperty('textContent').getTextContent();

    propGroup.innerHTML = `
        ${createPropHeader('Content')}
        <div class="prop-group-body">
            <div class="form-group">
                 <textarea id="prop-content" class="form-input" rows="3">${contentProp.getDefaultValue()}</textarea>
            </div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    checkAndSetEventControl(propGroup.querySelector('.form-group'), contentProp);

    propGroup.querySelector('#prop-content').addEventListener('input', (e) => {
        contentProp.setDefaultValue(e.target.value, true);
        markAsDirty();
        triggerActivePageRender(true);
    });
}

function buildLyricsProperties(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-lyrics';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;

    let parentPage = element.parent;
    while (parentPage && parentPage.type !== 'page') {
        parentPage = parentPage.parent;
    }
    const isOnThumbnailPage = parentPage === state.song.thumbnailPage;
    const disabledAttr = isOnThumbnailPage ? 'disabled' : '';
    const disabledTitle = isOnThumbnailPage ? 'title="Cannot add measures to the Thumbnail page."' : '';

    propGroup.innerHTML = `
        ${createPropHeader('Lyrics Content')}
        <div class="prop-group-body">
            <div class="form-group">
                <button id="edit-lyrics-btn" class="action-btn secondary-btn" style="width: 100%;" ${disabledAttr} ${disabledTitle}>Edit Lyrics</button>
            </div>
        </div>
    `;
    DOM.propertiesPanelBody.appendChild(propGroup);
    propGroup.querySelector('#edit-lyrics-btn').addEventListener('click', () => {
        const lyricsProp = element.getProperty('lyricsContent');
        const currentData = lyricsProp.getLyricsValue().getLyricsObject();

        const measureMap = buildMeasureMap();
        const offset = calculateGlobalMeasureOffsetForElement(element.id, measureMap);

        openLyricsEditor(JSON.stringify(currentData), offset, (newState) => {
            // 1. Update the element's content
            lyricsProp.setLyricsObject(newState);

            // 2. CRITICAL: Rebuild all event timelines for the entire song
            rebuildAllEventTimelines();

            // 3. Update the rest of the UI
            triggerActivePageRender(true);
            renderEventsPanel();
            updateEmptyPageHintVisibility();
        });
    });
}

function buildOrchestraProperties(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-orchestra';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;

    let parentPage = element.parent;
    while (parentPage && parentPage.type !== 'page') {
        parentPage = parentPage.parent;
    }
    const isOnThumbnailPage = parentPage === state.song.thumbnailPage;
    const disabledAttr = isOnThumbnailPage ? 'disabled' : '';
    const disabledTitle = isOnThumbnailPage ? 'title="Cannot add measures to the Thumbnail page."' : '';

    propGroup.innerHTML = `
        ${createPropHeader('Orchestra Content')}
        <div class="prop-group-body">
            <div class="form-group">
                <button id="edit-orchestra-btn" class="action-btn secondary-btn" style="width: 100%;" ${disabledAttr} ${disabledTitle}>Edit Measures</button>
            </div>
        </div>
    `;
    DOM.propertiesPanelBody.appendChild(propGroup);
    propGroup.querySelector('#edit-orchestra-btn').addEventListener('click', () => {
        const orchestraProp = element.getProperty('orchestraContent');
        const currentData = { measures: orchestraProp.getMeasures() };

        const measureMap = buildMeasureMap();
        const offset = calculateGlobalMeasureOffsetForElement(element.id, measureMap);

        openOrchestraEditor(JSON.stringify(currentData), offset, (newState) => {
            // 1. Update the element's content
            orchestraProp.setMeasures(newState.measures || []);

            // 2. CRITICAL: Rebuild all event timelines for the entire song.
            // This replaces the previous broken synchronization logic.
            rebuildAllEventTimelines();

            // 3. Update the rest of the UI
            triggerActivePageRender(true);
            renderEventsPanel();
            updateEmptyPageHintVisibility();
        });
    });
}

// --- MODIFIED: Dimension properties now use setPropertyAsDefaultValue and read from getDefaultValue ---
function buildDimensionProperties(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-dimensions';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const dimensionsProp = element.getProperty('dimensions');
    const widthVal = dimensionsProp.getWidth();
    const heightVal = dimensionsProp.getHeight();
    const defaultWidth = widthVal.getDefaultValue();
    const defaultHeight = heightVal.getDefaultValue();

    const widthValue = defaultWidth.unit === 'auto' ? '-' : defaultWidth.value;
    const heightValue = defaultHeight.unit === 'auto' ? '-' : defaultHeight.value;

    propGroup.innerHTML = `
        ${createPropHeader('Dimensions')}
        <div class="prop-group-body">
            <div class="form-group" data-prop-key="width">
                <label>Width</label>
                <div class="input-with-unit">
                    <input type="text" class="form-input" value="${widthValue}" ${defaultWidth.unit === 'auto' ? 'disabled' : ''}>
                    <select class="form-select">
                        <option value="auto" ${defaultWidth.unit === 'auto' ? 'selected' : ''}>Auto</option>
                        <option value="pw" ${defaultWidth.unit === 'pw' ? 'selected' : ''}>pw</option>
                        <option value="ph" ${defaultWidth.unit === 'ph' ? 'selected' : ''}>ph</option>
                        <option value="vw" ${defaultWidth.unit === 'vw' ? 'selected' : ''}>vw</option>
                        <option value="vh" ${defaultWidth.unit === 'vh' ? 'selected' : ''}>vh</option>
                        <option value="px" ${defaultWidth.unit === 'px' ? 'selected' : ''}>px</option>
                    </select>
                </div>
            </div>
            <div class="form-group" data-prop-key="height">
                <label>Height</label>
                <div class="input-with-unit">
                    <input type="text" class="form-input" value="${heightValue}" ${defaultHeight.unit === 'auto' ? 'disabled' : ''}>
                    <select class="form-select">
                        <option value="auto" ${defaultHeight.unit === 'auto' ? 'selected' : ''}>Auto</option>
                        <option value="ph" ${defaultHeight.unit === 'ph' ? 'selected' : ''}>ph</option>
                        <option value="pw" ${defaultHeight.unit === 'pw' ? 'selected' : ''}>pw</option>
                        <option value="vh" ${defaultHeight.unit === 'vh' ? 'selected' : ''}>vh</option>
                        <option value="vw" ${defaultHeight.unit === 'vw' ? 'selected' : ''}>vw</option>
                        <option value="px" ${defaultHeight.unit === 'px' ? 'selected' : ''}>px</option>
                    </select>
                </div>
            </div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    const widthGroup = propGroup.querySelector('[data-prop-key="width"]');
    const heightGroup = propGroup.querySelector('[data-prop-key="height"]');
    checkAndSetEventControl(widthGroup, widthVal);
    checkAndSetEventControl(heightGroup, heightVal);

    const widthInput = widthGroup.querySelector('input');
    const widthUnitSelect = widthGroup.querySelector('select');
    const heightInput = heightGroup.querySelector('input');
    const heightUnitSelect = heightGroup.querySelector('select');

    const update = () => {
        setPropertyAsDefaultValue(state.selectedElement, 'width', { value: parseFloat(widthInput.value) || 0, unit: widthUnitSelect.value });
        setPropertyAsDefaultValue(state.selectedElement, 'height', { value: parseFloat(heightInput.value) || 0, unit: heightUnitSelect.value });
    };

    widthInput.addEventListener('input', update);
    heightInput.addEventListener('input', update);

    widthUnitSelect.addEventListener('change', () => {
        const isAuto = widthUnitSelect.value === 'auto';
        widthInput.disabled = isAuto;
        if (isAuto) {
            widthInput.value = '-';
        } else if (widthInput.value === '-') {
            widthInput.value = '0';
        }
        update();
    });
    heightUnitSelect.addEventListener('change', () => {
        const isAuto = heightUnitSelect.value === 'auto';
        heightInput.disabled = isAuto;
        if (isAuto) {
            heightInput.value = '-';
        } else if (heightInput.value === '-') {
            heightInput.value = '0';
        }
        update();
    });
}

function buildAlignmentProperties(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-alignment';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const alignmentProp = element.getProperty('alignment');
    const gravityProp = element.getProperty('gravity');
    const gapProp = element.getProperty('gap');
    const currentAlignment = alignmentProp.getAlignment().getDefaultValue();

    propGroup.innerHTML = `
        ${createPropHeader('Alignment')}
        <div class="prop-group-body">
            <div class="form-group">
                <div class="segmented-tabs">
                    <button class="tab-btn ${currentAlignment === 'vertical' ? 'active' : ''}" data-align="vertical">Vertical</button>
                    <button class="tab-btn ${currentAlignment === 'horizontal' ? 'active' : ''}" data-align="horizontal">Horizontal</button>
                    <button class="tab-btn ${currentAlignment === 'absolute' ? 'active' : ''}" data-align="absolute">Absolute</button>
                </div>
            </div>
            <div id="flex-props-container"></div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    const flexPropsContainer = propGroup.querySelector('#flex-props-container');

    const renderFlexProps = () => {
        flexPropsContainer.innerHTML = '';
        const selectedAlignment = alignmentProp.getAlignment().getDefaultValue();
        if (selectedAlignment === 'vertical' || selectedAlignment === 'horizontal') {
            // Gravity (Justify Content & Align Items)
            const gravityGroup = document.createElement('div');
            gravityGroup.className = 'form-group';
            gravityGroup.innerHTML = `
                <label>Gravity</label>
                <div class="input-grid-2">
                    <select id="prop-justify-content" class="form-select" title="Justify Content">
                        <option value="flex-start" ${gravityProp.getJustifyContent().getDefaultValue() === 'flex-start' ? 'selected' : ''}>Start</option>
                        <option value="center" ${gravityProp.getJustifyContent().getDefaultValue() === 'center' ? 'selected' : ''}>Center</option>
                        <option value="flex-end" ${gravityProp.getJustifyContent().getDefaultValue() === 'flex-end' ? 'selected' : ''}>End</option>
                        <option value="space-between" ${gravityProp.getJustifyContent().getDefaultValue() === 'space-between' ? 'selected' : ''}>Space Between</option>
                        <option value="space-around" ${gravityProp.getJustifyContent().getDefaultValue() === 'space-around' ? 'selected' : ''}>Space Around</option>
                    </select>
                    <select id="prop-align-items" class="form-select" title="Align Items">
                        <option value="flex-start" ${gravityProp.getAlignItems().getDefaultValue() === 'flex-start' ? 'selected' : ''}>Start</option>
                        <option value="center" ${gravityProp.getAlignItems().getDefaultValue() === 'center' ? 'selected' : ''}>Center</option>
                        <option value="flex-end" ${gravityProp.getAlignItems().getDefaultValue() === 'flex-end' ? 'selected' : ''}>End</option>
                        <option value="stretch" ${gravityProp.getAlignItems().getDefaultValue() === 'stretch' ? 'selected' : ''}>Stretch</option>
                    </select>
                </div>
            `;
            flexPropsContainer.appendChild(gravityGroup);

            gravityGroup.querySelector('#prop-justify-content').addEventListener('input', (e) => {
                gravityProp.setJustifyContent(e.target.value, true);
                markAsDirty();
                triggerActivePageRender(false);
            });
            gravityGroup.querySelector('#prop-align-items').addEventListener('input', (e) => {
                gravityProp.setAlignItems(e.target.value, true);
                markAsDirty();
                triggerActivePageRender(false);
            });

            // Gap
            buildUnitValueUI(flexPropsContainer, 'gap', 'Gap', gapProp.getGap());
        }
    };

    propGroup.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            alignmentProp.setAlignment(btn.dataset.align, true);
            markAsDirty();
            triggerActivePageRender(true); // Re-render the main view
            renderPropertiesPanel(); // Re-render the panel to show/hide flex props
        });
    });

    renderFlexProps();
}

// --- MODIFIED: Margin properties now use correct event keys ---
function buildMarginProperties(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-margin';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const marginProp = element.getProperty('margin');

    propGroup.innerHTML = `${createPropHeader('Margin')} <div class="prop-group-body"></div>`;
    const body = propGroup.querySelector('.prop-group-body');
    DOM.propertiesPanelBody.appendChild(propGroup);

    buildUnitValueUI(body, 'top', 'Top', marginProp.getTop());
    buildUnitValueUI(body, 'left', 'Left', marginProp.getLeft());
    buildUnitValueUI(body, 'bottom', 'Bottom', marginProp.getBottom());
    buildUnitValueUI(body, 'right', 'Right', marginProp.getRight());
}

function buildInnerPaddingProperties(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-inner_padding';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const paddingProp = element.getProperty('inner_padding');

    propGroup.innerHTML = `${createPropHeader('Inner Padding')} <div class="prop-group-body"></div>`;
    const body = propGroup.querySelector('.prop-group-body');
    DOM.propertiesPanelBody.appendChild(propGroup);

    buildUnitValueUI(body, 'paddingTop', 'Top', paddingProp.getTop());
    buildUnitValueUI(body, 'paddingLeft', 'Left', paddingProp.getLeft());
    buildUnitValueUI(body, 'paddingBottom', 'Bottom', paddingProp.getBottom());
    buildUnitValueUI(body, 'paddingRight', 'Right', paddingProp.getRight());
}

// --- MODIFIED: Background properties now use setPropertyAsDefaultValue and read from getDefaultValue ---
function buildBackgroundColorProperty(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-bgcolor';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const backgroundProp = element.getProperty('background');
    const backgroundValue = backgroundProp.getBackground();
    const enabledValue = backgroundProp.getEnabled();
    const bgObject = backgroundValue.getDefaultValue();

    const isColor = bgObject.mode === 'color';
    const isEnabled = enabledValue.getDefaultValue();
    const isPage = element.type === 'page';

    const enabledToggleHTML = isPage ? '' : `
        <div class="form-group">
            <div class="toggle-switch-container">
                <label for="prop-bg-enabled">Enabled</label>
                <label class="toggle-switch">
                    <input type="checkbox" id="prop-bg-enabled" ${isEnabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>
        </div>
    `;

    const controlsContainerDisplay = isEnabled ? '' : 'style="display: none;"';
    const currentCSS = isColor ? generateCSSColor(bgObject) : generateCSSGradient(bgObject);

    propGroup.innerHTML = `
        ${createPropHeader('Background')}
        <div class="prop-group-body">
            ${enabledToggleHTML}
            <div id="bg-controls-container" ${controlsContainerDisplay}>
                <div class="form-group">
                    <div class="segmented-tabs" data-prop-key="bgType">
                        <button class="tab-btn ${isColor ? 'active' : ''}" data-tab="color">Color</button>
                        <button class="tab-btn ${!isColor ? 'active' : ''}" data-tab="gradient">Gradient</button>
                    </div>
                </div>
                <div class="tab-content ${isColor ? 'active' : ''}">
                    <div class="form-group" data-prop-key="bgColor">
                        <label>Color</label>
                        <div class="color-swatch" id="prop-bg-color"><div class="color-swatch-inner" style="background: ${currentCSS};"></div></div>
                    </div>
                </div>
                <div class="tab-content ${!isColor ? 'active' : ''}">
                    <div class="form-group" data-prop-key="gradient">
                        <label>Gradient</label>
                        <div class="gradient-preview" id="prop-bg-gradient" style="background-image: ${currentCSS};"></div>
                    </div>
                    <div class="form-group">
                        <label for="prop-bg-gradient-type">Type</label>
                        <select id="prop-bg-gradient-type" class="form-select">
                            <option value="linear" ${bgObject.type === 'linear' ? 'selected' : ''}>Linear</option>
                            <option value="radial" ${bgObject.type === 'radial' ? 'selected' : ''}>Radial</option>
                        </select>
                    </div>
                    <div class="form-group" id="prop-bg-gradient-angle-group" style="display: ${bgObject.type === 'linear' ? 'flex' : 'none'};">
                        <label for="prop-bg-gradient-angle">Angle</label>
                        <div class="input-with-unit">
                            <input type="number" id="prop-bg-gradient-angle" class="form-input" value="${bgObject.angle || 90}">
                            <span class="unit-label">deg</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    checkAndSetEventControl(propGroup.querySelector('[data-prop-key="bgColor"]'), backgroundValue);
    checkAndSetEventControl(propGroup.querySelector('[data-prop-key="gradient"]'), backgroundValue);

    const colorSwatch = propGroup.querySelector('#prop-bg-color');
    const gradientPreview = propGroup.querySelector('#prop-bg-gradient');
    const gradientTypeSelect = propGroup.querySelector('#prop-bg-gradient-type');
    const gradientAngleGroup = propGroup.querySelector('#prop-bg-gradient-angle-group');
    const gradientAngleInput = propGroup.querySelector('#prop-bg-gradient-angle');

    if (!isPage) {
        const enabledToggle = propGroup.querySelector('#prop-bg-enabled');
        if (enabledToggle) {
            enabledToggle.addEventListener('change', (e) => {
                setPropertyAsDefaultValue(state.selectedElement, 'bgEnabled', e.target.checked);
                renderPropertiesPanel();
            });
        }
    }

    colorSwatch.addEventListener('click', () => {
        const picker = isPage ? openOpaqueColorPicker : openColorPicker;
        picker(currentCSS, (newColor) => {
            const p = parseColorString(newColor);
            setPropertyAsDefaultValue(state.selectedElement, 'bgColor', { mode: 'color', ...p });
            renderPropertiesPanel();
        });
    });

    gradientPreview.addEventListener('click', () => {
        const gradientForEditor = {
            type: bgObject.type || 'linear',
            angle: bgObject.angle,
            colorStops: (bgObject.colorStops || []).map(cs => ({
                color: generateCSSColor(cs.color),
                position: cs.position,
                midpoint: cs.midpoint
            }))
        };
        openGradientEditor(gradientForEditor, (newGradient) => {
            const newGradientObject = {
                mode: 'gradient',
                type: newGradient.type,
                angle: newGradient.angle,
                colorStops: newGradient.colorStops.map(cs => ({
                    position: cs.position,
                    color: cs.color, // The editor now returns color objects
                    midpoint: cs.midpoint
                }))
            };
            setPropertyAsDefaultValue(state.selectedElement, 'bgColor', newGradientObject);
            renderPropertiesPanel();
        }, isPage);
    });

    gradientTypeSelect.addEventListener('input', () => {
        const newType = gradientTypeSelect.value;
        gradientAngleGroup.style.display = newType === 'linear' ? 'flex' : 'none';
        const currentObject = backgroundValue.getDefaultValue();
        currentObject.type = newType;
        setPropertyAsDefaultValue(state.selectedElement, 'bgColor', currentObject);
    });

    gradientAngleInput.addEventListener('input', () => {
        const currentObject = backgroundValue.getDefaultValue();
        currentObject.angle = parseInt(gradientAngleInput.value, 10) || 0;
        setPropertyAsDefaultValue(state.selectedElement, 'bgColor', currentObject);
    });

    propGroup.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const switchToColor = btn.dataset.tab === 'color';
            if (switchToColor !== isColor) {
                const newObj = switchToColor
                    ? { mode: 'color', r: 0, g: 0, b: 0, a: 1 }
                    : { mode: 'gradient', type: 'linear', angle: 90, colorStops: [{ position: 0, color: { r: 255, g: 0, b: 255, a: 1 } }, { position: 100, color: { r: 0, g: 255, b: 224, a: 1 } }] };
                setPropertyAsDefaultValue(state.selectedElement, 'bgColor', newObj);
                renderPropertiesPanel();
            }
        });
    });
}

// --- MODIFIED: Border properties now use setPropertyAsDefaultValue and read from getDefaultValue ---
function buildBorderProperties(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-border';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const borderProp = element.getProperty('border');

    propGroup.innerHTML = `
        ${createPropHeader('Border')}
        <div class="prop-group-body">
            <div class="form-group">
                <div class="toggle-switch-container">
                    <label for="prop-border-enabled">Enabled</label>
                    <label class="toggle-switch"><input type="checkbox" id="prop-border-enabled" ${borderProp.getEnabled().getDefaultValue() ? 'checked' : ''}><span class="toggle-slider"></span></label>
                </div>
            </div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    const body = propGroup.querySelector('.prop-group-body');
    buildUnitValueUI(body, 'borderSize', 'Width', borderProp.getWidth());
    buildUnitValueUI(body, 'borderRadius', 'Radius', borderProp.getRadius());

    const colorGroup = document.createElement('div');
    colorGroup.className = 'form-group';
    const defaultColor = borderProp.getColor().getDefaultValue();
    colorGroup.innerHTML = `
        <label>Color</label>
        <div class="color-swatch" id="prop-border-color"><div class="color-swatch-inner" style="background: ${generateCSSColor(defaultColor)};"></div></div>
    `;
    body.appendChild(colorGroup);
    checkAndSetEventControl(colorGroup, borderProp.getColor());


    colorGroup.querySelector('#prop-border-color').addEventListener('click', () => {
        openOpaqueColorPicker(generateCSSColor(borderProp.getColor().getDefaultValue()), (newColor) => {
            setPropertyAsDefaultValue(state.selectedElement, 'borderColor', parseColorString(newColor));
            renderPropertiesPanel();
        });
    });

    propGroup.querySelector('#prop-border-enabled').addEventListener('change', (e) => {
        setPropertyAsDefaultValue(state.selectedElement, 'borderEnabled', e.target.checked);
        renderPropertiesPanel();
    });
}

// --- MODIFIED: Box Shadow properties now use setPropertyAsDefaultValue and read from getDefaultValue ---
function buildBoxShadowProperties(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-boxshadow';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const shadowProp = element.getProperty('boxShadow');
    const values = shadowProp.getValues();

    propGroup.innerHTML = `
        ${createPropHeader('Box Shadow')}
        <div class="prop-group-body">
            <div class="form-group form-group-grid-2">
                <div class="toggle-switch-container">
                    <label for="prop-shadow-enabled">Enabled</label>
                    <label class="toggle-switch"><input type="checkbox" id="prop-shadow-enabled" ${values.enabled.getDefaultValue() ? 'checked' : ''}><span class="toggle-slider"></span></label>
                </div>
                <div class="toggle-switch-container">
                    <label for="prop-shadow-inset">Inset</label>
                    <label class="toggle-switch"><input type="checkbox" id="prop-shadow-inset" ${values.inset.getDefaultValue() ? 'checked' : ''}><span class="toggle-slider"></span></label>
                </div>
            </div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    const body = propGroup.querySelector('.prop-group-body');
    buildUnitValueUI(body, 'shadowOffsetX', 'Offset X', values.offsetX);
    buildUnitValueUI(body, 'shadowOffsetY', 'Offset Y', values.offsetY);
    buildUnitValueUI(body, 'shadowBlur', 'Blur', values.blur);
    buildUnitValueUI(body, 'shadowSpread', 'Spread', values.spread);

    const colorGroup = document.createElement('div');
    colorGroup.className = 'form-group';
    const defaultColor = values.color.getDefaultValue();
    colorGroup.innerHTML = `
        <label>Color</label>
        <div class="color-swatch" id="prop-shadow-color"><div class="color-swatch-inner" style="background: ${generateCSSColor(defaultColor)};"></div></div>
    `;
    body.appendChild(colorGroup);
    checkAndSetEventControl(colorGroup, values.color);

    colorGroup.querySelector('#prop-shadow-color').addEventListener('click', () => {
        openColorPicker(generateCSSColor(values.color.getDefaultValue()), (newColor) => {
            setPropertyAsDefaultValue(state.selectedElement, 'shadowColor', parseColorString(newColor));
            renderPropertiesPanel();
        });
    });

    propGroup.querySelector('#prop-shadow-enabled').addEventListener('change', (e) => {
        setPropertyAsDefaultValue(state.selectedElement, 'shadowEnabled', e.target.checked);
        renderPropertiesPanel();
    });
    propGroup.querySelector('#prop-shadow-inset').addEventListener('change', (e) => {
        setPropertyAsDefaultValue(state.selectedElement, 'shadowInset', e.target.checked);
    });
}

// NOTE: Progress properties are not animatable, so they continue to update directly and read the current value.
function buildProgressProperties(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-progress';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const progressProp = element.getProperty('progress');
    const bgColorValue = progressProp.getBackgroundColor();
    const fillColorValue = progressProp.getFillColor();
    const bgColorObject = bgColorValue.colorOrGradientObject;
    const fillColorObject = fillColorValue.colorOrGradientObject;

    const isBgColor = bgColorObject.mode === 'color';
    const isFillColor = fillColorObject.mode === 'color';

    propGroup.innerHTML = `
        ${createPropHeader(progressProp.name)}
        <div class="prop-group-body">
            <!-- Background Color -->
            <div class="form-group">
                <label>Background Color</label>
                <div class="segmented-tabs" data-prop-key="progressBgType">
                    <button class="tab-btn ${isBgColor ? 'active' : ''}" data-tab="color">Color</button>
                    <button class="tab-btn ${!isBgColor ? 'active' : ''}" data-tab="gradient">Gradient</button>
                </div>
            </div>
            <div class="tab-content ${isBgColor ? 'active' : ''}">
                <div class="form-group" data-prop-key="progressBgColor">
                    <div class="color-swatch" id="prop-progress-bg-color"><div class="color-swatch-inner" style="background: ${bgColorValue.getCSSValue()};"></div></div>
                </div>
            </div>
            <div class="tab-content ${!isBgColor ? 'active' : ''}">
                <div class="form-group" data-prop-key="progressBgGradient">
                    <label>Gradient</label>
                    <div class="gradient-preview" id="prop-progress-bg-gradient" style="background-image: ${bgColorValue.getCSSValue()};"></div>
                </div>
                <div class="form-group">
                    <label for="prop-progress-bg-gradient-type">Type</label>
                    <select id="prop-progress-bg-gradient-type" class="form-select">
                        <option value="linear" ${bgColorObject.type === 'linear' ? 'selected' : ''}>Linear</option>
                        <option value="radial" ${bgColorObject.type === 'radial' ? 'selected' : ''}>Radial</option>
                    </select>
                </div>
                <div class="form-group" id="prop-progress-bg-gradient-angle-group" style="display: ${bgColorObject.type === 'linear' ? 'flex' : 'none'};">
                    <label for="prop-progress-bg-gradient-angle">Angle</label>
                    <div class="input-with-unit">
                        <input type="number" id="prop-progress-bg-gradient-angle" class="form-input" value="${bgColorObject.angle || 90}">
                        <span class="unit-label">deg</span>
                    </div>
                </div>
            </div>
            
            <!-- Fill Color -->
            <div class="form-group" style="margin-top: 16px;">
                <label>Fill Color</label>
                <div class="segmented-tabs" data-prop-key="progressFillType">
                    <button class="tab-btn ${isFillColor ? 'active' : ''}" data-tab="color">Color</button>
                    <button class="tab-btn ${!isFillColor ? 'active' : ''}" data-tab="gradient">Gradient</button>
                </div>
            </div>
            <div class="tab-content ${isFillColor ? 'active' : ''}">
                <div class="form-group" data-prop-key="progressFillColor">
                    <div class="color-swatch" id="prop-progress-fill-color"><div class="color-swatch-inner" style="background: ${fillColorValue.getCSSValue()};"></div></div>
                </div>
            </div>
            <div class="tab-content ${!isFillColor ? 'active' : ''}">
                <div class="form-group" data-prop-key="progressFillGradient">
                    <label>Gradient</label>
                    <div class="gradient-preview" id="prop-progress-fill-gradient" style="background-image: ${fillColorValue.getCSSValue()};"></div>
                </div>
                <div class="form-group">
                    <label for="prop-progress-fill-gradient-type">Type</label>
                    <select id="prop-progress-fill-gradient-type" class="form-select">
                        <option value="linear" ${fillColorObject.type === 'linear' ? 'selected' : ''}>Linear</option>
                        <option value="radial" ${fillColorObject.type === 'radial' ? 'selected' : ''}>Radial</option>
                    </select>
                </div>
                <div class="form-group" id="prop-progress-fill-gradient-angle-group" style="display: ${fillColorObject.type === 'linear' ? 'flex' : 'none'};">
                    <label for="prop-progress-fill-gradient-angle">Angle</label>
                    <div class="input-with-unit">
                        <input type="number" id="prop-progress-fill-gradient-angle" class="form-input" value="${fillColorObject.angle || 90}">
                        <span class="unit-label">deg</span>
                    </div>
                </div>
            </div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    // Event listeners for Background Color
    const bgColorSwatch = propGroup.querySelector('#prop-progress-bg-color');
    const bgGradientPreview = propGroup.querySelector('#prop-progress-bg-gradient');
    const bgTabs = propGroup.querySelector('[data-prop-key="progressBgType"]');
    const bgGradientTypeSelect = propGroup.querySelector('#prop-progress-bg-gradient-type');
    const bgGradientAngleGroup = propGroup.querySelector('#prop-progress-bg-gradient-angle-group');
    const bgGradientAngleInput = propGroup.querySelector('#prop-progress-bg-gradient-angle');

    bgColorSwatch.addEventListener('click', () => {
        openColorPicker(bgColorValue.getCSSValue(), newColor => {
            progressProp.setBackgroundColor({ mode: 'color', ...parseColorString(newColor) }, true);
            markAsDirty();
            triggerActivePageRender(false);
            renderPropertiesPanel();
        });
    });

    bgGradientPreview.addEventListener('click', () => {
        const gradientForEditor = {
            type: bgColorObject.type || 'linear',
            angle: bgColorObject.angle,
            colorStops: (bgColorObject.colorStops || []).map(cs => ({
                color: generateCSSColor(cs.color),
                position: cs.position,
                midpoint: cs.midpoint
            }))
        };
        openGradientEditor(gradientForEditor, newGradient => {
            progressProp.setBackgroundColor({
                mode: 'gradient',
                type: newGradient.type,
                angle: newGradient.angle,
                colorStops: newGradient.colorStops.map(cs => ({
                    position: cs.position,
                    color: cs.color,
                    midpoint: cs.midpoint
                }))
            }, true);
            markAsDirty();
            triggerActivePageRender(false);
            renderPropertiesPanel();
        });
    });

    bgTabs.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const switchToColor = btn.dataset.tab === 'color';
            if (switchToColor !== isBgColor) {
                const newObj = switchToColor
                    ? { mode: 'color', r: 220, g: 220, b: 220, a: 1 }
                    : { mode: 'gradient', type: 'linear', angle: 90, colorStops: [{ position: 0, color: { r: 255, g: 0, b: 255, a: 1 } }, { position: 100, color: { r: 0, g: 255, b: 224, a: 1 } }] };
                progressProp.setBackgroundColor(newObj, true);
                markAsDirty();
                triggerActivePageRender(false);
                renderPropertiesPanel();
            }
        });
    });

    if (bgGradientTypeSelect) {
        bgGradientTypeSelect.addEventListener('input', () => {
            const newType = bgGradientTypeSelect.value;
            if (bgGradientAngleGroup) bgGradientAngleGroup.style.display = newType === 'linear' ? 'flex' : 'none';
            bgColorObject.type = newType;
            progressProp.setBackgroundColor(bgColorObject, true);
            markAsDirty();
            triggerActivePageRender(false);
            bgGradientPreview.style.backgroundImage = bgColorValue.getCSSValue();
        });
    }

    if (bgGradientAngleInput) {
        bgGradientAngleInput.addEventListener('input', () => {
            bgColorObject.angle = parseInt(bgGradientAngleInput.value, 10) || 0;
            progressProp.setBackgroundColor(bgColorObject, true);
            markAsDirty();
            triggerActivePageRender(false);
            bgGradientPreview.style.backgroundImage = bgColorValue.getCSSValue();
        });
    }

    // Event listeners for Fill Color
    const fillColorSwatch = propGroup.querySelector('#prop-progress-fill-color');
    const fillGradientPreview = propGroup.querySelector('#prop-progress-fill-gradient');
    const fillTabs = propGroup.querySelector('[data-prop-key="progressFillType"]');
    const fillGradientTypeSelect = propGroup.querySelector('#prop-progress-fill-gradient-type');
    const fillGradientAngleGroup = propGroup.querySelector('#prop-progress-fill-gradient-angle-group');
    const fillGradientAngleInput = propGroup.querySelector('#prop-progress-fill-gradient-angle');

    fillColorSwatch.addEventListener('click', () => {
        openColorPicker(fillColorValue.getCSSValue(), newColor => {
            progressProp.setFillColor({ mode: 'color', ...parseColorString(newColor) }, true);
            markAsDirty();
            triggerActivePageRender(false);
            renderPropertiesPanel();
        });
    });

    fillGradientPreview.addEventListener('click', () => {
        const gradientForEditor = {
            type: fillColorObject.type || 'linear',
            angle: fillColorObject.angle,
            colorStops: (fillColorObject.colorStops || []).map(cs => ({
                color: generateCSSColor(cs.color),
                position: cs.position,
                midpoint: cs.midpoint
            }))
        };
        openGradientEditor(gradientForEditor, newGradient => {
            progressProp.setFillColor({
                mode: 'gradient',
                type: newGradient.type,
                angle: newGradient.angle,
                colorStops: newGradient.colorStops.map(cs => ({
                    position: cs.position,
                    color: cs.color,
                    midpoint: cs.midpoint
                }))
            }, true);
            markAsDirty();
            triggerActivePageRender(false);
            renderPropertiesPanel();
        });
    });

    fillTabs.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const switchToColor = btn.dataset.tab === 'color';
            if (switchToColor !== isFillColor) {
                const newObj = switchToColor
                    ? { mode: 'color', r: 0, g: 120, b: 215, a: 1 }
                    : { mode: 'gradient', type: 'linear', angle: 90, colorStops: [{ position: 0, color: { r: 255, g: 0, b: 0, a: 1 } }, { position: 100, color: { r: 255, g: 255, b: 0, a: 1 } }] }
                progressProp.setFillColor(newObj, true);
                markAsDirty();
                triggerActivePageRender(false);
                renderPropertiesPanel();
            }
        });
    });

    if (fillGradientTypeSelect) {
        fillGradientTypeSelect.addEventListener('input', () => {
            const newType = fillGradientTypeSelect.value;
            if (fillGradientAngleGroup) fillGradientAngleGroup.style.display = newType === 'linear' ? 'flex' : 'none';
            fillColorObject.type = newType;
            progressProp.setFillColor(fillColorObject, true);
            markAsDirty();
            triggerActivePageRender(false);
            fillGradientPreview.style.backgroundImage = fillColorValue.getCSSValue();
        });
    }

    if (fillGradientAngleInput) {
        fillGradientAngleInput.addEventListener('input', () => {
            const newAngle = parseInt(fillGradientAngleInput.value, 10) || 0;
            fillColorObject.angle = newAngle;
            progressProp.setFillColor(fillColorObject, true);
            markAsDirty();
            triggerActivePageRender(false);
            fillGradientPreview.style.backgroundImage = fillColorValue.getCSSValue();
        });
    }
}

// --- MODIFIED: Text Style properties now use setPropertyAsDefaultValue and read from getDefaultValue ---
function buildTextStyleProperties(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-textstyle';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const textStyleProp = element.getProperty('textStyle');
    const isLyrics = textStyleProp.getKaraokeColor !== undefined;

    const currentFont = textStyleProp.getFontFamily().getDefaultValue();
    let fontOptionsHTML = (state.systemFonts || []).map(fontFamily =>
        `<option value="${fontFamily}" ${fontFamily === currentFont ? 'selected' : ''}>${fontFamily}</option>`
    ).join('');

    const isCurrentFontInList = (state.systemFonts || []).includes(currentFont);
    if (!isCurrentFontInList && currentFont) {
        fontOptionsHTML = `<option value="${currentFont}" selected>${currentFont}</option>${fontOptionsHTML}`;
    }

    const defaultFontSize = textStyleProp.getFontSize().getDefaultValue();
    const defaultLineHeight = textStyleProp.getLineHeight().getDefaultValue();
    const defaultLetterSpacing = textStyleProp.getLetterSpacing().getDefaultValue();
    const defaultWordSpacing = textStyleProp.getWordSpacing().getDefaultValue();

    propGroup.innerHTML = `
        ${createPropHeader('Text Style')}
        <div class="prop-group-body">
            <div class="form-group form-group-grid-3">
                <div>
                    <label>Font Family</label>
                    <select id="prop-font-family" class="form-select">${fontOptionsHTML}</select>
                </div>
                <div>
                    <label>Weight</label>
                    <select id="prop-font-weight" class="form-select">
                        <option value="normal" ${textStyleProp.getFontWeight().getDefaultValue() === 'normal' ? 'selected' : ''}>Normal</option>
                        <option value="bold" ${textStyleProp.getFontWeight().getDefaultValue() === 'bold' ? 'selected' : ''}>Bold</option>
                        <option value="100" ${textStyleProp.getFontWeight().getDefaultValue() === '100' ? 'selected' : ''}>100</option>
                        <option value="200" ${textStyleProp.getFontWeight().getDefaultValue() === '200' ? 'selected' : ''}>200</option>
                        <option value="300" ${textStyleProp.getFontWeight().getDefaultValue() === '300' ? 'selected' : ''}>300</option>
                        <option value="400" ${textStyleProp.getFontWeight().getDefaultValue() === '400' ? 'selected' : ''}>400</option>
                        <option value="500" ${textStyleProp.getFontWeight().getDefaultValue() === '500' ? 'selected' : ''}>500</option>
                        <option value="600" ${textStyleProp.getFontWeight().getDefaultValue() === '600' ? 'selected' : ''}>600</option>
                        <option value="700" ${textStyleProp.getFontWeight().getDefaultValue() === '700' ? 'selected' : ''}>700</option>
                        <option value="800" ${textStyleProp.getFontWeight().getDefaultValue() === '800' ? 'selected' : ''}>800</option>
                        <option value="900" ${textStyleProp.getFontWeight().getDefaultValue() === '900' ? 'selected' : ''}>900</option>
                    </select>
                </div>
                 <div>
                    <label>Style</label>
                    <select id="prop-font-style" class="form-select">
                        <option value="normal" ${textStyleProp.getFontStyle().getDefaultValue() === 'normal' ? 'selected' : ''}>Normal</option>
                        <option value="italic" ${textStyleProp.getFontStyle().getDefaultValue() === 'italic' ? 'selected' : ''}>Italic</option>
                    </select>
                </div>
            </div>
            <div class="form-group" data-prop-key="fontSize">
                <label>Size</label>
                <div class="input-with-unit">
                    <input type="number" id="prop-font-size" class="form-input" value="${defaultFontSize.value}">
                    <select id="prop-font-size-unit" class="form-select">
                       <option value="px" ${defaultFontSize.unit === 'px' ? 'selected' : ''}>px</option>
                       <option value="pt" ${defaultFontSize.unit === 'pt' ? 'selected' : ''}>pt</option>
                       <option value="em" ${defaultFontSize.unit === 'em' ? 'selected' : ''}>em</option>
                       <option value="rem" ${defaultFontSize.unit === 'rem' ? 'selected' : ''}>rem</option>
                       <option value="%" ${defaultFontSize.unit === '%' ? 'selected' : ''}>%</option>
                    </select>
                </div>
            </div>
            
            <div id="text-color-container"></div>
            
            ${isLyrics ? `<div id="karaoke-color-container"></div>` : ''}

            <div class="form-group form-group-grid-3">
                <div data-prop-key="lineHeight">
                    <label>Line Height</label>
                    <input type="number" step="0.1" id="prop-line-height" class="form-input" value="${(isLyrics ? defaultLineHeight.value : defaultLineHeight)}">
                </div>
                <div data-prop-key="letterSpacing">
                    <label>Letter Spacing</label>
                     <input type="number" id="prop-letter-spacing" class="form-input" value="${defaultLetterSpacing.value}">
                </div>
                <div data-prop-key="wordSpacing">
                    <label>Word Spacing</label>
                     <input type="number" id="prop-word-spacing" class="form-input" value="${defaultWordSpacing.value}">
                </div>
            </div>
            <div class="form-group">
                <label>Alignment</label>
                <div class="segmented-tabs" id="text-align-tabs">
                    <button class="tab-btn ${textStyleProp.getTextAlign().getDefaultValue() === 'left' ? 'active' : ''}" data-align="left" title="Align Left"><img src="../../icons/left_alignment.svg"></button>
                    <button class="tab-btn ${textStyleProp.getTextAlign().getDefaultValue() === 'center' ? 'active' : ''}" data-align="center" title="Align Center"><img src="../../icons/center_alignment.svg"></button>
                    <button class="tab-btn ${textStyleProp.getTextAlign().getDefaultValue() === 'right' ? 'active' : ''}" data-align="right" title="Align Right"><img src="../../icons/right_alignment.svg"></button>
                </div>
            </div>
            <div class="form-group">
                 <div class="toggle-switch-container">
                    <label for="prop-justify-text">Justify</label>
                    <label class="toggle-switch"><input type="checkbox" id="prop-justify-text" ${textStyleProp.getJustifyText().getDefaultValue() ? 'checked' : ''}><span class="toggle-slider"></span></label>
                </div>
            </div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    // --- Text Color UI ---
    const textColorValue = textStyleProp.getTextColor();
    const textColorObject = textColorValue.getDefaultValue();
    const isTextColor = textColorObject.mode === 'color';
    const textColorContainer = propGroup.querySelector('#text-color-container');
    const textColorCSS = isTextColor ? generateCSSColor(textColorObject) : generateCSSGradient(textColorObject);

    textColorContainer.innerHTML = `
        <div class="form-group">
            <label>Color</label>
            <div class="segmented-tabs" id="text-color-tabs">
                <button class="tab-btn ${isTextColor ? 'active' : ''}" data-tab="color">Color</button>
                <button class="tab-btn ${!isTextColor ? 'active' : ''}" data-tab="gradient">Gradient</button>
            </div>
        </div>
        <div class="tab-content ${isTextColor ? 'active' : ''}" style="margin-top: 8px;">
            <div class="form-group" data-prop-key="textColor">
                <div class="color-swatch" id="prop-text-color"><div class="color-swatch-inner" style="background: ${isTextColor ? textColorCSS : 'transparent'};"></div></div>
            </div>
        </div>
        <div class="tab-content ${!isTextColor ? 'active' : ''}" style="margin-top: 8px;">
            <div class="form-group" data-prop-key="textGradient">
                <label>Gradient</label>
                <div class="gradient-preview" id="prop-text-gradient" style="background-image: ${!isTextColor ? textColorCSS : 'none'};"></div>
            </div>
            <div class="form-group">
                <label for="prop-text-gradient-type">Type</label>
                <select id="prop-text-gradient-type" class="form-select">
                    <option value="linear" ${textColorObject.type === 'linear' ? 'selected' : ''}>Linear</option>
                    <option value="radial" ${textColorObject.type === 'radial' ? 'selected' : ''}>Radial</option>
                </select>
            </div>
            <div class="form-group" id="prop-text-gradient-angle-group" style="display: ${textColorObject.type === 'linear' ? 'flex' : 'none'};">
                <label for="prop-text-gradient-angle">Angle</label>
                <div class="input-with-unit">
                    <input type="number" id="prop-text-gradient-angle" class="form-input" value="${textColorObject.angle || 90}">
                    <span class="unit-label">deg</span>
                </div>
            </div>
        </div>
    `;
    checkAndSetEventControl(textColorContainer.querySelector('[data-prop-key="textColor"]'), textColorValue);
    checkAndSetEventControl(textColorContainer.querySelector('[data-prop-key="textGradient"]'), textColorValue);

    // --- Karaoke Color UI (if lyrics) ---
    if (isLyrics) {
        const karaokeColorValue = textStyleProp.getKaraokeColor();
        const karaokeColorObject = karaokeColorValue.getDefaultValue();
        const isKaraokeColor = karaokeColorObject.mode === 'color';
        const karaokeColorContainer = propGroup.querySelector('#karaoke-color-container');
        const karaokeColorCSS = isKaraokeColor ? generateCSSColor(karaokeColorObject) : generateCSSGradient(karaokeColorObject);

        karaokeColorContainer.innerHTML = `
            <div class="form-group">
                <label>Karaoke Color</label>
                <div class="segmented-tabs" id="karaoke-color-tabs">
                    <button class="tab-btn ${isKaraokeColor ? 'active' : ''}" data-tab="color">Color</button>
                    <button class="tab-btn ${!isKaraokeColor ? 'active' : ''}" data-tab="gradient">Gradient</button>
                </div>
            </div>
            <div class="tab-content ${isKaraokeColor ? 'active' : ''}" style="margin-top: 8px;">
                <div class="form-group" data-prop-key="karaokeColor">
                    <div class="color-swatch" id="prop-karaoke-color"><div class="color-swatch-inner" style="background: ${isKaraokeColor ? karaokeColorCSS : 'transparent'};"></div></div>
                </div>
            </div>
            <div class="tab-content ${!isKaraokeColor ? 'active' : ''}" style="margin-top: 8px;">
                <div class="form-group" data-prop-key="karaokeGradient">
                    <label>Gradient</label>
                    <div class="gradient-preview" id="prop-karaoke-gradient" style="background-image: ${!isKaraokeColor ? karaokeColorCSS : 'none'};"></div>
                </div>
                <div class="form-group">
                    <label for="prop-karaoke-gradient-type">Type</label>
                    <select id="prop-karaoke-gradient-type" class="form-select">
                        <option value="linear" ${karaokeColorObject.type === 'linear' ? 'selected' : ''}>Linear</option>
                        <option value="radial" ${karaokeColorObject.type === 'radial' ? 'selected' : ''}>Radial</option>
                    </select>
                </div>
                <div class="form-group" id="prop-karaoke-gradient-angle-group" style="display: ${karaokeColorObject.type === 'linear' ? 'flex' : 'none'};">
                    <label for="prop-karaoke-gradient-angle">Angle</label>
                    <div class="input-with-unit">
                        <input type="number" id="prop-karaoke-gradient-angle" class="form-input" value="${karaokeColorObject.angle || 90}">
                        <span class="unit-label">deg</span>
                    </div>
                </div>
            </div>
        `;
        checkAndSetEventControl(karaokeColorContainer.querySelector('[data-prop-key="karaokeColor"]'), karaokeColorValue);
        checkAndSetEventControl(karaokeColorContainer.querySelector('[data-prop-key="karaokeGradient"]'), karaokeColorValue);
    }

    // --- Add Event Listeners ---
    const fontFamilySelect = propGroup.querySelector('#prop-font-family');
    const fontWeightSelect = propGroup.querySelector('#prop-font-weight');
    const fontStyleSelect = propGroup.querySelector('#prop-font-style');
    const fontSizeInput = propGroup.querySelector('#prop-font-size');
    const fontSizeUnitSelect = propGroup.querySelector('#prop-font-size-unit');
    const lineHeightInput = propGroup.querySelector('#prop-line-height');
    const letterSpacingInput = propGroup.querySelector('#prop-letter-spacing');
    const wordSpacingInput = propGroup.querySelector('#prop-word-spacing');
    const alignButtons = propGroup.querySelector('#text-align-tabs').querySelectorAll('.tab-btn');
    const justifyToggle = propGroup.querySelector('#prop-justify-text');

    // Non-animatable properties update directly
    fontFamilySelect.addEventListener('input', (e) => { textStyleProp.setFontFamily(e.target.value, true); markAsDirty(); triggerActivePageRender(true); });
    fontWeightSelect.addEventListener('input', (e) => { textStyleProp.setFontWeight(e.target.value, true); markAsDirty(); triggerActivePageRender(true); });
    fontStyleSelect.addEventListener('input', (e) => { textStyleProp.setFontStyle(e.target.value, true); markAsDirty(); triggerActivePageRender(true); });
    alignButtons.forEach(btn => btn.addEventListener('click', () => { textStyleProp.setTextAlign(btn.dataset.align, true); markAsDirty(); triggerActivePageRender(true); renderPropertiesPanel(); }));
    justifyToggle.addEventListener('change', (e) => { textStyleProp.setJustifyText(e.target.checked, true); markAsDirty(); triggerActivePageRender(true); });

    // Animatable properties use setPropertyAsDefaultValue
    const updateFontSize = () => setPropertyAsDefaultValue(state.selectedElement, 'fontSize', { value: parseFloat(fontSizeInput.value) || 0, unit: fontSizeUnitSelect.value });
    fontSizeInput.addEventListener('input', updateFontSize);
    fontSizeUnitSelect.addEventListener('input', updateFontSize);

    lineHeightInput.addEventListener('input', (e) => setPropertyAsDefaultValue(state.selectedElement, 'lineHeight', (isLyrics ? { value: parseFloat(e.target.value) || 0, unit: 'px' } : parseFloat(e.target.value) || 0)));
    letterSpacingInput.addEventListener('input', (e) => setPropertyAsDefaultValue(state.selectedElement, 'letterSpacing', { value: parseFloat(e.target.value) || 0, unit: 'px' }));
    wordSpacingInput.addEventListener('input', (e) => setPropertyAsDefaultValue(state.selectedElement, 'wordSpacing', { value: parseFloat(e.target.value) || 0, unit: 'px' }));

    // Text Color Listeners
    const textColorSwatch = propGroup.querySelector('#prop-text-color');
    const textGradientPreview = propGroup.querySelector('#prop-text-gradient');
    const textGradientTypeSelect = propGroup.querySelector('#prop-text-gradient-type');
    const textGradientAngleGroup = propGroup.querySelector('#prop-text-gradient-angle-group');
    const textGradientAngleInput = propGroup.querySelector('#prop-text-gradient-angle');

    textColorSwatch.addEventListener('click', () => {
        openColorPicker(textColorCSS, (newColor) => {
            setPropertyAsDefaultValue(state.selectedElement, 'textColor', { mode: 'color', ...parseColorString(newColor) });
            renderPropertiesPanel();
        });
    });
    textGradientPreview.addEventListener('click', () => {
        const currentGradient = textColorObject.mode === 'gradient' ? textColorObject : { type: 'linear', angle: 90, colorStops: [{ position: 0, color: { r: 255, g: 0, b: 255, a: 1 } }, { position: 100, color: { r: 0, g: 255, b: 224, a: 1 } }] };
        const gradientForEditor = {
            type: currentGradient.type || 'linear',
            angle: currentGradient.angle,
            colorStops: (currentGradient.colorStops || []).map(cs => ({
                color: generateCSSColor(cs.color),
                position: cs.position,
                midpoint: cs.midpoint
            }))
        };
        openGradientEditor(gradientForEditor, (newGradient) => {
            setPropertyAsDefaultValue(state.selectedElement, 'textColor', {
                mode: 'gradient',
                type: newGradient.type,
                angle: newGradient.angle,
                colorStops: newGradient.colorStops.map(cs => ({
                    position: cs.position,
                    color: cs.color,
                    midpoint: cs.midpoint
                }))
            });
            renderPropertiesPanel();
        });
    });
    propGroup.querySelector('#text-color-tabs').querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const switchToColor = btn.dataset.tab === 'color';
            if (switchToColor !== isTextColor) {
                const newObj = switchToColor
                    ? { mode: 'color', r: 255, g: 255, b: 255, a: 1 }
                    : { mode: 'gradient', type: 'linear', angle: 90, colorStops: [{ position: 0, color: { r: 255, g: 0, b: 255, a: 1 } }, { position: 100, color: { r: 0, g: 255, b: 224, a: 1 } }] };
                setPropertyAsDefaultValue(state.selectedElement, 'textColor', newObj);
                renderPropertiesPanel();
            }
        });
    });

    if (textGradientTypeSelect) {
        textGradientTypeSelect.addEventListener('input', () => {
            const newType = textGradientTypeSelect.value;
            if (textGradientAngleGroup) textGradientAngleGroup.style.display = newType === 'linear' ? 'flex' : 'none';
            const currentObject = textColorValue.getDefaultValue();
            currentObject.type = newType;
            setPropertyAsDefaultValue(state.selectedElement, 'textColor', currentObject);
        });
    }

    if (textGradientAngleInput) {
        textGradientAngleInput.addEventListener('input', () => {
            const currentObject = textColorValue.getDefaultValue();
            currentObject.angle = parseInt(textGradientAngleInput.value, 10) || 0;
            setPropertyAsDefaultValue(state.selectedElement, 'textColor', currentObject);
        });
    }

    // Karaoke Color Listeners (if lyrics)
    if (isLyrics) {
        const karaokeColorValue = textStyleProp.getKaraokeColor();
        const karaokeColorObject = karaokeColorValue.getDefaultValue();
        const isKaraokeColor = karaokeColorObject.mode === 'color';
        const karaokeColorCSS = isKaraokeColor ? generateCSSColor(karaokeColorObject) : generateCSSGradient(karaokeColorObject);
        const karaokeColorSwatch = propGroup.querySelector('#prop-karaoke-color');
        const karaokeGradientPreview = propGroup.querySelector('#prop-karaoke-gradient');
        const karaokeGradientTypeSelect = propGroup.querySelector('#prop-karaoke-gradient-type');
        const karaokeGradientAngleGroup = propGroup.querySelector('#prop-karaoke-gradient-angle-group');
        const karaokeGradientAngleInput = propGroup.querySelector('#prop-karaoke-gradient-angle');

        karaokeColorSwatch.addEventListener('click', () => {
            openColorPicker(karaokeColorCSS, (newColor) => {
                setPropertyAsDefaultValue(state.selectedElement, 'karaokeColor', { mode: 'color', ...parseColorString(newColor) });
                renderPropertiesPanel();
            });
        });
        karaokeGradientPreview.addEventListener('click', () => {
            const currentGradient = karaokeColorObject.mode === 'gradient' ? karaokeColorObject : { type: 'linear', angle: 90, colorStops: [{ position: 0, color: { r: 255, g: 0, b: 0, a: 1 } }, { position: 100, color: { r: 255, g: 255, b: 0, a: 1 } }] };
            const gradientForEditor = {
                type: currentGradient.type || 'linear',
                angle: currentGradient.angle,
                colorStops: (currentGradient.colorStops || []).map(cs => ({
                    color: generateCSSColor(cs.color),
                    position: cs.position,
                    midpoint: cs.midpoint
                }))
            };
            openGradientEditor(gradientForEditor, (newGradient) => {
                setPropertyAsDefaultValue(state.selectedElement, 'karaokeColor', {
                    mode: 'gradient',
                    type: newGradient.type,
                    angle: newGradient.angle,
                    colorStops: newGradient.colorStops.map(cs => ({
                        position: cs.position,
                        color: cs.color,
                        midpoint: cs.midpoint
                    }))
                });
                renderPropertiesPanel();
            });
        });
        propGroup.querySelector('#karaoke-color-tabs').querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const switchToColor = btn.dataset.tab === 'color';
                if (switchToColor !== isKaraokeColor) {
                    const newObj = switchToColor
                        ? { mode: 'color', r: 255, g: 0, b: 0, a: 1 }
                        : { mode: 'gradient', type: 'linear', angle: 90, colorStops: [{ position: 0, color: { r: 255, g: 0, b: 0, a: 1 } }, { position: 100, color: { r: 255, g: 255, b: 0, a: 1 } }] };
                    setPropertyAsDefaultValue(state.selectedElement, 'karaokeColor', newObj);
                    renderPropertiesPanel();
                }
            });
        });

        if (karaokeGradientTypeSelect) {
            karaokeGradientTypeSelect.addEventListener('input', () => {
                const newType = karaokeGradientTypeSelect.value;
                if (karaokeGradientAngleGroup) karaokeGradientAngleGroup.style.display = newType === 'linear' ? 'flex' : 'none';
                const currentObject = karaokeColorValue.getDefaultValue();
                currentObject.type = newType;
                setPropertyAsDefaultValue(state.selectedElement, 'karaokeColor', currentObject);
            });
        }

        if (karaokeGradientAngleInput) {
            karaokeGradientAngleInput.addEventListener('input', () => {
                const currentObject = karaokeColorValue.getDefaultValue();
                currentObject.angle = parseInt(karaokeGradientAngleInput.value, 10) || 0;
                setPropertyAsDefaultValue(state.selectedElement, 'karaokeColor', currentObject);
            });
        }
    }
}

// --- MODIFIED: Effects properties now use setPropertyAsDefaultValue and read from getDefaultValue ---
function buildEffectsProperties(element, isCollapsed) {
    const propGroup = document.createElement('div');
    propGroup.id = 'prop-group-effects';
    propGroup.className = `prop-group ${isCollapsed ? 'collapsed' : ''}`;
    const effectsProp = element.getProperty('effects');
    const opacityVal = effectsProp.getOpacity();
    const defaultOpacity = opacityVal.getDefaultValue();

    propGroup.innerHTML = `
        ${createPropHeader('Effects')}
        <div class="prop-group-body">
            <div class="form-group" data-prop-key="opacity">
                <label>Opacity</label>
                <div class="input-with-unit">
                    <input type="range" class="form-input" min="0" max="1" step="0.01" value="${defaultOpacity}" style="padding: 0;">
                    <input type="number" class="form-input" min="0" max="100" step="1" value="${Math.round(defaultOpacity * 100)}" style="max-width: 80px;">
                    <span class="unit-label">%</span>
                </div>
            </div>
        </div>`;
    DOM.propertiesPanelBody.appendChild(propGroup);

    checkAndSetEventControl(propGroup.querySelector('.form-group'), opacityVal);

    const slider = propGroup.querySelector('input[type="range"]');
    const numberInput = propGroup.querySelector('input[type="number"]');

    const updateOpacity = (val) => {
        setPropertyAsDefaultValue(state.selectedElement, 'opacity', val);
    };

    slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        numberInput.value = Math.round(val * 100);
        updateOpacity(val);
    });
    numberInput.addEventListener('input', () => {
        const val = Math.max(0, Math.min(100, parseInt(numberInput.value, 10) || 0)) / 100;
        slider.value = val;
        updateOpacity(val);
    });
}

function buildTransformProperties(element, isCollapsed2D, isCollapsed3D) {
    const transformProp = element.getProperty('transform');
    if (!transformProp) return;

    const isEnabled = transformProp.getEnabled().getDefaultValue();

    // --- 2D Transform Group ---
    const propGroup2D = document.createElement('div');
    propGroup2D.id = 'prop-group-transform-2d';
    propGroup2D.className = `prop-group ${isCollapsed2D ? 'collapsed' : ''}`;
    propGroup2D.innerHTML = createPropHeader('Transform 2D');
    const body2D = document.createElement('div');
    body2D.className = 'prop-group-body';
    propGroup2D.appendChild(body2D);
    DOM.propertiesPanelBody.appendChild(propGroup2D);

    const enabledGroup = document.createElement('div');
    enabledGroup.className = 'form-group';
    enabledGroup.innerHTML = `
        <div class="toggle-switch-container">
            <label for="prop-transform-enabled">Enabled</label>
            <label class="toggle-switch">
                <input type="checkbox" id="prop-transform-enabled" ${isEnabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>
    `;
    body2D.appendChild(enabledGroup);

    buildUnitValueUI(body2D, 'translateX', 'Translate X', transformProp.getTranslateX());
    buildUnitValueUI(body2D, 'translateY', 'Translate Y', transformProp.getTranslateY());
    buildNumberInputUI(body2D, 'scaleX', 'Scale X', transformProp.getScaleX(), { step: 0.01 });
    buildNumberInputUI(body2D, 'scaleY', 'Scale Y', transformProp.getScaleY(), { step: 0.01 });
    buildNumberWithStaticUnitUI(body2D, 'rotate', 'Rotate', transformProp.getRotate(), 'deg');
    buildNumberWithStaticUnitUI(body2D, 'skewX', 'Skew X', transformProp.getSkewX(), 'deg');
    buildNumberWithStaticUnitUI(body2D, 'skewY', 'Skew Y', transformProp.getSkewY(), 'deg');
    buildUnitValueUI(body2D, 'transform-origin-x', 'Origin X', transformProp.getTransformOriginX());
    buildUnitValueUI(body2D, 'transform-origin-y', 'Origin Y', transformProp.getTransformOriginY());

    // --- 3D Transform Group ---
    const propGroup3D = document.createElement('div');
    propGroup3D.id = 'prop-group-transform-3d';
    propGroup3D.className = `prop-group ${isCollapsed3D ? 'collapsed' : ''}`;
    propGroup3D.innerHTML = createPropHeader('Transform 3D');
    const body3D = document.createElement('div');
    body3D.className = 'prop-group-body';
    propGroup3D.appendChild(body3D);
    DOM.propertiesPanelBody.appendChild(propGroup3D);

    buildUnitValueUI(body3D, 'translateZ', 'Translate Z', transformProp.getTranslateZ());
    buildNumberInputUI(body3D, 'scaleZ', 'Scale Z', transformProp.getScaleZ(), { step: 0.01 });
    buildNumberWithStaticUnitUI(body3D, 'rotateX', 'Rotate X', transformProp.getRotateX(), 'deg');
    buildNumberWithStaticUnitUI(body3D, 'rotateY', 'Rotate Y', transformProp.getRotateY(), 'deg');
    buildNumberWithStaticUnitUI(body3D, 'rotateZ', 'Rotate Z', transformProp.getRotateZ(), 'deg');
    buildUnitValueUI(body3D, 'transform-origin-z', 'Origin Z', transformProp.getTransformOriginZ());
    buildUnitValueUI(body3D, 'selfPerspective', 'Self-perspective', transformProp.getSelfPerspective());
    buildUnitValueUI(body3D, 'childrenPerspective', 'Children Perspective', transformProp.getChildrenPerspective());
    buildSelectUI(body3D, 'transform-style', 'Transform Style', transformProp.getTransformStyle(), [
        { value: 'flat', label: 'Flat' },
        { value: 'preserve-3d', label: 'Preserve 3D' }
    ]);
    buildSelectUI(body3D, 'backface-visibility', 'Backface Visibility', transformProp.getBackfaceVisibility(), [
        { value: 'visible', label: 'Visible' },
        { value: 'hidden', label: 'Hidden' }
    ]);

    propGroup2D.querySelector('#prop-transform-enabled').addEventListener('change', (e) => {
        setPropertyAsDefaultValue(state.selectedElement, 'transformEnabled', e.target.checked);
        renderPropertiesPanel();
    });

    if (!isEnabled) {
        [...body2D.children, ...body3D.children].forEach(child => {
            if (child !== enabledGroup) {
                child.querySelectorAll('input, select').forEach(el => el.disabled = true);
                child.classList.add('is-disabled');
            }
        });
    }
}

/**
 * Main function to build the entire properties panel for a given element.
 * @param {VirtualElement} [element=state.selectedElement] The selected virtual element.
 */
export function renderPropertiesPanel(element = state.selectedElement) {
    DOM.propertiesPanelBody.innerHTML = '';
    if (!element) {
        DOM.propertiesPanelTitle.textContent = 'Properties';
        return;
    }

    const elementId = element.id;
    const elementType = element.type;
    const defaultName = element.getProperty('name')?.name || 'Element';
    DOM.propertiesPanelTitle.textContent = defaultName;

    // Read the collapsed state for the current element
    const collapsedGroups = state.ui.propertiesPanelState.collapsedGroupsByElementId[elementId] || {};

    const isCollapsed = (groupId) => {
        const savedState = collapsedGroups[groupId];
        if (savedState !== undefined) {
            return savedState; // Use saved state if it exists
        }

        // Default to expand 'Name' property
        if (groupId === 'prop-group-name') {
            return false;
        }

        // Element-specific defaults
        switch (elementType) {
            case 'page':
                if (groupId === 'prop-group-bgcolor') return false;
                break;
            case 'container':
            case 'vcontainer':
            case 'hcontainer':
            case 'acontainer':
                if (groupId === 'prop-group-alignment') return false;
                break;
            case 'lyrics':
                if (groupId === 'prop-group-lyrics') return false;
                break;
            case 'orchestra':
                if (groupId === 'prop-group-orchestra') return false;
                break;
            case 'title':
            case 'text':
                if (groupId === 'prop-group-content') return false;
                break;
            case 'image':
                if (groupId === 'prop-group-imagesrc') return false;
                break;
            case 'video':
                if (groupId === 'prop-group-videosrc') return false;
                break;
            case 'audio':
                if (groupId === 'prop-group-audiosrc') return false;
                break;
            case 'smart-effect':
                if (groupId === 'prop-group-smart-effect-src') return false;
                break;
        }

        // Collapse all other properties by default
        return true;
    };

    const isPage = element.type === 'page';

    // Build UI for each property group, passing in its collapsed state
    if (element.getProperty('name')) buildNameProperty(element, isCollapsed('prop-group-name'));

    if (element.getProperty('src')) {
        if (elementType === 'smart-effect') {
            buildSmartEffectSrcProperty(element, isCollapsed('prop-group-smart-effect-src'));
        } else if (elementType === 'image') {
            buildImageSrcProperty(element, isCollapsed('prop-group-imagesrc'));
        } else if (elementType === 'video') {
            buildVideoSrcProperty(element, isCollapsed('prop-group-videosrc'));
        } else if (elementType === 'audio') {
            buildAudioSrcProperty(element, isCollapsed('prop-group-audiosrc'));
        }
    }

    if (elementType === 'image' && element.getProperty('objectFit')) {
        buildObjectFitProperty(element, isCollapsed('prop-group-objectfit'));
    }

    if (elementType === 'video') {
        if (element.getProperty('playback')) buildVideoPlaybackProperties(element, isCollapsed('prop-group-videoplayback'));
        if (element.getProperty('objectFit')) buildObjectFitProperty(element, isCollapsed('prop-group-objectfit'));
    }

    if (elementType === 'audio') {
        if (element.getProperty('playback')) buildAudioPlaybackProperties(element, isCollapsed('prop-group-audioplayback'));
    }

    if (element.getProperty('textContent')) buildContentProperty(element, isCollapsed('prop-group-content'));
    if (element.getProperty('lyricsContent')) buildLyricsProperties(element, isCollapsed('prop-group-lyrics'));
    if (element.getProperty('orchestraContent')) buildOrchestraProperties(element, isCollapsed('prop-group-orchestra'));

    if (element.getProperty('textStyle')) buildTextStyleProperties(element, isCollapsed('prop-group-textstyle'));
    if (element.getProperty('progress')) buildProgressProperties(element, isCollapsed('prop-group-progress'));

    if (!isPage && element.getProperty('dimensions')) buildDimensionProperties(element, isCollapsed('prop-group-dimensions'));
    if (!isPage && element.getProperty('alignment')) buildAlignmentProperties(element, isCollapsed('prop-group-alignment'));
    if (!isPage && element.getProperty('margin')) buildMarginProperties(element, isCollapsed('prop-group-margin'));
    if (!isPage && element.getProperty('inner_padding')) buildInnerPaddingProperties(element, isCollapsed('prop-group-inner_padding'));
    if (element.getProperty('background')) buildBackgroundColorProperty(element, isCollapsed('prop-group-bgcolor'));
    if (!isPage && element.getProperty('border')) buildBorderProperties(element, isCollapsed('prop-group-border'));
    if (!isPage && element.getProperty('boxShadow')) buildBoxShadowProperties(element, isCollapsed('prop-group-boxshadow'));
    if (!isPage && element.getProperty('effects')) buildEffectsProperties(element, isCollapsed('prop-group-effects'));
    if (!isPage && element.getProperty('transform')) buildTransformProperties(element, isCollapsed('prop-group-transform-2d'), isCollapsed('prop-group-transform-3d'));

    // Restore scroll position after the DOM has been updated
    requestAnimationFrame(() => {
        if (DOM.propertiesPanelBody) {
            const savedScroll = state.ui.propertiesPanelState.scrollPositionByElementId[elementId] || 0;
            DOM.propertiesPanelBody.scrollTop = savedScroll;
        }
    });
}