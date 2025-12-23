// src/renderer/js/renderer/properties/visible.js

import { VirtualProperty } from "./property.js";
import { BooleanValue } from "../values/boolean.js";

export class VisibleProperty extends VirtualProperty {
    #visible = new BooleanValue(true);

    constructor(visible = true) {
        super('visible', 'Visible');
        this.setVisible(visible, true);
    }

    getVisible() {
        return this.#visible;
    }

    setVisible(value, setAsDefault = false) {
        return this.#visible.setValue(value, setAsDefault);
    }

    getValues() {
        return { visible: this.getVisible() };
    }

    getValue(name) {
        if (name === 'visible') return this.getVisible();
        console.warn(`VisibleProperty: getValue - Unknown property name "${name}"`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if (key === 'visible') return this.setVisible(value, setAsDefault);
        console.warn(`VisibleProperty: setValue - Unknown property name "${key}"`);
        return false;
    }

    applyChanges(element) {
        const domElement = element.domElement;
        if (this.#visible.shouldRender) {
            const isVisible = this.#visible.getValue();
            domElement.classList.toggle('noneDisplay', !isVisible);
            this.#visible.markAsRendered();
        }
    }
}


