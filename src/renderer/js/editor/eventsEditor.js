// src/renderer/js/editor/eventsEditor.js

import { state, updateState } from './state.js';
import {
    getNoteIconHTML, getAvailablePropertiesForElement, lerp, lerpColor, findMusicElementsRecursively, getPropertyType,
    findVirtualElementById, getElementMeasuresStructure, getPageMeasuresStructure, getSongMeasuresStructure
} from './utils.js';
import { DOM } from './dom.js';
import { openPropertiesDialog } from './propertiesDialog.js';
import { openPropertyValueEditor } from "./propertyValueEditor.js";
import { openEasingEditor } from './easingEditor.js';
import { generateUUID } from "../renderer/utils.js";
import { generateCSSGradient } from "../renderer/utils.js";
import { markAsDirty } from './events.js';
import { makeDraggable } from './draggable.js';

// --- START: NEW CACHE AND STATE MANAGEMENT ---
/**
 * A cache to store the detailed state of the events editor for each element.
 * This allows the editor to remember its state without polluting the renderer elements.
 * @type {Map<string, object>}
 */
let editorDataCache = new Map();

/**
 * Clears the events editor cache. Should be called when a project is closed or reloaded.
 */
export function clearEventsEditorCache() {
    editorDataCache.clear();
}
// --- END: NEW CACHE AND STATE MANAGEMENT ---

/**
 * Helper to find the page an element belongs to.
 * @param {VirtualElement} element
 * @returns {VirtualPage|null}
 */
function findElementPage(element) {
    if (!element) return null;
    let parent = element.parent;
    while (parent) {
        if (parent.type === 'page') {
            return parent;
        }
        parent = parent.parent;
    }
    return null;
}


// --- Constants and Helpers ---
const NOTE_DURATIONS = {
    w_note: 1.0, h_note: 0.5, q_note: 0.25, e_note: 0.125, s_note: 0.0625,
    w_note_dotted: 1.5, h_note_dotted: 0.75, q_note_dotted: 0.375, e_note_dotted: 0.1875,
};

const PROP_KEY_TO_DATASET_MAP = {
    opacity: 'opacity', width: 'width', height: 'height', top: 'top', left: 'left', right: 'right', bottom: 'bottom',
    bgEnabled: 'bgEnabled',
    bgColor: 'bgColor',
    bgOpacity: 'bgOpacity',
    borderEnabled: 'borderEnabled',
    borderSize: 'borderSize', borderRadius: 'borderRadius', borderColor: 'borderColor', 
    shadowEnabled: 'shadowEnabled',
    shadowInset: 'shadowInset',
    shadowOffsetX: 'shadowOffsetX', shadowOffsetY: 'shadowOffsetY', shadowBlur: 'shadowBlur', shadowSpread: 'shadowSpread', shadowColor: 'shadowColor',
    paddingTop: 'paddingTop', paddingLeft: 'paddingLeft', paddingBottom: 'paddingBottom', paddingRight: 'paddingRight',
    fontSize: 'fontSize', textColor: 'textColor', lineHeight: 'lineHeight', letterSpacing: 'letterSpacing', wordSpacing: 'wordSpacing',
    textStrokeEnabled: 'textStrokeEnabled',
    textStrokeOutside: 'textStrokeOutside',
    textStrokeColor: 'textStrokeColor', textStrokeWidth: 'textStrokeWidth',
    textShadowEnabled: 'textShadowEnabled',
    textShadowColor: 'textShadowColor', textShadowOffsetX: 'textShadowOffsetX', textShadowOffsetY: 'textShadowOffsetY', textShadowBlur: 'textShadowBlur'
};


// --- START: NEW AND REVISED HELPER FUNCTIONS ---

/**
 * Checks if a transition between two property values is instant (non-interpolatable).
 */
function isInstantTransition(startValue, endValue, propKey) {
    const propType = getPropertyType(propKey, eventsState.virtualElement);

    if (propType === 'boolean') return true;

    // Specifically check for state properties which cannot be interpolated
    if (propKey === 'videoState' || propKey === 'audioState') return true;

    if (propType === 'size' && startValue?.unit !== endValue?.unit) return true;

    if (propType === 'color/gradient') {
        const sVal = (startValue?.type && startValue.hasOwnProperty('value')) ? startValue.value : startValue;
        const eVal = (endValue?.type && endValue.hasOwnProperty('value')) ? endValue.value : endValue;
        const sIsString = typeof sVal === 'string';
        const eIsString = typeof eVal === 'string';

        // Allow interpolation between a color and a gradient.
        if (sIsString || eIsString) return false;

        // If both are gradient objects, check for compatibility.
        if (typeof sVal === 'object' && typeof eVal === 'object') {
            const startType = sVal.type;
            const endType = eVal.type;
            if (startType !== endType) return true;
            if (sVal.colorStops?.length !== eVal.colorStops?.length) return true;
        }
    }

    return false;
}

/**
 * Gets the color of a gradient at a specific position, interpolating if necessary.
 */
function getColorAtPosition(gradient, position) {
    const stops = gradient.colorStops.slice().sort((a, b) => a.position - b.position);

    // Find exact match or bounding stops
    for (let i = 0; i < stops.length; i++) {
        if (stops[i].position === position) {
            return stops[i].color;
        }
        if (stops[i].position > position) {
            // We are between stop i-1 and stop i
            if (i === 0) {
                return stops[0].color; // Before the first stop
            }
            const before = stops[i - 1];
            const after = stops[i];
            const range = after.position - before.position;
            if (range === 0) {
                return before.color;
            }
            const t = (position - before.position) / range;
            return lerpColor(before.color, after.color, t);
        }
    }
    // If position is after the last stop
    return stops.length > 0 ? stops[stops.length - 1].color : { r:0, g:0, b:0, a:1 };
}

/**
 * REVISED: Interpolates between two gradient objects, handling different data structures.
 */
