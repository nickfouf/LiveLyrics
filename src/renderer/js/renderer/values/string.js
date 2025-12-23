// src/renderer/js/renderer/values/string.js

import { EventsArray } from '../events/eventsArray.js';
import { StringEvent } from '../events/stringEvent.js';

export class StringValue {
    #value = '';
    #shouldRender = false;
    #events = new EventsArray();

    getEvents() { return this.#events; }

    getDefaultValue() {
        return this.#events.getDefaultValue();
    }

    removeEvent(event) { return this.#events.remove(event); }
    addEvent(event) {
        if (!(event instanceof StringEvent)) {
            throw new Error("Event must be an instance of StringEvent");
        }
        this.#events.insert(event);
    }

    applyEvent(measureIndex, measureProgress) {
        const result = this.#events.getInterpolatedValue(measureIndex, measureProgress, 'string');
        if (result !== null && result !== undefined) {
            this.setValue(result);
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

    constructor(value='') {
        this.setDefaultValue(value);
    }

    getValue() {
        return this.#value;
    }

    getCSSValue() {
        return this.#value;
    }

    setDefaultValue(value) {
        if(this.#events.getDefaultValue() === value) return false;
        this.#events.setDefaultValue(value);
        this.#value = value;
        this.#shouldRender = true;
        return true;
    }

    setValue(value, setAsDefault = false) {
        if(setAsDefault) {
            return this.setDefaultValue(value);
        }
        if(this.#value === value) return false;
        console.log(`[StringValue] Value changed from '${this.#value}' to '${value}'. Setting shouldRender = true.`);
        this.#value = value;
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



