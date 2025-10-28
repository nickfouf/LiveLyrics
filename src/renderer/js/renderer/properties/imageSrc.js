import { VirtualProperty }from './property.js';
import { StringValue } from '../values/string.js';

export class ImageSrcProperty extends VirtualProperty {
    #src = new StringValue('');
    #alias = new StringValue('');

    constructor(options = {}) {
        super('src', 'Source');
        const src = (typeof options === 'string') ? options : options.src;
        const alias = (typeof options === 'string') ? '' : options.alias;
        this.setSrc(src || '', true);
        this.setAlias(alias || '', true);
    }

    getSrc() {
        return this.#src;
    }

    getAlias() {
        return this.#alias;
    }

    setSrc(value, setAsDefault = false) {
        return this.#src.setValue(value, setAsDefault);
    }

    setAlias(value, setAsDefault = false) {
        return this.#alias.setValue(value, setAsDefault);
    }

    getValues() {
        return {
            src: this.getSrc(),
            alias: this.getAlias()
        };
    }

    getValue(name) {
        if(name === 'src') return this.getSrc();
        if(name === 'alias') return this.getAlias();
        console.warn(`Value ${name} not found in ImageSrcProperty.`);
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if(key === 'src') return this.setSrc(value, setAsDefault);
        if(key === 'alias') return this.setAlias(value, setAsDefault);
        console.warn(`Value ${key} not found in ImageSrcProperty.`);
        return null;
    }

    applyChanges(element) {
        if (this.#src.shouldRender) {
            element.domElement.querySelector('img').src = this.#src.getValue();
            this.#src.markAsRendered();
        }
    }
}