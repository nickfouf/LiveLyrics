// src/renderer/js/renderer/values/unit.js

import {EventsArray} from "../events/eventsArray.js";
import {UnitEvent} from "../events/unitEvent.js";

export class UnitValue {
    #events = new EventsArray();
    #value;
    #unit;
    #pixelValue = 0;
    #shouldRender;
    
    // Instance-level cache (for parent tracking)
    #lastParentWidth = 0;
    #lastParentHeight = 0;

    // --- FIX START ---
    // Shared Static Cache.
    // Stores the last valid root dimensions seen by ANY UnitValue in the app.
    // This allows new pages (which have no history) to "borrow" the known viewport size 
    // from previous pages during transitions when the DOM might report 0.
    static #globalRootWidth = 0;
    static #globalRootHeight = 0;
    // --- FIX END ---

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
            this.batchUpdate(defaultValue);
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
        // --- FIX START ---
        
        // 1. Update Global Cache if we have valid root data
        if (rootWidth > 0) UnitValue.#globalRootWidth = rootWidth;
        if (rootHeight > 0) UnitValue.#globalRootHeight = rootHeight;

        // 2. Update Instance Cache for parent data
        if (parentWidth > 0) this.#lastParentWidth = parentWidth;
        if (parentHeight > 0) this.#lastParentHeight = parentHeight;

        // 3. Resolve Dimensions using Hierarchical Fallback
        
        // Root: Current -> Global Cache -> Window Fallback (Last resort)
        const rW = rootWidth || UnitValue.#globalRootWidth || window.innerWidth;
        const rH = rootHeight || UnitValue.#globalRootHeight || window.innerHeight;

        // Parent: Current -> Instance Cache -> Root (Effective fallback for top-level elements)
        const pW = parentWidth || this.#lastParentWidth || rW;
        const pH = parentHeight || this.#lastParentHeight || rH;

        let value;

        switch (this.#unit) {
            case 'px': 
                value = this.#value; 
                break;
            case 'pw': 
                value = (this.#value * pW / 100); 
                break;
            case 'ph': 
                value = (this.#value * pH / 100); 
                break;
            case 'vw': 
                value = (this.#value * rW / 100); 
                break;
            case 'vh': 
                value = (this.#value * rH / 100); 
                break;
            case '%': 
                value = (this.#value * pW / 100); 
                break;
            case 'auto': 
                value = null; 
                break;
        }

        if (value !== null) {
            value = Math.round(value * 100) / 100;
        }

        // 4. Final Safety Check
        // If calculation yields 0, but the intention was non-zero (relative unit + non-zero value),
        // and we suspect invalid parent data (parent <= 0), preserve the old pixel value.
        // This stops the "collapse to 0" glitch.
        const isRelative = ['pw', 'ph', 'vw', 'vh', '%'].includes(this.#unit);
        const intendedNonZero = this.#value !== 0 && isRelative;
        const resultIsZero = value === 0;
        
        if (intendedNonZero && resultIsZero && this.#pixelValue !== 0) {
            return false;
        }
        // --- FIX END ---

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

        this.updatePixelValue({
            rootWidth: UnitValue.#globalRootWidth,
            rootHeight: UnitValue.#globalRootHeight,
            parentWidth: this.#lastParentWidth,
            parentHeight: this.#lastParentHeight
        });
        
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

        this.updatePixelValue({
            rootWidth: UnitValue.#globalRootWidth,
            rootHeight: UnitValue.#globalRootHeight,
            parentWidth: this.#lastParentWidth,
            parentHeight: this.#lastParentHeight
        });

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