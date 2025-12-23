// src/renderer/js/renderer/values/dynamicStringValue.js

import { EventsArray } from "../events/eventsArray.js";
import { DynamicStringEvent } from '../events/dynamicStringEvent.js';

export class DynamicStringValue {
    #events = new EventsArray();
    #value;
    #id;
    #shouldRender;

    getEvents() { return this.#events; }

    getDefaultValue() {
        return this.#events.getDefaultValue();
    }

    removeEvent(event) { return this.#events.remove(event); }
    addEvent(event) {
        if (!(event instanceof DynamicStringEvent)) {
            throw new Error("Event must be an instance of DynamicStringEvent");
        }
        this.#events.insert(event);
    }

    applyEvent(measureIndex, measureProgress) {
        const result = this.#events.getInterpolatedValue(measureIndex, measureProgress, 'dynamic-string');
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

    constructor({ value = '', id = null } = {}) {
        this.setDefaultValue({ value, id });
    }

    getValue() { return this.#value; }
    getId() { return this.#id; }
    getFullValue() { return { value: this.#value, id: this.#id }; }
    getCSSValue() { return this.#value; }

    setValue(value, setAsDefault = false) {
        if (setAsDefault) {
            return this.setDefaultValue({ value });
        }
        if (this.#value === value) return false;
        this.#value = value;
        this.#shouldRender = true;
        return true;
    }

    setId(id, setAsDefault = false) {
        if (setAsDefault) {
            return this.setDefaultValue({ id });
        }
        if (this.#id === id) return false;
        this.#id = id;
        this.#shouldRender = true;
        return true;
    }

    setDefaultValue({ value, id }) {
        const defaultValue = this.getDefaultValue() || {};
        if (typeof value === 'undefined') value = defaultValue.value;
        if (typeof id === 'undefined') id = defaultValue.id;

        const valueChanged = defaultValue.value !== value;
        const idChanged = defaultValue.id !== id;

        if (!valueChanged && !idChanged) return false;

        this.#events.setDefaultValue({ value, id });
        this.#shouldRender = true;
        return true;
    }

    batchUpdate({ value, id }, setAsDefault = false) {
        const valueChange = this.setValue(value, setAsDefault);
        const idChange = this.setId(id, setAsDefault);
        return valueChange || idChange;
    }

    markAsRendered() {
        this.#shouldRender = false;
    }

    markAsDirty() {
        this.#shouldRender = true;
    }
}

