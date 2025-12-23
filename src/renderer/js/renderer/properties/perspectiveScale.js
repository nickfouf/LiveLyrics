import { VirtualProperty } from './property.js';
import { NumberValue } from "../values/number.js";
import { StringValue } from "../values/string.js";

export class PerspectiveScaleProperty extends VirtualProperty {
    #direction = new StringValue('none'); // 'up', 'down', 'left', 'right' or 'none'

    constructor(options={}) {
        super('perspectiveScale', 'Perspective Scale');
        
        // FIX: Handle both object input and string input (from JSON serialization)
        if (typeof options === 'string') {
            this.setDirection(options, true);
        } else if (options && options.direction) {
            this.setDirection(options.direction, true);
        }
    }

    getDirection() {
        return this.#direction;
    }

    setDirection(value, setAsDefault = false) {
        return this.#direction.setValue(value, setAsDefault);
    }

    getValues() {
        return { direction: this.getDirection() };
    }

    getValue(name) {
        if(name === 'direction') return this.getDirection();
        console.warn(`Value ${name} does not exist in PerspectiveScaleProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'direction') return this.setDirection(value, setAsDefault);
        console.warn(`Value ${key} does not exist in PerspectiveScaleProperty.`);
        return false;
    }

    applyChanges(element) {
        const direction = this.#direction.getValue();

        if (!element.hasProperty('parentPerspective')) {
            return;
        }
        const parentPerspectiveProperty = element.getProperty('parentPerspective');

        if (direction === 'none') {
            if (parentPerspectiveProperty.getScale().getValue() !== 1) {
                parentPerspectiveProperty.setScale(1);
            }
            return;
        }

        const dimensions = element.getProperty('dimensions');
        const width = dimensions.getWidth().getPixelValue();
        const height = dimensions.getHeight().getPixelValue();
        const perspective = parentPerspectiveProperty.getPerspective().getPixelValue();

        if (perspective === 0 || !width || !height) {
            if (parentPerspectiveProperty.getScale().getValue() !== 1) {
                parentPerspectiveProperty.setScale(1);
            }
            return;
        }

        let translateZ = 0;
        switch(direction) {
            case 'up': case 'down':
                translateZ = height / 2;
                break;
            case 'left': case 'right':
                translateZ = width / 2;
                break;
        }
        const scaleValue = (perspective - translateZ) / perspective;
        parentPerspectiveProperty.setScale(scaleValue);
    }
}




