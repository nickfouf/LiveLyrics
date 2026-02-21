// renderer/js/renderer/properties/textStroke.js

import { VirtualProperty } from "./property.js";
import { BooleanValue } from "../values/boolean.js";
import { UnitValue } from "../values/unit.js";
import { ColorValue } from "../values/color.js";

export class TextStrokeProperty extends VirtualProperty {
    #enabled = new BooleanValue(false);
    #width = new UnitValue({ value: 1, unit: 'px' });
    #color = new ColorValue({ r: 0, g: 0, b: 0, a: 1 });

    constructor(options = {}) {
        super('textStroke', 'Text Stroke');
        this.batchUpdate(options, true);
    }

    getEnabled() { return this.#enabled; }
    getWidth() { return this.#width; }
    getColor() { return this.#color; }

    setEnabled(value, setAsDefault = false) {
        return this.#enabled.setValue(value, setAsDefault);
    }

    setWidth({value, unit}, setAsDefault = false) {
        return this.#width.batchUpdate({value, unit}, setAsDefault);
    }

    setColor(value, setAsDefault = false) {
        return this.#color.setColorObject(value, setAsDefault);
    }

    batchUpdate({ enabled, width, color }, setAsDefault = false) {
        if (enabled !== undefined) this.setEnabled(enabled, setAsDefault);
        if (width !== undefined) this.setWidth(width, setAsDefault);
        if (color !== undefined) this.setColor(color, setAsDefault);
    }

    getValues() {
        return {
            enabled: this.getEnabled(),
            width: this.getWidth(),
            color: this.getColor()
        };
    }

    getValue(name) {
        if (name === 'enabled') return this.getEnabled();
        if (name === 'width') return this.getWidth();
        if (name === 'color') return this.getColor();
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if (key === 'enabled') return this.setEnabled(value, setAsDefault);
        if (key === 'width') return this.setWidth(value, setAsDefault);
        if (key === 'color') return this.setColor(value, setAsDefault);
        return null;
    }

    applyChanges(element) {
        const domElement = element.textElement || element.domElement;

        if (this.#enabled.shouldRender || this.#width.shouldRender || this.#color.shouldRender) {
            
            const enabled = this.#enabled.getValue();
            const width = this.#width.getCSSValue();
            const color = this.#color.getCSSValue();

            if (element.type === 'lyrics') {
                // For lyrics (SVG), we update CSS variables on the root SVG.
                // The LyricsLayout logic handles the creation of the stroke-layer elements.
                const svg = element.domElement.shadowRoot.querySelector('svg');
                if (svg) {
                    if (enabled) {
                        svg.style.setProperty('--text-stroke-width', width);
                        svg.style.setProperty('--text-stroke-color', color);
                        svg.classList.add('has-stroke');
                    } else {
                        svg.style.removeProperty('--text-stroke-width');
                        svg.style.removeProperty('--text-stroke-color');
                        svg.classList.remove('has-stroke');
                    }
                }
            } else {
                // For standard HTML text elements (Text, Title) using Webkit Text Stroke
                if (enabled) {
                    domElement.style.webkitTextStrokeWidth = width;
                    domElement.style.webkitTextStrokeColor = color;
                } else {
                    domElement.style.webkitTextStrokeWidth = '0';
                    domElement.style.webkitTextStrokeColor = 'transparent';
                }
            }

            this.#enabled.markAsRendered();
            this.#width.markAsRendered();
            this.#color.markAsRendered();
        }
    }
}

