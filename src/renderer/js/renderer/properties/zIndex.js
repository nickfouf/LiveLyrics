import { VirtualProperty } from "./property.js";
import { NumberValue } from "../values/number.js";

export class ZIndexProperty extends VirtualProperty {
    #zIndex = new NumberValue(0);

    constructor(value = 0) {
        super('zIndex', 'Z-Index');
        this.setZIndex(value, true);
    }

    getZIndex() {
        return this.#zIndex;
    }

    setZIndex(value, setAsDefault = false) {
        return this.#zIndex.setValue(value, setAsDefault);
    }

    getValues() {
        return { zIndex: this.getZIndex() };
    }

    getValue(name) {
        if (name === 'zIndex') return this.getZIndex();
        console.warn(`Value ${name} not found in ZIndexProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if (key === 'zIndex') return this.setZIndex(value, setAsDefault);
        console.warn(`Value ${key} not found in ZIndexProperty.`);
        return false;
    }

    applyChanges(element) {
        const domElement = element.domElement;
        if (this.#zIndex.shouldRender) {
            domElement.style.zIndex = this.#zIndex.getValue();
            this.#zIndex.markAsRendered();
        }
    }
}

