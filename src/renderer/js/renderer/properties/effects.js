import { VirtualProperty } from './property.js';
import { NumberValue } from "../values/number.js";

export class EffectsProperty extends VirtualProperty {
    #opacity = new NumberValue(1);

    constructor(options = {}) {
        super('effects', 'Effects');
        // --- START: MODIFICATION ---
        // Handle both object {opacity: 0.5} and raw number 0.5 from serialization for backward compatibility.
        const opacityValue = (typeof options === 'object' && options !== null && options.opacity !== undefined)
            ? options.opacity
            : (typeof options === 'number' ? options : undefined);

        if (opacityValue !== undefined) {
            this.setOpacity(opacityValue, true);
        }
        // --- END: MODIFICATION ---
    }

    getOpacity() {
        return this.#opacity;
    }

    setOpacity(value, setAsDefault = false) {
        return this.#opacity.setValue(value, setAsDefault);
    }

    getValues() {
        return { opacity: this.getOpacity() };
    }

    getValue(name) {
        if(name === 'opacity') return this.getOpacity();
        console.warn(`Value ${name} not found in EffectsProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'opacity') return this.setOpacity(value, setAsDefault);
        console.warn(`Value ${key} not found in EffectsProperty.`);
        return null;
    }

    // --- START: MODIFICATION ---
    /**
     * Overrides the default toJSON method to ensure the 'effects' property
     * is always saved as an object, making it future-proof for new effects.
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
        // Always return the object, even if it only has one key.
        return hasValues ? json : undefined;
    }
    // --- END: MODIFICATION ---

    applyChanges(element) {
        const domElement = element.domElement;
        if (this.#opacity.shouldRender) {
            domElement.style.opacity = this.#opacity.getCSSValue();
            this.#opacity.markAsRendered();
        }
    }
}