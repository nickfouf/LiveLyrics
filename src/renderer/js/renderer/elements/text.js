// src/renderer/js/renderer/elements/text.js

import { VirtualElement } from './element.js';

import { TextContentProperty } from "../properties/textContent.js";
import { TextStyleProperty } from "../properties/textStyle.js";
import { DimensionsProperty } from "../properties/dimensions.js";
import { InnerPaddingProperty } from "../properties/innerPadding.js";
import { MarginProperty } from "../properties/margin.js";
import { EffectsProperty } from "../properties/effects.js";
import { BorderProperty } from "../properties/border.js";
import { BoxShadowProperty } from "../properties/boxShadow.js";
import { BackgroundProperty } from "../properties/backgroundCG.js";
import { TransformProperty } from '../properties/transform.js';
import { TextShadowProperty } from "../properties/textShadow.js";

/**
 * Escapes HTML special characters to prevent HTML injection.
 * @param {string} str The string to escape.
 * @returns {string} The escaped string.
 */
function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, function(match) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[match];
    });
}

export class VirtualText extends VirtualElement {
    #textElement = null;

    get textElement() { return this.#textElement; }

    constructor(options = {}) {
        super('text', options.name || 'Text', options);
        this.domElement = document.createElement('div');
        this.domElement.id = this.id;
        this.domElement.style.display = 'flex';
        this.domElement.style.justifyContent = 'center';
        this.domElement.style.alignItems = 'center';
        // this.domElement.style.overflow = 'hidden';
        this.domElement.dataset.elementType = 'text';

        const textElement = document.createElement('div');
        textElement.style.display = 'inline-block';
        this.#textElement = textElement;
        this.domElement.appendChild(textElement);

        // UPDATED: Set the initial text content using innerHTML to respect newlines
        const initialText = options.textContent || 'Text Content';
        const escapedText = escapeHTML(initialText);
        textElement.innerHTML = escapedText.replace(/\n/g, '<br>');

        const defaultTextStyle = {
            fontSize: { value: 30, unit: 'px' }
        };
        const finalTextStyle = { ...defaultTextStyle, ...(options.textStyle || {}) };

        // FIX: Pass options.background
        this.setProperty('background', new BackgroundProperty(options.background || { enabled: false }));
        this.setProperty('textContent', new TextContentProperty(initialText));
        this.setProperty('textStyle', new TextStyleProperty(finalTextStyle));
        this.setProperty('textShadow', new TextShadowProperty(options.textShadow));
        this.setProperty('boxShadow', new BoxShadowProperty(options.boxShadow));
        this.setProperty('dimensions', new DimensionsProperty(options.dimensions || {width: {value:100, unit:'auto'}, height: {value:100, unit:'auto'}}));
        this.setProperty('margin', new MarginProperty(options.margin));
        this.setProperty('effects', new EffectsProperty(options.effects));
        this.setProperty('border', new BorderProperty(options.border));
        this.setProperty('inner_padding', new InnerPaddingProperty(options.inner_padding));
        this.setProperty('transform', new TransformProperty(options.transform));
    }
}


