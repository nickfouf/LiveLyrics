import {VirtualProperty} from "./property.js"
import {UnitValue} from "../values/unit.js";
import { BooleanValue } from "../values/boolean.js";

export class MarginProperty extends VirtualProperty {
    #enabled = new BooleanValue(false);
    #top = new UnitValue({value:0, unit:'px'});
    #right = new UnitValue({value:0, unit:'px'});
    #bottom = new UnitValue({value:0, unit:'px'});
    #left = new UnitValue({value:0, unit:'px'});
    constructor({enabled = false, top={value:0, unit:'px'}, right={value:0, unit:'px'}, bottom={value:0, unit:'px'}, left={value:0, unit:'px'}}={}) {
        super('margin', 'Margin');
        this.batchUpdate({enabled, top, right, bottom, left}, true);
    }

    getEnabled() {
        return this.#enabled;
    }

    setEnabled(value, setAsDefault = false) {
        return this.#enabled.setValue(value, setAsDefault);
    }

    getTop() {
        return this.#top;
    }

    getRight() {
        return this.#right;
    }

    getBottom() {
        return this.#bottom;
    }

    getLeft() {
        return this.#left;
    }

    setTop({value, unit}, setAsDefault = false) {
        return this.#top.batchUpdate({value, unit}, setAsDefault);
    }

    setRight({value, unit}, setAsDefault = false) {
        return this.#right.batchUpdate({value, unit}, setAsDefault);
    }

    setBottom({value, unit}, setAsDefault = false) {
        return this.#bottom.batchUpdate({value, unit}, setAsDefault);
    }

    setLeft({value, unit}, setAsDefault = false) {
        return this.#left.batchUpdate({value, unit}, setAsDefault);
    }

    batchUpdate({enabled, top, right, bottom, left}, setAsDefault = false) {
        let changed = false;
        if(enabled !== undefined) {
            changed = this.setEnabled(enabled, setAsDefault) || changed;
        }
        if(top) {
            changed = this.setTop({value: top.value, unit: top.unit}, setAsDefault) || changed;
        }
        if(right) {
            changed = this.setRight({value: right.value, unit: right.unit}, setAsDefault) || changed;
        }
        if(bottom) {
            changed = this.setBottom({value: bottom.value, unit: bottom.unit}, setAsDefault) || changed;
        }
        if(left) {
            changed = this.setLeft({value: left.value, unit: left.unit}, setAsDefault) || changed;
        }
        return changed;
    }

    getValues() {
        return {
            enabled: this.getEnabled(),
            top: this.getTop(),
            right: this.getRight(),
            bottom: this.getBottom(),
            left: this.getLeft()
        };
    }

    getValue(name) {
        if(name === 'enabled') return this.getEnabled();
        if(name === 'top') return this.getTop();
        if(name === 'right') return this.getRight();
        if(name === 'bottom') return this.getBottom();
        if(name === 'left') return this.getLeft();
        console.warn(`Value ${name} not found in MarginProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'enabled') return this.setEnabled(value, setAsDefault);
        if(key === 'top') return this.setTop(value, setAsDefault);
        if(key === 'right') return this.setRight(value, setAsDefault);
        if(key === 'bottom') return this.setBottom(value, setAsDefault);
        if(key === 'left') return this.setLeft(value, setAsDefault);
        console.warn(`Value ${key} not found in MarginProperty.`);
        return null;
    }

    applyChanges(element) {
        const domElement = element.domElement;

        if (this.#enabled.shouldRender || this.#top.shouldRender || this.#right.shouldRender || this.#bottom.shouldRender || this.#left.shouldRender) {
            if (!this.#enabled.getValue()) {
                domElement.style.top = '';
                domElement.style.right = '';
                domElement.style.bottom = '';
                domElement.style.left = '';
            } else {
                domElement.style.top = this.#top.getCSSValue();
                domElement.style.right = this.#right.getCSSValue();
                domElement.style.bottom = this.#bottom.getCSSValue();
                domElement.style.left = this.#left.getCSSValue();
            }
            this.#enabled.markAsRendered();
            this.#top.markAsRendered();
            this.#right.markAsRendered();
            this.#bottom.markAsRendered();
            this.#left.markAsRendered();
        }
    }

    updateTop({rootWidth, rootHeight, parentWidth, parentHeight}) {
        return this.#top.updatePixelValue({rootWidth, rootHeight, parentWidth, parentHeight});
    }

    updateRight({rootWidth, rootHeight, parentWidth, parentHeight}) {
        return this.#right.updatePixelValue({rootWidth, rootHeight, parentWidth, parentHeight});
    }

    updateBottom({rootWidth, rootHeight, parentWidth, parentHeight}) {
        return this.#bottom.updatePixelValue({rootWidth, rootHeight, parentWidth, parentHeight});
    }

    updateLeft({rootWidth, rootHeight, parentWidth, parentHeight}) {
        return this.#left.updatePixelValue({rootWidth, rootHeight, parentWidth, parentHeight});
    }

    resize({root, parent}) {
        const rootWidth = root.getWidth();
        const rootHeight = root.getHeight();
        const parentWidth = parent.getWidth();
        const parentHeight = parent.getHeight();
        const dimensions = {rootWidth, rootHeight, parentWidth, parentHeight};
        const topChanged = this.updateTop(dimensions);
        const rightChanged = this.updateRight(dimensions);
        const bottomChanged = this.updateBottom(dimensions);
        const leftChanged = this.updateLeft(dimensions);
        return topChanged || rightChanged || bottomChanged || leftChanged;
    }
}