function lerpGradient(gradA, gradB, t) {
    const adapt = (grad) => {
        // Handle solid color objects by adapting them into a two-stop gradient.
        if (typeof grad === 'object' && grad !== null && grad.hasOwnProperty('r') && !grad.hasOwnProperty('colorStops')) {
            return { type: 'linear', colorStops: [{ color: grad, position: 0 }, { color: grad, position: 100 }] };
        }

        if (typeof grad === 'string') {
            return { type: 'linear', colorStops: [{ color: grad, position: 0 }, { color: grad, position: 100 }] };
        }
        if (!grad || typeof grad !== 'object') return null;
        if (grad.type && grad.hasOwnProperty('value')) grad = grad.value;
        if (!grad || typeof grad !== 'object') return null;

        return {
            ...grad,
            type: grad.type || 'linear',
            colorStops: (grad.colorStops || []).map(c => ({
                color: c.color,
                position: c.position,
                midpoint: c.midpoint
            }))
        };
    };

    let adaptedA = adapt(gradA);
    let adaptedB = adapt(gradB);

    if (!adaptedA || !adaptedB) return gradA;

    // Handle color-to-gradient and gradient-to-color transitions by adapting the structure
    if (typeof (gradA?.value ?? gradA) === 'string' && typeof (gradB?.value ?? gradB) === 'object') {
        adaptedA = structuredClone(adaptedB);
        adaptedA.colorStops.forEach(stop => stop.color = (gradA?.value ?? gradA));
    } else if (typeof (gradA?.value ?? gradA) === 'object' && typeof (gradB?.value ?? gradB) === 'string') {
        adaptedB = structuredClone(adaptedA);
        adaptedB.colorStops.forEach(stop => stop.color = (gradB?.value ?? gradB));
    }

    // If types match but stop counts differ, resample the simpler gradient to match the more complex one.
    if (adaptedA && adaptedB && adaptedA.type === adaptedB.type && adaptedA.colorStops.length > 0 && adaptedB.colorStops.length > 0 && adaptedA.colorStops.length !== adaptedB.colorStops.length) {
        let source = adaptedA.colorStops.length > adaptedB.colorStops.length ? adaptedA : adaptedB;
        let target = adaptedA.colorStops.length > adaptedB.colorStops.length ? adaptedB : adaptedA;

        // Create new stops for the target by sampling its color at the source's positions.
        const newTargetStops = source.colorStops.map(sourceStop => {
            return {
                color: getColorAtPosition(target, sourceStop.position),
                position: sourceStop.position,
                // Midpoints cannot be accurately generated in this case, so we omit them.
            };
        });
        target.colorStops = newTargetStops;
    }

    if (adaptedA.type !== adaptedB.type || adaptedA.colorStops.length !== adaptedB.colorStops.length || adaptedA.colorStops.length === 0) {
        return gradA; // Now only fails on type mismatch, returning start value.
    }

    const result = { ...adaptedA, colorStops: [] };

    if (result.type === 'linear') {
        result.angle = lerp(adaptedA.angle ?? 90, adaptedB.angle ?? 90, t);
    } else if (result.type === 'radial') {
        result.scale = lerp(adaptedA.scale ?? 100, adaptedB.scale ?? 100, t);
    }

    for (let i = 0; i < adaptedA.colorStops.length; i++) {
        const stopA = adaptedA.colorStops[i];
        const stopB = adaptedB.colorStops[i];
        const newStop = {
            color: lerpColor(stopA.color, stopB.color, t),
            position: lerp(stopA.position, stopB.position, t),
        };
        if (stopA.midpoint !== undefined && stopB.midpoint !== undefined) {
            newStop.midpoint = lerp(stopA.midpoint, stopB.midpoint, t);
        }
        result.colorStops.push(newStop);
    }

    // If the result of the interpolation is a simple two-stop gradient of the same color,
    // simplify the data structure back to a single color object.
    if (result.colorStops.length === 2 &&
        JSON.stringify(result.colorStops[0].color) === JSON.stringify(result.colorStops[1].color)) {
        return result.colorStops[0].color;
    }

    return result;
}

/**
 * Interpolates between two size objects (e.g., {value: 10, unit: 'px'}).
 * Note: Only interpolates if units are identical for simplicity.
 */
function lerpSize(sizeA, sizeB, t) {
    if (!sizeA || !sizeB) return sizeA;
    if (sizeA.unit !== sizeB.unit) {
        return sizeA; // Return the start value if units mismatch
    }
    return {
        value: lerp(parseFloat(sizeA.value), parseFloat(sizeB.value), t),
        unit: sizeA.unit
    };
}

/**
 * Calculates the musical start time of a note within a flat array of notes.
 */
function getNoteStartTime(noteIndex, flatNotes) {
    let time = 0;
    for (let i = 0; i < noteIndex; i++) {
        time += NOTE_DURATIONS[flatNotes[i].type] || 0;
    }
    return time;
}


/**
 * Safely gets a property's root value from the VirtualElement's property objects.
 * This is used as the fallback "Starting Value" in the Events Editor when no keyframe exists.
 */
