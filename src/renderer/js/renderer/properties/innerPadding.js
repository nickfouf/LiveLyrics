import { VirtualProperty } from "./property.js"
import { UnitValue } from "../values/unit.js";

export class InnerPaddingProperty extends VirtualProperty {
    #top = new UnitValue({value:0, unit:'px'});
    #right = new UnitValue({value:0, unit:'px'});
    #bottom = new UnitValue({value:0, unit:'px'});
    #left = new UnitValue({value:0, unit:'px'});
    
    // REVISED CONSTRUCTOR
    constructor(options = {}) {
        super('inner_padding', 'Inner Padding');
        // This now correctly handles default values and applies loaded options on top.
        this.batchUpdate(options, true);
    }

    get extendsDimensions() {
        return true;
    }
    getAdditionalHorizontalSpace() {
        const left = this.#left.getUnit() !== 'auto' ? this.#left.getPixelValue() : 0;
        const right = this.#right.getUnit() !== 'auto' ? this.#right.getPixelValue() : 0;
        return left + right;
    }
    getAdditionalVerticalSpace() {
        const top = this.#top.getUnit() !== 'auto' ? this.#top.getPixelValue() : 0;
        const bottom = this.#bottom.getUnit() !== 'auto' ? this.#bottom.getPixelValue() : 0;
        return top + bottom;
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

    // REVISED BATCHUPDATE
    batchUpdate({top, right, bottom, left}, setAsDefault = false) {
        let changed = false;
        // Check for `undefined` to correctly handle partial updates when loading.
        if(top !== undefined) {
            changed = this.setTop(top, setAsDefault) || changed;
        }
        if(right !== undefined) {
            changed = this.setRight(right, setAsDefault) || changed;
        }
        if(bottom !== undefined) {
            changed = this.setBottom(bottom, setAsDefault) || changed;
        }
        if(left !== undefined) {
            changed = this.setLeft(left, setAsDefault) || changed;
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
        console.warn(`Value ${name} not found in InnerPaddingProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'top') return this.setTop(value, setAsDefault);
        if(key === 'right') return this.setRight(value, setAsDefault);
        if(key === 'bottom') return this.setBottom(value, setAsDefault);
        if(key === 'left') return this.setLeft(value, setAsDefault);
        console.warn(`Value ${key} not found in InnerPaddingProperty.`);
        return null;
    }

    applyChanges(element) {
        const domElement = element.domElement;

        if(this.#top.shouldRender) {
            domElement.style.paddingTop = this.#top.getCSSValue();
            this.#top.markAsRendered();
        }

        if(this.#right.shouldRender) {
            domElement.style.paddingRight = this.#right.getCSSValue();
            this.#right.markAsRendered();
        }

        if(this.#bottom.shouldRender) {
            domElement.style.paddingBottom = this.#bottom.getCSSValue();
            this.#bottom.markAsRendered();
        }

        if(this.#left.shouldRender) {
            domElement.style.paddingLeft = this.#left.getCSSValue();
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

    resize({element, root, parent}) {
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