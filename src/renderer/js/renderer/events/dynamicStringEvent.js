// src/renderer/js/renderer/events/dynamicStringEvent.js

export class DynamicStringEvent {
    #value;
    #id;
    #ease;
    #measureIndex;
    #measureProgress;
    #isTransition; // Added

    constructor({ value, id, ease = 'linear', measureIndex, measureProgress, isTransition = false }) { // Added isTransition
        if (typeof value !== 'string') {
            throw new TypeError('Value must be a string');
        }
        if (typeof id !== 'string') {
            throw new TypeError('ID must be a string');
        }
        if (typeof ease !== 'string') {
            throw new TypeError('Ease must be a string');
        }
        if (!Number.isInteger(measureIndex) || measureIndex < 0) {
            throw new TypeError('Measure index must be a non-negative integer');
        }
        if (typeof measureProgress !== 'number' || measureProgress < 0 || measureProgress >= 1) {
            throw new TypeError('Measure progress must be a number between 0 (inclusive) and 1 (exclusive)');
        }
        this.setValue(value);
        this.setId(id);
        this.setEase(ease);
        this.setMeasureIndex(measureIndex);
        this.setMeasureProgress(measureProgress);
        this.#isTransition = isTransition; // Store it
    }

    getIsTransition() { return this.#isTransition; } // Added getter

    getMeasureIndex() { return this.#measureIndex; }
    setMeasureIndex(index) { this.#measureIndex = index; }
    getMeasureProgress() { return this.#measureProgress; }
    setMeasureProgress(progress) { this.#measureProgress = progress; }
    getValue() { return this.#value; }
    setValue(value) { this.#value = value; }
    getId() { return this.#id; }
    setId(id) { this.#id = id; }
    getFullValue() { return { value: this.#value, id: this.#id }; }
    getEase() { return this.#ease; }
    setEase(ease) { this.#ease = ease; }
}



