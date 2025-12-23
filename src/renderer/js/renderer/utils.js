// src/renderer/js/renderer/utils.js
import { fontLoader } from './fontLoader.js'; // Correct sibling import within renderer

export function generateUUID() {
    if(window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
    } else {
        return Date.now().toString() + `-${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Resolves the font family name.
 * If the font exists in the project assets (checked via FontLoader), it returns the namespaced version.
 * Otherwise, it returns the standard name.
 * @param {string} fontFamily - The original font family name.
 * @returns {string} The resolved CSS font-family string.
 */
export function resolveFontFamily(fontFamily) {
    if (!fontFamily) return 'inherit';

    // Check if the font is loaded via the FontLoader singleton
    if (fontLoader.isFontLoaded(fontFamily)) {
        return `"lyx-${fontFamily}", "${fontFamily}", sans-serif`;
    }
    
    return `"${fontFamily}", sans-serif`;
}

/**
 * Determines the underlying data type of a property based on its key.
 * This is crucial for creating the correct type of Event object for animations.
 * @param {string} propKey - The property key (e.g., 'opacity', 'width').
 * @returns {string} The property type (e.g., 'number', 'size', 'color/gradient').
 */
export function getPropertyType(propKey) {
    switch (propKey) {
        // Number (a single numeric value)
        case 'opacity':
        case 'videoSpeed':
        case 'audioVolume':
        case 'audioStartTime':
        case 'audioEndTime':
        case 'shadowAngle':
        case 'textShadowAngle': // Added
        case 'scaleX':
        case 'scaleY':
        case 'scaleZ':
        case 'rotate':
        case 'rotateX':
        case 'rotateY':
        case 'rotateZ':
        case 'skewX':
        case 'skewY':
            return 'number';

        // Size (a value and a unit)
        case 'width':
        case 'height':
        case 'top':
        case 'left':
        case 'right':
        case 'bottom':
        case 'borderSize':
        case 'borderRadius':
        case 'shadowOffsetX':
        case 'shadowOffsetY':
        case 'shadowBlur':
        case 'shadowSpread':
        case 'paddingTop':
        case 'paddingLeft':
        case 'paddingBottom':
        case 'paddingRight':
        case 'fontSize':
        case 'letterSpacing':
        case 'wordSpacing':
        case 'lineHeight':
        case 'translateX':
        case 'translateY':
        case 'translateZ':
        case 'transform-origin-x':
        case 'transform-origin-y':
        case 'transform-origin-z':
        case 'perspective':
        case 'perspective-origin-x':
        case 'perspective-origin-y':
        case 'shadowDistance':
        case 'textShadowDistance': // Added
        case 'textShadowBlur':     // Added
            return 'size';

        // Color/Gradient (a complex color or gradient object)
        case 'bgColor':
        case 'borderColor':
        case 'shadowColor':
        case 'textColor':
        case 'karaokeColor':
        case 'textShadowColor': // Added
        case 'progressBgColor':
        case 'progressFillColor':
            return 'color/gradient';

        // Boolean (true/false)
        case 'bgEnabled':
        case 'borderEnabled':
        case 'shadowEnabled':
        case 'shadowInset':
        case 'textShadowEnabled': // Added
        case 'justifyText':
        case 'audioLoop':
            return 'boolean';

        // String (text content)
        case 'content':
        case 'fontFamily':
        case 'fontWeight':
        case 'fontStyle':
        case 'textAlign':
        case 'objectFit':
        case 'videoSrc':
        case 'audioSrc':
        case 'transform-style':
        case 'backface-visibility':
        case 'mixBlendMode':
            return 'string';

        // Dynamic String (value + id to trigger actions)
        case 'videoState':
        case 'audioState':
            return 'dynamic-string';

        case 'alignment':
            return 'alignment';
        case 'justifyContent':
            return 'justifyContent';
        case 'alignItems':
            return 'alignItems';

        default:
            console.warn(`[getPropertyType] Unknown property key: ${propKey}`);
            return 'unknown';
    }
}


export function parseColorString(colorStr) {
    if (!colorStr) return { r: 0, g: 0, b: 0, a: 1 };

    // RGBA
    let match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
        return {
            r: parseInt(match[1], 10),
            g: parseInt(match[2], 10),
            b: parseInt(match[3], 10),
            a: match[4] !== undefined ? parseFloat(match[4]) : 1,
        };
    }

    // HEX (now handles 6 and 8 digits)
    const rgb = hexToRgb(colorStr);
    if (rgb) {
        return rgb;
    }

    // Short HEX
    match = colorStr.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i);
    if (match) {
        return {
            r: parseInt(match[1] + match[1], 16),
            g: parseInt(match[2] + match[2], 16),
            b: parseInt(match[3] + match[3], 16),
            a: 1,
        };
    }

    return { r: 0, g: 0, b: 0, a: 1 }; // Default fallback
}


export function hexToRgb(hex) {
    if (!hex) return null;
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
        a: result[4] !== undefined ? parseInt(result[4], 16) / 255 : 1
    } : null;
}

export function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

export function rgbaToHex(r, g, b, a) {
    const toHex = (c) => ('0' + Math.round(c).toString(16)).slice(-2);
    const alphaHex = toHex(a * 255);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}${alphaHex}`.toUpperCase();
}


export function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    let d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) {
        h = 0;
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s: s * 100, v: v * 100 };
}

