import { VirtualProperty } from "./property.js";
import { StringValue } from "../values/string.js";
import { FontSizeValue } from "../values/fontSize.js";
import { ColorOrGradientValue } from "../values/color.js";
import { UnitValue } from "../values/unit.js";
import { BooleanValue } from "../values/boolean.js";
import {resolveFontFamily} from "../utils.js";

export class TextStyleSVGProperty extends VirtualProperty {
    #fontFamily = new StringValue('Arial');
    #fontWeight = new StringValue('normal');
    #fontStyle = new StringValue('normal');
    #fontSize = new FontSizeValue({ value: 16, unit: 'px' });
    #lineHeight = new UnitValue({ value: 1.2, unit: 'px' });
    #letterSpacing = new FontSizeValue({ value: 0, unit: 'px' });
    #wordSpacing = new FontSizeValue({ value: 0, unit: 'px' });
    #textAlign = new StringValue('left');
    #textColor = new ColorOrGradientValue({ r: 255, g: 255, b: 255, a: 1, mode: 'color' });
    #justifyText = new BooleanValue(false);

    constructor(style) {
        super('textStyleSVG', 'Text Style');
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

    setLineHeight({value, unit}, setAsDefault = false) {
        return this.#lineHeight.batchUpdate({value, unit}, setAsDefault);
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
            fontSize: this.#fontSize.getUnitAndValue(),
            lineHeight: this.#lineHeight.getUnitAndValue(),
            letterSpacing: this.#letterSpacing.getUnitAndValue(),
            wordSpacing: this.#wordSpacing.getUnitAndValue(),
            textAlign: this.#textAlign.getValue(),
            textColor: this.#textColor.colorOrGradientObject,
            justifyText: this.#justifyText.getValue()
        };
    }

    batchUpdate({fontFamily, fontWeight, fontStyle, fontSize, lineHeight, letterSpacing, wordSpacing, textAlign, textColor, justifyText}, setAsDefault = false) {
        const fontFamilyChanged = fontFamily !== undefined ? this.setFontFamily(fontFamily, setAsDefault) : false;
        const fontWeightChanged = fontWeight !== undefined ? this.setFontWeight(fontWeight, setAsDefault) : false;
        const fontStyleChanged = fontStyle !== undefined ? this.setFontStyle(fontStyle, setAsDefault) : false;
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
        console.warn(`TextStyleSVGProperty: getValue - Unknown property name "${name}"`);
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
        console.warn(`TextStyleSVGProperty: setValue - Unknown property name "${key}"`);
        return false;
    }

    _updateSvgFill(svg, baseId, colorOrGradientValue, element) {
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            svg.prepend(defs);
        }

        const gradientId = `${baseId}-gradient-${element.id}`;
        let existingGradient = defs.querySelector(`#${gradientId}`);

        const value = colorOrGradientValue.colorOrGradientObject;

