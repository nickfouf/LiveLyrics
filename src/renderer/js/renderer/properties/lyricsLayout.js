import {VirtualProperty} from "./property.js";
import {LyricsLayout} from "../values/lyrics.js";

export class LyricsLayoutProperty extends VirtualProperty {
    #lyricsLayout = new LyricsLayout();

    constructor(properties) {
        super('lyricsLayout', 'Lyrics Layout');
        if(properties) {
            this.batchUpdate(properties);
        }
    }

    getLyricsLayoutValue() {
        return this.#lyricsLayout;
    }

    getLyricsLayout() {
        return this.#lyricsLayout.getLyricsLayout();
    }

    setLyricsLayout(value) {
        return this.#lyricsLayout.setLyricsLayout(value);
    }

    getLyricsObject() {
        return this.#lyricsLayout.getLyricsObject();
    }

    setLyricsObject({element, lyricsObject}) {
        return this.#lyricsLayout.setLyricsObject({element, lyricsObject});
    }

    getFontFamily() {
        return this.#lyricsLayout.getFontFamily();
    }

    setFontFamily({element, fontFamily}) {
        return this.#lyricsLayout.setFontFamily({element, fontFamily});
    }

    getFontWeight() {
        return this.#lyricsLayout.getFontWeight();
    }

    setFontWeight({element, fontWeight}) {
        return this.#lyricsLayout.setFontWeight({element, fontWeight});
    }

    getFontStyle() {
        return this.#lyricsLayout.getFontStyle();
    }

    setFontStyle({element, fontStyle}) {
        return this.#lyricsLayout.setFontStyle({element, fontStyle});
    }

    getFontSize() {
        return this.#lyricsLayout.getFontSize();
    }

    setFontSize({element, fontSize}) {
        return this.#lyricsLayout.setFontSize({element, fontSize});
    }

    getLetterSpacing() {
        return this.#lyricsLayout.getLetterSpacing();
    }

    setLetterSpacing({element, letterSpacing}) {
        return this.#lyricsLayout.setLetterSpacing({element, letterSpacing});
    }

    getWordSpacing() {
        return this.#lyricsLayout.getWordSpacing();
    }

    setWordSpacing({element, wordSpacing}) {
        return this.#lyricsLayout.setWordSpacing({element, wordSpacing});
    }

    getTextAlign() {
        return this.#lyricsLayout.getTextAlign();
    }

    setTextAlign({element, textAlign}) {
        return this.#lyricsLayout.setTextAlign({element, textAlign});
    }

    getJustifyText() {
        return this.#lyricsLayout.getJustifyText();
    }

    setJustifyText({element, justifyText}) {
        return this.#lyricsLayout.setJustifyText({element, justifyText});
    }


    getLineHeight() {
        return this.#lyricsLayout.getLineHeight();
    }

    setLineHeight({element, lineHeight}) {
        return this.#lyricsLayout.setLineHeight({element, lineHeight});
    }

    getHighlightedPercentage() {
        return this.#lyricsLayout.getHighlightedPercentage();
    }

    setHighlightedPercentage({element, highlightedPercentage}) {
        return this.#lyricsLayout.setHighlightedPercentage({element, highlightedPercentage});
    }

    rebuildLayout({element}) {
        const layout = this.#lyricsLayout.rebuildLayout({element});
        return this.setLyricsLayout(layout);
    }

    batchUpdate({element, highlightedPercentage, lyricsObject, fontFamily, fontWeight, fontStyle, fontSize, letterSpacing, wordSpacing, lineHeight, textAlign, justifyText}) {
        let changed = false;
        if(highlightedPercentage !== undefined) {
            changed = this.setHighlightedPercentage({element, highlightedPercentage}) || changed;
        }
        if(lyricsObject) {
            changed = this.setLyricsObject({element, lyricsObject}) || changed;
        }
        if(fontFamily) {
            changed = this.setFontFamily({element, fontFamily}) || changed;
        }
        if(fontWeight) {
            changed = this.setFontWeight({element, fontWeight}) || changed;
        }
        if(fontStyle) {
            changed = this.setFontStyle({element, fontStyle}) || changed;
        }
        if(fontSize) {
            changed = this.setFontSize({element, fontSize}) || changed;
        }
        if(letterSpacing) {
            changed = this.setLetterSpacing({element, letterSpacing}) || changed;
        }
        if(wordSpacing) {
            changed = this.setWordSpacing({element, wordSpacing}) || changed;
        }
        if(lineHeight) {
            changed = this.setLineHeight({element, lineHeight}) || changed;
        }
        if(textAlign) {
            changed = this.setTextAlign({element, textAlign}) || changed;
        }
        if(justifyText !== undefined) {
            changed = this.setJustifyText({element, justifyText}) || changed;
        }
        return changed;
    }

    getValues() {
        return {
            lyricsLayout: this.getLyricsLayoutValue()
        };
    }

    getValue(name) {
        if(name === 'lyricsLayout') return this.getLyricsLayoutValue();
        console.warn(`Value ${name} not found in LyricsLayoutProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'lyricsLayout') return this.setLyricsLayout(value, setAsDefault);
        console.warn(`Value ${key} not found in LyricsLayoutProperty.`);
        return null;
    }

    toJSON() {
        return undefined; // This is runtime-generated and should not be saved.
    }

    applyChanges(element) {
        if(!this.#lyricsLayout.shouldRender) return;

        const domElement = element.domElement;
        const svg = domElement.shadowRoot.querySelector('svg');
        this.#lyricsLayout.applyDifferences(svg);
    }

    resize({element, root, parent}) {
        return this.rebuildLayout({element});
    }
}

