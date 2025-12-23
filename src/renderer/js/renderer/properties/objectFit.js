import {VirtualProperty} from "./property.js";
import {StringValue} from "../values/string.js";

export class ObjectFitProperty extends VirtualProperty {
    #objectFit = new StringValue('cover');
    constructor(fit = 'cover') {
        super('objectFit', 'Object Fit');
        this.setObjectFit(fit, true);
    }

    getObjectFit() {
        return this.#objectFit;
    }

    setObjectFit(value, setAsDefault = false) {
        return this.#objectFit.setValue(value, setAsDefault);
    }

    getValues() {
        return {objectFit: this.getObjectFit()};
    }

    getValue(name) {
        if(name === 'objectFit') return this.getObjectFit();
        console.warn(`No such value ${name} in ObjectFitProperty`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'objectFit') return this.setObjectFit(value, setAsDefault);
        console.warn(`No such value ${key} in ObjectFitProperty`);
        return null;
    }

    applyChanges(element) {
        if (this.#objectFit.shouldRender) {
            // For elements with an `img` or `video` tag, apply the CSS property.
            const mediaElement = element.domElement.querySelector('img, video');
            if (mediaElement) {
                mediaElement.style.objectFit = this.#objectFit.getValue();
            }
            this.#objectFit.markAsRendered();
        }
    }
}



