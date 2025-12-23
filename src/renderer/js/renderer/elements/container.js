// src/renderer/js/renderer/elements/container.js

import { VirtualElement } from './element.js';

import { AlignmentProperty } from "../properties/alignment.js";
import { DimensionsProperty } from "../properties/dimensions.js";
import { GravityProperty } from "../properties/gravity.js";
import { GapProperty } from "../properties/gap.js";
import { MarginProperty } from "../properties/margin.js";
import { BackgroundProperty } from "../properties/backgroundCG.js";
import { BorderProperty } from "../properties/border.js";
import { BoxShadowProperty } from "../properties/boxShadow.js";
import { EffectsProperty } from "../properties/effects.js";
import { InnerPaddingProperty } from "../properties/innerPadding.js";
import { TransformProperty } from '../properties/transform.js';

export class VirtualContainer extends VirtualElement {
    #children = [];
    get addedInDom() {
        return super.addedInDom;
    }
    set addedInDom(value) {
        super.addedInDom = value;
        this.#children.forEach(child => {
            child.addedInDom = value;
        });
    }
    constructor(options={} ) {
        super('container', options.name || 'Container', options);
        this.domElement = document.createElement('div');
        this.domElement.id = this.id;
        this.domElement.dataset.elementType = 'container';
        this.domElement.style.display = 'flex';
        this.domElement.style.position = 'absolute';
        // this.domElement.style.overflow = 'hidden';

        // --- FIX START: Add placeholder initially ---
        const placeholder = document.createElement('div');
        placeholder.className = 'container-placeholder';
        placeholder.textContent = 'Drop elements here';
        this.domElement.appendChild(placeholder);
        this.domElement.classList.add('is-empty-container');
        // --- FIX END ---

        // Add all common properties
        this.setProperty('alignment', new AlignmentProperty(options.alignment));
        this.setProperty('border', new BorderProperty(options.border));
        this.setProperty('boxShadow', new BoxShadowProperty(options.boxShadow));
        this.setProperty('margin', new MarginProperty(options.margin));
        this.setProperty('dimensions', new DimensionsProperty(options.dimensions));

        // Default background to disabled for generic containers. Page will override this.
        const backgroundOptions = options.background !== undefined
            ? options.background
            : { enabled: false };
        this.setProperty('background', new BackgroundProperty(backgroundOptions));

        this.setProperty('inner_padding', new InnerPaddingProperty(options.inner_padding));
        this.setProperty('gravity', new GravityProperty(options.gravity));
        this.setProperty('gap', new GapProperty(options.gap));
        this.setProperty('effects', new EffectsProperty(options.effects));
        this.setProperty('transform', new TransformProperty(options.transform));

        this.#children = [];
    }

    getChildren() {
        return this.#children;
    }

    getWidth() {
        return this.getProperty('dimensions').getWidth().getPixelValue() - this.getAdditionalHorizontalSpace();
    }

    getHeight() {
        return this.getProperty('dimensions').getHeight().getPixelValue() - this.getAdditionalVerticalSpace();
    }

    hasElement(element) {
        return this.#children.includes(element);
    }

    addElement(element) {
        if(this.hasElement(element)) return;

        // --- FIX START: Remove placeholder before adding first child ---
        if (this.#children.length === 0) {
            const placeholder = this.domElement.querySelector('.container-placeholder');
            if (placeholder) this.domElement.removeChild(placeholder);
            this.domElement.classList.remove('is-empty-container');
        }
        // --- FIX END ---

        this.#children.push(element);
        this.domElement.appendChild(element.domElement);
        element.setParent(this);
        element.addedInDom = true;
        element.domElement.style.position = this.getProperty('alignment').getAlignment().getValue() === 'absolute' ? 'absolute' : 'relative';
    }

    /**
     * NEW: Adds an element at a specific index in the children array
     * and re-orders the DOM to match.
     */
    addElementAt(element, index) {
        if(this.hasElement(element)) return;

        // --- FIX START: Remove placeholder before adding first child ---
        if (this.#children.length === 0) {
            const placeholder = this.domElement.querySelector('.container-placeholder');
            if (placeholder) this.domElement.removeChild(placeholder);
            this.domElement.classList.remove('is-empty-container');
        }
        // --- FIX END ---

        // Insert into virtual array
        this.#children.splice(index, 0, element);
        element.setParent(this);
        element.domElement.style.position = this.getProperty('alignment').getAlignment().getValue() === 'absolute' ? 'absolute' : 'relative';

        // Re-order the real DOM to perfectly match the virtual array
        this.#children.forEach(child => {
            child.addedInDom = false;
            this.domElement.appendChild(child.domElement);
            child.addedInDom = true;
        });
    }

    removeElement(element) {
        const index = this.#children.indexOf(element);
        if (index === -1) return;

        this.#children.splice(index, 1);

        // CORRECTED: More robust check to prevent errors if the element is already virtually removed.
        if(this.addedInDom && this.domElement.contains(element.domElement)) {
            this.domElement.removeChild(element.domElement);
            element.addedInDom = false;
        }

        // --- FIX START: Add placeholder back if it becomes empty ---
        if (this.#children.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'container-placeholder';
            placeholder.textContent = 'Drop elements here';
            this.domElement.appendChild(placeholder);
            this.domElement.classList.add('is-empty-container');
        }
        // --- FIX END ---
    }

    getFontSize() {
        // Default font size for containers is 16px
        return 16;
    }

    handlePlaybackStateChange(isPlaying) {
        super.handlePlaybackStateChange(isPlaying);
        this.#children.forEach(child => {
            child.handlePlaybackStateChange(isPlaying);
        });
    }

    applyEvents(measureIndex, measureProgress, timingData) {
        if(!this.addedInDom) return;
        super.applyEvents(measureIndex, measureProgress, timingData);
        this.#children.forEach(child => {
            child.applyEvents(measureIndex, measureProgress, timingData);
        });
    }

    render() {
        if(!this.addedInDom) return;
        super.render();
        this.#children.forEach(child => {
            child.render();
        });
    }

    resize({root, parent}) {
        if(!this.addedInDom) return;
        super.resize({root, parent});
        this.#children.forEach(child => {
            child.resize({root, parent: this});
        });
    }
}

