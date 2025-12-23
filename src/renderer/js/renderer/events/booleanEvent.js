// src/renderer/js/renderer/events/booleanEvent.js

export class BooleanEvent {
    #value;
    #ease;
    #measureIndex;
    #measureProgress;
    #isTransition; // Added

    constructor({ value, ease = 'linear', measureIndex, measureProgress, isTransition = false }) { // Added isTransition
        if (typeof value !== 'boolean') {
            throw new TypeError('Value must be a boolean');
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
    setValue(value) { this.#value = !!value; }
    getEase() { return this.#ease; }
    setEase(ease) { this.#ease = ease; }
}

