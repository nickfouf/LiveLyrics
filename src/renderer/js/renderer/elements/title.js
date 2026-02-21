// renderer/js/renderer/elements/title.js

import { VirtualText } from "./text.js";
import { NameProperty } from "../properties/name.js";

export class VirtualTitle extends VirtualText {
    constructor(options = {}, name = 'Title') {
        const defaultTitleStyle = {
            fontSize: { value: 60, unit: 'px' },
            fontWeight: 'bold',
            textAlign: 'center'
        };
        const finalTextStyle = { ...defaultTitleStyle, ...(options.textStyle || {}) };
        
        // ADDED: Ensure we pass the options down properly so TextStroke is picked up by VirtualText
        const finalOptions = {
            ...options,
            textContent: options.textContent || 'Title Content',
            textStyle: finalTextStyle
        };
        super(finalOptions);
        this._setType('title');
        this.domElement.dataset.elementType = this.type;
        this.setProperty('name', new NameProperty(name));
    }
}