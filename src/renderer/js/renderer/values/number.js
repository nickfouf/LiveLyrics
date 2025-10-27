// src/renderer/js/renderer/values/number.js

import { EventsArray } from '../events/eventsArray.js';
import { NumberEvent } from '../events/numberEvent.js';

export class NumberValue {
    #events = new EventsArray();
    #value;
    #shouldRender;

    getEvents() { return this.#events; }

    getDefaultValue() {
        return this.#events.getDefaultValue();
    }

    removeEvent(event) { return this.#events.remove(event); }
    addEvent(event) {
        if (!(event instanceof NumberEvent)) {
            throw new Error("Event must be an instance of NumberEvent");
        }
        this.#events.insert(event);
    }

    applyEvent(measureIndex, measureProgress) {
        const result = this.#events.getInterpolatedValue(measureIndex, measureProgress, 'number');
        if (result !== null) {
            const num = parseFloat(result);
            this.setValue(num);
        }
    }

    applyDefaultEvent() {
        const defaultValue = this.#events.getDefaultValue();
        if (defaultValue) {
            this.setValue(defaultValue);
        }
    }

    get shouldRender() {
        return this.#shouldRender;
    }

    getValue() {
        return this.#value;
    }

    getCSSValue() {
        return this.#value.toString();
    }

    constructor(value = 0) {
        this.setDefaultValue(value);
    }

    // This is for internal timeline updates
    setValue(value, setAsDefault = false) {
        if (setAsDefault) {
            return this.setDefaultValue(value);
        }
        if (this.#value === value) return false;
        this.#value = value;
        this.#shouldRender = true;
        return true;
    }

    // This is for user/property panel updates
    setDefaultValue(value) {
        const num = parseFloat(value);
        if (isNaN(num)) throw new Error('Value must be a number');

        if(this.getDefaultValue() === num) return false;
        this.#events.setDefaultValue(num);
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