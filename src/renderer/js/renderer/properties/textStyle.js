import {VirtualProperty} from "./property.js";
import {StringValue} from "../values/string.js";
import {FontSizeValue} from "../values/fontSize.js";
import {NumberValue} from "../values/number.js";
import {ColorOrGradientValue} from "../values/color.js";
import {BooleanValue} from "../values/boolean.js";
import {resolveFontFamily} from "../utils.js";

export class TextStyleProperty extends VirtualProperty {
    #fontFamily = new StringValue('Arial');
    #fontWeight = new StringValue('normal');
    #fontStyle = new StringValue('normal');
    #fontSize = new FontSizeValue({ value: 16, unit: 'px' });
    #lineHeight = new NumberValue(1.2);
    #letterSpacing = new FontSizeValue({ value: 0, unit: 'px' });
    #wordSpacing = new FontSizeValue({ value: 0, unit: 'px' });
    #textAlign = new StringValue('left');
    #textColor = new ColorOrGradientValue({ r: 255, g: 255, b: 255, a: 1, mode: 'color' });
    #justifyText = new BooleanValue(false);

    constructor(style) {
        super('textStyle', 'Text Style');
        if(style) {
            this.batchUpdate(style, true);
        }
    }

    getFontFamily() {
        return this.#fontFamily;
    }

    setFontFamily(value, setAsDefault = false) {
        return this.#fontFamily.setValue(value, setAsDefault);
    }

    getFontWeight() {
        return this.#fontWeight;
    }

    setFontWeight(value, setAsDefault = false) {
        return this.#fontWeight.setValue(value, setAsDefault);
    }

    getFontStyle() {
        return this.#fontStyle;
    }

    setFontStyle(value, setAsDefault = false) {
        return this.#fontStyle.setValue(value, setAsDefault);
    }

    getFontSize() {
        return this.#fontSize;
    }

    setFontSize({value, unit}, setAsDefault = false) {
        return this.#fontSize.batchUpdate({value, unit}, setAsDefault);
    }

    getLineHeight() {
        return this.#lineHeight;
    }

    setLineHeight(value, setAsDefault = false) {
        return this.#lineHeight.setValue(value, setAsDefault);
    }

    getLetterSpacing() {
        return this.#letterSpacing;
    }

    setLetterSpacing({value, unit}, setAsDefault = false) {
        return this.#letterSpacing.batchUpdate({value, unit}, setAsDefault);
    }

    getWordSpacing() {
        return this.#wordSpacing;
    }

    setWordSpacing({value, unit}, setAsDefault = false) {
        return this.#wordSpacing.batchUpdate({value, unit}, setAsDefault);
    }

    getTextAlign() {
        return this.#textAlign;
    }

    setTextAlign(value, setAsDefault = false) {
        return this.#textAlign.setValue(value, setAsDefault);
    }

    getTextColor() {
        return this.#textColor;
    }

    setTextColor(value, setAsDefault = false) {
        return this.#textColor.setColorOrGradientObject(value, setAsDefault);
    }

    getJustifyText() {
        return this.#justifyText;
    }

    setJustifyText(value, setAsDefault = false) {
        return this.#justifyText.setValue(value, setAsDefault);
    }

    getValuesObject() {
        return {
            fontFamily: this.#fontFamily.getValue(),
            fontWeight: this.#fontWeight.getValue(),
            fontStyle: this.#fontStyle.getValue(),
            fontSize: this.#fontSize.getValue(),
            fontSizeUnit: this.#fontSize.getUnit(),
            lineHeight: this.#lineHeight.getValue(),
            letterSpacing: this.#letterSpacing.getValue(),
            letterSpacingUnit: this.#letterSpacing.getUnit(),
            wordSpacing: this.#wordSpacing.getValue(),
            wordSpacingUnit: this.#wordSpacing.getUnit(),
            textAlign: this.#textAlign.getValue(),
            textColor: this.#textColor.colorOrGradientObject,
            justifyText: this.#justifyText.getValue()
        }
    }

    batchUpdate({fontFamily, fontWeight, fontStyle, fontSize, lineHeight, letterSpacing, wordSpacing, textAlign, textColor, justifyText}, setAsDefault = false) {
        const fontFamilyChanged = fontFamily !== undefined ? this.setFontFamily(fontFamily, setAsDefault) : false;
        const fontWeightChanged = fontWeight !== undefined ? this.setFontWeight(fontWeight, setAsDefault) : false;
        const fontStyleChanged =  fontStyle !== undefined ? this.setFontStyle(fontStyle, setAsDefault) : false;
        const fontSizeChanged = fontSize !== undefined ? this.setFontSize(fontSize, setAsDefault) : false;
        const lineHeightChanged = lineHeight !== undefined ? this.setLineHeight(lineHeight, setAsDefault) : false;
        const letterSpacingChanged = letterSpacing !== undefined ? this.setLetterSpacing(letterSpacing, setAsDefault) : false;
        const wordSpacingChanged = wordSpacing !== undefined ? this.setWordSpacing(wordSpacing, setAsDefault) : false;
        const textAlignChanged = textAlign !== undefined ? this.setTextAlign(textAlign, setAsDefault) : false;
        const textColorChanged = textColor !== undefined ? this.setTextColor(textColor, setAsDefault) : false;
        const justifyTextChanged = justifyText !== undefined ? this.setJustifyText(justifyText, setAsDefault) : false;
        return fontFamilyChanged || fontWeightChanged || fontStyleChanged || fontSizeChanged || lineHeightChanged || letterSpacingChanged || wordSpacingChanged || textAlignChanged || textColorChanged || justifyTextChanged;
    }


