// src/renderer/js/renderer/elements/smartEffect.js
import { VirtualElement } from "./element.js";

import { DimensionsProperty } from "../properties/dimensions.js";
import { MarginProperty } from "../properties/margin.js";
import { EffectsProperty } from "../properties/effects.js";
import { SmartEffectSrcProperty } from "../properties/smartEffectSrcProperty.js";
import { TransformProperty } from "../properties/transform.js";

export class VirtualSmartEffect extends VirtualElement {
    #addedInDom = false;
    get addedInDom() {
        return this.#addedInDom;
    }
    set addedInDom(value) {
        this.#addedInDom = value;
        if(!value) return;
        // Browser removes styles when element is removed from DOM, so we need to reapply them
        this.getProperty('src').getEffectData().rerenderStyles(this);
    }
    constructor(options = {}) {
        super('smart-effect', options.name || 'Smart Effect', options);

        this.domElement = document.createElement('div');
        this.domElement.id = this.id;
        this.domElement.dataset.elementType = 'smart-effect';
        this.domElement.style.width = '100%';
        this.domElement.style.height = '100%';
        this.domElement.style.position = 'relative'; // For progress bar positioning
        this.domElement.style.overflow = 'hidden';

        this.domElement.attachShadow({ mode: 'open' });

        const styleElement = document.createElement('style');
        styleElement.id = 'smart-effect-styles';
        this.domElement.shadowRoot.appendChild(styleElement);

        // Add properties
        this.setProperty('src', new SmartEffectSrcProperty(options.src));
        this.setProperty('dimensions', new DimensionsProperty(options.dimensions));
        this.setProperty('margin', new MarginProperty(options.margin));
        this.setProperty('effects', new EffectsProperty(options.effects));
        this.setProperty('transform', new TransformProperty(options.transform));
    }
}



