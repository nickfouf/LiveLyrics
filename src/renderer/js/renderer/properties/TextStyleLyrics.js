import { TextStyleSVGProperty } from "./textStyleSVG.js";
import { ColorOrGradientValue } from "../values/color.js";

export class TextStyleLyricsProperty extends TextStyleSVGProperty {
    #karaokeColor = new ColorOrGradientValue({ r: 255, g: 0, b: 0, a: 1, mode: 'color' });
    constructor(style) {
        super();
        if(style) this.batchUpdate(style, true);
    }

    getKaraokeColor() {
        return this.#karaokeColor;
    }

    setKaraokeColor(value, setAsDefault = false) {
        return this.#karaokeColor.setColorOrGradientObject(value, setAsDefault);
    }

    batchUpdate({fontFamily, fontWeight, fontStyle, fontSize, lineHeight, letterSpacing, wordSpacing, textAlign, textColor, karaokeColor, justifyText}, setAsDefault = false) {
        const superChanged = super.batchUpdate({
            fontFamily,
            fontWeight,
            fontStyle,
            fontSize,
            lineHeight,
            letterSpacing,
            wordSpacing,
            textAlign,
            textColor,
            justifyText
        }, setAsDefault);
        let karaokeChanged = false;
        if (karaokeColor) {
            karaokeChanged = this.setKaraokeColor(karaokeColor, setAsDefault);
        }
        return superChanged || karaokeChanged;
    }

    getValues() {
        return {
            ...super.getValues(),
            karaokeColor: this.#karaokeColor
        };
    }

    getValue(name) {
        if(name === 'karaokeColor') return this.getKaraokeColor();
        return super.getValue(name);
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'karaokeColor') return this.setKaraokeColor(value, setAsDefault);
        return super.setValue(key, value, setAsDefault);
    }

    applyChanges(element) {
        super.applyChanges(element);
        const domElement = element.domElement;
        const svg = domElement.shadowRoot.querySelector('svg');

        if(this.#karaokeColor.shouldRender) {
            const fillValue = this._updateSvgFill(svg, 'karaoke-color', this.#karaokeColor, element);
            svg.style.setProperty('--karaoke-color', fillValue);
            this.#karaokeColor.markAsRendered();
        }
    }
}



