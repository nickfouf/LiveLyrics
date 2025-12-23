export class VirtualProperty {
    #type;
    #name;
    constructor(type='property', name='Unnamed Property') {
        this.#type = type;
        this.#name = name;
    }

    get extendsDimensions() {
        return false;
    }

    get type() {
        return this.#type;
    }

    get name() {
        return this.#name;
    }

    getValues() {
        console.warn('getValues not implemented for this property type:', this.#type);
    }

    getValue(name) {
        console.warn('getValue not implemented for this property type:', this.#type);
    }

    setValue(key, value, setAsDefault = false) {
        console.warn('setValue not implemented for this property type:', this.#type);
    }

    /**
     * ADDED: Generic serialization method.
     * Iterates through the property's values and serializes their default state.
     * Returns undefined if there's nothing to serialize.
     */
    toJSON() {
        const values = this.getValues();
        const json = {};
        let hasValues = false;

        for (const key in values) {
            const valueObject = values[key];
            if (valueObject && typeof valueObject.getDefaultValue === 'function') {
                json[key] = valueObject.getDefaultValue();
                hasValues = true;
            }
        }
        // For simple properties with a single value, return the value directly.
        if (hasValues && Object.keys(json).length === 1) {
            return Object.values(json)[0];
        }

        return hasValues ? json : undefined;
    }

    applyChanges(domElement) {
        console.warn('applyChanges not implemented for this property type:', this.#type);
    }

    applyEvents(element, measureIndex, measureProgress, timingData) {
        const values = this.getValues();
        for (const key in values) {
            const value = values[key];
            if( typeof value.applyEvent !== 'function') {
                continue;
            }
            value.applyEvent(measureIndex, measureProgress);
        }
    }

    getEventsData() {
        const eventsData = [];
        const values = this.getValues();
        for (const key in values) {
            const value = values[key];
            if( typeof value.getEventsData !== 'function') {
                // console.warn(`Value ${key} does not have a getEventsData method.`);
                continue;
            }
            const valueEventsData = value.getEvents();
            if (Array.isArray(valueEventsData)) {
                eventsData.push(valueEventsData);
            }
        }
        return eventsData.flat();
    }

    setEventData(eventsData) {
        for (const valueKey of eventsData) {
        }
    }

    batchUpdate() {
        console.warn('batchUpdate not implemented for this property type:', this.#type);
    }

    resize({element, root, parent}) {
        // Default implementation does nothing
    }
}



