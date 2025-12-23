import { VirtualProperty } from "./property.js";
import { StringValue } from "../values/string.js";

export class AlignmentProperty extends VirtualProperty {
    #alignment = new StringValue('absolute');
    constructor(alignment='absolute') {
        super('alignment', 'Alignment');
        this.setAlignment(alignment, true);
    }
    getAlignment() {
        return this.#alignment;
    }
    setAlignment(value, setAsDefault = false) {
        return this.#alignment.setValue(value, setAsDefault);
    }

    getValue(name) {
        if(name === 'alignment') return this.getAlignment();
        console.warn(`No such value ${name} in AlignmentProperty`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'alignment') return this.setAlignment(value, setAsDefault);
        console.warn(`No such value ${key} in AlignmentProperty`);
        return null;
    }

    getValues() {
        return { alignment: this.getAlignment() };
    }

    applyChanges(element) {
        const domElement = element.domElement;
        if(this.#alignment.shouldRender) {
            switch (this.#alignment.getValue()) {
                case 'absolute':
                    domElement.style.display = 'block';
                    break;
                case 'vertical':
                    domElement.style.display = 'flex';
                    domElement.style.flexDirection = 'column';
                    break;
                case 'horizontal':
                    domElement.style.display = 'flex';
                    domElement.style.flexDirection = 'row';
                    break;
            }
            element.getChildren().forEach(child => {
                child.domElement.style.position = this.#alignment.getValue() === 'absolute' ? 'absolute' : 'relative';
            });
            this.#alignment.markAsRendered();
        }
    }
}

