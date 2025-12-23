import { VirtualProperty } from "./property.js";

export class NameProperty extends VirtualProperty {
    #name = '';
    constructor(name) {
        super('name', 'Name');
        this.setName(name);
    }
    get name() {
        return this.#name;
    }
    setName(value) {
        if(this.#name === value) return false;
        this.#name = value;
        return true;
    }

    getValues() {
        return { };
    }

    getValue(name) {
        console.warn(`NameProperty: getValue - Unknown property name "${name}"`);
        return null;
    }

    setValue(key, value) {
        console.warn(`NameProperty: setValue - Unknown property name "${key}"`);
        return null;
    }

    toJSON() {
        return this.name;
    }

    applyChanges(domElement) {
        // This property does not affect the DOM element's appearance
    }
}

