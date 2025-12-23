// src/renderer/js/renderer/values/color.js

import {compareColorAndColor, compareGradientAndGradient, generateCSSColor, generateCSSGradient} from "../utils.js";
import { EventsArray } from "../events/eventsArray.js";
import { ColorOrGradientEvent, ColorEvent, GradientEvent } from "../events/colorEvent.js";

export class ColorOrGradientValue {
    #shouldRender = true;
    #events = new EventsArray();
    #colorOrGradientObject = {
        a: 1,
        r: 0,
        g: 0,
        b: 0,
        mode: 'color'
    };

    get shouldRender() {
        return this.#shouldRender;
    }

    constructor(colorOrGradientObject) {
        this.setDefaultValue(colorOrGradientObject);
    }

    getEvents() { return this.#events; }

    getDefaultValue() {
        return this.#events.getDefaultValue();
    }

    removeEvent(event) { return this.#events.remove(event); }

    addEvent(event) {
        if (event instanceof ColorOrGradientEvent) {
            this.#events.insert(event);
        } else if (event instanceof ColorEvent || event instanceof GradientEvent) {
            const genericEvent = new ColorOrGradientEvent({
                colorOrGradientObject: event.getValue(),
                ease: event.getEase(),
                measureIndex: event.getMeasureIndex(),
                measureProgress: event.getMeasureProgress()
            });
            this.#events.insert(genericEvent);
        } else {
            throw new Error('Event must be an instance of ColorOrGradientEvent, ColorEvent, or GradientEvent');
        }
    }

    applyEvent(measureIndex, measureProgress) {
        const result = this.#events.getInterpolatedValue(measureIndex, measureProgress, 'color/gradient');
        if (result !== null) {
            this.setColorOrGradientObject(result);
        }
    }

    applyDefaultEvent() {
        const defaultValue = this.#events.getDefaultValue();
        if (defaultValue) {
            this.setColorOrGradientObject(defaultValue);
        }
    }

    get colorOrGradientObject() {
        return structuredClone(this.#colorOrGradientObject);
    }

    getCSSValue() {
        if(this.#colorOrGradientObject.mode === 'color') {
            return generateCSSColor(this.#colorOrGradientObject);
        } else if(this.#colorOrGradientObject.mode === 'gradient') {
            return generateCSSGradient(this.#colorOrGradientObject);
        }
        return 'none';
    }

    // Internal update from timeline
    setColorOrGradientObject(colorOrGradientObject, setAsDefault = false) {
        if(setAsDefault) {
            return this.setDefaultValue(colorOrGradientObject);
        }
        const clonedObj = structuredClone(colorOrGradientObject);
        const modeChanged = this.#colorOrGradientObject.mode !== clonedObj.mode;
        if (modeChanged) {
            this.#colorOrGradientObject = clonedObj;
            this.#shouldRender = true;
            return true;
        }
        if (clonedObj.mode === 'color') {
            if (!compareColorAndColor(this.#colorOrGradientObject, clonedObj)) {
                this.#colorOrGradientObject = clonedObj;
                this.#shouldRender = true;
                return true;
            }
        } else if (clonedObj.mode === 'gradient') {
            if (!compareGradientAndGradient(this.#colorOrGradientObject, clonedObj)) {
                this.#colorOrGradientObject = clonedObj;
                this.#shouldRender = true;
                return true;
            }
        }
        return false;
    }

    // External update from user/properties panel
    setDefaultValue(colorOrGradientObject) {
        const clonedObj = structuredClone(colorOrGradientObject);
        const defaultVal = this.getDefaultValue();
        const modeChanged = !defaultVal || defaultVal.mode !== clonedObj.mode;
        if (modeChanged) {
            this.#events.setDefaultValue(clonedObj);
            this.#shouldRender = true;
            return true;
        }
        if (clonedObj.mode === 'color') {
            if (defaultVal === clonedObj || defaultVal && compareColorAndColor(this.getDefaultValue(), clonedObj)) {
                return false;
            }
        } else if (clonedObj.mode === 'gradient') {
            if (defaultVal === clonedObj || defaultVal && compareGradientAndGradient(this.getDefaultValue(), clonedObj)) {
                return false;
            }
        } else {
            throw new Error('Invalid mode in colorOrGradientObject. Must be "color" or "gradient".');
        }
        this.#events.setDefaultValue(clonedObj);
        this.#shouldRender = true;
        return true;
    }

    markAsRendered() {
        this.#shouldRender = false;
    }

    markAsDirty() {
        this.#shouldRender = true;
    }
}

export class ColorValue {
    #shouldRender = true;
    #events = new EventsArray();
    #colorObject = {
        a: 1,
        r: 0,
        g: 0,
        b: 0
    };

    get shouldRender() {
        return this.#shouldRender;
    }

    constructor(colorObject) {
        if (colorObject) {
            this.setDefaultValue(colorObject);
        }
    }

    getEvents() { return this.#events; }

    getDefaultValue() {
        return this.#events.getDefaultValue();
    }

    removeEvent(event) { return this.#events.remove(event); }

    addEvent(event) {
        if (!(event instanceof ColorEvent)) throw new Error('Event must be an instance of ColorEvent');
        this.#events.insert(event);
    }

    applyEvent(measureIndex, measureProgress) {
        const result = this.#events.getInterpolatedValue(measureIndex, measureProgress, 'color');
        if (result !== null) {
            this.setColorObject(result);
        }
    }

    applyDefaultEvent() {
        const defaultValue = this.#events.getDefaultValue();
        if (defaultValue) {
            this.setColorObject(defaultValue);
        }
    }

    get colorObject() {
        return structuredClone(this.#colorObject);
    }

    getCSSValue() {
        return generateCSSColor(this.#colorObject);
    }

    setColorObject(colorObject, setAsDefault = false) {
        if (setAsDefault) {
            return this.setDefaultValue(colorObject);
        }
        const clonedObj = structuredClone(colorObject);
        if (!compareColorAndColor(this.#colorObject, clonedObj)) {
            this.#colorObject = clonedObj;
            this.#shouldRender = true;
            return true;
        }
        return false;
    }

    // External update from user/properties panel
    setDefaultValue(colorObject) {
        const clonedObj = structuredClone(colorObject);
        const defaultVal = this.getDefaultValue();
        if (defaultVal === clonedObj || (defaultVal && compareColorAndColor(defaultVal, clonedObj))) {
            return false;
        }
        this.#events.setDefaultValue(clonedObj);
        this.#shouldRender = true;
        return true;
    }

    markAsRendered() {
        this.#shouldRender = false;
    }

    markAsDirty() {
        this.#shouldRender = true;
    }
}


export class GradientValue {
    #shouldRender = true;
    #events = new EventsArray();
    #gradientObject = {
        a: 1,
        type: 'linear',
        angle: 90,
        colorStops: []
    };

    get shouldRender() {
        return this.#shouldRender;
    }

    constructor(gradientObject) {
        if (gradientObject) {
            this.setDefaultValue(gradientObject);
        }
    }

    getEvents() { return this.#events; }
    removeEvent(event) { return this.#events.remove(event); }

    getDefaultValue() {
        return this.#events.getDefaultValue();
    }

    setDefaultValue(gradientObject) {
        gradientObject = structuredClone(gradientObject);
        const defaultVal = this.getDefaultValue();
        if(defaultVal === gradientObject || defaultVal && compareGradientAndGradient(this.getDefaultValue(), gradientObject)) {
            return false;
        }
        this.#events.setDefaultValue(gradientObject);
        this.#shouldRender = true;
        return true;
    }

    /**
     * FIXED: Signature changed to the standard `addEvent(event)` to be
     * consistent with other Value classes.
     */
    addEvent(event) {
        if (!(event instanceof GradientEvent)) throw new Error('Event must be an instance of GradientEvent');
        this.#events.insert(event);
    }

    applyEvent(measureIndex, measureProgress) {
        const result = this.#events.getInterpolatedValue(measureIndex, measureProgress, 'gradient');
        if (result !== null) {
            this.setGradientObject(result);
        }
    }

    applyDefaultEvent() {
        const defaultValue = this.#events.getDefaultValue();
        if (defaultValue) {
            this.setGradientObject(defaultValue);
        }
    }

    get gradientObject() {
        return structuredClone(this.#gradientObject);
    }

    getCSSValue() {
        return generateCSSGradient(this.#gradientObject);
    }

    setGradientObject(gradientObject, setAsDefault = false) {
        if(setAsDefault) {
            return this.setDefaultValue(gradientObject);
        }
        gradientObject = structuredClone(gradientObject);
        const isDifferent = !compareGradientAndGradient(this.#gradientObject, gradientObject);
        if (isDifferent) {
            this.#gradientObject = gradientObject;
            this.#shouldRender = true;
            return true;
        }
        return false;
    }

    markAsRendered() {
        this.#shouldRender = false;
    }

    markAsDirty() {
        this.#shouldRender = true;
    }
}

