// src/renderer/js/renderer/elements/image.js
import { VirtualElement } from "./element.js";
import { DimensionsProperty } from "../properties/dimensions.js";
import { MarginProperty } from "../properties/margin.js";
import { EffectsProperty } from "../properties/effects.js";
import { BorderProperty } from "../properties/border.js";
import { BoxShadowProperty } from "../properties/boxShadow.js";
import { ImageSrcProperty } from "../properties/imageSrc.js";
import { ObjectFitProperty } from "../properties/objectFit.js";
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

        this.setProperty('background', new BackgroundProperty({ enabled: false }));
        this.setProperty('src', new ImageSrcProperty(options.src));
        this.setProperty('objectFit', new ObjectFitProperty(options.objectFit));
        this.setProperty('boxShadow', new BoxShadowProperty());
        this.setProperty('dimensions', new DimensionsProperty(options.dimensions));
        this.setProperty('margin', new MarginProperty());
        this.setProperty('effects', new EffectsProperty());
        this.setProperty('border', new BorderProperty());
        this.setProperty('transform', new TransformProperty(options.transform));
    }
}