import { VirtualProperty } from "./property.js";
import { StringValue } from "../values/string.js";

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

export class TextContentProperty extends VirtualProperty {
    #textContent = new StringValue('');
    constructor(textContent='') {
        super('textContent', 'Text Content');
        this.setTextContent(textContent, true);
    }

    getTextContent() {
        return this.#textContent;
    }

    setTextContent(value, setAsDefault = false) {
        return this.#textContent.setValue(value, setAsDefault);
    }

    getValues() {
        return { textContent: this.#textContent };
    }

    getValue(name) {
        if(name === 'textContent') return this.getTextContent();
        console.warn(`No such value ${name} in TextContentProperty`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'textContent') return this.setTextContent(value, setAsDefault);
        console.warn(`No such value ${key} in TextContentProperty`);
        return null;
    }

    /**
     * Correctly applies the text content to the virtual element's DOM node,
     * converting newlines to <br> tags.
     * @param {VirtualElement} element The virtual element instance.
     */
    applyChanges(element) {
        const domElement = element.textElement || element.domElement;
        if (this.#textContent.shouldRender) {
            const rawText = this.#textContent.getValue();
            const escapedText = escapeHTML(rawText);
            const finalText = escapedText.replace(/\n/g, '<br>');
            domElement.innerHTML = finalText;
            this.#textContent.markAsRendered();
        }
    }
}

