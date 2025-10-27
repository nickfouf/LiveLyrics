import { VirtualProperty } from "./property.js";
import { BooleanValue } from "../values/boolean.js";
import { UnitValue } from "../values/unit.js";
import { ColorValue } from "../values/color.js";

export class BoxShadowProperty extends VirtualProperty {
    #enabled = new BooleanValue(false);
    #inset = new BooleanValue(false);
    #offsetX = new UnitValue({ value: 0, unit: 'px' });
    #offsetY = new UnitValue({ value: 0, unit: 'px' });
    #blur = new UnitValue({ value: 20, unit: 'px' });
    #spread = new UnitValue({ value: 4, unit: 'px' });
    #color = new ColorValue({ r: 0, g: 0, b: 0, a: 1 });

    get extendsDimensions() {
        return true;
    }

    constructor(options = {}) {
        super('boxShadow', 'Box Shadow');
        this.batchUpdate(options, true);
    }

    getEnabled() {
        return this.#enabled;
    }

    setEnabled(value, setAsDefault = false) {
        return this.#enabled.setValue(value, setAsDefault);
    }

    getInset() {
        return this.#inset;
    }

    setInset(value, setAsDefault = false) {
        return this.#inset.setValue(value, setAsDefault);
    }

    getOffsetX() {
        return this.#offsetX;
    }

    setOffsetX({ value, unit }, setAsDefault = false) {
        return this.#offsetX.batchUpdate({ value, unit }, setAsDefault);
    }

    getOffsetY() {
        return this.#offsetY;
    }

    setOffsetY({ value, unit }, setAsDefault = false) {
        return this.#offsetY.batchUpdate({ value, unit }, setAsDefault);
    }

    getBlur() {
        return this.#blur;
    }

    setBlur({ value, unit }, setAsDefault = false) {
        return this.#blur.batchUpdate({ value, unit }, setAsDefault);
    }

    getSpread() {
        return this.#spread;
    }

    setSpread({ value, unit }, setAsDefault = false) {
        return this.#spread.batchUpdate({ value, unit }, setAsDefault);
    }

    getColor() {
        return this.#color;
    }

    setColor(value, setAsDefault = false) {
        return this.#color.setColorObject(value, setAsDefault);
    }

    batchUpdate({ enabled, inset, offsetX, offsetY, blur, spread, color }, setAsDefault = false) {
        if (enabled !== undefined) this.setEnabled(enabled, setAsDefault);
        if (inset !== undefined) this.setInset(inset, setAsDefault);
        if (offsetX !== undefined) this.setOffsetX(offsetX, setAsDefault);
        if (offsetY !== undefined) this.setOffsetY(offsetY, setAsDefault);
        if (blur !== undefined) this.setBlur(blur, setAsDefault);
        if (spread !== undefined) this.setSpread(spread, setAsDefault);
        if (color !== undefined) this.setColor(color, setAsDefault);
    }

    getValues() {
        return {
            enabled: this.getEnabled(),
            inset: this.getInset(),
            offsetX: this.getOffsetX(),
            offsetY: this.getOffsetY(),
            blur: this.getBlur(),
            spread: this.getSpread(),
            color: this.getColor()
        };
    }

    getValue(name) {
        if(name === 'enabled') return this.getEnabled();
        if(name === 'inset') return this.getInset();
        if(name === 'offsetX') return this.getOffsetX();
        if(name === 'offsetY') return this.getOffsetY();
        if(name === 'blur') return this.getBlur();
        if(name === 'spread') return this.getSpread();
        if(name === 'color') return this.getColor();
        console.warn(`BoxShadowProperty has no value named ${name}`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'enabled') return this.setEnabled(value, setAsDefault);
        if(key === 'inset') return this.setInset(value, setAsDefault);
        if(key === 'offsetX') return this.setOffsetX(value, setAsDefault);
        if(key === 'offsetY') return this.setOffsetY(value, setAsDefault);
        if(key === 'blur') return this.setBlur(value, setAsDefault);
        if(key === 'spread') return this.setSpread(value, setAsDefault);
        if(key === 'color') return this.setColor(value, setAsDefault);
        console.warn(`BoxShadowProperty has no value named ${key}`);
        return null;
    }

    /**
     * Calculates the additional space the shadow adds to the outside of the element.
     * @returns {{top: number, right: number, bottom: number, left: number}}
     */
    getAdditionalSpace() {
        // If the shadow is disabled or inset, it adds no external space.
        if (!this.#enabled.getValue() || this.#inset.getValue()) {
            return { top: 0, right: 0, bottom: 0, left: 0 };
        }

        // Assumes UnitValue has a method to get the computed pixel value.
        // This is a reasonable assumption given the resize() method calls updatePixelValue().
        const offsetX = this.#offsetX.getPixelValue();
        const offsetY = this.#offsetY.getPixelValue();
        const blur = this.#blur.getPixelValue();
        const spread = this.#spread.getPixelValue();

        // Calculate the extra space for each side.
        const top = spread - offsetY + blur / 2;
        const right = spread + offsetX + blur / 2;
        const bottom = spread + offsetY + blur / 2;
        const left = spread - offsetX + blur / 2;

        return {
            top: Math.max(0, top),
            right: Math.max(0, right),
            bottom: Math.max(0, bottom),
            left: Math.max(0, left)
        };
    }

    getAdditionalHorizontalSpace() {
        const space = this.getAdditionalSpace();
        return space.left + space.right;
    }

    getAdditionalVerticalSpace() {
        const space = this.getAdditionalSpace();
        return space.top + space.bottom;
    }

    applyChanges(element) {
        const domElement = element.effectsElement || element.domElement;
        if (this.#enabled.shouldRender || this.#inset.shouldRender || this.#offsetX.shouldRender || this.#offsetY.shouldRender || this.#blur.shouldRender || this.#spread.shouldRender || this.#color.shouldRender) {
            if (!this.#enabled.getValue()) {
                domElement.style.boxShadow = 'none';
            } else {
                const insetStr = this.#inset.getValue() ? 'inset' : '';
                domElement.style.boxShadow = `${insetStr} ${this.#offsetX.getCSSValue()} ${this.#offsetY.getCSSValue()} ${this.#blur.getCSSValue()} ${this.#spread.getCSSValue()} ${this.#color.getCSSValue()}`;
            }
            // Mark all as rendered
            if(this.#enabled.shouldRender) this.#enabled.markAsRendered();
            if(this.#inset.shouldRender) this.#inset.markAsRendered();
            if(this.#offsetX.shouldRender) this.#offsetX.markAsRendered();
            if(this.#offsetY.shouldRender) this.#offsetY.markAsRendered();
            if(this.#blur.shouldRender) this.#blur.markAsRendered();
            if(this.#spread.shouldRender) this.#spread.markAsRendered();
            if(this.#color.shouldRender) this.#color.markAsRendered();
        }
    }

    resize({ element, root, parent }) {
        const rootWidth = root.getWidth();
        const rootHeight = root.getHeight();
        const parentWidth = parent.getWidth();
        const parentHeight = parent.getHeight();
        const dimensions = { rootWidth, rootHeight, parentWidth, parentHeight };
        this.#offsetX.updatePixelValue(dimensions);
        this.#offsetY.updatePixelValue(dimensions);
        this.#blur.updatePixelValue(dimensions);
        this.#spread.updatePixelValue(dimensions);
    }
}