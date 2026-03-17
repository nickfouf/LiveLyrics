import { VirtualProperty } from "./property.js";
import { StringValue } from "../values/string.js";

export class ObjectPositionProperty extends VirtualProperty {
    #xPosition = new StringValue('center');
    #yPosition = new StringValue('center');

    constructor(options = {}) {
        super('objectPosition', 'Object Position');
        // Support both shorthand (x, y) and serialized (xPosition, yPosition) formats
        const x = options.xPosition !== undefined ? options.xPosition : (options.x || 'center');
        const y = options.yPosition !== undefined ? options.yPosition : (options.y || 'center');
        this.batchUpdate({ xPosition: x, yPosition: y }, true);
    }

    getX() { return this.#xPosition; }
    setX(value, setAsDefault = false) { return this.#xPosition.setValue(value, setAsDefault); }

    getY() { return this.#yPosition; }
    setY(value, setAsDefault = false) { return this.#yPosition.setValue(value, setAsDefault); }

    batchUpdate({ x, y, xPosition, yPosition }, setAsDefault = false) {
        let changed = false;
        
        const finalX = xPosition !== undefined ? xPosition : x;
        const finalY = yPosition !== undefined ? yPosition : y;
        
        if (finalX !== undefined) {
            if (this.setX(finalX, setAsDefault)) changed = true;
        }
        if (finalY !== undefined) {
            if (this.setY(finalY, setAsDefault)) changed = true;
        }
        return changed;
    }

    getValues() {
        return {
            xPosition: this.#xPosition,
            yPosition: this.#yPosition
        };
    }

    getValue(name) {
        if (name === 'xPosition') return this.getX();
        if (name === 'yPosition') return this.getY();
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if (key === 'xPosition') return this.setX(value, setAsDefault);
        if (key === 'yPosition') return this.setY(value, setAsDefault);
        return false;
    }

    applyChanges(element) {
        // Target <img> for Image element, <video> for Video element
        const target = element.videoElement || element.domElement.querySelector('img');
        
        if (target && (this.#xPosition.shouldRender || this.#yPosition.shouldRender)) {
            target.style.objectPosition = `${this.#xPosition.getValue()} ${this.#yPosition.getValue()}`;
            this.#xPosition.markAsRendered();
            this.#yPosition.markAsRendered();
        }
    }
}