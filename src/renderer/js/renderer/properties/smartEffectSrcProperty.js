import { VirtualProperty } from './property.js';
import { StringValue } from '../values/string.js';

export class SmartEffectSrcProperty extends VirtualProperty {
    #src = new StringValue('');
    #alias = new StringValue('');

    constructor(options = {}) {
        super('src', 'Source');
        
        // Handle input options
        if (typeof options === 'string') {
            this.setSrcValue(options || '', true);
            this.setAlias('', true);
        } else if (options) {
            this.setSrcValue(options.src || '', true);
            this.setAlias(options.alias || '', true);
        }
    }

    getSrc() {
        return this.#src;
    }

    getAlias() {
        return this.#alias;
    }

    setSrcValue(value, setAsDefault = false) {
        return this.#src.setValue(value, setAsDefault);
    }

    setAlias(value, setAsDefault = false) {
        return this.#alias.setValue(value, setAsDefault);
    }

    /**
     * Sets the source from a file dialog result.
     * @param {object} fileData - { filePath, alias }
     */
    setSrc(fileData, setAsDefault = false) {
        if (!fileData || !fileData.filePath) {
            return;
        }
        this.setSrcValue(fileData.filePath, setAsDefault);
        this.setAlias(fileData.alias || '', setAsDefault);
    }

    toJSON() {
        return {
            src: this.#src.getDefaultValue(),
            alias: this.#alias.getDefaultValue(),
        };
    }

    getValues() {
        return {
            src: this.getSrc(),
            alias: this.getAlias()
        }
    }

    getValue(name) {
        if (name === 'src') return this.getSrc();
        if (name === 'alias') return this.getAlias();
        console.warn(`Value ${name} not found in SmartEffectSrcProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if (key === 'src') return this.setSrc(value, setAsDefault);
        if (key === 'alias') return this.setAlias(value, setAsDefault);
        console.warn(`Value ${key} not found in SmartEffectSrcProperty.`);
        return null;
    }

    applyChanges(element) {
        if (this.#src.shouldRender && element.iframe) {
            const url = this.#src.getValue();
            // Prevent reloading if URL is the same
            if (element.iframe.src !== url) {
                element.iframe.src = url;
            }
            this.#src.markAsRendered();
        }
    }
}

