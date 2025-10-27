// src/renderer/js/renderer/elements/element.js

import { NameProperty } from '../properties/name.js';
import { generateUUID, getPropertyType } from '../utils.js';
import { NumberEvent } from '../events/numberEvent.js';
import { UnitEvent } from '../events/unitEvent.js';
import { FontSizeEvent } from '../events/fontSizeEvent.js';
import { ColorOrGradientEvent, ColorEvent, GradientEvent } from '../events/colorEvent.js';
import { BooleanEvent } from '../events/booleanEvent.js';
import { StringEvent } from '../events/stringEvent.js';
import { DynamicStringEvent } from '../events/dynamicStringEvent.js';
import { VisibleProperty } from '../properties/visible.js';


export class VirtualElement {
    #type = 'element';
    #properties = [];
    #parent = null;
    #addedInDom = false;
    domElement = null;
    id = '';
    #eventsData = {}; // Internal, measure-keyed data for the renderer

    get addedInDom() {
        return this.#addedInDom;
    }

    set addedInDom(value) {
        this.#addedInDom = value;
    }

    get extendsDimensions() {
        return false;
    }

    constructor(type, name, options = {}) {
        this.#type = type;
        this.id = `ve-${generateUUID()}`;
        console.log(this);
        // All elements must have a name property.
        this.setProperty('name', new NameProperty(name));
        const initialVisibility = options.visible !== undefined ? options.visible : true;
        this.setProperty('visible', new VisibleProperty(initialVisibility));
    }

    _setType(type) {
        this.#type = type;
    }

    get type() {
        return this.#type;
    }

    setProperty(key, property) {
        const index = this.#properties.findIndex(p => p.key === key);
        if (index !== -1) {
            this.#properties[index].property = property;
        } else {
            this.#properties.push({ key, property });
        }
    }

    /**
     * Inserts a property before another property identified by its key.
     * @param {string} key - The key of the new property to insert.
     * @param {object} property - The property object to insert.
     * @param {string} beforeKey - The key of the property to insert before.
     */
    insertPropertyBefore(key, property, beforeKey) {
        // First, remove the property if it already exists to avoid duplicates
        // and to handle re-ordering correctly.
        const existingIndex = this.#properties.findIndex(p => p.key === key);
        if (existingIndex !== -1) {
            this.#properties.splice(existingIndex, 1);
        }

        // Find the index of the property to insert before.
        const beforeIndex = this.#properties.findIndex(p => p.key === beforeKey);

        const newProperty = { key, property };

        if (beforeIndex !== -1) {
            // If the 'before' property is found, insert the new property at its index.
            this.#properties.splice(beforeIndex, 0, newProperty);
        } else {
            // If the 'before' property is not found, add the new property to the end.
            this.#properties.push(newProperty);
        }
    }

    getProperty(key) {
        const prop = this.#properties.find(p => p.key === key);
        return prop ? prop.property : undefined;
    }

