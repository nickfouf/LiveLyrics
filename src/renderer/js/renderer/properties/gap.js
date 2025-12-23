// src/renderer/js/renderer/properties/gap.js

import { VirtualProperty } from "./property.js";
import { UnitValue } from "../values/unit.js";

export class GapProperty extends VirtualProperty {
    #gap = new UnitValue({ value: 8, unit: 'px' });

    constructor(options = {}) {
        super('gap', 'Gap');
        if (options && options.value !== undefined && options.unit !== undefined) {
            this.#gap.batchUpdate(options, true);
        }
    }

    getGap() {
        return this.#gap;
    }

    setGap({ value, unit }, setAsDefault = false) {
        return this.#gap.batchUpdate({ value, unit }, setAsDefault);
    }

    getValues() {
        return { gap: this.getGap() };
    }

    getValue(name) {
        if(name === 'gap') return this.getGap();
        console.warn(`Value ${name} not found in GapProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'gap') return this.setGap(value, setAsDefault);
        console.warn(`Value ${key} not found in GapProperty.`);
        return null;
    }

    applyChanges(element) {
        const domElement = element.domElement;
        if (this.#gap.shouldRender) {
            domElement.style.gap = this.#gap.getCSSValue();
            this.#gap.markAsRendered();
        }
    }

    resize({ element, root, parent }) {
        const rootWidth = root.getWidth();
        const rootHeight = root.getHeight();
        const parentWidth = parent.getWidth();
        const parentHeight = parent.getHeight();
        this.#gap.updatePixelValue({ rootWidth, rootHeight, parentWidth, parentHeight });
    }
}

