export class NumberEvent {
    #value;
    #ease;
    #measureIndex;
    #measureProgress;

    constructor({ value, ease = 'linear', measureIndex, measureProgress }) {
        if (typeof value !== 'number') {
            throw new TypeError('Value must be a number');
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