function getRootPropertyValue(virtualElement, propKey) {
    if (!virtualElement) {
        console.error(`[Events Editor] getRootPropertyValue: virtualElement is null for key: ${propKey}`);
        return null;
    }

    // Special handling for SmartEffect parameters
    if (virtualElement.type === 'smart-effect') {
        const dataProp = virtualElement.getProperty('src')?.getEffectData();
        return dataProp?.effectData?.parameterValues?.[propKey] ?? null;
    }

    // Map the UI Event Key (propKey) to the structured property system
    switch (propKey) {
        // --- Effects ---
        case 'opacity':
            return virtualElement.getProperty('effects')?.getOpacity().getDefaultValue();
        case 'mixBlendMode':
            return virtualElement.getProperty('effects')?.getMixBlendMode().getDefaultValue();

        // --- Dimensions ---
        case 'width':
            return virtualElement.getProperty('dimensions')?.getWidth().getDefaultValue();
        case 'height':
            return virtualElement.getProperty('dimensions')?.getHeight().getDefaultValue();

        // --- Margin ---
        case 'top':
            return virtualElement.getProperty('margin')?.getTop().getDefaultValue();
        case 'left':
            return virtualElement.getProperty('margin')?.getLeft().getDefaultValue();
        case 'bottom':
            return virtualElement.getProperty('margin')?.getBottom().getDefaultValue();
        case 'right':
            return virtualElement.getProperty('margin')?.getRight().getDefaultValue();

        // --- Background ---
        case 'bgEnabled':
            return virtualElement.getProperty('background')?.getEnabled().getDefaultValue();
        case 'bgColor':
            return virtualElement.getProperty('background')?.getBackground().getDefaultValue();

        // --- Border ---
        case 'borderEnabled':
            return virtualElement.getProperty('border')?.getEnabled().getDefaultValue();
        case 'borderSize':
            return virtualElement.getProperty('border')?.getWidth().getDefaultValue();
        case 'borderRadius':
            return virtualElement.getProperty('border')?.getRadius().getDefaultValue();
        case 'borderColor':
            return virtualElement.getProperty('border')?.getColor().getDefaultValue();

        // --- Box Shadow ---
        case 'shadowEnabled':
            return virtualElement.getProperty('boxShadow')?.getEnabled().getDefaultValue();
        case 'shadowInset':
            return virtualElement.getProperty('boxShadow')?.getInset().getDefaultValue();
        case 'shadowAngle':
            return virtualElement.getProperty('boxShadow')?.getShadowAngle().getDefaultValue();
        case 'shadowDistance':
            return virtualElement.getProperty('boxShadow')?.getShadowDistance().getDefaultValue();
        case 'shadowBlur': // Maps shadowBlur to the internal 'blur' value
            return virtualElement.getProperty('boxShadow')?.getBlur().getDefaultValue();
        case 'shadowSpread': // Maps shadowSpread to the internal 'spread' value
            return virtualElement.getProperty('boxShadow')?.getSpread().getDefaultValue();
        case 'shadowColor': // Maps shadowColor to the internal 'color' value
            return virtualElement.getProperty('boxShadow')?.getColor().getDefaultValue();

        // --- Inner Padding ---
        case 'paddingTop':
            return virtualElement.getProperty('inner_padding')?.getTop().getDefaultValue();
        case 'paddingLeft':
            return virtualElement.getProperty('inner_padding')?.getLeft().getDefaultValue();
        case 'paddingBottom':
            return virtualElement.getProperty('inner_padding')?.getBottom().getDefaultValue();
        case 'paddingRight':
            return virtualElement.getProperty('inner_padding')?.getRight().getDefaultValue();

        // --- Text Style ---
        case 'fontSize':
            return virtualElement.getProperty('textStyle')?.getFontSize().getDefaultValue();
        case 'textColor':
            return virtualElement.getProperty('textStyle')?.getTextColor().getDefaultValue();
        case 'lineHeight':
            return virtualElement.getProperty('textStyle')?.getLineHeight().getDefaultValue();
        case 'letterSpacing':
            return virtualElement.getProperty('textStyle')?.getLetterSpacing().getDefaultValue();
        case 'wordSpacing':
            return virtualElement.getProperty('textStyle')?.getWordSpacing().getDefaultValue();
        case 'karaokeColor':
            return virtualElement.getProperty('textStyle')?.getKaraokeColor()?.getDefaultValue();
        case 'fontFamily':
            return virtualElement.getProperty('textStyle')?.getFontFamily().getDefaultValue();
        case 'fontWeight':
            return virtualElement.getProperty('textStyle')?.getFontWeight().getDefaultValue();
        case 'fontStyle':
            return virtualElement.getProperty('textStyle')?.getFontStyle().getDefaultValue();
        case 'textAlign':
            return virtualElement.getProperty('textStyle')?.getTextAlign().getDefaultValue();
        case 'justifyText':
            return virtualElement.getProperty('textStyle')?.getJustifyText().getDefaultValue();

        // --- Text Shadow ---
        case 'textShadowEnabled':
            return virtualElement.getProperty('textShadow')?.getEnabled().getDefaultValue();
        case 'textShadowAngle':
            return virtualElement.getProperty('textShadow')?.getTextShadowAngle().getDefaultValue();
        case 'textShadowDistance':
            return virtualElement.getProperty('textShadow')?.getTextShadowDistance().getDefaultValue();
        case 'textShadowBlur': // Maps textShadowBlur to the internal 'blur' value
            return virtualElement.getProperty('textShadow')?.getBlur().getDefaultValue();
        case 'textShadowColor': // Maps textShadowColor to the internal 'color' value
            return virtualElement.getProperty('textShadow')?.getColor().getDefaultValue();

        // --- Video & Audio Playback ---
        case 'videoState':
            return virtualElement.getProperty('playback')?.getState().getDefaultValue()?.value;
        case 'videoSpeed':
            return virtualElement.getProperty('playback')?.getSpeed().getDefaultValue();
        case 'videoLoop':
            return virtualElement.getProperty('playback')?.getLoop().getDefaultValue();
        case 'audioState':
            return virtualElement.getProperty('playback')?.getState().getDefaultValue()?.value;
        case 'audioVolume':
            return virtualElement.getProperty('playback')?.getVolume().getDefaultValue();
        case 'audioLoop':
            return virtualElement.getProperty('playback')?.getLoop().getDefaultValue();

        // --- Orchestra Progress Bar ---
        case 'progressBgColor':
            return virtualElement.getProperty('progress')?.getBackgroundColor().getDefaultValue();
        case 'progressFillColor':
            return virtualElement.getProperty('progress')?.getFillColor().getDefaultValue();

        // --- Image/Video ---
        case 'objectFit':
            return virtualElement.getProperty('objectFit')?.getObjectFit().getDefaultValue();
            
        // --- ADDED: Object Position ---
        case 'objectPositionX':
            return virtualElement.getProperty('objectPosition')?.getX().getDefaultValue();
        case 'objectPositionY':
            return virtualElement.getProperty('objectPosition')?.getY().getDefaultValue();

        // --- Layout/Gravity ---
        case 'gap':
            return virtualElement.getProperty('gap')?.getGap().getDefaultValue();
        case 'justifyContent':
            return virtualElement.getProperty('gravity')?.getJustifyContent().getDefaultValue();
        case 'alignItems':
            return virtualElement.getProperty('gravity')?.getAlignItems().getDefaultValue();
        case 'alignment':
            return virtualElement.getProperty('alignment')?.getAlignment().getDefaultValue();

        // --- Transform ---
        case 'translateX':
            return virtualElement.getProperty('transform')?.getTranslateX().getDefaultValue();
        case 'translateY':
            return virtualElement.getProperty('transform')?.getTranslateY().getDefaultValue();
        case 'translateZ':
            return virtualElement.getProperty('transform')?.getTranslateZ().getDefaultValue();
        case 'scaleX':
            return virtualElement.getProperty('transform')?.getScaleX().getDefaultValue();
        case 'scaleY':
            return virtualElement.getProperty('transform')?.getScaleY().getDefaultValue();
        case 'scaleZ':
            return virtualElement.getProperty('transform')?.getScaleZ().getDefaultValue();
        case 'rotate':
            return virtualElement.getProperty('transform')?.getRotate().getDefaultValue();
        case 'rotateX':
            return virtualElement.getProperty('transform')?.getRotateX().getDefaultValue();
        case 'rotateY':
            return virtualElement.getProperty('transform')?.getRotateY().getDefaultValue();
        case 'rotateZ':
            return virtualElement.getProperty('transform')?.getRotateZ().getDefaultValue();
        case 'skewX':
            return virtualElement.getProperty('transform')?.getSkewX().getDefaultValue();
        case 'skewY':
            return virtualElement.getProperty('transform')?.getSkewY().getDefaultValue();
        case 'transform-origin-x':
            return virtualElement.getProperty('transform')?.getTransformOriginX().getDefaultValue();
        case 'transform-origin-y':
            return virtualElement.getProperty('transform')?.getTransformOriginY().getDefaultValue();
        case 'transform-origin-z':
            return virtualElement.getProperty('transform')?.getTransformOriginZ().getDefaultValue();
        case 'selfPerspective':
            return virtualElement.getProperty('transform')?.getSelfPerspective().getDefaultValue();
        case 'childrenPerspective':
            return virtualElement.getProperty('transform')?.getChildrenPerspective().getDefaultValue();
        case 'backface-visibility':
            return virtualElement.getProperty('transform')?.getBackfaceVisibility().getDefaultValue();
        case 'transform-style':
            return virtualElement.getProperty('transform')?.getTransformStyle().getDefaultValue();
            
        // --- Page Properties ---
        case 'parentPerspectiveEnabled':
             return virtualElement.getProperty('parentPerspective')?.getEnabled().getDefaultValue();
        case 'perspective':
             return virtualElement.getProperty('parentPerspective')?.getPerspective().getDefaultValue();
        case 'parent-transform-style':
             return virtualElement.getProperty('parentPerspective')?.getTransformStyle().getDefaultValue();
        case 'parent-rotateX':
             return virtualElement.getProperty('parentPerspective')?.getRotateX().getDefaultValue();
        case 'parent-rotateY':
             return virtualElement.getProperty('parentPerspective')?.getRotateY().getDefaultValue();
        case 'parent-rotateZ':
             return virtualElement.getProperty('parentPerspective')?.getRotateZ().getDefaultValue();
        case 'parent-scale':
             return virtualElement.getProperty('parentPerspective')?.getScale().getDefaultValue();
        case 'perspectiveScaleDirection':
             return virtualElement.getProperty('perspectiveScale')?.getDirection().getDefaultValue();
             
        case 'visible':
             return virtualElement.getProperty('visible')?.getVisible().getDefaultValue();

        default:
            console.warn(`[Events Editor] getRootPropertyValue not implemented for UI key: ${propKey}`);
            return null;
    }
}

