// src/renderer/js/renderer/events/fontSizeEvent.js

export class FontSizeEvent {
    #value;
    #unit;
    #ease;
    #measureIndex;
    #measureProgress;
    constructor({ value, unit, ease = 'linear', measureIndex, measureProgress }) {
        if (typeof value !== 'number') {
            throw new TypeError('Value must be a number');
        }
        if (typeof unit !== 'string') {
            throw new TypeError('Unit must be a string');
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
        this.setUnit(unit);
        this.setEase(ease);
        this.setMeasureIndex(measureIndex);
        this.setMeasureProgress(measureProgress);
    }
    getMeasureIndex() {
        return this.#measureIndex;
    }
    setMeasureIndex(index) {
        this.#measureIndex = index;
    }
    getMeasureProgress() {
        return this.#measureProgress;
    }
    setMeasureProgress(progress) {
        this.#measureProgress = progress;
    }
    getValue() {
        return this.#value;
    }
    getFullValue() {
        return { value: this.#value, unit: this.#unit };
    }
    setValue(value) {
        this.#value = value;
    }
    getUnit() {
        return this.#unit;
    }
    setUnit(unit) {
        this.#unit = unit;
    }
    getEase() {
        return this.#ease;
    }
    setEase(ease) {
        this.#ease = ease;
    }
}