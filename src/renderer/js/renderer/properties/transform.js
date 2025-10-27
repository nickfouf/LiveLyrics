// js/renderer/properties/transform.js

// src/renderer/js/renderer/properties/transform.js
import { VirtualProperty } from "./property.js";
import { UnitValue } from "../values/unit.js";
import { NumberValue } from "../values/number.js";
import { StringValue } from "../values/string.js";
import { BooleanValue } from "../values/boolean.js";

export class TransformProperty extends VirtualProperty {
    #enabled = new BooleanValue(true);
    #translateX = new UnitValue({ value: 0, unit: 'px' });
    #translateY = new UnitValue({ value: 0, unit: 'px' });
    #translateZ = new UnitValue({ value: 0, unit: 'px' });
    #scaleX = new NumberValue(1);
    #scaleY = new NumberValue(1);
    #scaleZ = new NumberValue(1);
    #rotate = new NumberValue(0);
    #rotateX = new NumberValue(0);
    #rotateY = new NumberValue(0);
    #rotateZ = new NumberValue(0);
    #skewX = new NumberValue(0);
    #skewY = new NumberValue(0);
    #transformOriginX = new UnitValue({ value: 50, unit: 'vw' });
    #transformOriginY = new UnitValue({ value: 50, unit: 'vh' });
    #transformOriginZ = new UnitValue({ value: 0, unit: 'px' });
    #transformStyle = new StringValue('preserve-3d');
    #selfPerspective = new UnitValue({ value: 0, unit: 'px' });
    #childrenPerspective = new UnitValue({ value: 0, unit: 'px' });
    #backfaceVisibility = new StringValue('visible');

    constructor(options = {}) {
        super('transform', 'Transform');
        this.batchUpdate(options, true);
    }

