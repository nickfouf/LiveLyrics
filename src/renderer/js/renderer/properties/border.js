import { VirtualProperty } from "./property.js";
import { BooleanValue } from "../values/boolean.js";
import { UnitValue } from "../values/unit.js";
import { ColorValue } from "../values/color.js";

export class BorderProperty extends VirtualProperty {
    #enabled = new BooleanValue(false);
    #width = new UnitValue({ value: 1, unit: 'px' });
    #radius = new UnitValue({ value: 0, unit: 'px' });
    #color = new ColorValue({ r: 255, g: 255, b: 255, a: 1 });

    constructor(options = {}) {
        super('border', 'Border');
        this.batchUpdate(options, true);
    }

    get extendsDimensions() {
        return true;
    }

    getAdditionalHorizontalSpace() {
        const left = this.#enabled.getValue() && this.#width.getUnit() !== 'auto' ? this.#width.getPixelValue() : 0;
        const right = this.#enabled.getValue() && this.#width.getUnit() !== 'auto' ? this.#width.getPixelValue() : 0;
        return left + right;
    }

    getAdditionalVerticalSpace() {
        const top = this.#enabled.getValue() ? this.#width.getPixelValue() : 0;
        const bottom = this.#enabled.getValue() ? this.#width.getPixelValue() : 0;
        return top + bottom;
    }

    getEnabled() {
        return this.#enabled;
    }

    getWidth() {
        return this.#width;
    }

    getRadius() {
        return this.#radius;
    }

    getColor() {
        return this.#color;
    }

    setEnabled(value, setAsDefault = false) {
        return this.#enabled.setValue(value, setAsDefault);
    }

    setWidth({unit, value}, setAsDefault = false) {
        return this.#width.batchUpdate({unit, value}, setAsDefault);
    }

    setRadius({unit, value}, setAsDefault = false) {
        return this.#radius.batchUpdate({unit, value}, setAsDefault);
    }

    setColor(value, setAsDefault = false) {
        return this.#color.setColorObject(value, setAsDefault);
    }

    batchUpdate({ enabled, width, radius, color }, setAsDefault = false) {
        if (enabled !== undefined) this.setEnabled(enabled, setAsDefault);
        if (width !== undefined) this.setWidth(width, setAsDefault);
        if (radius !== undefined) this.setRadius(radius, setAsDefault);
        if (color !== undefined) this.setColor(color, setAsDefault);
    }

    getValues() {
        return {
            enabled: this.getEnabled(),
            width: this.getWidth(),
            radius: this.getRadius(),
            color: this.getColor()
        };
    }

    getValue(name) {
        if(name === 'enabled') return this.getEnabled();
        if(name === 'width') return this.getWidth();
        if(name === 'radius') return this.getRadius();
        if(name === 'color') return this.getColor();
        console.warn(`BorderProperty does not have a value named ${name}`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'enabled') return this.setEnabled(value, setAsDefault);
        if(key === 'width') return this.setWidth(value, setAsDefault);
        if(key === 'radius') return this.setRadius(value, setAsDefault);
        if(key === 'color') return this.setColor(value, setAsDefault);
        console.warn(`BorderProperty does not have a value named ${key}`);
        return null;
    }

    applyChanges(element) {
        const domElement = element.domElement;
        if (this.#enabled.shouldRender || this.#width.shouldRender || this.#radius.shouldRender || this.#color.shouldRender) {
            if (!this.#enabled.getValue()) {
                domElement.style.border = 'none';
                domElement.style.borderRadius = '0px';
            } else {
                domElement.style.border = `${this.#width.getCSSValue()} solid ${this.#color.getCSSValue()}`;
                domElement.style.borderRadius = this.#radius.getCSSValue();
            }
            this.#enabled.markAsRendered();
            this.#width.markAsRendered();
            this.#radius.markAsRendered();
            this.#color.markAsRendered();
        }
    }

    resize({ element, root, parent }) {
        const rootWidth = root.getWidth();
        const rootHeight = root.getHeight();
        const parentWidth = parent.getWidth();
        const parentHeight = parent.getHeight();
        this.#width.updatePixelValue({ rootWidth, rootHeight, parentWidth, parentHeight });
        this.#radius.updatePixelValue({ rootWidth, rootHeight, parentWidth, parentHeight });
    }
}



