// src/renderer/js/renderer/elements/smartEffect.js
import { VirtualElement } from "./element.js";

import { DimensionsProperty } from "../properties/dimensions.js";
import { MarginProperty } from "../properties/margin.js";
import { EffectsProperty } from "../properties/effects.js";
import { SmartEffectSrcProperty } from "../properties/smartEffectSrcProperty.js";
import { TransformProperty } from "../properties/transform.js";
import { BorderProperty } from "../properties/border.js"; 
import { BoxShadowProperty } from "../properties/boxShadow.js"; 
import { BeatPointsProperty } from "../properties/beatPoints.js"; // <--- IMPORTED

export class VirtualSmartEffect extends VirtualElement {
    #addedInDom = false;
    
    get addedInDom() {
        return this.#addedInDom;
    }
    
    set addedInDom(value) {
        this.#addedInDom = value;
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
        this.iframe.style.pointerEvents = 'none'; 

        this.domElement.appendChild(this.iframe);

        // Add properties
        this.setProperty('src', new SmartEffectSrcProperty(options.src));
        
        // --- ADDED: Initialize BeatPointsProperty ---
        // Defaults to '0' (beat at the start of measure)
        this.setProperty('beatPoints', new BeatPointsProperty(options.beatPoints || '0')); 
        
        this.setProperty('dimensions', new DimensionsProperty(options.dimensions));
        this.setProperty('margin', new MarginProperty(options.margin));
        this.setProperty('effects', new EffectsProperty(options.effects));
        this.setProperty('transform', new TransformProperty(options.transform));
        this.setProperty('border', new BorderProperty(options.border));
        this.setProperty('boxShadow', new BoxShadowProperty(options.boxShadow));
    }

    /**
     * Intercept the timeline loop to pass the current frame data to the iframe.
     */
    applyEvents(measureIndex, measureProgress, timingData) {
        super.applyEvents(measureIndex, measureProgress, timingData);

        // Push data to the iframe if it's rendered in the DOM
        if (this.addedInDom && this.iframe && this.iframe.contentWindow) {
            const beatPointsProp = this.getProperty('beatPoints');
            if (beatPointsProp) {
                const beatPointsStr = beatPointsProp.getBeatPoints().getValue() || '';
                
                // Safely parse the comma separated string "0, 0.5, 0.75" into [0.0, 0.5, 0.75]
                const beatPoints = beatPointsStr
                    .split(',')
                    .map(s => parseFloat(s.trim()))
                    .filter(n => !isNaN(n));

                this.iframe.contentWindow.postMessage({
                    type: 'timeline-progress',
                    measure: {
                        index: measureIndex,
                        progress: measureProgress,
                        beatPoints: beatPoints
                    }
                }, '*');
            }
        }
    }

    render() {
        super.render();
    }
}