    // Getters
    getEnabled() { return this.#enabled; }
    getTranslateX() { return this.#translateX; }
    getTranslateY() { return this.#translateY; }
    getTranslateZ() { return this.#translateZ; }
    getScaleX() { return this.#scaleX; }
    getScaleY() { return this.#scaleY; }
    getScaleZ() { return this.#scaleZ; }
    getRotate() { return this.#rotate; }
    getRotateX() { return this.#rotateX; }
    getRotateY() { return this.#rotateY; }
    getRotateZ() { return this.#rotateZ; }
    getSkewX() { return this.#skewX; }
    getSkewY() { return this.#skewY; }
    getTransformOriginX() { return this.#transformOriginX; }
    getTransformOriginY() { return this.#transformOriginY; }
    getTransformOriginZ() { return this.#transformOriginZ; }
    getTransformStyle() { return this.#transformStyle; }
    getSelfPerspective() { return this.#selfPerspective; }
    getChildrenPerspective() { return this.#childrenPerspective; }
    getBackfaceVisibility() { return this.#backfaceVisibility; }

    // Setters
    setEnabled(value, setAsDefault = false) { return this.#enabled.setValue(value, setAsDefault); }
    setTranslateX(value, setAsDefault = false) { return this.#translateX.batchUpdate(value, setAsDefault); }
    setTranslateY(value, setAsDefault = false) { return this.#translateY.batchUpdate(value, setAsDefault); }
    setTranslateZ(value, setAsDefault = false) { return this.#translateZ.batchUpdate(value, setAsDefault); }
    setScaleX(value, setAsDefault = false) { return this.#scaleX.setValue(value, setAsDefault); }
    setScaleY(value, setAsDefault = false) { return this.#scaleY.setValue(value, setAsDefault); }
    setScaleZ(value, setAsDefault = false) { return this.#scaleZ.setValue(value, setAsDefault); }
    setRotate(value, setAsDefault = false) { return this.#rotate.setValue(value, setAsDefault); }
    setRotateX(value, setAsDefault = false) { return this.#rotateX.setValue(value, setAsDefault); }
    setRotateY(value, setAsDefault = false) { return this.#rotateY.setValue(value, setAsDefault); }
    setRotateZ(value, setAsDefault = false) { return this.#rotateZ.setValue(value, setAsDefault); }
    setSkewX(value, setAsDefault = false) { return this.#skewX.setValue(value, setAsDefault); }
    setSkewY(value, setAsDefault = false) { return this.#skewY.setValue(value, setAsDefault); }
    setTransformOriginX(value, setAsDefault = false) { return this.#transformOriginX.batchUpdate(value, setAsDefault); }
    setTransformOriginY(value, setAsDefault = false) { return this.#transformOriginY.batchUpdate(value, setAsDefault); }
    setTransformOriginZ(value, setAsDefault = false) { return this.#transformOriginZ.batchUpdate(value, setAsDefault); }
    setTransformStyle(value, setAsDefault = false) { return this.#transformStyle.setValue(value, setAsDefault); }
    setSelfPerspective(value, setAsDefault = false) { return this.#selfPerspective.batchUpdate(value, setAsDefault); }
    setChildrenPerspective(value, setAsDefault = false) { return this.#childrenPerspective.batchUpdate(value, setAsDefault); }
    setBackfaceVisibility(value, setAsDefault = false) { return this.#backfaceVisibility.setValue(value, setAsDefault); }

    batchUpdate(options, setAsDefault = false) {
        if (options.enabled !== undefined) this.setEnabled(options.enabled, setAsDefault);
        if (options.translateX !== undefined) this.setTranslateX(options.translateX, setAsDefault);
        if (options.translateY !== undefined) this.setTranslateY(options.translateY, setAsDefault);
        if (options.translateZ !== undefined) this.setTranslateZ(options.translateZ, setAsDefault);
        if (options.scaleX !== undefined) this.setScaleX(options.scaleX, setAsDefault);
        if (options.scaleY !== undefined) this.setScaleY(options.scaleY, setAsDefault);
        if (options.scaleZ !== undefined) this.setScaleZ(options.scaleZ, setAsDefault);
        if (options.rotate !== undefined) this.setRotate(options.rotate, setAsDefault);
        if (options.rotateX !== undefined) this.setRotateX(options.rotateX, setAsDefault);
        if (options.rotateY !== undefined) this.setRotateY(options.rotateY, setAsDefault);
        if (options.rotateZ !== undefined) this.setRotateZ(options.rotateZ, setAsDefault);
        if (options.skewX !== undefined) this.setSkewX(options.skewX, setAsDefault);
        if (options.skewY !== undefined) this.setSkewY(options.skewY, setAsDefault);
        if (options['transform-origin-x'] !== undefined) this.setTransformOriginX(options['transform-origin-x'], setAsDefault);
        if (options['transform-origin-y'] !== undefined) this.setTransformOriginY(options['transform-origin-y'], setAsDefault);
        if (options['transform-origin-z'] !== undefined) this.setTransformOriginZ(options['transform-origin-z'], setAsDefault);
        if (options['transform-style'] !== undefined) this.setTransformStyle(options['transform-style'], setAsDefault);
        if (options.perspective !== undefined) this.setSelfPerspective(options.perspective, setAsDefault);
        if (options.selfPerspective !== undefined) this.setSelfPerspective(options.selfPerspective, setAsDefault);
        if (options.childrenPerspective !== undefined) this.setChildrenPerspective(options.childrenPerspective, setAsDefault);
        if (options['backface-visibility'] !== undefined) this.setBackfaceVisibility(options['backface-visibility'], setAsDefault);
    }

    getValues() {
        return {
            enabled: this.#enabled,
            translateX: this.#translateX,
            translateY: this.#translateY,
            translateZ: this.#translateZ,
            scaleX: this.#scaleX,
            scaleY: this.#scaleY,
            scaleZ: this.#scaleZ,
            rotate: this.#rotate,
            rotateX: this.#rotateX,
            rotateY: this.#rotateY,
            rotateZ: this.#rotateZ,
            skewX: this.#skewX,
            skewY: this.#skewY,
            'transform-origin-x': this.#transformOriginX,
            'transform-origin-y': this.#transformOriginY,
            'transform-origin-z': this.#transformOriginZ,
            'transform-style': this.#transformStyle,
            selfPerspective: this.#selfPerspective,
            childrenPerspective: this.#childrenPerspective,
            'backface-visibility': this.#backfaceVisibility,
        };
    }

    getValue(name) {
        const values = this.getValues();
        return values[name] || null;
    }

    setValue(key, value, setAsDefault = false) {
        switch (key) {
            case 'enabled': return this.setEnabled(value, setAsDefault);
            case 'translateX': return this.setTranslateX(value, setAsDefault);
            case 'translateY': return this.setTranslateY(value, setAsDefault);
            case 'translateZ': return this.setTranslateZ(value, setAsDefault);
            case 'scaleX': return this.setScaleX(value, setAsDefault);
            case 'scaleY': return this.setScaleY(value, setAsDefault);
            case 'scaleZ': return this.setScaleZ(value, setAsDefault);
            case 'rotate': return this.setRotate(value, setAsDefault);
            case 'rotateX': return this.setRotateX(value, setAsDefault);
            case 'rotateY': return this.setRotateY(value, setAsDefault);
            case 'rotateZ': return this.setRotateZ(value, setAsDefault);
            case 'skewX': return this.setSkewX(value, setAsDefault);
            case 'skewY': return this.setSkewY(value, setAsDefault);
            case 'transform-origin-x': return this.setTransformOriginX(value, setAsDefault);
            case 'transform-origin-y': return this.setTransformOriginY(value, setAsDefault);
            case 'transform-origin-z': return this.setTransformOriginZ(value, setAsDefault);
            case 'transform-style': return this.setTransformStyle(value, setAsDefault);
            case 'perspective': return this.setSelfPerspective(value, setAsDefault);
            case 'selfPerspective': return this.setSelfPerspective(value, setAsDefault);
            case 'childrenPerspective': return this.setChildrenPerspective(value, setAsDefault);
            case 'backface-visibility': return this.setBackfaceVisibility(value, setAsDefault);
            default:
                console.warn(`TransformProperty: Unknown property key "${key}"`);
                return false;
        }
    }

    applyChanges(element) {
        const domElement = element.domElement;
        if (this.#enabled.shouldRender) {
            if (!this.#enabled.getValue()) {
                domElement.style.transform = 'none';
                this.#enabled.markAsRendered();
                // Mark all other transform properties as rendered to prevent them from re-applying
                Object.values(this.getValues()).forEach(v => v.markAsRendered());
                return;
            } else {
                Object.values(this.getValues()).forEach(v => v.markAsDirty());
                this.#enabled.markAsRendered();
            }
        }

        if (!this.#enabled.getValue()) {
            domElement.style.transform = 'none';
            domElement.style.perspective = 'none';
            domElement.style.transformOrigin = '50% 50% 0px';
            domElement.style.transformStyle = 'flat';
            domElement.style.backfaceVisibility = 'visible';
            return;
        }

        const values = this.getValues();
        let transformNeedsUpdate = false;

        const transformFuncKeys = ['translateX', 'translateY', 'translateZ', 'scaleX', 'scaleY', 'scaleZ', 'rotate', 'rotateX', 'rotateY', 'rotateZ', 'skewX', 'skewY'];
        for (const key of transformFuncKeys) {
            if (values[key].shouldRender) {
                transformNeedsUpdate = true;
                break;
            }
        }

        if (this.#selfPerspective.shouldRender) {
            transformNeedsUpdate = true;
        }

        if (transformNeedsUpdate) {
            const tX = this.#translateX.getCSSValue();
            const tY = this.#translateY.getCSSValue();
            const tZ = this.#translateZ.getCSSValue();
            const sX = this.#scaleX.getValue();
            const sY = this.#scaleY.getValue();
            const sZ = this.#scaleZ.getValue();
            const r = this.#rotate.getValue();
            const rX = this.#rotateX.getValue();
            const rY = this.#rotateY.getValue();
            const rZ = this.#rotateZ.getValue();
            const skX = this.#skewX.getValue();
            const skY = this.#skewY.getValue();

            const p = this.#selfPerspective.getCSSValue();
            const perspectiveString = (this.#selfPerspective.getPixelValue() > 0) ? `perspective(${p}) ` : '';

            let transformString = `${perspectiveString} scale3d(${sX}, ${sY}, ${sZ}) rotate(${r}deg) rotateX(${rX}deg) rotateY(${rY}deg) rotateZ(${rZ}deg) skew(${skX}deg, ${skY}deg) translate3d(${tX}, ${tY}, ${tZ})`;

            domElement.style.transform = transformString;

            transformFuncKeys.forEach(key => values[key].markAsRendered());
            this.#selfPerspective.markAsRendered();
        }

        if (this.#childrenPerspective.shouldRender) {
            const p = this.#childrenPerspective.getCSSValue();
            domElement.style.perspective = (this.#childrenPerspective.getPixelValue() > 0) ? p : 'none';
            this.#childrenPerspective.markAsRendered();
        }

        if (this.#transformOriginX.shouldRender || this.#transformOriginY.shouldRender || this.#transformOriginZ.shouldRender) {
            domElement.style.transformOrigin = `${this.#transformOriginX.getCSSValue()} ${this.#transformOriginY.getCSSValue()} ${this.#transformOriginZ.getCSSValue()}`;
            this.#transformOriginX.markAsRendered();
            this.#transformOriginY.markAsRendered();
            this.#transformOriginZ.markAsRendered();
        }
        if (this.#transformStyle.shouldRender) {
            domElement.style.transformStyle = this.#transformStyle.getValue();
            this.#transformStyle.markAsRendered();
        }

        if (this.#backfaceVisibility.shouldRender) {
            domElement.style.backfaceVisibility = this.#backfaceVisibility.getValue();
            this.#backfaceVisibility.markAsRendered();
        }
    }

    resize({ element, root, parent }) {
        const rootWidth = root.getWidth();
        const rootHeight = root.getHeight();
        const parentWidth = parent.getWidth();
        const parentHeight = parent.getHeight();
        const dimensions = { rootWidth, rootHeight, parentWidth, parentHeight };
        this.#translateX.updatePixelValue(dimensions);
        this.#translateY.updatePixelValue(dimensions);
        this.#translateZ.updatePixelValue(dimensions);
        this.#transformOriginX.updatePixelValue(dimensions);
        this.#transformOriginY.updatePixelValue(dimensions);
        this.#transformOriginZ.updatePixelValue(dimensions);
        this.#selfPerspective.updatePixelValue(dimensions);
        this.#childrenPerspective.updatePixelValue(dimensions);
    }
}