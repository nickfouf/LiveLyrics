// src/renderer/js/editor/styleClipboard.js

import { internalClipboard } from './internalClipboard.js';
import { setPropertyAsDefaultValue, markAsDirty } from './events.js';
import { triggerActivePageRender } from './pageManager.js';
import { renderPropertiesPanel } from './propertiesPanel.js';

// Properties defined as "Style". 
// Dimensions (width/height) are excluded to prevent layout breaking on paste.
const STYLE_GROUPS = [
    'background', 
    'border', 
    'boxShadow', 
    'effects', 
    'textStyle', 
    'textShadow', 
    'margin', 
    'inner_padding', 
    'gap', 
    'gravity', 
    'alignment',
    'transform', 
    'objectFit',
    'objectPosition',
    'progress' // Orchestra bar style
];

/**
 * Copies the style of the given element to internal memory.
 * @param {VirtualElement} element 
 */
export function copyStyle(element) {
    if (!element) return;

    const styleData = {
        sourceType: element.type,
        properties: {}
    };

    STYLE_GROUPS.forEach(propKey => {
        if (element.hasProperty(propKey)) {
            const property = element.getProperty(propKey);
            // Use the property's toJSON method to get the serializable value
            const serialized = property.toJSON();
            if (serialized !== undefined) {
                styleData.properties[propKey] = serialized;
            }
        }
    });

    internalClipboard.write('style', styleData);
    console.log('[StyleClipboard] Copied style to memory.');
    
    // Force re-render of panel to update the Paste button state
    renderPropertiesPanel(element); 
}

/**
 * Checks if the data currently in the clipboard can be pasted onto the target element.
 * @param {VirtualElement} targetElement 
 * @returns {boolean}
 */
export function canPasteStyle(targetElement) {
    if (!targetElement) return false;
    const styleData = internalClipboard.read('style');
    if (!styleData) return false;
    return isCompatible(styleData.sourceType, targetElement.type);
}

/**
 * Pastes the style from internal memory to the target element.
 * @param {VirtualElement} targetElement 
 */
export function pasteStyle(targetElement) {
    if (!targetElement) return;

    const styleData = internalClipboard.read('style');
    
    if (!styleData) {
        console.log('[StyleClipboard] Clipboard is empty.');
        return;
    }

    if (!isCompatible(styleData.sourceType, targetElement.type)) {
        console.warn(`[StyleClipboard] Incompatible types: ${styleData.sourceType} -> ${targetElement.type}`);
        return;
    }

    const updates = styleData.properties;
    let madeChanges = false;

    // Iterate through all potential properties in the clipboard data
    for (const [propGroupKey, propValue] of Object.entries(updates)) {
        
        // 1. Check if target supports this property group
        if (!targetElement.hasProperty(propGroupKey)) continue;

        // 2. Special Logic: Do not paste 'alignment' (layout direction) 
        // if pasting between different container types, to preserve structure.
        if (propGroupKey === 'alignment' && isContainer(targetElement.type)) {
            continue; 
        }

        // 3. Special Logic: For Pages, ONLY allow pasting Background.
        // Even though Page is a container, we don't want to paste borders/shadows/etc onto the root page.
        if (targetElement.type === 'page') {
            if (propGroupKey !== 'background') {
                continue;
            }
        }

        // 4. Apply the flattened values
        const applied = applyRecursive(targetElement, propGroupKey, propValue);
        if (applied) madeChanges = true;
    }

    if (madeChanges) {
        markAsDirty();
        triggerActivePageRender(true);
        renderPropertiesPanel(targetElement); // Refresh UI values
    }
}

function isContainer(type) {
    // Note: 'page' is excluded here to enforce Page<->Page strictness via isCompatible
    return ['container', 'vcontainer', 'hcontainer', 'acontainer'].includes(type);
}

function isTextType(type) {
    return ['text', 'title'].includes(type);
}

/**
 * Determines if two element types are compatible for style pasting.
 */
function isCompatible(source, target) {
    if (source === target) return true;
    
    // Group 1: Standard Containers (V/H/A/Generic)
    if (isContainer(source) && isContainer(target)) return true;

    // Group 2: Basic Text Elements (Title/Text)
    if (isTextType(source) && isTextType(target)) return true;

    // All other types (Image, Video, Audio, Lyrics, SmartEffect, Orchestra, Page) 
    // must match exactly (handled by source === target check above).
    return false; 
}

/**
 * Maps the serialized JSON structure back to specific UI keys 
 * expected by setPropertyAsDefaultValue in events.js.
 */
