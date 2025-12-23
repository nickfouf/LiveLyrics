export class Measure {
    #numerator = 4;
    #denominator = 4;
    #index = 0;
    constructor(numerator = 4, denominator = 4, index = 0) {
        this.#numerator = numerator;
        this.#denominator = denominator;
        this.#index = index;
    }
    get numerator() {
        return this.#numerator;
    }
    get denominator() {
        return this.#denominator;
    }
    get index() {
        return this.#index;
    }
    setNumerator(numerator) {
        if (this.#numerator === numerator) return false;
        this.#numerator = numerator;
        return true;
    }
    setDenominator(denominator) {
        if (this.#denominator === denominator) return false;
        this.#denominator = denominator;
        return true;
    }
    setIndex(index) {
        if (this.#index === index) return false;
        this.#index = index;
        return true;
    }
}