/**
 * Gets the value of a property for a specific note for the purpose of editing.
 */
function getValueForEditing(noteId, propKey) {
    const flatNotes = eventsState.measures.flatMap(m => m.content || []);
    const currentNoteIndex = flatNotes.findIndex(n => n.id === noteId);
    if (currentNoteIndex === -1) return null;

    // Search backwards from the current note to find the last keyframe.
    for (let i = currentNoteIndex; i >= 0; i--) {
        const note = flatNotes[i];
        if (note.events.enabled && note.events.values.hasOwnProperty(propKey)) {
            return note.events.values[propKey];
        }
    }

    // If no keyframe is found in the history, get the root default value.
    return getRootPropertyValue(eventsState.virtualElement, propKey);
}


// --- END: NEW AND REVISED HELPER FUNCTIONS ---

function getMeasureCapacity(timeSignature) {
    try {
        const {numerator, denominator} = timeSignature;
        return numerator * (1.0 / denominator);
    } catch (e) { return 1.0; }
}


// --- Module State ---
let eventsState = {
    elementId: null,
    virtualElement: null,
    measures: [],
    selectedNoteId: null,
    globalMeasureOffset: 0,
    selectedProperties: [],
    elementPageIndex: -1, 
};
let eventsEditorDialog, measuresContainer, toolPalette, deleteNoteBtn, dotBtn, sNoteBtn;
let draggedNoteType = null;
let eventsMeasureClipboard = null;

// --- Easing Functions ---
const EASING_FUNCTIONS = {
    linear: t => t,
    fast: t => t * t, 
    slow: t => t * (2 - t),
    instant: t => (t < 1 ? 0 : 1),
};

function getEffectivePropertyValue(noteId, propKey) {
    const propType = getPropertyType(propKey, eventsState.virtualElement);

    if (propType === 'boolean') {
        const flatNotesSimple = eventsState.measures.flatMap(m => m.content || []);
        const currentNoteIndexSimple = flatNotesSimple.findIndex(n => n.id === noteId);

        for (let i = currentNoteIndexSimple; i >= 0; i--) {
            const note = flatNotesSimple[i];
            if (note.events.enabled && note.events.values[propKey] !== undefined) {
                return note.events.values[propKey];
            }
        }
        return getRootPropertyValue(eventsState.virtualElement, propKey);
    }

    const flatNotes = eventsState.measures.flatMap(m => m.content || []);
    const currentNoteIndex = flatNotes.findIndex(n => n.id === noteId);
    const currentNote = flatNotes[currentNoteIndex];

    if (currentNote.events.enabled && currentNote.events.values[propKey] !== undefined) {
        return currentNote.events.values[propKey];
    }

    let startKeyframe = { index: -1, value: null };
    let endKeyframe = { index: -1, value: null };

    for (let i = currentNoteIndex - 1; i >= 0; i--) {
        const note = flatNotes[i];
        if (note.events.enabled && note.events.values[propKey] !== undefined) {
            startKeyframe = { index: i, value: note.events.values[propKey] };
            break;
        }
    }

    if (startKeyframe.index === -1) {
        startKeyframe.value = getRootPropertyValue(eventsState.virtualElement, propKey);
    }

    for (let i = currentNoteIndex + 1; i < flatNotes.length; i++) {
        const note = flatNotes[i];
        if (note.events.enabled && note.events.values[propKey] !== undefined) {
            endKeyframe = { index: i, value: note.events.values[propKey] };
            break;
        }
    }

    if (endKeyframe.index === -1) {
        return startKeyframe.value;
    }

    if (isInstantTransition(startKeyframe.value, endKeyframe.value, propKey)) {
        return startKeyframe.value;
    }

    const startNoteIndex = startKeyframe.index;
    const endNoteIndex = endKeyframe.index;

    const startTimeOfAnimation = (startNoteIndex === -1) ? 0 : getNoteStartTime(startNoteIndex, flatNotes);
    const endTimeOfAnimation = getNoteStartTime(endNoteIndex, flatNotes);
    const currentTime = getNoteStartTime(currentNoteIndex, flatNotes);

    const totalDuration = endTimeOfAnimation - startTimeOfAnimation;
    const progressDuration = currentTime - startTimeOfAnimation;

    if (totalDuration <= 0) {
        return startKeyframe.value;
    }

    const t = Math.max(0, Math.min(1, progressDuration / totalDuration));

    const endNoteForEasing = flatNotes[endKeyframe.index];
    const easingKey = `${propKey}_easing`;
    const easingType = endNoteForEasing.events.values[easingKey] || 'linear';
    const easingFunction = EASING_FUNCTIONS[easingType] || EASING_FUNCTIONS.linear;
    const easedT = easingFunction(t);

    const startValue = startKeyframe.value;
    const endValue = endKeyframe.value;

    switch (propType) {
        case 'number':
            return lerp(parseFloat(startValue), parseFloat(endValue), easedT);
        case 'size':
            return lerpSize(startValue, endValue, easedT);
        case 'color/gradient':
            // This case handles all color and gradient types, including mixes.
            if ((typeof startValue === 'object' || typeof startValue === 'string') &&
                (typeof endValue === 'object' || typeof endValue === 'string') &&
                startValue !== null && endValue !== null) {
                return lerpGradient(startValue, endValue, easedT);
            }
            return startValue; // Fallback
        default:
            return startKeyframe.value;
    }
}


