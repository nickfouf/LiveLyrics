/**
 * Measures the width and bounding box height of a text string with high accuracy using a hidden SVG element.
 * This function is a drop-in replacement for canvas-based text measurement when the final output is SVG.
 * It provides more accurate results as it uses the browser's SVG rendering engine directly.
 *
 * @param {string} text The text to measure.
 * @param {object} styles An object with font properties.
 * @param {string} styles.fontFamily The font family (e.g., "Arial", "sans-serif").
 * @param {string|number} styles.fontSize The font size with units (e.g., "16px") or just a number.
 * @param {string|number} [styles.fontWeight] Optional: The font weight (e.g., "bold", 400).
 * @param {string|number} [styles.letterSpacing] Optional: The letter spacing (e.g., "2px" or 2).
 * @param {string} [styles.fontStyle] Optional: The font style (e.g., "italic").
 * @returns {{width: number, height: number, x: number, ascent: number, descent: number, baseline: number, advanceWidth: number}} An object with the calculated dimensions.
 */
export function getTextMetrics(text, styles) {
    // 1. Singleton Setup for performance
    if (!getTextMetrics.svg) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.style.position = 'absolute';
        svg.style.top = '-9999px';
        svg.style.left = '-9999px';
        svg.style.visibility = 'hidden';

        const textNode = document.createElementNS("http://www.w3.org/2000/svg", "text");
        // Set a default alignment to ensure consistent measurement
        textNode.setAttribute('alignment-baseline', 'text-before-edge');
        svg.appendChild(textNode);

        document.body.appendChild(svg);

        getTextMetrics.svg = svg;
        getTextMetrics.textNode = textNode;
    }

    // 2. Get cached elements
    const textNode = getTextMetrics.textNode;
    const { fontFamily="Arial", fontSize, fontWeight="normal", fontStyle, letterSpacing } = styles;

    // 3. Apply font styles as SVG attributes, ensuring units for pixel values
    const formattedFontSize = typeof fontSize === 'number' ? `${fontSize}px` : fontSize;
    const formattedLetterSpacing = typeof letterSpacing === 'number' ? `${letterSpacing}px` : letterSpacing;

    textNode.setAttribute('font-family', fontFamily);
    textNode.setAttribute('font-size', formattedFontSize);

    // Set optional attributes, removing them if not present to prevent stale values
    if (fontWeight) {
        textNode.setAttribute('font-weight', fontWeight);
    } else {
        textNode.removeAttribute('font-weight');
    }

    if (fontStyle) {
        textNode.setAttribute('font-style', fontStyle);
    } else {
        textNode.removeAttribute('font-style');
    }

    if (formattedLetterSpacing) {
        textNode.setAttribute('letter-spacing', formattedLetterSpacing);
    } else {
        textNode.removeAttribute('letter-spacing');
    }

    // 4. Set text content using a tspan for robust measurement
    // Clear any previous child nodes (like old tspans)
    while (textNode.firstChild) {
        textNode.removeChild(textNode.firstChild);
    }

    // Create a new tspan element and set its content
    const tspanNode = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    tspanNode.textContent = text;
    textNode.appendChild(tspanNode);

    // 5. Measure using the browser's highly accurate SVG rendering engine
    const bbox = textNode.getBBox();
    const advanceWidth = textNode.getComputedTextLength();

    // 6. Return dimensions
    return {
        width: bbox.width,
        height: bbox.height,
        x: bbox.x,
        ascent: -bbox.y,
        descent: bbox.height + bbox.y,
        baseline: 0, // Baseline is at y=0 because of the 'text-before-edge' alignment
        advanceWidth: advanceWidth
    };
}

