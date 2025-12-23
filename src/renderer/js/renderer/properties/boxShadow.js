import { VirtualProperty } from "./property.js";
import { BooleanValue } from "../values/boolean.js";
import { UnitValue } from "../values/unit.js";
import { ColorValue } from "../values/color.js";
import { NumberValue } from "../values/number.js";

export class BoxShadowProperty extends VirtualProperty {
    #enabled = new BooleanValue(false);
    #inset = new BooleanValue(false);
    #shadowAngle = new NumberValue(90); 
    #shadowDistance = new UnitValue({ value: 5, unit: 'px' });
    #blur = new UnitValue({ value: 20, unit: 'px' });
    #spread = new UnitValue({ value: 4, unit: 'px' });
    #color = new ColorValue({ r: 0, g: 0, b: 0, a: 0.5 });

    get extendsDimensions() {
        return true;
    }

    constructor(options = {}) {
        super('boxShadow', 'Box Shadow');
        this.batchUpdate(options, true);
    }

    getEnabled() { return this.#enabled; }
    setEnabled(value, setAsDefault = false) { return this.#enabled.setValue(value, setAsDefault); }

    getInset() { return this.#inset; }
    setInset(value, setAsDefault = false) { return this.#inset.setValue(value, setAsDefault); }

    getShadowAngle() { return this.#shadowAngle; }
    setShadowAngle(value, setAsDefault = false) { return this.#shadowAngle.setValue(value, setAsDefault); }

    getShadowDistance() { return this.#shadowDistance; }
    setShadowDistance(value, setAsDefault = false) { return this.#shadowDistance.batchUpdate(value, setAsDefault); }

    getBlur() { return this.#blur; }
    setBlur(value, setAsDefault = false) { return this.#blur.batchUpdate(value, setAsDefault); }

    getSpread() { return this.#spread; }
    setSpread(value, setAsDefault = false) { return this.#spread.batchUpdate(value, setAsDefault); }

    getColor() { return this.#color; }
    setColor(value, setAsDefault = false) { return this.#color.setColorObject(value, setAsDefault); }

    batchUpdate({ enabled, inset, shadowAngle, shadowDistance, shadowBlur, blur, shadowSpread, spread, shadowColor, color }, setAsDefault = false) {
        if (enabled !== undefined) this.setEnabled(enabled, setAsDefault);
        if (inset !== undefined) this.setInset(inset, setAsDefault);
        if (shadowAngle !== undefined) this.setShadowAngle(shadowAngle, setAsDefault);
        if (shadowDistance !== undefined) this.setShadowDistance(shadowDistance, setAsDefault);
        
        // Handle both naming variations for robustness during loading
        if (blur !== undefined) this.setBlur(blur, setAsDefault);
        else if (shadowBlur !== undefined) this.setBlur(shadowBlur, setAsDefault);

        if (spread !== undefined) this.setSpread(spread, setAsDefault);
        else if (shadowSpread !== undefined) this.setSpread(shadowSpread, setAsDefault);

        if (color !== undefined) this.setColor(color, setAsDefault);
        else if (shadowColor !== undefined) this.setColor(shadowColor, setAsDefault);
    }

    /**
     * Returns the value objects. 
     * These keys MUST match the 'value' field in the keyToPath map in element.js
     */
    getValues() {
        return {
            enabled: this.#enabled,
            inset: this.#inset,
            shadowAngle: this.#shadowAngle,
            shadowDistance: this.#shadowDistance,
            blur: this.#blur,   // Changed from shadowBlur
            spread: this.#spread, // Changed from shadowSpread
            color: this.#color    // Changed from shadowColor
        };
    }

    getValue(name) {
        const values = this.getValues();
        return values[name] || null;
    }

    setValue(key, value, setAsDefault = false) {
        switch (key) {
            case 'enabled': return this.setEnabled(value, setAsDefault);
            case 'inset': return this.setInset(value, setAsDefault);
            case 'shadowAngle': return this.setShadowAngle(value, setAsDefault);
            case 'shadowDistance': return this.setShadowDistance(value, setAsDefault);
            case 'blur': return this.setBlur(value, setAsDefault);
            case 'spread': return this.setSpread(value, setAsDefault);
            case 'color': return this.setColor(value, setAsDefault);
            default:
                console.warn(`BoxShadowProperty has no value named ${key}`);
                return null;
        }
    }

    getAdditionalHorizontalSpace() {
        if (!this.#enabled.getValue() || this.#inset.getValue()) return 0;
        const angleRad = (this.#shadowAngle.getValue() * Math.PI) / 180;
        const distPx = this.#shadowDistance.getPixelValue();
        const offsetX = Math.abs(Math.cos(angleRad) * distPx);
        const blur = this.#blur.getPixelValue();
        const spread = this.#spread.getPixelValue();
        return (spread + offsetX + blur / 2) * 2;
    }

    getAdditionalVerticalSpace() {
        if (!this.#enabled.getValue() || this.#inset.getValue()) return 0;
        const angleRad = (this.#shadowAngle.getValue() * Math.PI) / 180;
        const distPx = this.#shadowDistance.getPixelValue();
        const offsetY = Math.abs(Math.sin(angleRad) * distPx);
        const blur = this.#blur.getPixelValue();
        const spread = this.#spread.getPixelValue();
        return (spread + offsetY + blur / 2) * 2;
    }

    applyChanges(element) {
        const domElement = element.effectsElement || element.domElement;
        if (this.#enabled.shouldRender || this.#inset.shouldRender || this.#shadowAngle.shouldRender || 
            this.#shadowDistance.shouldRender || this.#blur.shouldRender || this.#spread.shouldRender || this.#color.shouldRender) {
            
            if (!this.#enabled.getValue()) {
                domElement.style.boxShadow = 'none';
            } else {
                const angleRad = (this.#shadowAngle.getValue() * Math.PI) / 180;
                const distPx = this.#shadowDistance.getPixelValue();
                
                const offsetX = (Math.cos(angleRad) * distPx).toFixed(2);
                const offsetY = (Math.sin(angleRad) * distPx).toFixed(2);
                
                const insetStr = this.#inset.getValue() ? 'inset' : '';
                domElement.style.boxShadow = `${insetStr} ${offsetX}px ${offsetY}px ${this.#blur.getCSSValue()} ${this.#spread.getCSSValue()} ${this.#color.getCSSValue()}`;
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
        this.#shadowDistance.updatePixelValue(dimensions);
        this.#blur.updatePixelValue(dimensions);
        this.#spread.updatePixelValue(dimensions);
    }
}