        if (value.mode === 'color') {
            if (existingGradient) {
                defs.removeChild(existingGradient);
            }
            return colorOrGradientValue.getCSSValue();
        } else { // Gradient
            const gradientType = value.type === 'radial' ? 'radialGradient' : 'linearGradient';
            if (!existingGradient || existingGradient.tagName.toLowerCase() !== gradientType) {
                if (existingGradient) defs.removeChild(existingGradient);
                existingGradient = document.createElementNS("http://www.w3.org/2000/svg", gradientType);
                existingGradient.id = gradientId;
                defs.appendChild(existingGradient);
            }

            // For linear gradients, use gradientTransform for rotation.
            if (value.type === 'linear') {
                // SVG rotation is clockwise, 0 is horizontal right. CSS 0deg is vertical up.
                // A CSS angle of 90deg (to right) corresponds to an SVG rotation of 0.
                const angle = value.angle !== undefined ? value.angle : 90;
                const svgAngle = angle - 90;
                existingGradient.setAttribute('gradientTransform', `rotate(${svgAngle})`);
            } else { // radial
                existingGradient.removeAttribute('gradientTransform');
            }

            // Update stops
            existingGradient.innerHTML = ''; // Clear old stops
            const globalOpacity = value.opacity !== undefined ? value.opacity : 1;
            (value.colorStops || []).sort((a, b) => a.position - b.position).forEach(stop => {
                const stopEl = document.createElementNS("http://www.w3.org/2000/svg", "stop");
                stopEl.setAttribute('offset', `${stop.position}%`);
                stopEl.setAttribute('stop-color', `rgb(${stop.color.r}, ${stop.color.g}, ${stop.color.b})`);
                stopEl.setAttribute('stop-opacity', (stop.color.a * globalOpacity).toFixed(3));
                existingGradient.appendChild(stopEl);
            });

            return `url(#${gradientId})`;
        }
    }

    applyChanges(element) {
        const layoutProperty = element.getProperty('lyricsLayout');
        const domElement = element.domElement;
        const svg = domElement.shadowRoot.querySelector('svg');

        if(this.#fontFamily.shouldRender) {
            const rawFont = this.#fontFamily.getValue();
            const resolvedFont = resolveFontFamily(rawFont);

            domElement.style.fontFamily = resolvedFont;
            layoutProperty.setFontFamily({element, fontFamily: resolvedFont});
            this.#fontFamily.markAsRendered();
        }
        if(this.#fontWeight.shouldRender) {
            layoutProperty.setFontWeight({element, fontWeight: this.#fontWeight.getValue()});
            domElement.style.fontWeight = this.#fontWeight.getValue();
            this.#fontWeight.markAsRendered();
        }
        if(this.#fontStyle.shouldRender) {
            layoutProperty.setFontStyle({element, fontStyle: this.#fontStyle.getValue()});
            domElement.style.fontStyle = this.#fontStyle.getValue();
            this.#fontStyle.markAsRendered();
        }
        if(this.#fontSize.shouldRender) {
            layoutProperty.setFontSize({element, fontSize: this.#fontSize.getCSSValue()});
            this.#fontSize.markAsRendered();
        }
        if(this.#lineHeight.shouldRender) {
            layoutProperty.setLineHeight({element, lineHeight: this.#lineHeight.getValue()});
            this.#lineHeight.markAsRendered();
        }
        if(this.#letterSpacing.shouldRender) {
            layoutProperty.setLetterSpacing({element, letterSpacing: this.#letterSpacing.getCSSValue()});
            domElement.style.letterSpacing = this.#letterSpacing.getCSSValue();
            this.#letterSpacing.markAsRendered();
        }
        if(this.#wordSpacing.shouldRender) {
            layoutProperty.setWordSpacing({element, wordSpacing: this.#wordSpacing.getPixelValue()});
            domElement.style.wordSpacing = this.#wordSpacing.getCSSValue();
            this.#wordSpacing.markAsRendered();
        }
        if(this.#textAlign.shouldRender) {
            layoutProperty.setTextAlign({element, textAlign: this.#textAlign.getValue()});
            this.#textAlign.markAsRendered();
        }
        if(this.#justifyText.shouldRender) {
            layoutProperty.setJustifyText({element, justifyText: this.#justifyText.getValue()});
            this.#justifyText.markAsRendered();
        }
        if(this.#textColor.shouldRender) {
            const fillValue = this._updateSvgFill(svg, 'text-color', this.#textColor, element);
            svg.style.setProperty('--text-color', fillValue);
            this.#textColor.markAsRendered();
        }
    }

    updateFontSize({rootFontSize, parentFontSize}) {
        return this.#fontSize.updatePixelValue({rootFontSize, parentFontSize});
    }

    resize({element, root, parent}) {
        const rootFontSize = root.getFontSize();
        const parentFontSize = parent.getFontSize();
        const fontSizeChanged = this.updateFontSize({rootFontSize, parentFontSize});
        const lineHeightChanged = this.#lineHeight.updatePixelValue({rootFontSize, parentFontSize});
        const letterSpacingChanged = this.#letterSpacing.updatePixelValue({rootFontSize, parentFontSize});
        const wordSpacingChanged = this.#wordSpacing.updatePixelValue({rootFontSize, parentFontSize});
        return fontSizeChanged || lineHeightChanged || letterSpacingChanged || wordSpacingChanged;
    }
}