function getFormattedValuePreview(propKey, value, isOverridden) {
    const overrideClass = isOverridden ? 'is-overridden' : '';
    let innerHTML;

    const isSmartEffectValue = typeof value === 'object' && value !== null && value.hasOwnProperty('type') && value.hasOwnProperty('value');
    const displayValue = isSmartEffectValue ? value.value : value;

    const propType = getPropertyType(propKey, eventsState.virtualElement);

    if (value === undefined || value === null) {
        innerHTML = `<i>(not set)</i>`;
    } else if (propType === 'boolean') {
        innerHTML = `<span>${(value === true || value === 'true') ? 'On' : 'Off'}</span>`;
    } else if (propType === 'color/gradient') {
        let finalColor;
        if (displayValue && displayValue.r !== undefined && displayValue.g !== undefined && displayValue.b !== undefined) {
            // Solid color
            finalColor = `rgba(${displayValue.r}, ${displayValue.g}, ${displayValue.b}, ${displayValue.a !== undefined ? displayValue.a : 1})`;
        } else {
            // Gradient
            const adaptGradientForCSS = (grad) => {
                if (!grad || typeof grad !== 'object') return grad;
                return {
                    type: grad.type || 'linear',
                    angle: grad.angle,
                    scale: grad.scale,
                    colorStops: (grad.colorStops || []).map(c => ({
                        color: c.color,
                        position: c.position,
                        midpoint: c.midpoint
                    }))
                };
            };
            const adaptedGradient = adaptGradientForCSS(displayValue);
            finalColor = generateCSSGradient(adaptedGradient);
        }
        innerHTML = `<div class="value-preview-color-swatch" style="background: ${finalColor};"></div>`;
    } else if (propType === 'size') {
        innerHTML = `<span>${displayValue.value || 0} ${displayValue.unit || 'px'}</span>`;
    } else if (propType === 'number') {
        if (propKey.toLowerCase().includes('opacity')) {
            innerHTML = `<span>${Math.round(displayValue * 100)}%</span>`;
        } else {
            innerHTML = `<span>${displayValue}</span>`;
        }
    } else if (propType === 'alignment') {
        let iconSrc = '';
        switch(displayValue) {
            case 'vertical': iconSrc = '../../icons/vcontainer.svg'; break;
            case 'horizontal': iconSrc = '../../icons/hcontainer.svg'; break;
            case 'absolute': iconSrc = '../../icons/acontainer.svg'; break;
        }
        innerHTML = `<img src="${iconSrc}" class="value-preview-icon" style="height: 100%;">`;
    } else if (propType === 'textAlign') {
        let iconSrc = '';
        switch(displayValue) {
            case 'left': iconSrc = '../../icons/left_alignment.svg'; break;
            case 'center': iconSrc = '../../icons/center_alignment.svg'; break;
            case 'right': iconSrc = '../../icons/right_alignment.svg'; break;
        }
        innerHTML = `<img src="${iconSrc}" class="value-preview-icon" style="height: 100%;">`;
    } else if (['fontFamily', 'fontWeight', 'fontStyle', 'objectFit', 'string', 'justifyContent', 'alignItems', 'dynamic-string', 'objectPositionX', 'objectPositionY'].includes(propType)) {
        let text = String(displayValue);
        if (text.length > 10) {
            text = text.substring(0, 7) + '...';
        }
        innerHTML = `<span title="${displayValue}">${text}</span>`;
    } else {
        innerHTML = `<span>...</span>`;
    }

    return `<div class="note-event-value-preview ${overrideClass}" data-prop-key="${propKey}">${innerHTML}</div>`;
}


function renderNoteEvents(noteEl, note) {
    const container = noteEl.querySelector('.note-events-container');
    if (!note.events.enabled || !container) {
        if (container) container.innerHTML = '';
        return;
    }

    const selectedProps = eventsState.selectedProperties;

    if (selectedProps.length === 0) {
        container.innerHTML = '<div class="note-events-placeholder">No properties selected.</div>';
        return;
    }

    container.style.display = 'grid';
    const allAvailableProps = getAvailablePropertiesForElement(eventsState.virtualElement.domElement);

    const findPropDetails = (propKey) => {
        for (const [groupName, props] of Object.entries(allAvailableProps)) {
            if (props[propKey]) {
                return { groupName, propName: props[propKey] };
            }
        }
        return { groupName: 'Unknown', propName: propKey };
    };

    let html = '';

    selectedProps.forEach(propKey => {
        const { groupName, propName } = findPropDetails(propKey);
        const valueToDisplay = getValueForEditing(note.id, propKey);
        const isOverridden = note.events.values.hasOwnProperty(propKey);

        html += `
            <div class="note-event-prop-label" data-prop-key="${propKey}">
                <span class="prop-group-name">${groupName}</span>
                <span class="prop-name">${propName}:</span>
            </div>
            ${getFormattedValuePreview(propKey, valueToDisplay, isOverridden)}
        `;
    });
    container.innerHTML = html;
}

function renderMeasureContent(measureBox, measure) {
    const contentDiv = measureBox.querySelector('.measure-content');
    contentDiv.innerHTML = '';
    (measure.content || []).forEach((note, index, arr) => {
        const noteEl = document.createElement('div');
        noteEl.className = 'note-element';
        noteEl.dataset.noteId = note.id;
        if (note.id === eventsState.selectedNoteId) noteEl.classList.add('selected');

        const hasEvents = note.events && note.events.enabled;

        const nextNote = arr[index + 1];
        if (hasEvents && nextNote && nextNote.events && nextNote.events.enabled) {
            noteEl.classList.add('needs-spacing-for-connector');
        }

        noteEl.innerHTML = `
            <div class="note-element-top">
                <button class="note-toggle-events-btn">${hasEvents ? '-' : '+'}</button>
                ${getNoteIconHTML(note.type)}
            </div>
            <div class="note-events-container">
                ${!hasEvents ? '<div class="note-events-disabled-symbol">∅</div>' : ''}
            </div>`;
        contentDiv.appendChild(noteEl);

        if (hasEvents) {
            renderNoteEvents(noteEl, note);
        }
    });
}

