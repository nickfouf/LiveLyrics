import { VirtualProperty } from './property.js';
import { UnitValue } from '../values/unit.js';
import { NumberValue } from "../values/number.js";

export class DimensionsProperty extends VirtualProperty {
    #width = new UnitValue({value:100, unit:'pw'});
    #height = new UnitValue({value:100, unit:'ph'});
    #horizontalSpace = new NumberValue(0);
    #verticalSpace = new NumberValue(0)

    constructor(options={width: {value:100, unit:'pw'}, height: {value:100, unit:'ph'}}) {
        super('dimensions', 'Dimensions');
        this.batchUpdate({width: options.width, height: options.height}, true);
    }
    getWidth() {
        return this.#width;
    }
    setWidth({value, unit}, setAsDefault = false) {
        return this.#width.batchUpdate({value, unit}, setAsDefault);
    }
    getHeight() {
        return this.#height;
    }
    setHeight({value, unit}, setAsDefault = false) {
        return this.#height.batchUpdate({value, unit}, setAsDefault);
    }

    batchUpdate({width, height}, setAsDefault = false) {
        const widthChanged = this.setWidth(width, setAsDefault);
        const heightChanged = this.setHeight(height, setAsDefault);
        return widthChanged || heightChanged;
    }

    getValues() {
        return { width: this.getWidth(), height: this.getHeight() };
    }

    getValue(name) {
        if(name === 'width') return this.getWidth();
        if(name === 'height') return this.getHeight();
        console.warn(`Value ${name} does not exist in DimensionsProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'width') return this.setWidth(value, setAsDefault);
        if(key === 'height') return this.setHeight(value, setAsDefault);
        console.warn(`Value ${key} does not exist in DimensionsProperty.`);
        return false;
    }

    applyChanges(element) {
        const domElement = element.domElement;

        this.#horizontalSpace.setValue(element.getAdditionalHorizontalSpace());

        if(this.#width.shouldRender || this.#horizontalSpace.shouldRender) {
            let value = this.#width.getCSSValue();
            const unit = this.#width.getUnit();
            const extraSpace = element.getAdditionalHorizontalSpace();
            if(unit !== 'auto' && extraSpace > 0) {
                value = `calc(${value} - ${extraSpace}px)`;
            }
            domElement.style.width = value;
            this.#width.markAsRendered();
            this.#horizontalSpace.markAsRendered();
        }

        this.#verticalSpace.setValue(element.getAdditionalVerticalSpace());
        if(this.#height.shouldRender || this.#verticalSpace.shouldRender) {
            let value = this.#height.getCSSValue();
            const unit = this.#height.getUnit();
            const extraSpace = element.getAdditionalVerticalSpace();
            if(unit !== 'auto' && extraSpace > 0) {
                value = `calc(${value} - ${extraSpace}px)`;
            }
            domElement.style.height = value;
            this.#height.markAsRendered();
            this.#verticalSpace.markAsRendered();
        }
    }

    updateWidth({rootWidth, rootHeight, parentWidth, parentHeight}) {
        return this.#width.updatePixelValue({rootWidth, rootHeight, parentWidth, parentHeight});
    }

    updateHeight({rootWidth, rootHeight, parentWidth, parentHeight}) {
        return this.#height.updatePixelValue({rootWidth, rootHeight, parentWidth, parentHeight});
    }

    resize({element, root, parent}) {
        const rootWidth = root.getWidth();
        const rootHeight = root.getHeight();
        const parentWidth = parent.getWidth();
        const parentHeight = parent.getHeight();

        const widthChanged = this.updateWidth({rootWidth: rootWidth, rootHeight: rootHeight, parentWidth, parentHeight});
        const heightChanged = this.updateHeight({rootWidth: rootWidth, rootHeight: rootHeight, parentWidth, parentHeight});
        return widthChanged || heightChanged;
    }
}