export function hsvToRgb(h, s, v) {
    s /= 100; v /= 100;
    let i = Math.floor(h / 60);
    let f = h / 60 - i;
    let p = v * (1 - s);
    let q = v * (1 - f * s);
    let t = v * (1 - (1 - f) * s);
    let r, g, b;
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

export function compareColorAndColor(color1, color2) {
    return color1.r === color2.r &&
        color1.g === color2.g &&
        color1.b === color2.b &&
        color1.a === color2.a;
}

export function compareGradientAndGradient(gradient1, gradient2) {
    if(gradient1.type !== gradient2.type) return false;
    if(gradient1.scale !== gradient2.scale) return false;
    if(gradient1.type === 'linear' && (gradient1.angle !== gradient2.angle)) return false;
    if(gradient1.colorStops.length !== gradient2.colorStops.length) return false;
    const stops1 = [...gradient1.colorStops].sort((a, b) => a.position - b.position);
    const stops2 = [...gradient2.colorStops].sort((a, b) => a.position - b.position);
    for(let i = 0; i < stops1.length; i++) {
        if(!compareColorStops(stops1[i], stops2[i])) {
            return false;
        }
    }
    return true;
}

export function compareColorStops(colorStop1, colorStop2) {
    return colorStop1.midpoint === colorStop2.midpoint &&
        colorStop1.position === colorStop2.position &&
        compareColorAndColor(colorStop1.color, colorStop2.color);
}

export function generateCSSColor(color) {
    if(color.a === 1) {
        return `rgb(${color.r}, ${color.g}, ${color.b})`;
    } else {
        return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
    }
}

export function generateCSSGradient(gradient) {
    if (!gradient || !gradient.colorStops || gradient.colorStops.length < 1) {
        return 'none';
    }

    if (gradient.colorStops.length === 1) {
        const { r, g, b, a } = gradient.colorStops[0].color;
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    const sortedStops = [...gradient.colorStops].sort((a, b) => a.position - b.position);
    const globalOpacity = gradient.opacity !== undefined ? Number(gradient.opacity) : 1;
    let colorStopsStr = '';

    for (let i = 0; i < sortedStops.length; i++) {
        const stop = sortedStops[i];
        const c = stop.color;
        const finalAlpha = c.a * globalOpacity;
        const colorString = `rgba(${c.r}, ${c.g}, ${c.b}, ${finalAlpha})`;

        colorStopsStr += `${colorString} ${stop.position}%`;

        if (i < sortedStops.length - 1) {
            const nextStop = sortedStops[i + 1];
            if (nextStop.midpoint !== undefined && nextStop.midpoint !== 50) {
                const startPos = stop.position;
                const endPos = nextStop.position;
                const relativeMidpoint = Math.max(0, Math.min(100, nextStop.midpoint));
                const absoluteHint = startPos + (endPos - startPos) * (relativeMidpoint / 100);
                colorStopsStr += `, ${absoluteHint.toFixed(2)}%`;
            }
            colorStopsStr += ', ';
        }
    }

    const style = gradient.type;

    if (style === 'linear') {
        const angle = gradient.angle !== undefined ? gradient.angle : 90;
        return `linear-gradient(${angle}deg, ${colorStopsStr})`;
    } else if (style === 'radial') {
        return `radial-gradient(circle, ${colorStopsStr})`;
    }

    return 'none';
}

export function compareNoteObjects(noteA, noteB) {
    if (!noteA || !noteB) return noteA === noteB;
    const lineBreakA = noteA.lineBreakAfter === true;
    const lineBreakB = noteB.lineBreakAfter === true;
    return noteA.id === noteB.id &&
        noteA.type === noteB.type &&
        noteA.text === noteB.text &&
        noteA.isConnectedToNext === noteB.isConnectedToNext &&
        lineBreakA === lineBreakB;
}

export function compareTimeSignatureObjects(tsA, tsB) {
    if (!tsA || !tsB) return tsA === tsB;
    return tsA.numerator === tsB.numerator && tsA.denominator === tsB.denominator;
}

export function compareMeasureObjects(measureA, measureB) {
    if (!measureA || !measureB) return measureA === measureB;
    if (measureA.id !== measureB.id ||
        measureA.content.length !== measureB.content.length ||
        !compareTimeSignatureObjects(measureA.timeSignature, measureB.timeSignature)) {
        return false;
    }
    for (let i = 0; i < measureA.content.length; i++) {
        if (!compareNoteObjects(measureA.content[i], measureB.content[i])) {
            return false;
        }
    }
    return true;
}

export function compareLyricsObjects(lyricsA, lyricsB) {
    if (lyricsA === lyricsB) return true;
    if (!lyricsA || !lyricsB) return false;
    const measuresA = lyricsA.measures;
    const measuresB = lyricsB.measures;
    if (measuresA.length !== measuresB.length) return false;
    for (let i = 0; i < measuresA.length; i++) {
        if (!compareMeasureObjects(measuresA[i], measuresB[i])) return false;
    }
    const orderA = lyricsA.measureIdOrder || [];
    const orderB = lyricsB.measureIdOrder || [];
    if (orderA.length !== orderB.length) return false;
    for(let i=0; i<orderA.length; i++) {
        if(orderA[i] !== orderB[i]) return false;
    }
    return true;
}

export function compareLyricsLayouts(layoutA, layoutB) {
    if (layoutA === layoutB) return true;
    if (!layoutA || !layoutB) return false;

    if (
        layoutA.fontFamily !== layoutB.fontFamily ||
        layoutA.fontWeight !== layoutB.fontWeight ||
        layoutA.fontStyle !== layoutB.fontStyle ||
        layoutA.fontSize !== layoutB.fontSize ||
        layoutA.letterSpacing !== layoutB.letterSpacing ||
        layoutA.wordSpacing !== layoutB.wordSpacing ||
        layoutA.lineHeight !== layoutB.lineHeight ||
        layoutA.width !== layoutB.width ||
        layoutA.height !== layoutB.height ||
        layoutA.textAlign !== layoutB.textAlign ||
        layoutA.justifyText !== layoutB.justifyText ||
        layoutA.highlightedPercentage !== layoutB.highlightedPercentage
    ) {
        return false;
    }

    if (layoutA.lines.length !== layoutB.lines.length) return false;

    for (let i = 0; i < layoutA.lines.length; i++) {
        const lineA = layoutA.lines[i];
        const lineB = layoutB.lines[i];
        if (lineA.width !== lineB.width || lineA.height !== lineB.height || lineA.x !== lineB.x) return false;
        if (lineA.tspans.length !== lineB.tspans.length) return false;
        for (let j = 0; j < lineA.tspans.length; j++) {
            const tspanA = lineA.tspans[j];
            const tspanB = lineA.tspans[j];
            if (
                tspanA.text !== tspanB.text ||
                tspanA.type !== tspanB.type ||
                tspanA.isConnectedToNext !== tspanB.isConnectedToNext ||
                tspanA.id !== tspanB.id ||
                tspanA.width !== tspanB.width ||
                tspanA.dx !== tspanB.dx
            ) {
                return false;
            }
        }
    }
    return true;
}

export function deepEqual(a, b) {
    if (a === b) return true;
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        if (Array.isArray(a) !== Array.isArray(b)) return false;
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        for (let key of keysA) {
            if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
            if (!deepEqual(a[key], b[key])) return false;
        }
        return true;
    }
    return false;
}

export function getIconForElementType(type) {
    const icons = {
        'vcontainer': '<img src="../../icons/vcontainer.svg" alt="VContainer">',
        'hcontainer': '<img src="../../icons/hcontainer.svg" alt="HContainer">',
        'acontainer': '<img src="../../icons/acontainer.svg" alt="AContainer">',
        'lyrics': '<img src="../../icons/lyrics.svg" alt="Lyrics">',
        'image': '<img src="../../icons/image.svg" alt="Image">',
        'default': '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16,20H20V16H16M16,14H20V10H16M14,20H10V16H14M14,14H10V10H14M8,20H4V16H8M8,14H4V10H8M16,8H20V4H16M14,8H10V4H14M8,8H4V4H8V8Z" /></svg>',
        'title': '<img src="../../icons/title.svg" alt="Title">',
        'text': '<img src="../../icons/text.svg" alt="Text">',
        'orchestra': '<img src="../../icons/orchestra.svg" alt="Orchestra">',
        'smart-effect': '<img src="../../icons/smart-effect.svg" alt="Smart Effect">',
        'video': '<img src="../../icons/video.svg" alt="Video">',
        'audio': '<img src="../../icons/audio.svg" alt="Audio">',
    };
    return icons[type] || icons['default'];
}

export function getNameForElementType(type) {
    const names = {'page': 'Page', 'vcontainer': 'VContainer', 'hcontainer': 'HContainer', 'acontainer': 'AContainer', 'lyrics': 'Lyrics', 'title': 'Title', 'text': 'Text', 'image': 'Image', 'orchestra': 'Orchestra', 'smart-effect': 'Smart Effect', 'video': 'Video', 'audio': 'Audio'};
    return names[type] || 'Element';
}

export function getNoteIconHTML(noteType) {
    if (!noteType || typeof noteType !== 'string' || !noteType.endsWith('_note') && !noteType.endsWith('_note_dotted')) {
        return `<img src="../../icons/delete_red.svg" alt="Invalid Note" class="lyrics-render-note-icon">`;
    }
    return `<img src="../../icons/${noteType}.svg" alt="${noteType}" class="lyrics-render-note-icon">`;
}

export function getAvailablePropertiesForElement(element) {
    if (!element) return {};
    const elementType = element.dataset.elementType;

    let props = {};

    const commonEffects = { "Effects": { 
        "opacity": "Opacity",
        "mixBlendMode": "Blending Mode"
    }};
    const commonDimensions = { "Dimensions": { "width": "Width", "height": "Height" } };
    const commonMargin = { "Margin": { "top": "Top", "left": "Left", "bottom": "Bottom", "right": "Right" } };
    const commonInnerPadding = { "Inner Padding": { "paddingTop": "Top", "paddingLeft": "Left", "paddingBottom": "Bottom", "paddingRight": "Right" } };
    const commonBackground = { "Background": { "bgEnabled": "Enabled", "bgColor": "Color/Gradient" } };
    const commonBorder = { "Border": { "borderEnabled": "Enabled", "borderSize": "Width", "borderRadius": "Radius", "borderColor": "Color" } };
    const commonBoxShadow = { "Box Shadow": { "shadowEnabled": "Enabled", "shadowInset": "Inset", "shadowOffsetX": "OffsetX", "shadowOffsetY": "OffsetY", "shadowBlur": "Blur", "shadowSpread": "Spread", "shadowColor": "Color" } };
    const commonTextStyle = { "Text Style": {
            "fontFamily": "Font Family",
            "fontWeight": "Weight",
            "fontStyle": "Style",
            "fontSize": "Size",
            "textColor": "Text Color/Gradient",
            "lineHeight": "Line Height",
            "letterSpacing": "Letter Spacing",
            "wordSpacing": "Word Spacing",
            "textAlign": "Alignment",
            "justifyText": "Justify"
        }};
    const commonTextShadow = { "Text Shadow": {
        "textShadowEnabled": "Enabled",
        "textShadowColor": "Color",
        "textShadowOffsetX": "Offset X",
        "textShadowOffsetY": "Offset Y",
        "textShadowBlur": "Blur"
    }};

    const commonTransform2D = { "Transform 2D": {
        "translateX": "Translate X",
        "translateY": "Translate Y",
        "scaleX": "Scale X",
        "scaleY": "Scale Y",
        "rotate": "Rotate",
        "skewX": "Skew X",
        "skewY": "Skew Y",
        "transform-origin-x": "Origin X",
        "transform-origin-y": "Origin Y"
    }};
    const commonTransform3D = { "Transform 3D": {
        "translateZ": "Translate Z",
        "scaleZ": "Scale Z",
        "rotateX": "Rotate X",
        "rotateY": "Rotate Y",
        "rotateZ": "Rotate Z",
        "transform-origin-z": "Origin Z",
        "transform-style": "Transform Style",
        "selfPerspective": "Self-perspective",
        "childrenPerspective": "Children Perspective",
        "backface-visibility": "Backface Visibility"
    }};

    if (elementType === 'page') {
        props["Parent's Perspective"] = {
            "perspective": "Perspective",
            "parent-transform-style": "Transform Style",
            "parent-rotateX": "Rotate X",
            "parent-rotateY": "Rotate Y",
            "parent-rotateZ": "Rotate Z"
        };
    }

    switch (elementType) {
        case 'lyrics':
            props = {
                ...props,
                ...commonTextStyle,
                ...commonTextShadow,
                ...commonDimensions,
                ...commonMargin,
                ...commonInnerPadding,
                ...commonBackground,
                ...commonBorder,
                ...commonBoxShadow,
                ...commonEffects,
                ...commonTransform2D,
                ...commonTransform3D
            };
            props["Text Style"]["karaokeColor"] = "Karaoke Color/Gradient";
            break;

        case 'orchestra':
            props = {
                ...props,
                "Bar Style": {
                    "progressBgColor": "Background Color/Gradient",
                    "progressFillColor": "Fill Color/Gradient"
                },
                ...commonDimensions,
                ...commonMargin,
                ...commonInnerPadding,
                ...commonBorder,
                ...commonBoxShadow,
                ...commonEffects,
                ...commonTransform2D,
                ...commonTransform3D
            };
            break;

        case 'title':
        case 'text':
            props = {
                ...props,
                ...commonTextStyle,
                ...commonTextShadow,
                ...commonDimensions,
                ...commonMargin,
                ...commonInnerPadding,
                ...commonBackground,
                ...commonBorder,
                ...commonBoxShadow,
                ...commonEffects,
                ...commonTransform2D,
                ...commonTransform3D
            };
            break;

        case 'image':
            props = {
                ...props,
                "Object Fit": { "objectFit": "Fit" },
                ...commonDimensions,
                ...commonMargin,
                ...commonBackground,
                ...commonBorder,
                ...commonBoxShadow,
                ...commonEffects,
                ...commonTransform2D,
                ...commonTransform3D
            };
            break;

        case 'video':
            props = {
                ...props,
                "Playback": { "videoState": "State", "videoSpeed": "Speed", "videoLoop": "Loop" },
                "Object Fit": { "objectFit": "Fit" },
                ...commonDimensions,
                ...commonMargin,
                ...commonBackground,
                ...commonBorder,
                ...commonBoxShadow,
                ...commonEffects,
                ...commonTransform2D,
                ...commonTransform3D
            };
            break;

        case 'audio':
            props = {
                ...props,
                "Playback": {
                    "audioState": "State",
                    "audioVolume": "Volume",
                    "audioLoop": "Loop"
                },
                ...commonEffects,
                ...commonMargin
            };
            break;

        case 'smart-effect':
            props = {
                ...props,
                ...commonDimensions,
                ...commonMargin,
                ...commonEffects,
                ...commonTransform2D,
                ...commonTransform3D
            };
            if (element.dataset.effectJson) {
                try {
                    const effectData = JSON.parse(element.dataset.effectJson);
                    if (effectData.parameters) {
                        props["Effect Parameters"] = {};
                        for (const [key, config] of Object.entries(effectData.parameters)) {
                            if (['number', 'color', 'gradient', 'svg_color', 'svg_gradient', 'size', 'boolean', 'string'].includes(config.type)) {
                                props["Effect Parameters"][key] = config.name || key;
                            }
                        }
                    }
                } catch (e) {
                    console.error("Could not parse effect JSON for properties dialog:", e);
                }
            }
            break;

        case 'container':
        case 'acontainer':
        case 'vcontainer':
        case 'hcontainer':
            props = {
                ...props,
                "Gravity": { "justifyContent": "Justify Content", "alignItems": "Align Items" },
                "Layout": { "gap": "Gap" },
                ...commonInnerPadding,
                ...commonDimensions,
                ...commonMargin,
                ...commonBackground,
                ...commonBorder,
                ...commonBoxShadow,
                ...commonEffects,
                ...commonTransform2D,
                ...commonTransform3D
            };
            break;

        default:
            props = {};
            break;
    }

    return props;
}