function renderEventConnectors() {
    const manager = eventsEditorDialog.querySelector('.measure-manager');
    if (!manager) return;
    manager.querySelectorAll('.event-connector-line').forEach(line => line.remove());
    manager.querySelectorAll('.event-easing-btn').forEach(btn => btn.remove());

    const selectedProps = eventsState.selectedProperties;
    if (selectedProps.length === 0) return;

    const managerRect = manager.getBoundingClientRect();
    const GAP = 5;
    const flatNotes = eventsState.measures.flatMap(m => m.content || []);

    for (let i = 0; i < flatNotes.length; i++) {
        const sourceNote = flatNotes[i];
        if (!sourceNote.events.enabled) continue;

        let targetNote = null;
        for (let j = i + 1; j < flatNotes.length; j++) {
            if (flatNotes[j].events.enabled) {
                targetNote = flatNotes[j];
                break;
            }
        }
        if (!targetNote) continue;

        const sourceNoteEl = manager.querySelector(`.note-element[data-note-id="${sourceNote.id}"]`);
        const targetNoteEl = manager.querySelector(`.note-element[data-note-id="${targetNote.id}"]`);
        if (!sourceNoteEl || !targetNoteEl) continue;

        selectedProps.forEach(propKey => {
            const sourcePreview = sourceNoteEl.querySelector(`.note-event-value-preview[data-prop-key="${propKey}"]`);
            const targetLabel = targetNoteEl.querySelector(`.note-event-prop-label[data-prop-key="${propKey}"]`);
            if (!sourcePreview || !targetLabel) return;

            const sourceRect = sourcePreview.getBoundingClientRect();
            const targetRect = targetLabel.getBoundingClientRect();

            const startX = sourceRect.right - managerRect.left + manager.scrollLeft + GAP;
            const startY = sourceRect.top + sourceRect.height / 2 - managerRect.top + manager.scrollTop;
            const endX = targetRect.left - managerRect.left + manager.scrollLeft - GAP;
            const endY = targetRect.top + targetRect.height / 2 - managerRect.top + manager.scrollTop;

            if (endX <= startX) return;

            const dx = endX - startX;
            const dy = endY - startY;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);

            const line = document.createElement('div');
            line.className = 'event-connector-line';
            line.style.left = `${startX}px`;
            line.style.top = `${startY}px`;
            line.style.width = `${length}px`;
            line.style.transform = `rotate(${angle}deg)`;
            manager.appendChild(line);

            const targetHasOverride = targetNote.events.values.hasOwnProperty(propKey);
            if (targetNote.events.enabled && targetHasOverride) {
                const midX = startX + dx / 2;
                const midY = startY + dy / 2;

                const easingBtn = document.createElement('button');
                easingBtn.className = 'event-easing-btn';
                easingBtn.title = 'Edit Easing Function';

                const easingPropKey = `${propKey}_easing`;
                const startValue = getEffectivePropertyValue(sourceNote.id, propKey);
                const endValue = targetNote.events.values[propKey];
                const isInstant = isInstantTransition(startValue, endValue, propKey);

                let currentEasing = targetNote.events.values[easingPropKey] || (isInstant ? 'instant' : 'linear');
                if (isInstant && currentEasing !== 'instant') {
                    currentEasing = 'instant';
                    targetNote.events.values[easingPropKey] = 'instant';
                }

                easingBtn.innerHTML = `<img src="../../icons/${currentEasing}_ease.svg" alt="Easing">`;
                easingBtn.style.position = 'absolute';
                easingBtn.style.left = `${midX}px`;
                easingBtn.style.top = `${midY}px`;

                easingBtn.addEventListener('click', () => {
                    openEasingEditor(currentEasing, (newEasing) => {
                        targetNote.events.values[easingPropKey] = newEasing;
                        refreshEditorView();
                    }, isInstant);
                });

                manager.appendChild(easingBtn);
            }
        });
    }
}

/**
 * REVISED: This function now serves as the main entry point for updating the editor's view,
 * ensuring that connectors are always rendered after the main content.
 */
function refreshEditorView() {
    renderMeasures();
    requestAnimationFrame(renderEventConnectors);
}

function renderMeasures() {
    if (!measuresContainer) return;
    measuresContainer.innerHTML = '';
    let globalMeasureCounter = 0;

    eventsState.measures.forEach((measure, index) => {
        const measureBox = document.createElement('div');
        measureBox.className = 'measure-box';
        measureBox.dataset.index = index;
        const globalMeasureNumber = globalMeasureCounter + 1;
        const pasteDisabled = eventsMeasureClipboard === null ? 'disabled' : '';

        const isForeign = measure.pageIndex !== eventsState.elementPageIndex;
        if (isForeign) {
            measureBox.classList.add('foreign-measure');
        }

        measureBox.innerHTML = `
            <button class="copy-measure-btn" title="Copy Measure Content">
                <img src="../../icons/copy.svg" alt="Copy">
            </button>
            <button class="paste-measure-btn" title="Paste Measure Content" ${pasteDisabled}>
                <img src="../../icons/paste.svg" alt="Paste">
            </button>
            <div class="measure-header" draggable="${!isForeign}">
                <span class="measure-global-number">${globalMeasureNumber}</span>
                <span class="measure-time-signature">${measure.timeSignature.numerator + '/' + measure.timeSignature.denominator}</span>
            </div>
            <div class="measure-content"></div>`;
        renderMeasureContent(measureBox, measure);
        measuresContainer.appendChild(measureBox);
        globalMeasureCounter++;
    });
}

function updateDeleteButtonState() {
    if (deleteNoteBtn) deleteNoteBtn.disabled = eventsState.selectedNoteId === null;
}

function deselectNote() {
    if (eventsState.selectedNoteId) {
        const currentlySelected = eventsEditorDialog.querySelector('.note-element.selected');
        if (currentlySelected) currentlySelected.classList.remove('selected');
        eventsState.selectedNoteId = null;
        updateDeleteButtonState();
    }
}

function selectNote(noteElement) {
    const noteId = noteElement.dataset.noteId;
    if (eventsState.selectedNoteId === noteId) return;
    deselectNote();
    eventsState.selectedNoteId = noteId;
    noteElement.classList.add('selected');
    updateDeleteButtonState();
}

function deleteSelectedNote() {
    if (!eventsState.selectedNoteId) return;
    for (const measure of eventsState.measures) {
        const noteIndex = (measure.content || []).findIndex(n => n.id === eventsState.selectedNoteId);
        if (noteIndex !== -1) {
            measure.content.splice(noteIndex, 1);
            refreshEditorView();
            eventsState.selectedNoteId = null;
            updateDeleteButtonState();
            break;
        }
    }
}

function clearDropIndicators() {
    document.querySelectorAll('.measure-content.drag-over, .measure-content.drag-invalid').forEach(el => el.classList.remove('drag-over', 'drag-invalid'));
    document.querySelectorAll('.note-element.drop-indicator-before, .note-element.drop-indicator-after').forEach(el => el.classList.remove('drop-indicator-before', 'drop-indicator-after'));
}

