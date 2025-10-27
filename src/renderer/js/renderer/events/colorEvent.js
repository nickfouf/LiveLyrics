export class ColorEvent {
    #value;
    #ease;
    #measureIndex;
    #measureProgress;

    constructor({ colorObject, ease = 'linear', measureIndex, measureProgress }) {
        if (typeof colorObject !== 'object' || colorObject === null || colorObject.mode === 'gradient') {
            throw new TypeError('Value must be a color object');
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
        this.setValue(colorObject);
        this.setEase(ease);
        this.setMeasureIndex(measureIndex);
        this.setMeasureProgress(measureProgress);
    }

    getMeasureIndex() { return this.#measureIndex; }
    setMeasureIndex(index) { this.#measureIndex = index; }
    getMeasureProgress() { return this.#measureProgress; }
    setMeasureProgress(progress) { this.#measureProgress = progress; }
    getValue() { return this.#value; }
    setValue(value) { this.#value = value; }
    getEase() { return this.#ease; }
    setEase(ease) { this.#ease = ease; }
}

export class GradientEvent {
    #value;
    #ease;
    #measureIndex;
    #measureProgress;

    constructor({ gradientObject, ease = 'linear', measureIndex, measureProgress }) {
        if (typeof gradientObject !== 'object' || gradientObject === null || gradientObject.mode !== 'gradient') {
            throw new TypeError('Value must be a gradient object');
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
        this.setValue(gradientObject);
        this.setEase(ease);
        this.setMeasureIndex(measureIndex);
        this.setMeasureProgress(measureProgress);
    }

    getMeasureIndex() { return this.#measureIndex; }
    setMeasureIndex(index) { this.#measureIndex = index; }
    getMeasureProgress() { return this.#measureProgress; }
    setMeasureProgress(progress) { this.#measureProgress = progress; }
    getValue() { return this.#value; }
    setValue(value) { this.#value = value; }
    getEase() { return this.#ease; }
    setEase(ease) { this.#ease = ease; }
}

export class ColorOrGradientEvent {
    #value;
    #ease;
    #measureIndex;
    #measureProgress;

    constructor({ colorOrGradientObject, ease = 'linear', measureIndex, measureProgress }) {
        if (typeof colorOrGradientObject !== 'object' || colorOrGradientObject === null) {
            throw new TypeError('Value must be a color or gradient object');
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
        this.setValue(colorOrGradientObject);
        this.setEase(ease);
        this.setMeasureIndex(measureIndex);
        this.setMeasureProgress(measureProgress);
    }

    getMeasureIndex() { return this.#measureIndex; }
    setMeasureIndex(index) { this.#measureIndex = index; }
    getMeasureProgress() { return this.#measureProgress; }
    setMeasureProgress(progress) { this.#measureProgress = progress; }
    getValue() { return this.#value; }
    setValue(value) { this.#value = value; }
    getEase() { return this.#ease; }
    setEase(ease) { this.#ease = ease; }
}