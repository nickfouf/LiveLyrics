import { VirtualProperty } from './property.js';

// A simple value-wrapper class to be consistent with the architecture.
class OrchestraValue {
    #measures = [];
    #shouldRender = false;

    constructor(measures = []) {
        this.setMeasures(measures);
    }

    get shouldRender() {
        return this.#shouldRender;
    }

    getMeasures() {
        return this.#measures;
    }

    // A simple compare for arrays of measure objects.
    areMeasuresEqual(arrA, arrB) {
        if (arrA.length !== arrB.length) return false;
        for (let i = 0; i < arrA.length; i++) {
            if (arrA[i].id !== arrB[i].id ||
                arrA[i].timeSignature !== arrB[i].timeSignature ||
                arrA[i].count !== arrB[i].count) {
                return false;
            }
        }
        return true;
    }

    setMeasures(measures) {
        if (this.areMeasuresEqual(this.#measures, measures)) return false;
        this.#measures = measures;
        this.#shouldRender = true;
        return true;
    }

    markAsRendered() {
        this.#shouldRender = false;
    }
}


export class OrchestraContentProperty extends VirtualProperty {
    #orchestraValue = new OrchestraValue([]);

    constructor(orchestraContent = { measures: [] }) {
        super('orchestraContent', 'Orchestra Content');
        if (orchestraContent && orchestraContent.measures) {
            this.setMeasures(orchestraContent.measures);
        }
    }

    getMeasures() {
        return this.#orchestraValue.getMeasures();
    }

    setMeasures(measures) {
        return this.#orchestraValue.setMeasures(measures);
    }

    getValues() {
        return {
            measures: this.getMeasures()
        };
    }

    getValue(name) {
        if (name === 'measures') return this.getMeasures();
        console.warn(`Value ${name} not found in OrchestraContentProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if (key === 'measures') return this.setMeasures(value, setAsDefault);
        console.warn(`Value ${key} not found in OrchestraContentProperty.`);
        return null;
    }

    toJSON() {
        return {
            measures: this.getMeasures()
        };
    }

    // This property holds data for the timeline and doesn't render directly to the DOM.
    applyChanges(element) {
        if (this.#orchestraValue.shouldRender) {
            this.#orchestraValue.markAsRendered();
        }
    }
}