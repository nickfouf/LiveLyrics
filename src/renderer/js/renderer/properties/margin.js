import {VirtualProperty} from "./property.js"
import {UnitValue} from "../values/unit.js";

export class MarginProperty extends VirtualProperty {
    #top = new UnitValue({value:0, unit:'px'});
    #right = new UnitValue({value:0, unit:'px'});
    #bottom = new UnitValue({value:0, unit:'px'});
    #left = new UnitValue({value:0, unit:'px'});
    constructor({top={value:0, unit:'px'}, right={value:0, unit:'px'}, bottom={value:0, unit:'px'}, left={value:0, unit:'px'}}={}) {
        super('margin', 'Margin');
        this.batchUpdate({top: top, right: right, bottom: bottom, left: left}, true);
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

    batchUpdate({top, right, bottom, left}, setAsDefault = false) {
        let changed = false;
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
            top: this.getTop(),
            right: this.getRight(),
            bottom: this.getBottom(),
            left: this.getLeft()
        };
    }

    getValue(name) {
        if(name === 'top') return this.getTop();
        if(name === 'right') return this.getRight();
        if(name === 'bottom') return this.getBottom();
        if(name === 'left') return this.getLeft();
        console.warn(`Value ${name} not found in MarginProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'top') return this.setTop(value, setAsDefault);
        if(key === 'right') return this.setRight(value, setAsDefault);
        if(key === 'bottom') return this.setBottom(value, setAsDefault);
        if(key === 'left') return this.setLeft(value, setAsDefault);
        console.warn(`Value ${key} not found in MarginProperty.`);
        return null;
    }

    applyChanges(element) {
        const domElement = element.domElement;

        if(this.#top.shouldRender) {
            domElement.style.top = this.#top.getCSSValue();
            this.#top.markAsRendered();
        }

        if(this.#right.shouldRender) {
            domElement.style.right = this.#right.getCSSValue();
            this.#right.markAsRendered();
        }

        if(this.#bottom.shouldRender) {
            domElement.style.bottom = this.#bottom.getCSSValue();
            this.#bottom.markAsRendered();
        }

        if(this.#left.shouldRender) {
            domElement.style.left = this.#left.getCSSValue();
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