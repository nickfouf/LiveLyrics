// src/renderer/js/renderer/properties/gravity.js

import { VirtualProperty } from "./property.js";
import { StringValue } from "../values/string.js";

export class GravityProperty extends VirtualProperty {
    #justifyContent = new StringValue('center');
    #alignItems = new StringValue('center');

    constructor({ justifyContent, alignItems } = {}) {
        super('gravity', 'Gravity');
        this.batchUpdate({ justify: justifyContent, align: alignItems }, true);
    }

    getJustifyContent() {
        return this.#justifyContent;
    }

    setJustifyContent(value, setAsDefault = false) {
        return this.#justifyContent.setValue(value, setAsDefault);
    }

    getAlignItems() {
        return this.#alignItems;
    }

    setAlignItems(value, setAsDefault = false) {
        return this.#alignItems.setValue(value, setAsDefault);
    }

    batchUpdate({ justify, align }, setAsDefault = false) {
        if (justify) this.setJustifyContent(justify, setAsDefault);
        if (align) this.setAlignItems(align, setAsDefault);
    }

    getValues() {
        return {
            justifyContent: this.getJustifyContent(),
            alignItems: this.getAlignItems()
        }
    }

    getValue(name) {
        if(name === 'justifyContent') return this.getJustifyContent();
        if(name === 'alignItems') return this.getAlignItems();
        console.warn(`Value ${name} not found in GravityProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault) {
        if(key === 'justifyContent') return this.setJustifyContent(value, setAsDefault);
        if(key === 'alignItems') return this.setAlignItems(value, setAsDefault);
        console.warn(`Value ${key} not found in GravityProperty.`);
        return null;
    }

    applyChanges(element) {
        const domElement = element.domElement;
        if (this.#justifyContent.shouldRender) {
            domElement.style.justifyContent = this.#justifyContent.getCSSValue();
            this.#justifyContent.markAsRendered();
        }
        if (this.#alignItems.shouldRender) {
            domElement.style.alignItems = this.#alignItems.getCSSValue();
            this.#alignItems.markAsRendered();
        }
    }
}



