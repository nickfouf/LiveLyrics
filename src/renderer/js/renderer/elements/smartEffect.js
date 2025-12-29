// src/renderer/js/renderer/elements/smartEffect.js
import { VirtualElement } from "./element.js";

import { DimensionsProperty } from "../properties/dimensions.js";
import { MarginProperty } from "../properties/margin.js";
import { EffectsProperty } from "../properties/effects.js";
import { SmartEffectSrcProperty } from "../properties/smartEffectSrcProperty.js";
import { TransformProperty } from "../properties/transform.js";
import { BorderProperty } from "../properties/border.js"; // Added common props
import { BoxShadowProperty } from "../properties/boxShadow.js"; // Added common props

export class VirtualSmartEffect extends VirtualElement {
    #addedInDom = false;
    
    get addedInDom() {
        return this.#addedInDom;
    }
    
    set addedInDom(value) {
        this.#addedInDom = value;
        // The iframe will automatically load/unload when attached/detached from DOM.
    }

    constructor(options = {}) {
        super('smart-effect', options.name || 'Smart Effect', options);

        // Main container
        this.domElement = document.createElement('div');
        this.domElement.id = this.id;
        this.domElement.dataset.elementType = 'smart-effect';
        this.domElement.style.width = '100%';
        this.domElement.style.height = '100%';
        this.domElement.style.position = 'relative';
        this.domElement.style.overflow = 'hidden';

        // The Iframe
        this.iframe = document.createElement('iframe');
        this.iframe.style.width = '100%';
        this.iframe.style.height = '100%';
        this.iframe.style.border = 'none';
        this.iframe.style.display = 'block';
        
        // Important: In the editor, iframes capture mouse events, making drag/drop impossible.
        // We set pointer-events to none on the iframe so the container div receives the clicks.
        this.iframe.style.pointerEvents = 'none'; 

        this.domElement.appendChild(this.iframe);

        // Add properties
        this.setProperty('src', new SmartEffectSrcProperty(options.src)); // This now holds URL
        this.setProperty('dimensions', new DimensionsProperty(options.dimensions));
        this.setProperty('margin', new MarginProperty(options.margin));
        this.setProperty('effects', new EffectsProperty(options.effects));
        this.setProperty('transform', new TransformProperty(options.transform));
        
        // Add visual styling properties that wrapper can handle
        this.setProperty('border', new BorderProperty(options.border));
        this.setProperty('boxShadow', new BoxShadowProperty(options.boxShadow));
    }

    render() {
        super.render();
        // Specific render logic if needed, e.g. passing messages to iframe
    }
}

