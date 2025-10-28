import { VirtualProperty } from "./property.js"
import {NumberValue} from "../values/number.js";
import {ColorOrGradientValue} from "../values/color.js";

export class ProgressProperty extends VirtualProperty {
    #progress = new NumberValue(0);
    #backgroundColor = new ColorOrGradientValue({r: 220, g: 220, b: 220, a:1, mode:'color'});
    #fillColor = new ColorOrGradientValue({r: 0, g: 120, b: 215, a:1, mode:'color'});

    constructor({progress = 0, backgroundColor={r: 220, g: 220, b: 220, a:1, mode:'color'}, fillColor={r: 0, g: 120, b: 215, a:1, mode:'color'}} = {}) {
        super('progress', 'Bar Style');
        this.batchUpdate({progress, backgroundColor, fillColor}, true);
    }

    getProgress() {
        return this.#progress;
    }

    setProgress(value, setAsDefault = false) {
        return this.#progress.setValue(value, setAsDefault);
    }

    getBackgroundColor() {
        return this.#backgroundColor;
    }

    setBackgroundColor(value, setAsDefault = false) {
        return this.#backgroundColor.setColorOrGradientObject(value, setAsDefault);
    }

    getFillColor() {
        return this.#fillColor;
    }

    setFillColor(value, setAsDefault = false) {
        return this.#fillColor.setColorOrGradientObject(value, setAsDefault);
    }

    batchUpdate({progress, backgroundColor, fillColor}, setAsDefault = false) {
        let changed = false;
        if (progress !== undefined) {
            changed = this.setProgress(progress, setAsDefault) || changed;
        }
        if (backgroundColor) {
            changed = this.setBackgroundColor(backgroundColor, setAsDefault) || changed;
        }
        if (fillColor) {
            changed = this.setFillColor(fillColor, setAsDefault) || changed;
        }
        return changed;
    }

    getValues() {
        return {
            progress: this.#progress,
            backgroundColor: this.#backgroundColor,
            fillColor: this.#fillColor
        };
    }

    getValue(name) {
        if(name === 'progress') return this.getProgress();
        if(name === 'backgroundColor') return this.getBackgroundColor();
        if(name === 'fillColor') return this.getFillColor();
        console.warn(`ProgressProperty: getValue - Unknown property name "${name}"`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'progress') return this.setProgress(value, setAsDefault);
        if(key === 'backgroundColor') return this.setBackgroundColor(value, setAsDefault);
        if(key === 'fillColor') return this.setFillColor(value, setAsDefault);
        console.warn(`ProgressProperty: setValue - Unknown property name "${key}"`);
        return false;
    }

    applyChanges(element) {
        const domElement = element.domElement;
        const fillElement = domElement.querySelector('[data-progress-fill]');

        if (this.#progress.shouldRender) {
            const numValue = this.getProgress().getValue();
            fillElement.style.width = `${numValue}%`;
            this.#progress.markAsRendered();
        }

        if (this.#backgroundColor.shouldRender) {
            domElement.style.background = this.#backgroundColor.getCSSValue();
            this.#backgroundColor.markAsRendered();
        }

        if (this.#fillColor.shouldRender) {
            fillElement.style.background = this.#fillColor.getCSSValue();
            this.#fillColor.markAsRendered();
        }
    }
}