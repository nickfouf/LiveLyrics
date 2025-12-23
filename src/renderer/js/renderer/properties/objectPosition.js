import { VirtualProperty } from "./property.js";
import { StringValue } from "../values/string.js";

export class ObjectPositionProperty extends VirtualProperty {
    #xPosition = new StringValue('center');
    #yPosition = new StringValue('center');

    constructor(options = {}) {
        super('objectPosition', 'Object Position');
        // Handle options if passed as an object { x: 'left', y: 'top' }
        // or potentially as individual arguments if serialized that way,
        // but typically options come from deserialization.
        const x = options.x || 'center';
        const y = options.y || 'center';
        this.batchUpdate({ x, y }, true);
    }

    getX() { return this.#xPosition; }
    setX(value, setAsDefault = false) { return this.#xPosition.setValue(value, setAsDefault); }

    getY() { return this.#yPosition; }
    setY(value, setAsDefault = false) { return this.#yPosition.setValue(value, setAsDefault); }

    batchUpdate({ x, y }, setAsDefault = false) {
        let changed = false;
        if (x !== undefined) {
            if (this.setX(x, setAsDefault)) changed = true;
        }
        if (y !== undefined) {
            if (this.setY(y, setAsDefault)) changed = true;
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

