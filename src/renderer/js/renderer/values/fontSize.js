// src/renderer/js/renderer/values/fontSize.js

import { EventsArray } from "../events/eventsArray.js";
import { FontSizeEvent } from '../events/fontSizeEvent.js';

export class FontSizeValue {
    #events = new EventsArray();
    #value;
    #unit;
    #pixelValue = 0;
    #shouldRender;
    #lastRootFontSize;
    #lastParentFontSize;
    static validUnits = ['px', 'pt', 'em', 'rem', '%', 'auto'];

    getEvents() { return this.#events; }

    getDefaultValue() {
        return this.#events.getDefaultValue();
    }

    removeEvent(event) { return this.#events.remove(event); }
    addEvent(event) {
        if (!(event instanceof FontSizeEvent)) {
            throw new Error("Event must be an instance of FontSizeEvent");
        }
        this.#events.insert(event);
    }

    applyEvent(measureIndex, measureProgress) {
        const result = this.#events.getInterpolatedValue(measureIndex, measureProgress, 'size');
        if (result) {
            this.batchUpdate(result);
        }
    }

    applyDefaultEvent() {
        const defaultValue = this.#events.getDefaultValue();
        if (defaultValue) {
            this.batchUpdate(defaultValue);
        }
    }

    get shouldRender() {
        return this.#shouldRender;
    }

    getValue() {
        return this.#value;
    }
    getUnit() {
        return this.#unit;
    }

    getPixelValue() {
        return this.#pixelValue;
    }

    updatePixelValue({rootFontSize, parentFontSize}) {
        this.#lastRootFontSize = rootFontSize;
        this.#lastParentFontSize = parentFontSize;
        let value;
        switch (this.#unit) {
            case 'px':
                value = this.#value;
                break;
            case 'pt':
                value = this.#value * 4 / 3; // 1pt = 1.3333px
                break;
            case 'em':
                value = this.#value * parentFontSize;
                break;
            case 'rem':
                value = this.#value * rootFontSize;
                break;
            case '%':
                value = this.#value / 100 * parentFontSize;
                break;
            case 'auto':
                value = null;
                break;
        }
        if(this.#pixelValue === value) return false;
        this.#pixelValue = value;
        this.#shouldRender = true;
        return true;
    }

    getCSSValue() {
        if (this.#unit === 'auto') return 'auto';
        return this.getPixelValue() + 'px';
    }

    constructor({value = 0, unit = 'px'}) {
        this.setDefaultValue({value, unit});
    }

    setValue(value, setAsDefault = false) {
        if(setAsDefault) {
            return this.setDefaultValue({value});
        }
        const num = parseFloat(value);
        if (isNaN(num)) throw new Error('Value must be a number');

        if( this.#value === num) return false;
        this.#value = num;
        const changed = this.updatePixelValue({rootFontSize: this.#lastRootFontSize, parentFontSize: this.#lastParentFontSize});
        if(changed) this.#shouldRender = true;
        return changed;
    }

    setUnit(unit, setAsDefault = false) {
        if(setAsDefault) {
            return this.setDefaultValue({unit});
        }
        if (!FontSizeValue.validUnits.includes(unit)) throw new Error(`Invalid unit: ${unit}`);

        if( this.#unit === unit) return false;
        this.#unit = unit;
        const changed = this.updatePixelValue({rootFontSize: this.#lastRootFontSize, parentFontSize: this.#lastParentFontSize});
        if(changed) this.#shouldRender = true;
        return changed;
    }

    setDefaultValue({value, unit}) {
        const defaultValue = this.getDefaultValue();
        if(typeof value === 'undefined') value = defaultValue?.value;
        if(typeof unit === 'undefined') unit = defaultValue?.unit;

        const num = parseFloat(value);
        if (isNaN(num)) throw new Error('Value must be a number');
        if (!FontSizeValue.validUnits.includes(unit)) throw new Error(`Invalid unit: ${unit}`);

        const valueChanged = defaultValue?.value !== num;
        const unitChanged = defaultValue?.unit !== unit;

        if (!valueChanged && !unitChanged) return false;

        this.#events.setDefaultValue({ value: num, unit: unit });
        this.#shouldRender = true;
        return true;
    }

    getUnitAndValue() {
        return { value: this.#value, unit: this.#unit };
    }

    batchUpdate({value, unit}, setAsDefault = false) {
        const valueChange = this.setValue(value, setAsDefault);
        const unitChange = this.setUnit(unit, setAsDefault);
        return valueChange || unitChange;
    }

    markAsRendered() {
        this.#shouldRender = false;
    }

    markAsDirty() {
        this.#shouldRender = true;
    }
}



