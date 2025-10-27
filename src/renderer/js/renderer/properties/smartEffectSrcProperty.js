import { VirtualProperty } from './property.js';
import { StringValue } from '../values/string.js';
import { SmartEffectDataValue } from '../values/smartEffectData.js';

export class SmartEffectSrcProperty extends VirtualProperty {
    #src = new StringValue('');
    #alias = new StringValue('');
    #effectData = new SmartEffectDataValue(null);

    constructor(options = {}) {
        super('src', 'Source');
        // MODIFIED: Handle deserialization of the full effect data object.
        if (typeof options === 'string') {
            this.setSrcValue(options || '', true);
            this.setAlias('', true);
        } else if (options) {
            this.setSrcValue(options.src || '', true);
            this.setAlias(options.alias || '', true);
            if (options.effectData) {
                this.#effectData.setEffectData(options.effectData);
            }
        }
    }

    getSrc() {
        return this.#src;
    }

    getAlias() {
        return this.#alias;
    }

    getEffectData() {
        return this.#effectData;
    }

    setSrcValue(value, setAsDefault = false) {
        return this.#src.setValue(value, setAsDefault);
    }

    setAlias(value, setAsDefault = false) {
        return this.#alias.setValue(value, setAsDefault);
    }

    /**
     * Sets the source for the smart effect from a file dialog result.
     * @param {object} fileData - The object returned from the IPC call.
     * @param {string} fileData.filePath - The path to the selected file.
     * @param {string} fileData.content - The JSON content of the file.
     * @param {string} fileData.alias - The original filename.
     * @param {boolean} setAsDefault - Whether to set the value as default.
     */
    setSrc(fileData, setAsDefault = false) {
        if (!fileData || !fileData.filePath || !fileData.content) {
            return;
        }

        this.setSrcValue(fileData.filePath, setAsDefault);
        this.setAlias(fileData.alias || '', setAsDefault);

        try {
            const data = JSON.parse(fileData.content);
            this.#effectData.setEffectData(data);
        } catch (e) {
            console.error("Failed to parse Smart Effect JSON content:", e);
            this.#effectData.setEffectData(null); // Reset on error
        }
    }

    /**
     * ADDED: Custom serialization to include the full effect data.
     * This ensures the effect's JSON content is saved within the song file.
     */
    toJSON() {
        return {
            src: this.#src.getDefaultValue(),
            alias: this.#alias.getDefaultValue(),
            effectData: this.#effectData.effectData
        };
    }

    getValues() {
        return {
            src: this.getSrc(),
            alias: this.getAlias(),
            effectData: this.getEffectData()
        }
    }

    getValue(name) {
        if (name === 'src') return this.getSrc();
        if (name === 'alias') return this.getAlias();
        if (name === 'effectData') return this.getEffectData();
        console.warn(`Value ${name} not found in SmartEffectSrcProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if (key === 'src') return this.setSrc(value, setAsDefault);
        if (key === 'alias') return this.setAlias(value, setAsDefault);
        if (key === 'effectData') return this.#effectData.setEffectData(value);
        console.warn(`Value ${key} not found in SmartEffectSrcProperty.`);
        return null;
    }

    applyChanges(element) {
        this.#effectData.applyDifferences(element);
        console.log(this.#effectData.shouldRender)
        // if (this.#effectData.shouldRender) {
        //     this.#effectData.applyDifferences(element);
        // }
    }
}