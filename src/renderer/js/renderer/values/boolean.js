// src/renderer/js/renderer/values/boolean.js

import { EventsArray } from "../events/eventsArray.js";
import { BooleanEvent } from "../events/booleanEvent.js";

export class BooleanValue {
    #value = false;
    #shouldRender = false;
    #events = new EventsArray();

    getEvents() { return this.#events; }

    getDefaultValue() {
        return this.#events.getDefaultValue();
    }

    setDefaultValue(value) {
        const boolValue = !!value;
        if (this.#events.getDefaultValue() === boolValue) return false;
        this.#events.setDefaultValue(boolValue);
        this.#value = boolValue;
        this.#shouldRender = true;
        return true;
    }

    removeEvent(event) { return this.#events.remove(event); }
    addEvent(event) {
        if (!(event instanceof BooleanEvent)) {
            throw new Error("Event must be an instance of BooleanEvent");
        }
        this.#events.insert(event);
    }

    applyEvent(measureIndex, measureProgress) {
        const result = this.#events.getInterpolatedValue(measureIndex, measureProgress, 'boolean');
        if (result !== null) {
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

    constructor(value = false) {
        this.setDefaultValue(value);
    }

    getValue() {
        return this.#value;
    }

    setValue(value, setAsDefault = false) {
        const boolValue = !!value;
        if(setAsDefault) {
            return this.setDefaultValue(boolValue);
        }
        if (this.#value === boolValue) return false;
        this.#value = boolValue;
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



