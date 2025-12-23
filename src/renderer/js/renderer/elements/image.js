// src/renderer/js/renderer/elements/image.js
import { VirtualElement } from "./element.js";
import { DimensionsProperty } from "../properties/dimensions.js";
import { MarginProperty } from "../properties/margin.js";
import { EffectsProperty } from "../properties/effects.js";
import { BorderProperty } from "../properties/border.js";
import { BoxShadowProperty } from "../properties/boxShadow.js";
import { ImageSrcProperty } from "../properties/imageSrc.js";
import { ObjectFitProperty } from "../properties/objectFit.js";
import { ObjectPositionProperty } from "../properties/objectPosition.js";
import { BackgroundProperty } from "../properties/backgroundCG.js";
import { TransformProperty } from "../properties/transform.js";

export class VirtualImage extends VirtualElement {
    constructor(options = {}) {
        super('image', options.name || 'Image', options);
        this.domElement = document.createElement('div');
        const img = document.createElement('img');
        this.domElement.id = this.id;
        this.domElement.dataset.elementType = 'image';
        this.domElement.style.display = 'inline-block';
        this.domElement.style.position = 'relative';
        this.domElement.style.overflow = 'hidden';
        this.domElement.appendChild(img);
        img.style.display = 'block';
        img.style.width = '100%';
        img.style.height = '100%';

        const effectsElement = document.createElement('div');
        effectsElement.style.position = 'absolute';
        effectsElement.style.inset = '0';
        effectsElement.style.borderRadius = 'inherit';
        effectsElement.style.pointerEvents = 'none';
        effectsElement.style.boxShadow = 'inherit';
        this.domElement.appendChild(effectsElement);
        this.effectsElement = effectsElement;

        // FIX: Pass options to properties so they are not reset to defaults
        this.setProperty('background', new BackgroundProperty(options.background || { enabled: false }));
        this.setProperty('src', new ImageSrcProperty(options.src));
        this.setProperty('objectFit', new ObjectFitProperty(options.objectFit));
        this.setProperty('objectPosition', new ObjectPositionProperty(options.objectPosition));
        this.setProperty('boxShadow', new BoxShadowProperty(options.boxShadow));
        this.setProperty('dimensions', new DimensionsProperty(options.dimensions));
        this.setProperty('margin', new MarginProperty(options.margin));
        this.setProperty('effects', new EffectsProperty(options.effects));
        this.setProperty('border', new BorderProperty(options.border));
        this.setProperty('transform', new TransformProperty(options.transform));
    }
}



