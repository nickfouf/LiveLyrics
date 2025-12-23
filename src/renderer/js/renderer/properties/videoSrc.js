import { VirtualProperty } from './property.js';
import { StringValue } from '../values/string.js';

export class VideoSrcProperty extends VirtualProperty {
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
        if (name === 'src') return this.getSrc();
        if (name === 'alias') return this.getAlias();
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if (key === 'src') return this.setSrc(value, setAsDefault);
        if (key === 'alias') return this.setAlias(value, setAsDefault);
        return null;
    }

    /**
     * Overrides the base property's event application. The video source is not
     * an animatable property and should not be affected by the timeline's
     * event processing, which was causing it to be reset to its default value.
     */
    applyEvents(element, measureIndex, measureProgress, timingData) {
        // DO NOTHING.
    }

    applyChanges(element) {
        if (element.videoElement && this.#src.shouldRender) {
            const srcValue = this.#src.getValue();
            if (element.videoElement.src !== srcValue) {
                element.videoElement.src = srcValue;
                element.videoElement.load();
            }
            this.#src.markAsRendered();
        }
    }
}

