// src/renderer/js/renderer/values/unit.js

import {EventsArray} from "../events/eventsArray.js";
import {UnitEvent} from "../events/unitEvent.js";

export class UnitValue {
    #events = new EventsArray();
    #value;
    #unit;
    #pixelValue = 0;
    #shouldRender;
    #lastRootWidth = 0;
    #lastRootHeight = 0;
    #lastParentWidth = 0;
    #lastParentHeight = 0;
    static validUnits = ['px', 'pw', 'ph', 'vw', 'vh', '%', 'auto'];

    get shouldRender() {
        return this.#shouldRender;
    }

    getEvents() {
        return this.#events;
    }

    getDefaultValue() {
        return this.#events.getDefaultValue();
    }

    removeEvent(measureIndex, measureProgress) {
        return this.#events.remove(event);
    }

    addEvent(event) {
        if (!(event instanceof UnitEvent)) throw new Error('Event must be an instance of UnitEvent');
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
            this.setValue(defaultValue);
        }
    }

    getValue() {
        return this.#value;
    }
    getUnit() {
        return this.#unit;
    }

    getUnitAndValue() {
        return {value: this.#value, unit: this.#unit};
    }

    getCSSValue() {
        return this.#unit === 'auto' ? 'auto' : this.#pixelValue + 'px';
    }

    getPixelValue() {
        return this.#pixelValue;
    }

    updatePixelValue({rootWidth, rootHeight, parentWidth, parentHeight}) {
        this.#lastRootWidth = rootWidth;
        this.#lastRootHeight = rootHeight;
        this.#lastParentWidth = parentWidth;
        this.#lastParentHeight = parentHeight;
        let value;

        if(parentWidth <= 0) throw new Error('Parent width cannot be zero when updating pixel value');
        if(parentHeight <= 0) throw new Error('Parent height cannot be zero when updating pixel value');
        if(rootWidth <= 0) throw new Error('Root width cannot be zero when updating pixel value');
        if(rootHeight <= 0) throw new Error('Root height cannot be zero when updating pixel value');
        switch (this.#unit) {
            case 'px': value = this.#value; break;
            case 'pw': value = this.#value * parentWidth / 100; break;
            case 'ph': value = this.#value * parentHeight / 100; break;
            case 'vw': value = this.#value * rootWidth / 100; break;
            case 'vh': value = this.#value * rootHeight / 100; break;
            case '%': value = this.#value * parentWidth / 100; break;
            case 'auto': value = null; break;
        }

        if(this.#pixelValue === value) return false;
        this.#pixelValue = value;
        this.#shouldRender = true;
        return true;
    }

    constructor({value = 0, unit = 'px'}) {
        this.#events;
        this.setDefaultValue({value, unit});
    }

    setUnit(unit, setAsDefault = false) {
        if (setAsDefault) {
            return this.setDefaultValue({unit});
        }
        if (!UnitValue.validUnits.includes(unit)) throw new Error(`Invalid unit: ${unit}`);
        if (this.#unit === unit) return false;
        this.#unit = unit;

        if (this.#lastParentWidth > 0) {
            this.updatePixelValue({
                rootWidth: this.#lastRootWidth,
                rootHeight: this.#lastRootHeight,
                parentWidth: this.#lastParentWidth,
                parentHeight: this.#lastParentHeight
            });
        }
        this.#shouldRender = true;
        return true;
    }

    setValue(value, setAsDefault = false) {
        if (setAsDefault) {
            return this.setDefaultValue({value});
        }
        const num = parseFloat(value);
        if (isNaN(num)) throw new Error('Value must be a number');
        if (this.#value === num) return false;
        this.#value = num;

        if (this.#lastParentWidth > 0) {
            this.updatePixelValue({
                rootWidth: this.#lastRootWidth,
                rootHeight: this.#lastRootHeight,
                parentWidth: this.#lastParentWidth,
                parentHeight: this.#lastParentHeight
            });
        }
        this.#shouldRender = true;
        return true;
    }

    setDefaultValue({value, unit}) {
        const defaultValue = this.getDefaultValue();
        if(typeof value === 'undefined') value = defaultValue?.value;
        if(typeof unit === 'undefined') unit = defaultValue?.unit;

        const num = parseFloat(value);
        if (isNaN(num)) throw new Error('Value must be a number');
        if (!UnitValue.validUnits.includes(unit)) throw new Error(`Invalid unit: ${unit}`);

        const valueChanged = defaultValue?.value !== num;
        const unitChanged = defaultValue?.unit !== unit;

        if (!valueChanged && !unitChanged) return false;

        this.#events.setDefaultValue({ value: num, unit: unit });
        this.#shouldRender = true;
        return true;
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