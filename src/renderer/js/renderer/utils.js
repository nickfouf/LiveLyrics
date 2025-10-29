// src/renderer/js/renderer/utils.js
export function generateUUID() {
    if(window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
    } else {
        return Date.now().toString() + `-${Math.random().toString(36).substr(2, 9)}`;
    }
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
            return 'size';

        // Color/Gradient (a complex color or gradient object)
        case 'bgColor':
        case 'borderColor':
        case 'shadowColor':
        case 'textColor':
        case 'karaokeColor':
        case 'progressBgColor':
        case 'progressFillColor':
            return 'color/gradient';

        // Boolean (true/false)
        case 'bgEnabled':
        case 'borderEnabled':
        case 'shadowEnabled':
        case 'shadowInset':
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
            return 'string';
        
        // Dynamic String (value + id to trigger actions)
        case 'videoState':
        case 'audioState':
            return 'dynamic-string';

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

/**
 * Converts RGBA color values to a CSS hex string with alpha.
 * @param {number} r - Red value (0-255).
 * @param {number} g - Green value (0-255).
 * @param {number} b - Blue value (0-255).
 * @param {number} a - Alpha value (0-1).
 * @returns {string} The hex color string (e.g., #RRGGBBAA).
 */
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

        // Add the color stop string (e.g., "rgba(...) 50%")
        colorStopsStr += `${colorString} ${stop.position}%`;

        // If this is not the last stop, check if the *next* stop has a midpoint
        if (i < sortedStops.length - 1) {
            const nextStop = sortedStops[i + 1];

            // A midpoint of 50 is the default and doesn't need a hint in CSS
            if (nextStop.midpoint !== undefined && nextStop.midpoint !== 50) {
                const startPos = stop.position;
                const endPos = nextStop.position;

                // Translate the relative midpoint (0-100) to an absolute CSS color hint
                const relativeMidpoint = Math.max(0, Math.min(100, nextStop.midpoint)); // Clamp to 0-100
                const absoluteHint = startPos + (endPos - startPos) * (relativeMidpoint / 100);

                colorStopsStr += `, ${absoluteHint.toFixed(2)}%`;
            }
            colorStopsStr += ', ';
        }
    }

    const style = gradient.type;

    if (style === 'linear') {
        const angle = gradient.angle || 90;
        return `linear-gradient(${angle}deg, ${colorStopsStr})`;
    } else if (style === 'radial') {
        return `radial-gradient(circle, ${colorStopsStr})`;
    }

    return 'none';
}

/**
 * Compares two note objects for equality.
 * @param {object} noteA - The first note object.
 * @param {object} noteB - The second note object.
 * @returns {boolean} - True if the objects are equal, false otherwise.
 */
export function compareNoteObjects(noteA, noteB) {
    if (!noteA || !noteB) {
        return noteA === noteB;
    }

    // Ensure lineBreakAfter is treated as a boolean for comparison
    const lineBreakA = noteA.lineBreakAfter === true;
    const lineBreakB = noteB.lineBreakAfter === true;

    return noteA.id === noteB.id &&
        noteA.type === noteB.type &&
        noteA.text === noteB.text &&
        noteA.isConnectedToNext === noteB.isConnectedToNext &&
        lineBreakA === lineBreakB;
}

/**
 * Compares two time signature objects for equality.
 * @param {object} tsA - The first time signature object.
 * @param {object} tsB - The second time signature object.
 * @returns {boolean} - True if the objects are equal, false otherwise.
 */
export function compareTimeSignatureObjects(tsA, tsB) {
    if (!tsA || !tsB) {
        return tsA === tsB;
    }

    return tsA.numerator === tsB.numerator &&
        tsA.denominator === tsB.denominator;
}

/**
 * Compares two measure objects for equality.
 * @param {object} measureA - The first measure object.
 * @param {object} measureB - The second measure object.
 * @returns {boolean} - True if the objects are equal, false otherwise.
 */
export function compareMeasureObjects(measureA, measureB) {
    if (!measureA || !measureB) {
        return measureA === measureB;
    }

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

/**
 * Compares two lyrics objects for equality.
 * @param {object} lyricsA - The first lyrics object.
 * @param {object} lyricsB - The second lyrics object.
 * @returns {boolean} - True if the objects are equal, false otherwise.
 */
export function compareLyricsObjects(lyricsA, lyricsB) {
    if (lyricsA === lyricsB) {
        return true;
    }

    if (!lyricsA || !lyricsB) {
        return false;
    }

    const measuresA = lyricsA.measures;
    const measuresB = lyricsB.measures;

    if (measuresA.length !== measuresB.length) {
        return false;
    }

    for (let i = 0; i < measuresA.length; i++) {
        if (!compareMeasureObjects(measuresA[i], measuresB[i])) {
            return false;
        }
    }

    return true;
}

export function compareLyricsLayouts(layoutA, layoutB) {
    // Handle strict equality and cases where one or both are null/undefined.
    if (layoutA === layoutB) {
        return true;
    }
    if (!layoutA || !layoutB) {
        return false;
    }

    // Compare top-level style and dimension properties.
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

    // Compare the lines array.
    if (layoutA.lines.length !== layoutB.lines.length) {
        return false;
    }

    // Deep compare each line and its tspans.
    for (let i = 0; i < layoutA.lines.length; i++) {
        const lineA = layoutA.lines[i];
        const lineB = layoutB.lines[i];

        if (lineA.width !== lineB.width || lineA.height !== lineB.height || lineA.x !== lineB.x) {
            return false;
        }

        if (lineA.tspans.length !== lineB.tspans.length) {
            return false;
        }

        for (let j = 0; j < lineA.tspans.length; j++) {
            const tspanA = lineA.tspans[j];
            const tspanB = lineA.tspans[j];

            // Compare individual tspan properties.
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

    // If all checks have passed, the layouts are considered equal.
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