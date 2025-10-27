import { VirtualProperty } from './property.js';
import { ColorOrGradientValue } from '../values/color.js';
import { BooleanValue } from "../values/boolean.js";

/* Background Property (Color or Gradient) */
export class BackgroundProperty extends VirtualProperty {
    #enabled = new BooleanValue(true);
    #background = new ColorOrGradientValue({r: 0, g: 0, b: 0, a:1, mode:'color'});

    constructor(options = {}) {
        super('background', 'Background');
        if (options.enabled !== undefined || options.background !== undefined) {
            this.batchUpdate(options, true);
        }
    }

    getEnabled() {
        return this.#enabled;
    }

    setEnabled(value, setAsDefault = false) {
        return this.#enabled.setValue(value, setAsDefault);
    }

    getBackground() {
        return this.#background;
    }

    setBackground(value, setAsDefault = false) {
        console.log('BackgroundProperty: setBackground', { value, setAsDefault });
        if (value) {
            return this.#background.setColorOrGradientObject(value, setAsDefault);
        }
        return false;
    }

    batchUpdate({ enabled, background }, setAsDefault = false) {
        if (enabled !== undefined) this.setEnabled(enabled, setAsDefault);
        if (background) this.setBackground(background, setAsDefault);
    }

    getValues() {
        return {
            enabled: this.getEnabled(),
            background: this.getBackground()
        };
    }

    getValue(name) {
        if(name === 'enabled') return this.getEnabled();
        if(name === 'background') return this.getBackground();
        console.warn(`BackgroundProperty: getValue - Unknown property name "${name}"`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'enabled') return this.setEnabled(value, setAsDefault);
        if(key === 'background') return this.setBackground(value, setAsDefault);
        console.warn(`BackgroundProperty: setValue - Unknown property name "${key}"`);
        return false;
    }

    applyChanges(element) {
        if (this.#enabled.shouldRender || this.#background.shouldRender) {
            if (!this.#enabled.getValue()) {
                element.domElement.style.background = 'none';
            } else {
                element.domElement.style.background = this.#background.getCSSValue();
            }
            this.#enabled.markAsRendered();
            this.#background.markAsRendered();
        }
    }
}