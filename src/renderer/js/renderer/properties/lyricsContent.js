// src/renderer/js/renderer/properties/lyricsContent.js

import {VirtualProperty} from "./property.js";
import {LyricsValue} from "../values/lyrics.js";
import {NumberValue} from "../values/number.js";

export class LyricsContentProperty extends VirtualProperty {
    #lyricsValue = new LyricsValue({
        measures: [],
        foreignContent: {},
        measureIdOrder: [] // Ensure default initialization
    });

    #highlightedPercentageValue = new NumberValue(0);

    constructor(lyricsContent = {
        measures: [],
        foreignContent: {},
        measureIdOrder: [] // Ensure default initialization
    }) {
        super('lyricsContent', 'Lyrics Content');
        this.setLyricsObject(lyricsContent);
    }

    getLyricsValue() {
        return this.#lyricsValue;
    }

    setLyricsObject(lyricsObject) {
        return this.#lyricsValue.setLyricsObject(lyricsObject);
    }

    setHighlightedPercentage(value, setAsDefault = false) {
        return this.#highlightedPercentageValue.setValue(value, setAsDefault);
    }

    getHighlightedPercentageValue() {
        return this.#highlightedPercentageValue;
    }

    getValues() {
        return {
            lyricsObject: this.getLyricsValue(),
            highlightedPercentage: this.getHighlightedPercentageValue()
        };
    }

    getValue(name) {
        if(name === 'lyricsObject') return this.getLyricsValue();
        if(name === 'highlightedPercentage') return this.getHighlightedPercentageValue();
        console.warn(`Value ${name} not found in LyricsContentProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'lyricsObject') return this.setLyricsObject(value, setAsDefault);
        if(key === 'highlightedPercentage') return this.setHighlightedPercentage(value, setAsDefault);
        console.warn(`Value ${key} not found in LyricsContentProperty.`);
        return null;
    }

    toJSON() {
        return this.getLyricsValue().getLyricsObject();
    }

    applyChanges(element) {
        if(!this.#lyricsValue.shouldRender) return;
        element.getProperty("lyricsLayout").setLyricsObject({element, lyricsObject: this.#lyricsValue.getLyricsObject()});
        this.#lyricsValue.markAsRendered();
    }
}