function applyRecursive(element, propGroupKey, valueObj) {
    if (!valueObj) return false;
    let didChange = false;

    // Mapping complex property objects to individual keys used by setPropertyAsDefaultValue
    const propertyMap = {
        'background': [
            { json: 'enabled', ui: 'bgEnabled' },
            { json: 'background', ui: 'bgColor' }
        ],
        'border': [
            { json: 'enabled', ui: 'borderEnabled' },
            { json: 'width', ui: 'borderSize' }, // BorderProperty.toJSON uses 'width'
            { json: 'radius', ui: 'borderRadius' },
            { json: 'color', ui: 'borderColor' }
        ],
        'boxShadow': [
            { json: 'enabled', ui: 'shadowEnabled' },
            { json: 'inset', ui: 'shadowInset' },
            { json: 'shadowAngle', ui: 'shadowAngle' },
            { json: 'shadowDistance', ui: 'shadowDistance' },
            { json: 'blur', ui: 'shadowBlur' },
            { json: 'spread', ui: 'shadowSpread' },
            { json: 'color', ui: 'shadowColor' }
        ],
        'textShadow': [
            { json: 'enabled', ui: 'textShadowEnabled' },
            { json: 'textShadowAngle', ui: 'textShadowAngle' },
            { json: 'textShadowDistance', ui: 'textShadowDistance' },
            { json: 'blur', ui: 'textShadowBlur' },
            { json: 'color', ui: 'textShadowColor' }
        ],
        'effects': [
            { json: 'opacity', ui: 'opacity' },
            { json: 'mixBlendMode', ui: 'mixBlendMode' }
        ],
        'margin': [
            { json: 'top', ui: 'top' },
            { json: 'left', ui: 'left' },
            { json: 'bottom', ui: 'bottom' },
            { json: 'right', ui: 'right' },
            { json: 'enabled', ui: 'marginEnabled' }
        ],
        'inner_padding': [
            { json: 'top', ui: 'paddingTop' },
            { json: 'left', ui: 'paddingLeft' },
            { json: 'bottom', ui: 'paddingBottom' },
            { json: 'right', ui: 'paddingRight' }
        ],
        'textStyle': [
            { json: 'fontFamily', ui: 'fontFamily' },
            { json: 'fontWeight', ui: 'fontWeight' },
            { json: 'fontStyle', ui: 'fontStyle' },
            { json: 'fontSize', ui: 'fontSize' },
            { json: 'lineHeight', ui: 'lineHeight' },
            { json: 'letterSpacing', ui: 'letterSpacing' },
            { json: 'wordSpacing', ui: 'wordSpacing' },
            { json: 'textAlign', ui: 'textAlign' },
            { json: 'textColor', ui: 'textColor' },
            { json: 'justifyText', ui: 'justifyText' },
            { json: 'karaokeColor', ui: 'karaokeColor' }
        ],
        'transform': [
            { json: 'enabled', ui: 'transformEnabled' },
            { json: 'translateX', ui: 'translateX' },
            { json: 'translateY', ui: 'translateY' },
            { json: 'translateZ', ui: 'translateZ' },
            { json: 'scaleX', ui: 'scaleX' },
            { json: 'scaleY', ui: 'scaleY' },
            { json: 'scaleZ', ui: 'scaleZ' },
            { json: 'rotate', ui: 'rotate' },
            { json: 'rotateX', ui: 'rotateX' },
            { json: 'rotateY', ui: 'rotateY' },
            { json: 'rotateZ', ui: 'rotateZ' },
            { json: 'skewX', ui: 'skewX' },
            { json: 'skewY', ui: 'skewY' },
            { json: 'transform-origin-x', ui: 'transform-origin-x' },
            { json: 'transform-origin-y', ui: 'transform-origin-y' },
            { json: 'transform-origin-z', ui: 'transform-origin-z' },
            { json: 'transform-style', ui: 'transform-style' },
            { json: 'selfPerspective', ui: 'selfPerspective' },
            { json: 'childrenPerspective', ui: 'childrenPerspective' },
            { json: 'backface-visibility', ui: 'backface-visibility' }
        ],
        'gravity': [
            { json: 'justifyContent', ui: 'justifyContent' },
            { json: 'alignItems', ui: 'alignItems' }
        ],
        'gap': [
            { json: 'gap', ui: 'gap' }
        ],
        'objectFit': [
            { json: 'objectFit', ui: 'objectFit' }
        ],
        'objectPosition': [
            { json: 'xPosition', ui: 'objectPositionX' },
            { json: 'yPosition', ui: 'objectPositionY' }
        ],
        'progress': [
            { json: 'backgroundColor', ui: 'progressBgColor' },
            { json: 'fillColor', ui: 'progressFillColor' }
        ]
    };

    // If it's a known complex group
    if (propertyMap[propGroupKey]) {
        const mappings = propertyMap[propGroupKey];
        
        for (const map of mappings) {
            let val = undefined;

            // Case A: valueObj is an object and has the key
            if (typeof valueObj === 'object' && valueObj !== null && valueObj[map.json] !== undefined) {
                val = valueObj[map.json];
            } 
            
            if (val !== undefined) {
                // We use setPropertyAsDefaultValue because we want to update the *base* style,
                // not add a keyframe animation.
                setPropertyAsDefaultValue(element, map.ui, val);
                didChange = true;
            }
        }
    } 
    
    return didChange;
}