function handleNoteDragStart(e) {
    const toolBtn = e.target.closest('.tool-btn');
    if (!toolBtn || toolBtn.disabled) { e.preventDefault(); return; }
    draggedNoteType = toolBtn.dataset.tool;
    e.dataTransfer.setData('text/plain', draggedNoteType);
    e.dataTransfer.effectAllowed = 'copy';
    setTimeout(() => toolBtn.classList.add('dragging'), 0);
    eventsEditorDialog.classList.add('is-dragging-note');
}

function handleNoteDragEnd(e) {
    const toolBtn = e.target.closest('.tool-btn');
    if (toolBtn) toolBtn.classList.remove('dragging');
    draggedNoteType = null;
    eventsEditorDialog.classList.remove('is-dragging-note');
    clearDropIndicators();
}

function handleNoteDrop(e) {
    const measureBox = e.target.closest('.measure-box');
    const measureContent = measureBox ? measureBox.querySelector('.measure-content') : null;
    if (!measureBox || !measureContent || measureContent.classList.contains('drag-invalid')) return;
    const noteType = e.dataTransfer.getData('text/plain');
    const measureIndex = parseInt(measureBox.dataset.index, 10);
    const measure = eventsState.measures[measureIndex];
    if (!measure.content) measure.content = [];
    const isDottedActive = dotBtn.classList.contains('active');
    const finalNoteType = isDottedActive ? `${noteType}_dotted` : noteType;
    if (!draggedNoteType) return;
    const newNote = {
        id: `evt-${Date.now()}`,
        type: finalNoteType,
        events: { enabled: false, values: {} }
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
    refreshEditorView();
}

export function initEventsEditor() {
    const dialogHTML = `
        <div id="events-editor-dialog" class="dialog-overlay">
            <div class="dialog-content">
                <div class="dialog-header">Events Editor</div>
                <div class="dialog-body">
                    <div class="measure-manager">
                        <div id="ee-measures-container" class="measures-container"></div>
                    </div>
                    <div class="lyrics-editor-bottom">
                        <div id="ee-tool-palette" class="tool-palette">
                            <div class="tool-row">
                                <button class="tool-btn" data-tool="w_note" title="Whole Note" draggable="true"><img src="../../icons/w_note.svg"></button>
                                <button class="tool-btn" data-tool="h_note" title="Half Note" draggable="true"><img src="../../icons/h_note.svg"></button>
                                <button class="tool-btn" data-tool="q_note" title="Quarter Note" draggable="true"><img src="../../icons/q_note.svg"></button>
                                <button class="tool-btn" data-tool="e_note" title="Eighth Note" draggable="true"><img src="../../icons/e_note.svg"></button>
                                <button class="tool-btn" data-tool="s_note" title="Sixteenth Note" draggable="true"><img src="../../icons/s_note.svg"></button>
                                <button id="ee-dot-btn" class="tool-btn" data-tool="dot" title="Dotted Note"><img src="../../icons/dot.svg"></button>
                            </div>
                        </div>
                        <div id="ee-action-palette" class="tool-palette">
                            <div class="tool-row">
                                <button id="ee-properties-btn" class="tool-btn" title="Select Event Properties">📅</button>
                                <button id="ee-delete-note-btn" class="tool-btn" title="Delete Event" draggable="false" disabled><img src="../../icons/delete_red.svg"></button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="dialog-footer">
                    <button id="ee-cancel-btn" class="action-btn secondary-btn">Cancel</button>
                    <button id="ee-ok-btn" class="action-btn primary-btn">OK</button>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    eventsEditorDialog = document.getElementById('events-editor-dialog');
    measuresContainer = document.getElementById('ee-measures-container');
    toolPalette = document.getElementById('ee-tool-palette');
    deleteNoteBtn = document.getElementById('ee-delete-note-btn');
    dotBtn = document.getElementById('ee-dot-btn');
    sNoteBtn = toolPalette.querySelector('[data-tool="s_note"]');

    makeDraggable('events-editor-dialog');

    document.getElementById('ee-properties-btn').addEventListener('click', () => {
        if (!eventsState.virtualElement || !eventsState.virtualElement.domElement) return;

        const currentSelection = eventsState.selectedProperties;

        openPropertiesDialog(eventsState.virtualElement.domElement, currentSelection, (newSelection) => {
            const removedProperties = currentSelection.filter(prop => !newSelection.includes(prop));

            if (removedProperties.length > 0) {
                eventsState.measures.forEach(measure => { 
                    if (measure.content) {
                        measure.content.forEach(note => {
                            if (note.events && note.events.values) {
                                removedProperties.forEach(propKey => {
                                    delete note.events.values[propKey];
                                    delete note.events.values[`${propKey}_easing`];
                                });
                            }
                        });
                    }
                });
            }

            eventsState.selectedProperties = newSelection; 
            refreshEditorView();
        });
    });

    document.getElementById('ee-ok-btn').addEventListener('click', () => {
        if (state.eventsEditorCallback) {
            
            // Construct the eventsToSave object correctly without mangling IDs.
            const eventsToSave = {
                content: {},
                format: 'map'
            };

            eventsState.measures.forEach(measure => {
                if (measure.content && measure.content.length > 0) {
                    // Use the measure.id directly.
                    eventsToSave.content[measure.id] = measure.content;
                }
            });

            editorDataCache.set(eventsState.elementId, structuredClone(eventsToSave.content));

            const element = document.getElementById(eventsState.elementId);
            if (element) {
                element.dataset.selectedEventProperties = JSON.stringify(eventsState.selectedProperties);
            }

            state.eventsEditorCallback(eventsToSave);
            markAsDirty();
        }
        eventsEditorDialog.classList.remove('visible');
    });

    document.getElementById('ee-cancel-btn').addEventListener('click', () => {
        eventsEditorDialog.classList.remove('visible');
    });

    deleteNoteBtn.addEventListener('click', deleteSelectedNote);
    dotBtn.addEventListener('click', () => {
        dotBtn.classList.toggle('active');
        sNoteBtn.disabled = dotBtn.classList.contains('active');
        sNoteBtn.draggable = !sNoteBtn.disabled;
    });

    eventsEditorDialog.addEventListener('click', (e) => {
        if (!e.target.closest('.note-element, #ee-delete-note-btn, #ee-properties-btn, #edit-event-property-dialog')) deselectNote();
    });

    measuresContainer.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('.copy-measure-btn');
        if (copyBtn) {
            e.stopPropagation();
            const measureBox = copyBtn.closest('.measure-box');
            const measureIndex = parseInt(measureBox.dataset.index, 10);
            const measureToCopy = eventsState.measures[measureIndex];

            if (measureToCopy && measureToCopy.content) {
                eventsMeasureClipboard = structuredClone(measureToCopy.content);
                refreshEditorView();
            }
            return;
        }

        const pasteBtn = e.target.closest('.paste-measure-btn');
        if (pasteBtn) {
            e.stopPropagation();
            if (eventsMeasureClipboard === null) return;

            const measureBox = pasteBtn.closest('.measure-box');
            const measureIndex = parseInt(measureBox.dataset.index, 10);
            const targetMeasure = eventsState.measures[measureIndex];

            const clipboardDuration = eventsMeasureClipboard.reduce((sum, note) => sum + (NOTE_DURATIONS[note.type] || 0), 0);
            const targetCapacity = getMeasureCapacity(targetMeasure.timeSignature);

            if (clipboardDuration > targetCapacity) {
                alert('Paste failed: The copied notes do not fit in the target measure.');
                return;
            }

            const newContent = structuredClone(eventsMeasureClipboard);
            newContent.forEach(note => {
                note.id = `evt-${generateUUID()}`;
            });
            targetMeasure.content = newContent;

            refreshEditorView();
            return;
        }

        const valuePreview = e.target.closest('.note-event-value-preview');
        if (valuePreview) {
            e.stopPropagation();
            const noteEl = valuePreview.closest('.note-element');
            const noteId = noteEl.dataset.noteId;
            const propKey = valuePreview.dataset.propKey;

            const valueToEdit = getValueForEditing(noteId, propKey);

            openPropertyValueEditor(eventsState.elementId, propKey, valueToEdit, (newValue) => {
                const flatNotes = eventsState.measures.flatMap(m => m.content || []);
                const sourceNote = flatNotes.find(n => n.id === noteId);
                if (!sourceNote) return;

                if (newValue === undefined) {
                    delete sourceNote.events.values[propKey];
                } else {
                    sourceNote.events.values[propKey] = newValue;
                }
                refreshEditorView();
            });
            return;
        }

        const noteElement = e.target.closest('.note-element');
        if (noteElement) selectNote(noteElement);

        const toggleBtn = e.target.closest('.note-toggle-events-btn');
        if (toggleBtn) {
            const noteEl = toggleBtn.closest('.note-element');
            const noteId = noteEl.dataset.noteId;
            for (const measure of eventsState.measures) {
                const note = (measure.content || []).find(n => n.id === noteId);
                if (note) {
                    note.events.enabled = !note.events.enabled;
                    refreshEditorView();
                    break;
                }
            }
        }
    });


    toolPalette.addEventListener('dragstart', handleNoteDragStart);
    toolPalette.addEventListener('dragend', handleNoteDragEnd);

    measuresContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const measureContent = e.target.closest('.measure-content');
        if (!measureContent || !draggedNoteType) return;
        const measureBox = measureContent.closest('.measure-box');
        const measureIndex = parseInt(measureBox.dataset.index, 10);
        const measure = eventsState.measures[measureIndex];
        const capacity = getMeasureCapacity(measure.timeSignature);
        let currentDuration = (measure.content || []).reduce((sum, note) => sum + NOTE_DURATIONS[note.type], 0);
        const isDotted = dotBtn.classList.contains('active');
        const finalType = isDotted ? `${draggedNoteType}_dotted` : draggedNoteType;
        const noteToAddDuration = NOTE_DURATIONS[finalType];
        clearDropIndicators();
        if (currentDuration + noteToAddDuration > capacity) {
            measureContent.classList.add('drag-invalid');
        } else {
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
        handleNoteDrop(e);
        clearDropIndicators();
    });
}

export function openEventsEditor(elementId, initialData, globalMeasureOffset, callback) {
    const element = findVirtualElementById(state.activePage, elementId);
    if (!element) return;

    let selectedProperties = [];
    try {
        selectedProperties = JSON.parse(element.domElement.dataset.selectedEventProperties || '[]');
    } catch (e) { /* use default empty array */ }

    // 1. Determine the source of truth for event data
    let eventDataContent;
    if (editorDataCache.has(elementId)) {
        eventDataContent = editorDataCache.get(elementId);
    } else {
        eventDataContent = initialData?.content || {};
    }

    // 2. Get the structure of all measures in the song
    const allSongMeasures = getSongMeasuresStructure();
    const elementPage = findElementPage(element);
    const elementPageIndex = state.song.pages.indexOf(elementPage);

    // Handle legacy array format from loaded files
    if (Array.isArray(eventDataContent)) {
        const legacyArray = eventDataContent;
        eventDataContent = {}; // Convert to map
        
        legacyArray.forEach((content, index) => {
            const targetMeasureIndex = globalMeasureOffset + index;
            // Ensure we are within bounds of the current song structure
            if (allSongMeasures[targetMeasureIndex]) {
                const measureId = allSongMeasures[targetMeasureIndex].id;
                eventDataContent[measureId] = content;
            }
        });
    }

    const eventDataLookup = new Map(Object.entries(eventDataContent));

    // 3. Construct the combined measure list for the editor
    const editorMeasures = allSongMeasures.map(measureStructure => {
        const content = eventDataLookup.get(measureStructure.id) || [];
        return {
            ...measureStructure,
            content: content.map(note => ({
                ...note,
                events: note.events || { enabled: false, values: {} }
            }))
        };
    });

    eventsState = {
        elementId: elementId,
        virtualElement: element,
        globalMeasureOffset: 0,
        measures: editorMeasures,
        selectedNoteId: null,
        selectedProperties: selectedProperties,
        elementPageIndex: elementPageIndex,
    };

    if (dotBtn) dotBtn.classList.remove('active');
    if (sNoteBtn) { sNoteBtn.disabled = false; sNoteBtn.draggable = true; }
    updateState({ eventsEditorCallback: callback });

    renderMeasures();
    updateDeleteButtonState();

    const manager = eventsEditorDialog.querySelector('.measure-manager');
    if (manager) {
        manager.querySelectorAll('.event-connector-line, .event-easing-btn').forEach(el => el.remove());
    }

    eventsEditorDialog.classList.add('visible');

    // Precise Auto-scroll Logic
    requestAnimationFrame(() => {
        setTimeout(() => {
            if (!measuresContainer) return;

            const measures = eventsState.measures;
            // Find the first measure belonging to the current page (or a later page if current has none)
            let targetIndex = measures.findIndex(m => m.pageIndex >= eventsState.elementPageIndex);

            const scrollContainer = measuresContainer.parentElement;
            const GAP_OFFSET = 8; // 0.5rem

            if (targetIndex === -1) {
                 scrollContainer.scrollLeft = scrollContainer.scrollWidth;
            } else {
                const el = measuresContainer.querySelector(`.measure-box[data-index="${targetIndex}"]`);
                if (el) {
                    scrollContainer.scrollLeft = el.offsetLeft - GAP_OFFSET;
                }
            }
        }, 0);
    });

    eventsEditorDialog.addEventListener('transitionend', () => {
        renderEventConnectors();
    }, { once: true });
}

