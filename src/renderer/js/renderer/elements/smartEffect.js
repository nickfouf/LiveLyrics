// src/renderer/js/renderer/elements/smartEffect.js
import { VirtualElement } from "./element.js";

import { DimensionsProperty } from "../properties/dimensions.js";
import { MarginProperty } from "../properties/margin.js";
import { EffectsProperty } from "../properties/effects.js";
import { SmartEffectSrcProperty } from "../properties/smartEffectSrcProperty.js";
import { TransformProperty } from "../properties/transform.js";
import { BorderProperty } from "../properties/border.js"; 
import { BoxShadowProperty } from "../properties/boxShadow.js"; 
import { BeatPointsProperty } from "../properties/beatPoints.js";

// FIXED IMPORTS: These utilities live in the editor directory
import { buildMeasureMap, findVirtualElementById } from "../../editor/utils.js";
import { state } from "../../editor/state.js";

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

        // Send measure map on load
        this.iframe.addEventListener('load', () => {
            this.#sendMeasureMap();
        });

        this.domElement.appendChild(this.iframe);

        // Add properties
        this.setProperty('src', new SmartEffectSrcProperty(options.src));
        this.setProperty('beatPoints', new BeatPointsProperty(options.beatPoints || '0')); 
        this.setProperty('dimensions', new DimensionsProperty(options.dimensions));
        this.setProperty('margin', new MarginProperty(options.margin));
        this.setProperty('effects', new EffectsProperty(options.effects));
        this.setProperty('transform', new TransformProperty(options.transform));
        this.setProperty('border', new BorderProperty(options.border));
        this.setProperty('boxShadow', new BoxShadowProperty(options.boxShadow));
    }

    #getPage() {
        let current = this.parent;
        while (current && current.type !== 'page') {
            current = current.parent;
        }
        return current;
    }

    #sendMeasureMap() {
        if (!this.iframe || !this.iframe.contentWindow) return;

        const page = this.#getPage();
        if (!page) return;

        // Get the globally calculated measure map
        const globalMeasureMap = buildMeasureMap();
        const pageIndex = state.song.pages.indexOf(page);

        // We use an Object (Dictionary) so the global index serves as the direct key
        const measureMapToSend = {};

        // Filter out measures that belong to the page this Smart Effect is on
        const pageMeasures = globalMeasureMap.filter(m => m.pageIndex === pageIndex);

        pageMeasures.forEach(m => {
            const el = findVirtualElementById(page, m.elementId);
            // Key the map by the GLOBAL index so it perfectly matches the timeline progress
            measureMapToSend[m.globalIndex] = {
                index: m.globalIndex,
                type: el ? el.type : 'unknown',
                numerator: m.timeSignature.numerator,
                denominator: m.timeSignature.denominator
            };
        });

        this.iframe.contentWindow.postMessage({
            type: 'page-measure-map',
            measures: measureMapToSend
        }, '*');
    }

    applyEvents(measureIndex, measureProgress, timingData) {
        super.applyEvents(measureIndex, measureProgress, timingData);

        if (this.addedInDom && this.iframe && this.iframe.contentWindow) {
            const beatPointsProp = this.getProperty('beatPoints');
            if (beatPointsProp) {
                const beatPointsStr = beatPointsProp.getBeatPoints().getValue() || '';
                const beatPoints = beatPointsStr
                    .split(',')
                    .map(s => parseFloat(s.trim()))
                    .filter(n => !isNaN(n));

                this.iframe.contentWindow.postMessage({
                    type: 'timeline-progress',
                    measure: {
                        index: measureIndex, // This is the Global Index
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