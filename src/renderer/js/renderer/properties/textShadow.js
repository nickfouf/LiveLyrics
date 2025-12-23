import { VirtualProperty } from "./property.js";
import { BooleanValue } from "../values/boolean.js";
import { UnitValue } from "../values/unit.js";
import { ColorValue } from "../values/color.js";
import { NumberValue } from "../values/number.js";

export class TextShadowProperty extends VirtualProperty {
    #enabled = new BooleanValue(false);
    #textShadowAngle = new NumberValue(90);
    #textShadowDistance = new UnitValue({ value: 2, unit: 'px' });
    #blur = new UnitValue({ value: 4, unit: 'px' });
    #color = new ColorValue({ r: 0, g: 0, b: 0, a: 0.5 });

    constructor(options = {}) {
        super('textShadow', 'Text Shadow');
        this.batchUpdate(options, true);
    }

    getEnabled() { return this.#enabled; }
    getTextShadowAngle() { return this.#textShadowAngle; }
    getTextShadowDistance() { return this.#textShadowDistance; }
    getBlur() { return this.#blur; }
    getColor() { return this.#color; }

    setEnabled(value, setAsDefault = false) { return this.#enabled.setValue(value, setAsDefault); }
    setTextShadowAngle(value, setAsDefault = false) { return this.#textShadowAngle.setValue(value, setAsDefault); }
    setTextShadowDistance(value, setAsDefault = false) { return this.#textShadowDistance.batchUpdate(value, setAsDefault); }
    setBlur(value, setAsDefault = false) { return this.#blur.batchUpdate(value, setAsDefault); }
    setColor(value, setAsDefault = false) { return this.#color.setColorObject(value, setAsDefault); }

    batchUpdate({ enabled, textShadowAngle, textShadowDistance, blur, color }, setAsDefault = false) {
        if (enabled !== undefined) this.setEnabled(enabled, setAsDefault);
        if (textShadowAngle !== undefined) this.setTextShadowAngle(textShadowAngle, setAsDefault);
        if (textShadowDistance !== undefined) this.setTextShadowDistance(textShadowDistance, setAsDefault);
        if (blur !== undefined) this.setBlur(blur, setAsDefault);
        if (color !== undefined) this.setColor(color, setAsDefault);
    }

    getValues() {
        return {
            enabled: this.#enabled,
            textShadowAngle: this.#textShadowAngle,
            textShadowDistance: this.#textShadowDistance,
            blur: this.#blur,
            color: this.#color
        };
    }

    getValue(name) {
        const values = this.getValues();
        return values[name] || null;
    }

    setValue(key, value, setAsDefault = false) {
        if (key === 'enabled') return this.setEnabled(value, setAsDefault);
        if (key === 'textShadowAngle') return this.setTextShadowAngle(value, setAsDefault);
        if (key === 'textShadowDistance') return this.setTextShadowDistance(value, setAsDefault);
        if (key === 'blur') return this.setBlur(value, setAsDefault);
        if (key === 'color') return this.setColor(value, setAsDefault);
        console.warn(`TextShadowProperty has no value named ${key}`);
        return null;
    }

    applyChanges(element) {
        if (this.#enabled.shouldRender || this.#textShadowAngle.shouldRender || this.#textShadowDistance.shouldRender || this.#blur.shouldRender || this.#color.shouldRender) {
            
            const enabled = this.#enabled.getValue();
            const angleRad = (this.#textShadowAngle.getValue() * Math.PI) / 180;
            const distPx = this.#textShadowDistance.getPixelValue();
            
            const offsetX = (Math.cos(angleRad) * distPx).toFixed(2);
            const offsetY = (Math.sin(angleRad) * distPx).toFixed(2);
            
            const b = this.#blur.getCSSValue();
            const c = this.#color.getCSSValue();

            if (element.type === 'lyrics') {
                const svg = element.domElement.shadowRoot.querySelector('svg');
                if (svg) {
                    svg.style.filter = enabled ? `drop-shadow(${offsetX}px ${offsetY}px ${b} ${c})` : 'none';
                    svg.style.overflow = 'visible';
                }
            } else {
                const target = element.textElement || element.domElement;
                target.style.textShadow = enabled ? `${offsetX}px ${offsetY}px ${b} ${c}` : 'none';
            }

            Object.values(this.getValues()).forEach(v => v.markAsRendered());
        }
    }

    resize({ element, root, parent }) {
        const rootWidth = root.getWidth();
        const rootHeight = root.getHeight();
        const parentWidth = parent.getWidth();
        const parentHeight = parent.getHeight();
        const dimensions = { rootWidth, rootHeight, parentWidth, parentHeight };
        this.#textShadowDistance.updatePixelValue(dimensions);
        this.#blur.updatePixelValue(dimensions);
    }
}