    getValues() {
        return {
            fontFamily: this.getFontFamily(),
            fontWeight: this.getFontWeight(),
            fontStyle: this.getFontStyle(),
            fontSize: this.getFontSize(),
            lineHeight: this.getLineHeight(),
            letterSpacing: this.getLetterSpacing(),
            wordSpacing: this.getWordSpacing(),
            textAlign: this.getTextAlign(),
            textColor: this.getTextColor(),
            justifyText: this.getJustifyText()
        };
    }

    getValue(name) {
        if(name === 'fontFamily') return this.getFontFamily();
        if(name === 'fontWeight') return this.getFontWeight();
        if(name === 'fontStyle') return this.getFontStyle();
        if(name === 'fontSize') return this.getFontSize();
        if(name === 'lineHeight') return this.getLineHeight();
        if(name === 'letterSpacing') return this.getLetterSpacing();
        if(name === 'wordSpacing') return this.getWordSpacing();
        if(name === 'textAlign') return this.getTextAlign();
        if(name === 'textColor') return this.getTextColor();
        if(name === 'justifyText') return this.getJustifyText();
        console.warn(`TextStyleProperty: getValue - Unknown property name "${name}"`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'fontFamily') return this.setFontFamily(value, setAsDefault);
        if(key === 'fontWeight') return this.setFontWeight(value, setAsDefault);
        if(key === 'fontStyle') return this.setFontStyle(value, setAsDefault);
        if(key === 'fontSize') return this.setFontSize(value, setAsDefault);
        if(key === 'lineHeight') return this.setLineHeight(value, setAsDefault);
        if(key === 'letterSpacing') return this.setLetterSpacing(value, setAsDefault);
        if(key === 'wordSpacing') return this.setWordSpacing(value, setAsDefault);
        if(key === 'textAlign') return this.setTextAlign(value, setAsDefault);
        if(key === 'textColor') return this.setTextColor(value, setAsDefault);
        if(key === 'justifyText') return this.setJustifyText(value, setAsDefault);
        console.warn(`TextStyleProperty: setValue - Unknown property name "${key}"`);
        return false;
    }

    applyChanges(element) {
        const domElement = element.textElement || element.domElement;
        if(this.#fontFamily.shouldRender) {
            domElement.style.fontFamily = resolveFontFamily(this.#fontFamily.getValue());
            this.#fontFamily.markAsRendered();
        }
        if(this.#fontWeight.shouldRender) {
            domElement.style.fontWeight = this.#fontWeight.getValue();
            this.#fontWeight.markAsRendered();
        }
        if(this.#fontStyle.shouldRender) {
            domElement.style.fontStyle = this.#fontStyle.getValue();
            this.#fontStyle.markAsRendered();
        }
        if(this.#fontSize.shouldRender) {
            domElement.style.fontSize = this.#fontSize.getCSSValue();
            this.#fontSize.markAsRendered();
        }
        if(this.#lineHeight.shouldRender) {
            domElement.style.lineHeight = this.#lineHeight.getValue();
            this.#lineHeight.markAsRendered();
        }
        if(this.#letterSpacing.shouldRender) {
            domElement.style.letterSpacing = this.#letterSpacing.getCSSValue();
            this.#letterSpacing.markAsRendered();
        }
        if(this.#wordSpacing.shouldRender) {
            domElement.style.wordSpacing = this.#wordSpacing.getCSSValue();
            this.#wordSpacing.markAsRendered();
        }
        if(this.#textAlign.shouldRender || this.#justifyText.shouldRender) {
            if (this.#justifyText.getValue()) {
                domElement.style.textAlign = 'justify';
                domElement.style.textAlignLast = this.#textAlign.getValue();
            } else {
                domElement.style.textAlign = this.#textAlign.getValue();
                domElement.style.textAlignLast = 'auto';
            }
            this.#textAlign.markAsRendered();
            this.#justifyText.markAsRendered();
        }
        if(this.#textColor.shouldRender) {
            const value = this.#textColor.colorOrGradientObject;
            if (value.mode === 'color') {
                domElement.style.color = this.#textColor.getCSSValue();
                // Reset background properties in case it was a gradient before
                domElement.style.background = 'none';
                domElement.style.webkitBackgroundClip = 'auto';
                domElement.style.backgroundClip = 'auto';
            } else { // Gradient
                domElement.style.background = this.#textColor.getCSSValue();
                domElement.style.webkitBackgroundClip = 'text';
                domElement.style.backgroundClip = 'text';
                domElement.style.color = 'transparent';
            }
            this.#textColor.markAsRendered();
        }
    }
    updateFontSize({rootFontSize, parentFontSize}) {
        return this.#fontSize.updatePixelValue({rootFontSize, parentFontSize});
    }

    resize({element, root, parent}) {
        const rootFontSize = root.getFontSize();
        const parentFontSize = parent.getFontSize();
        return this.updateFontSize({rootFontSize, parentFontSize});
    }
}


