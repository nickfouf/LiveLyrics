import { VirtualProperty } from './property.js';
import { NumberValue } from "../values/number.js";
import { StringValue } from "../values/string.js";

export class EffectsProperty extends VirtualProperty {
    #opacity = new NumberValue(1);
    #mixBlendMode = new StringValue('normal');

    constructor(options = {}) {
        super('effects', 'Effects');
        
        // Handle opacity
        const opacityValue = (typeof options === 'object' && options !== null && options.opacity !== undefined)
            ? options.opacity
            : (typeof options === 'number' ? options : undefined);

        if (opacityValue !== undefined) {
            this.setOpacity(opacityValue, true);
        }

        // Handle mixBlendMode
        const blendModeValue = (typeof options === 'object' && options !== null && options.mixBlendMode !== undefined)
            ? options.mixBlendMode
            : 'normal';
        
        this.setMixBlendMode(blendModeValue, true);
    }

    getOpacity() {
        return this.#opacity;
    }

    setOpacity(value, setAsDefault = false) {
        return this.#opacity.setValue(value, setAsDefault);
    }

    getMixBlendMode() {
        return this.#mixBlendMode;
    }

    setMixBlendMode(value, setAsDefault = false) {
        return this.#mixBlendMode.setValue(value, setAsDefault);
    }

    getValues() {
        return { 
            opacity: this.getOpacity(),
            mixBlendMode: this.getMixBlendMode()
        };
    }

    getValue(name) {
        if(name === 'opacity') return this.getOpacity();
        if(name === 'mixBlendMode') return this.getMixBlendMode();
        console.warn(`Value ${name} not found in EffectsProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'opacity') return this.setOpacity(value, setAsDefault);
        if(key === 'mixBlendMode') return this.setMixBlendMode(value, setAsDefault);
        console.warn(`Value ${key} not found in EffectsProperty.`);
        return null;
    }

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
        return hasValues ? json : undefined;
    }

    applyChanges(element) {
        const domElement = element.domElement;
        
        if (this.#opacity.shouldRender) {
            domElement.style.opacity = this.#opacity.getCSSValue();
            this.#opacity.markAsRendered();
        }

        if (this.#mixBlendMode.shouldRender) {
            domElement.style.mixBlendMode = this.#mixBlendMode.getValue();
            this.#mixBlendMode.markAsRendered();
        }
    }
}