    getProperties() {
        return this.#properties.reduce((acc, { key, property }) => {
            acc[key] = property;
            return acc;
        }, {});
    }

    hasProperty(key) {
        return this.#properties.some(p => p.key === key);
    }

    /**
     * Calculates the total horizontal space taken up by properties like
     * border and padding, which needs to be subtracted from the main width.
     */
    getAdditionalHorizontalSpace() {
        let total = 0;
        for (const { property } of this.#properties) {
            if (property.extendsDimensions) {
                total += property.getAdditionalHorizontalSpace();
            }
        }
        return total;
    }

    /**
     * Calculates the total vertical space taken up by properties like
     * border and padding, which needs to be subtracted from the main height.
     */
    getAdditionalVerticalSpace() {
        let total = 0;
        for (const { property } of this.#properties) {
            if (property.extendsDimensions) {
                total += property.getAdditionalVerticalSpace();
            }
        }
        return total;
    }

    setParent(parent) {
        this.#parent = parent;
    }
    get parent() {
        return this.#parent;
    }

    handlePlaybackStateChange(isPlaying) {
        // Base implementation does nothing. To be overridden by children.
    }

    applyEvents(measureIndex, beatProgress, timingData) {
        if(!this.addedInDom) return;
        for (const { property } of this.#properties) {
            property.applyEvents(this, measureIndex, beatProgress, timingData);
        }
    }

    render() {
        if(!this.addedInDom) return;
        for (const { property } of this.#properties) {
            property.applyChanges(this);
        }
    }

    resize({root, parent}) {
        if(!this.addedInDom) return;
        // Properties must be resized first, as their calculated pixel values
        // might be needed by child elements.
        for (const { property } of this.#properties) {
            property.resize({element: this, root, parent});
        }
    }

    /**
     * Returns the internal, processed event data. This is the source
     * of truth for project saving and initial editor load.
     */
    getEventsData() {
        return structuredClone(this.#eventsData);
    }

    /**
     * Sets the raw event data from the events editor and rebuilds the
     * internal, time-based event arrays used for animation.
     * @param {object} data - The event data, containing a content array of note arrays.
     * @param {number} globalMeasureOffset - The global measure index where this element's timeline starts.
     * @param {Array} measureMap - The global measure map for the entire song.
     */
    setEventsData(data, globalMeasureOffset, measureMap) {
        // Store the new data structure directly, removing the now-redundant shift property.
        this.#eventsData = { content: data?.content || [] };
        this.#rebuildEventArrays(globalMeasureOffset, measureMap);
    }

    /**
     * Creates the correct Event object based on a property key.
     * @private
     */
    _createEventForProperty(propKey, options) {
        const propType = getPropertyType(propKey);
        const { value, ease, measureIndex, measureProgress } = options;

        switch (propType) {
            case 'number': {
                const numValue = (typeof value === 'object' && value !== null && value.hasOwnProperty('value')) ? value.value : value;
                return new NumberEvent({ value: parseFloat(numValue), ease, measureIndex, measureProgress });
            }
            case 'size': {
                if (typeof value !== 'object' || value === null || !value.hasOwnProperty('value') || !value.hasOwnProperty('unit')) {
                    console.warn(`Invalid size value for event key "${propKey}":`, value);
                    return null;
                }
                // Special case for fontSize which has its own event type
                if (['fontSize', 'letterSpacing', 'wordSpacing'].includes(propKey)) {
                    return new FontSizeEvent({ value: value.value, unit: value.unit, ease, measureIndex, measureProgress });
                }
                return new UnitEvent({ value: value.value, unit: value.unit, ease, measureIndex, measureProgress });
            }
            case 'color/gradient': {
                let eventValue = structuredClone(value);
                if (typeof eventValue !== 'object' || eventValue === null) {
                    console.warn(`Invalid color/gradient value for event key "${propKey}":`, value);
                    return null;
                }

                if (eventValue.hasOwnProperty('colorStops')) {
                    eventValue.mode = 'gradient';
                    return new GradientEvent({ gradientObject: eventValue, ease, measureIndex, measureProgress });
                } else if (eventValue.hasOwnProperty('r')) {
                    eventValue.mode = 'color';
                    return new ColorEvent({ colorObject: eventValue, ease, measureIndex, measureProgress });
                }
                return null;
            }
            case 'boolean':
                return new BooleanEvent({ value: value, ease, measureIndex, measureProgress });
            case 'string':
                return new StringEvent({ value: value, ease, measureIndex, measureProgress });
            case 'dynamic-string':
                return new DynamicStringEvent({ value: value, id: generateUUID(), ease, measureIndex, measureProgress });
            default:
                console.warn(`Cannot create event for unknown property type: ${propType} (key: ${propKey})`);
                return null;
        }
    }

    /**
     * Clears all existing animation events and rebuilds them from the raw event data.
     * @private
     */
    #rebuildEventArrays(globalMeasureOffset, measureMap) {
        if (!measureMap) {
            console.error("Cannot rebuild event arrays without a measureMap.");
            return;
        }

        // --- 1. Build a map of property keys to their actual Value objects ---
        const keyToPath = {
            opacity: { prop: 'effects', value: 'opacity' },
            width: { prop: 'dimensions', value: 'width' },
            height: { prop: 'dimensions', value: 'height' },
            top: { prop: 'margin', value: 'top' },
            left: { prop: 'margin', value: 'left' },
            right: { prop: 'margin', value: 'right' },
            bottom: { prop: 'margin', value: 'bottom' },
            bgEnabled: { prop: 'background', value: 'enabled' },
            bgColor: { prop: 'background', value: 'background' },
            borderEnabled: { prop: 'border', value: 'enabled' },
            borderSize: { prop: 'border', value: 'width' },
            borderRadius: { prop: 'border', value: 'radius' },
            borderColor: { prop: 'border', value: 'color' },
            shadowEnabled: { prop: 'boxShadow', value: 'enabled' },
            shadowInset: { prop: 'boxShadow', value: 'inset' },
            shadowOffsetX: { prop: 'boxShadow', value: 'offsetX' },
            shadowOffsetY: { prop: 'boxShadow', value: 'offsetY' },
            shadowBlur: { prop: 'boxShadow', value: 'blur' },
            shadowSpread: { prop: 'boxShadow', value: 'spread' },
            shadowColor: { prop: 'boxShadow', value: 'color' },
            paddingTop: { prop: 'inner_padding', value: 'top' },
            paddingLeft: { prop: 'inner_padding', value: 'left' },
            paddingBottom: { prop: 'inner_padding', value: 'bottom' },
            paddingRight: { prop: 'inner_padding', value: 'right' },
            fontSize: { prop: 'textStyle', value: 'fontSize' },
            textColor: { prop: 'textStyle', value: 'textColor' },
            lineHeight: { prop: 'textStyle', value: 'lineHeight' },
            letterSpacing: { prop: 'textStyle', value: 'letterSpacing' },
            wordSpacing: { prop: 'textStyle', value: 'wordSpacing' },
            karaokeColor: { prop: 'textStyle', value: 'karaokeColor' },
            fontFamily: { prop: 'textStyle', value: 'fontFamily' },
            fontWeight: { prop: 'textStyle', value: 'fontWeight' },
            fontStyle: { prop: 'textStyle', value: 'fontStyle' },
            textAlign: { prop: 'textStyle', value: 'textAlign' },
            justifyText: { prop: 'textStyle', value: 'justifyText' },
            objectFit: { prop: 'objectFit', value: 'objectFit' },
            progressBgColor: { prop: 'progress', value: 'backgroundColor' },
            progressFillColor: { prop: 'progress', value: 'fillColor' },
            videoState: { prop: 'playback', value: 'state' },
            videoSpeed: { prop: 'playback', value: 'speed' },
            videoLoop: { prop: 'playback', value: 'loop' },
            audioState: { prop: 'playback', value: 'state' },
            audioVolume: { prop: 'playback', value: 'volume' },
            audioLoop: { prop: 'playback', value: 'loop' },
            audioStartTime: { prop: 'playback', value: 'startTime' },
            audioEndTime: { prop: 'playback', value: 'endTime' },
            audioSrc: { prop: 'src', value: 'src' },
            translateX: { prop: 'transform', value: 'translateX' },
            translateY: { prop: 'transform', value: 'translateY' },
            translateZ: { prop: 'transform', value: 'translateZ' },
            scaleX: { prop: 'transform', value: 'scaleX' },
            scaleY: { prop: 'transform', value: 'scaleY' },
            scaleZ: { prop: 'transform', value: 'scaleZ' },
            rotate: { prop: 'transform', value: 'rotate' },
            rotateX: { prop: 'transform', value: 'rotateX' },
            rotateY: { prop: 'transform', value: 'rotateY' },
            rotateZ: { prop: 'transform', value: 'rotateZ' },
            skewX: { prop: 'transform', value: 'skewX' },
            skewY: { prop: 'transform', value: 'skewY' },
            'transform-origin-x': { prop: 'transform', value: 'transform-origin-x' },
            'transform-origin-y': { prop: 'transform', value: 'transform-origin-y' },
            'transform-origin-z': { prop: 'transform', value: 'transform-origin-z' },
            'transform-style': { prop: 'transform', value: 'transform-style' },
            perspective: { prop: 'parentPerspective', value: 'perspective' },
            selfPerspective: { prop: 'transform', value: 'selfPerspective' },
            childrenPerspective: { prop: 'transform', value: 'childrenPerspective' },
            'backface-visibility': { prop: 'transform', value: 'backface-visibility' },
        };

        // --- 2. Clear all existing events ---
        for (const { property } of this.#properties) {
            const values = property.getValues();
            if (!values) continue;
            for (const valueKey in values) {
                const valueObject = values[valueKey];
                if (valueObject && typeof valueObject.getEvents === 'function') {
                    const eventsArray = valueObject.getEvents();
                    if (eventsArray && typeof eventsArray.clear === 'function') {
                        eventsArray.clear();
                        eventsArray.setTimelineOffset(globalMeasureOffset);
                    }
                }
            }
        }

        // --- 3. Parse new data and add events ---
        const NOTE_DURATIONS_IN_BEATS = { w_note: 4.0, h_note: 2.0, q_note: 1.0, e_note: 0.5, s_note: 0.25, w_note_dotted: 6.0, h_note_dotted: 3.0, q_note_dotted: 1.5, e_note_dotted: 0.75 };
        const { content = [] } = this.#eventsData;

        content.forEach((measureNotes, localMeasureIndex) => {
            const actualMeasureIndex = localMeasureIndex + globalMeasureOffset;
            const measureInfo = measureMap[actualMeasureIndex];

            // If the measure doesn't exist in the global timeline, we can't process its events.
            if (!measureInfo) {
                return; // continue to next measure
            }

            let noteTimeOffsetInBeats = 0;

            measureNotes.forEach(note => {
                if (note.events && note.events.enabled) {
                    const measureProgress = measureInfo.duration > 0 ? noteTimeOffsetInBeats / measureInfo.duration : 0;

                    for (const propKey in note.events.values) {
                        if (propKey.endsWith('_easing')) continue;

                        const value = note.events.values[propKey];
                        const ease = note.events.values[`${propKey}_easing`] || 'linear';
                        const path = keyToPath[propKey];
                        if (!path || !this.hasProperty(path.prop)) continue;

                        const valueObject = this.getProperty(path.prop).getValue(path.value);
                        if (!valueObject || typeof valueObject.addEvent !== 'function') continue;

                        const event = this._createEventForProperty(propKey, {
                            value,
                            ease,
                            measureIndex: actualMeasureIndex,
                            measureProgress
                        });

                        if (event) {
                            valueObject.addEvent(event);
                        }
                    }
                }
                noteTimeOffsetInBeats += NOTE_DURATIONS_IN_BEATS[note.type] || 0;
            });
        });
    }
}