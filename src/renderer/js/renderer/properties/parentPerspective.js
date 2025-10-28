// src/renderer/js/renderer/properties/parentPerspective.js
import { VirtualProperty } from "./property.js";
import { UnitValue } from "../values/unit.js";
import { StringValue } from "../values/string.js";
import { NumberValue } from "../values/number.js";
import { BooleanValue } from "../values/boolean.js";

export class ParentPerspectiveProperty extends VirtualProperty {
    #enabled = new BooleanValue(false);
    #perspective = new UnitValue({ value: 0, unit: 'px' });
    #transformStyle = new StringValue('flat');
    #rotateX = new NumberValue(0);
    #rotateY = new NumberValue(0);
    #rotateZ = new NumberValue(0);
    #scale = new NumberValue(1);

    constructor(options = {}) {
        super('parentPerspective', 'Parent\'s Perspective');
        this.batchUpdate(options, true);
    }

    getEnabled() { return this.#enabled; }
    setEnabled(value, setAsDefault = false) { return this.#enabled.setValue(value, setAsDefault); }

    getPerspective() { return this.#perspective; }
    setPerspective(value, setAsDefault = false) { return this.#perspective.batchUpdate(value, setAsDefault); }

    getTransformStyle() { return this.#transformStyle; }
    setTransformStyle(value, setAsDefault = false) { return this.#transformStyle.setValue(value, setAsDefault); }

    getRotateX() { return this.#rotateX; }
    setRotateX(value, setAsDefault = false) { return this.#rotateX.setValue(value, setAsDefault); }

    getRotateY() { return this.#rotateY; }
    setRotateY(value, setAsDefault = false) { return this.#rotateY.setValue(value, setAsDefault); }

    getRotateZ() { return this.#rotateZ; }
    setRotateZ(value, setAsDefault = false) { return this.#rotateZ.setValue(value, setAsDefault); }

    getScale() { return this.#scale; }
    setScale(value, setAsDefault = false) { return this.#scale.setValue(value, setAsDefault); }

    batchUpdate(options, setAsDefault = false) {
        if (options.enabled !== undefined) this.setEnabled(options.enabled, setAsDefault);
        if (options.perspective !== undefined) this.setPerspective(options.perspective, setAsDefault);
        if (options['transform-style'] !== undefined) this.setTransformStyle(options['transform-style'], setAsDefault);
        if (options.rotateX !== undefined) this.setRotateX(options.rotateX, setAsDefault);
        if (options.rotateY !== undefined) this.setRotateY(options.rotateY, setAsDefault);
        if (options.rotateZ !== undefined) this.setRotateZ(options.rotateZ, setAsDefault);
        if (options.scale !== undefined) this.setScale(options.scale, setAsDefault);
    }

    getValues() {
        return {
            enabled: this.#enabled,
            perspective: this.#perspective,
            'transform-style': this.#transformStyle,
            rotateX: this.#rotateX,
            rotateY: this.#rotateY,
            rotateZ: this.#rotateZ,
            scale: this.#scale,
        };
    }

    getValue(name) {
        const values = this.getValues();
        return values[name] || null;
    }

    setValue(key, value, setAsDefault = false) {
        switch (key) {
            case 'enabled': return this.setEnabled(value, setAsDefault);
            case 'perspective': return this.setPerspective(value, setAsDefault);
            case 'transform-style': return this.setTransformStyle(value, setAsDefault);
            case 'rotateX': return this.setRotateX(value, setAsDefault);
            case 'rotateY': return this.setRotateY(value, setAsDefault);
            case 'rotateZ': return this.setRotateZ(value, setAsDefault);
            case 'scale': return this.setScale(value, setAsDefault);
            default:
                console.warn(`ParentPerspectiveProperty: Unknown property key "${key}"`);
                return false;
        }
    }

    applyChanges(element) {
        const parentDomElement = element.parent?.domElement;
        const grandparentDomElement = parentDomElement?.parentElement;

        if (this.#enabled.shouldRender) {
            if (!this.#enabled.getValue()) {
                if (grandparentDomElement) {
                    grandparentDomElement.style.perspective = 'none';
                    grandparentDomElement.style.perspectiveOrigin = 'center';
                }
                if (parentDomElement) {
                    parentDomElement.style.transformStyle = 'flat';
                    parentDomElement.style.transform = 'none';
                }
                this.#enabled.markAsRendered();
                Object.values(this.getValues()).forEach(v => v.markAsRendered());
                return;
            } else {
                Object.values(this.getValues()).forEach(v => v.markAsDirty());
                this.#enabled.markAsRendered();
            }
        }

        if (!this.#enabled.getValue()) {
            return;
        }

        // Apply perspective to grandparent
        if (grandparentDomElement) {
            if (this.#perspective.shouldRender) {
                const p = this.#perspective.getCSSValue();
                const hasPerspective = this.#perspective.getPixelValue() > 0;
                grandparentDomElement.style.perspective = hasPerspective ? p : 'none';
                this.#perspective.markAsRendered();
            }

            grandparentDomElement.style.perspectiveOrigin = 'center';
        }

        // Apply transform-style and rotations to parent
        if (parentDomElement) {
            if (this.#transformStyle.shouldRender) {
                parentDomElement.style.transformStyle = this.#transformStyle.getValue();
                this.#transformStyle.markAsRendered();
            }

            if (this.#rotateX.shouldRender || this.#rotateY.shouldRender || this.#rotateZ.shouldRender || this.#scale.shouldRender) {
                const rX = this.#rotateX.getValue();
                const rY = this.#rotateY.getValue();
                const rZ = this.#rotateZ.getValue();
                const s = this.#scale.getValue();
                parentDomElement.style.transform = `scale(${s}) rotateX(${rX}deg) rotateY(${rY}deg) rotateZ(${rZ}deg)`;

                this.#rotateX.markAsRendered();
                this.#rotateY.markAsRendered();
                this.#rotateZ.markAsRendered();
                this.#scale.markAsRendered();
            }
        }
    }

    resize({ element, root, parent }) {
        const grandparent = parent?.parent;
        if (!grandparent) {
            const rootWidth = root.getWidth();
            const rootHeight = root.getHeight();
            const parentWidth = parent.getWidth();
            const parentHeight = parent.getHeight();
            const dimensions = { rootWidth, rootHeight, parentWidth, parentHeight };
            this.#perspective.updatePixelValue(dimensions);
            return;
        };

        const rootWidth = root.getWidth();
        const rootHeight = root.getHeight();
        const grandparentWidth = grandparent.getWidth();
        const grandparentHeight = grandparent.getHeight();

        const dimensions = { rootWidth, rootHeight, parentWidth: grandparentWidth, parentHeight: grandparentHeight };
        this.#perspective.updatePixelValue(dimensions);
    }
}