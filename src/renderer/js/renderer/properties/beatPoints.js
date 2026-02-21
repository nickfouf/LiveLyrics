// src/renderer/js/renderer/properties/beatPoints.js

import { VirtualProperty } from "./property.js";
import { StringValue } from "../values/string.js";

export class BeatPointsProperty extends VirtualProperty {
    #beatPoints = new StringValue('0');

    constructor(options = {}) {
        super('beatPoints', 'Beat Points');
        // Handle options if passed as a simple string or an object structure
        const val = typeof options === 'string' ? options : (options?.value !== undefined ? options.value : '0');
        this.setBeatPoints(val, true);
    }

    getBeatPoints() { 
        return this.#beatPoints; 
    }

    setBeatPoints(value, setAsDefault = false) { 
        return this.#beatPoints.setValue(value, setAsDefault); 
    }

    getValues() { 
        return { beatPoints: this.getBeatPoints() }; 
    }

    getValue(name) {
        if (name === 'beatPoints') return this.getBeatPoints();
        console.warn(`Value ${name} not found in BeatPointsProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if (key === 'beatPoints') return this.setBeatPoints(value, setAsDefault);
        console.warn(`Value ${key} not found in BeatPointsProperty.`);
        return false;
    }

    applyChanges(element) {
        // We only clear the render flag here.
        // The actual application happens continuously in applyEvents via postMessage in the SmartEffect element.
        if (this.#beatPoints.shouldRender) {
            this.#beatPoints.markAsRendered();
        }
    }
}