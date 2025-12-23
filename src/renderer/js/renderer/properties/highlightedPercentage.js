import { VirtualProperty } from './property.js';
import { NumberValue } from '../values/number.js';

export class HighlightedPercentage extends VirtualProperty {
    #progress = new NumberValue(0);

    constructor(progress = 0) {
        super('progress', 'Progress');
        this.setProgress(progress, true);
    }

    getProgress() {
        return this.#progress;
    }

    setProgress(value, setAsDefault = false) {
        return this.#progress.setValue(value, setAsDefault);
    }

    getValues() {
        return { progress: this.getProgress() };
    }

    getValue(name) {
        if(name === 'progress') return this.getProgress();
        console.warn(`Value ${name} not found in HighlightedPercentage.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'progress') return this.setProgress(value, setAsDefault);
        console.warn(`Value ${key} not found in HighlightedPercentage.`);
    }

    toJSON() {
        return undefined; // This is a runtime value and should not be saved.
    }

    applyChanges(element) {
        const layoutProperty = element.getProperty('lyricsLayout');

        if (this.#progress.shouldRender) {
            const numValue = this.getProgress().getValue();
            layoutProperty.setHighlightedPercentage({element, highlightedPercentage: numValue});
            this.#progress.markAsRendered();
        }
    }
}



