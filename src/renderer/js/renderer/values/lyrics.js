// src/renderer/js/renderer/values/lyrics.js

import {compareLyricsObjects, compareLyricsLayouts, deepEqual} from "../utils.js";
import {getTextMetrics} from "../textMetrics.js";
import { getCharInfo } from '../language_parser.js';

export class LyricsValue {
    #shouldRender = false;
    #lyricsObject = {
        measures: [],
        foreignContent: {},
        measureIdOrder: []
    };

    get shouldRender() {
        return this.#shouldRender;
    }

    constructor(lyricsObject) {
        window.lyricsValue = this; // TODO: Remove this line
        if (lyricsObject) {
            this.setLyricsObject(lyricsObject);
        }
    }

    getLyricsObject() {
        return structuredClone(this.#lyricsObject);
    }

    setLyricsObject(lyricsObject) {
        const newObject = {
            measures: lyricsObject.measures || [],
            foreignContent: lyricsObject.foreignContent || {},
            measureIdOrder: lyricsObject.measureIdOrder || []
        };

        const isDifferent = !compareLyricsObjects(this.#lyricsObject, newObject);

        if (isDifferent) {
            this.#lyricsObject = newObject;
            this.#shouldRender = true;
            return true;
        }

        return false;
    }

    markAsRendered() {
        this.#shouldRender = false;
    }
}

export class LyricsLayout {
    #shouldRender = false;
    #lyricsLayout = {
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'normal',
        fontStyle: 'normal',
        fontSize: null,
        letterSpacing: '0', // any valid CSS value
        wordSpacing: 10, // in pixels
        lineHeight: 10, // in pixels
        textAlign: 'left',
        justifyText: false,
        lines: [],
        width: 0,
        height: 0,
        highlightedPercentage: 0
    };
    #pendingLyricsLayout = this.#lyricsLayout;
    #lyricsObject = {
        measures: []
    };

    get shouldRender() {
        return this.#shouldRender;
    }

    constructor(lyricsLayout = null) {
        lyricsLayout = structuredClone(lyricsLayout);
        if (lyricsLayout) {
            this.setLyricsLayout(lyricsLayout);
        }
    }

    getLayoutStyle() {
        return {
            fontFamily: this.#pendingLyricsLayout.fontFamily,
            fontWeight: this.#pendingLyricsLayout.fontWeight,
            fontStyle: this.#pendingLyricsLayout.fontStyle,
            fontSize: this.#pendingLyricsLayout.fontSize,
            letterSpacing: this.#pendingLyricsLayout.letterSpacing,
            wordSpacing: this.#pendingLyricsLayout.wordSpacing,
            lineHeight: this.#pendingLyricsLayout.lineHeight,
            textAlign: this.#pendingLyricsLayout.textAlign,
            justifyText: this.#pendingLyricsLayout.justifyText,
            highlightedPercentage: this.#pendingLyricsLayout.highlightedPercentage,
        };
    }

    getLyricsObject() {
        return structuredClone(this.#lyricsObject);
    }

    setLyricsObject({element, lyricsObject}) {
        lyricsObject = structuredClone(lyricsObject);
        const spans = this.getSpansFromLyricsObject(lyricsObject);
        const availableWidth = this.getAvailableWidthFromElement(element);
        this.#lyricsObject = lyricsObject;
        const newLayout = this.buildLyricsLayout(Object.assign({}, this.getLayoutStyle(), {availableWidth, spans}));
        return this.setLyricsLayout(newLayout);
    }

    getFontFamily() {
        return this.#pendingLyricsLayout.fontFamily;
    }

    setFontFamily({element, fontFamily}) {
        const spans = this.getSpansFromLyricsObject(this.#lyricsObject);
        const availableWidth = this.getAvailableWidthFromElement(element);
        const newLayout = this.buildLyricsLayout(Object.assign({}, this.getLayoutStyle(), {availableWidth, fontFamily, spans}));
        return this.setLyricsLayout(newLayout);
    }

    getFontWeight() {
        return this.#pendingLyricsLayout.fontWeight;
    }

    setFontWeight({element, fontWeight}) {
        const spans = this.getSpansFromLyricsObject(this.#lyricsObject);
        const availableWidth = this.getAvailableWidthFromElement(element);
        const newLayout = this.buildLyricsLayout(Object.assign({}, this.getLayoutStyle(), {availableWidth, fontWeight, spans}));
        return this.setLyricsLayout(newLayout);
    }

    getFontStyle() {
        return this.#pendingLyricsLayout.fontStyle;
    }

    setFontStyle({element, fontStyle}) {
        const spans = this.getSpansFromLyricsObject(this.#lyricsObject);
        const availableWidth = this.getAvailableWidthFromElement(element);
        const newLayout = this.buildLyricsLayout(Object.assign({}, this.getLayoutStyle(), {availableWidth, fontStyle, spans}));
        return this.setLyricsLayout(newLayout);
    }

    getFontSize() {
        return this.#pendingLyricsLayout.fontSize;
    }

    setFontSize({element, fontSize}) {
        const spans = this.getSpansFromLyricsObject(this.#lyricsObject);
        const availableWidth = this.getAvailableWidthFromElement(element);
        const newLayout = this.buildLyricsLayout(Object.assign({}, this.getLayoutStyle(), {availableWidth, fontSize, spans}));
        return this.setLyricsLayout(newLayout);
    }

    getLetterSpacing() {
        return this.#pendingLyricsLayout.letterSpacing;
    }

    setLetterSpacing({element, letterSpacing}) {
        const spans = this.getSpansFromLyricsObject(this.#lyricsObject);
        const availableWidth = this.getAvailableWidthFromElement(element);
        const newLayout = this.buildLyricsLayout(Object.assign({}, this.getLayoutStyle(), {availableWidth, letterSpacing, spans}));
        return this.setLyricsLayout(newLayout);
    }

    getWordSpacing() {
        return this.#pendingLyricsLayout.wordSpacing;
    }

    setWordSpacing({element, wordSpacing}) {
        const spans = this.getSpansFromLyricsObject(this.#lyricsObject);
        const availableWidth = this.getAvailableWidthFromElement(element);
        const newLayout = this.buildLyricsLayout(Object.assign({}, this.getLayoutStyle(), {availableWidth, wordSpacing, spans}));
        return this.setLyricsLayout(newLayout);
    }

    getLineHeight() {
        return this.#pendingLyricsLayout.lineHeight;
    }

    setLineHeight({element, lineHeight}) {
        const spans = this.getSpansFromLyricsObject(this.#lyricsObject);
        const availableWidth = this.getAvailableWidthFromElement(element);
        const newLayout = this.buildLyricsLayout(Object.assign({}, this.getLayoutStyle(), {availableWidth, lineHeight, spans}));
        return this.setLyricsLayout(newLayout);
    }

    getTextAlign() {
        return this.#pendingLyricsLayout.textAlign;
    }

    setTextAlign({element, textAlign}) {
        const spans = this.getSpansFromLyricsObject(this.#lyricsObject);
        const availableWidth = this.getAvailableWidthFromElement(element);
        const newLayout = this.buildLyricsLayout(Object.assign({}, this.getLayoutStyle(), {availableWidth, textAlign, spans}));
        return this.setLyricsLayout(newLayout);
    }

    getJustifyText() {
        return this.#pendingLyricsLayout.justifyText;
    }

    setJustifyText({element, justifyText}) {
        const spans = this.getSpansFromLyricsObject(this.#lyricsObject);
        const availableWidth = this.getAvailableWidthFromElement(element);
        const newLayout = this.buildLyricsLayout(Object.assign({}, this.getLayoutStyle(), {availableWidth, justifyText, spans}));
        return this.setLyricsLayout(newLayout);
    }

    getHighlightedPercentage() {
        return this.#pendingLyricsLayout.highlightedPercentage;
    }

    setHighlightedPercentage({ element, highlightedPercentage }) {
        const newPercentage = Math.max(0, Math.min(100, highlightedPercentage)); // Clamp between 0 and 100
        return this.setLyricsLayout(Object.assign({}, this.#pendingLyricsLayout, { highlightedPercentage: newPercentage }));
    }

    getLyricsLayout() {
        return structuredClone(this.#lyricsLayout);
    }

    setLyricsLayout(lyricsLayout) {
        lyricsLayout = structuredClone(lyricsLayout);
        this.#pendingLyricsLayout = lyricsLayout;
        const isDifferent = !compareLyricsLayouts(this.#lyricsLayout, this.#pendingLyricsLayout);

        if (isDifferent) {
            this.#shouldRender = true;
            return true;
        }

        return false;
    }

    getSpansFromLyricsObject(lyricsObject) {
        const spans = [];
        let allNotes = [];

        // NEW LOGIC: Use measureIdOrder if available to ensure correct visual sequence
        if (lyricsObject.measureIdOrder && lyricsObject.measureIdOrder.length > 0) {
            // Create lookups
            const ownMeasuresMap = new Map(lyricsObject.measures.map(m => [m.id, m.content]));
            
            lyricsObject.measureIdOrder.forEach(measureId => {
                if (ownMeasuresMap.has(measureId)) {
                    allNotes = allNotes.concat(ownMeasuresMap.get(measureId));
                } else if (lyricsObject.foreignContent && lyricsObject.foreignContent[measureId]) {
                    allNotes = allNotes.concat(lyricsObject.foreignContent[measureId]);
                }
            });
        } else {
            // Fallback for legacy data: Owned then Foreign
            allNotes = lyricsObject.measures.flatMap(measure => measure.content);
            if (lyricsObject.foreignContent) {
                 Object.values(lyricsObject.foreignContent).forEach(notes => {
                     if (Array.isArray(notes)) {
                         allNotes = allNotes.concat(notes);
                     }
                 });
            }
        }

        for (let i = 0; i < allNotes.length; i++) {
            const note = allNotes[i];
            if (note.text === '∅') {
                continue;
            }
    
            const currentText = note.text;
            const parts = [];
            let lastCut = 0;
    
            // Find all apostrophes that are not at the beginning and split after them.
            for (let j = 1; j < currentText.length; j++) {
                const charInfo = getCharInfo(currentText[j]);
                if (charInfo.name === 'apostrophe') {
                    // We found an apostrophe that is not at the start.
                    // Cut the string up to and including the apostrophe.
                    parts.push(currentText.substring(lastCut, j + 1));
                    lastCut = j + 1;
                }
            }
    
            // Add the remaining part of the string.
            if (lastCut < currentText.length) {
                parts.push(currentText.substring(lastCut));
            }
    
            // If no splitting occurred, parts will have 1 or 0 elements.
            // If it has 0 elements (e.g., empty string note), it will be skipped.
            // If it has 1 element, it's the original string.
            if (parts.length <= 1) {
                if (currentText) { // Ensure we don't push empty spans
                    spans.push({
                        text: currentText,
                        type: "note",
                        isConnectedToNext: note.isConnectedToNext,
                        id: note.id
                    });
                }
            } else {
                // Splitting occurred. Create a span for each part.
                for (let p = 0; p < parts.length; p++) {
                    const partText = parts[p];
                    if (!partText) continue; // Skip empty parts
    
                    spans.push({
                        text: partText,
                        type: "note",
                        // A split note is never connected to the next part.
                        // The original note's connection status applies only to the very last part.
                        isConnectedToNext: (p === parts.length - 1) ? note.isConnectedToNext : false,
                        // We need unique IDs for each part.
                        id: `${note.id}-part-${p}`
                    });
    
                    // Add a space between the parts, but not after the last one.
                    if (p < parts.length - 1) {
                        spans.push({
                            text: '\u00A0', // non-breaking space
                            type: 'space',
                            id: `${note.id}-part-${p}-space`,
                            isConnectedToNext: false
                        });
                    }
                }
            }
    
            if (note.lineBreakAfter) {
                spans.push({
                    text: '', // No text for a line break
                    type: 'line-break',
                    id: note.id + '-linebreak',
                    isConnectedToNext: false
                });
            } else if (!note.isConnectedToNext && (i < allNotes.length - 1)) {
                spans.push({
                    text: '\u00A0',
                    type: 'space',
                    id: note.id + '-space',
                    isConnectedToNext: false
                });
            }
        }
        return spans;
    }

    getAvailableWidthFromElement(element) {
        const widthProp = element.getProperty('dimensions').getWidth();
        if (widthProp.getUnit() === 'auto') {
            return element.parent ? element.parent.getWidth() : Infinity;
        } else {
            return widthProp.getPixelValue();
        }
    }

    rebuildLayout({element}) {
        const spans = this.getSpansFromLyricsObject(this.#lyricsObject);
        const availableWidth = this.getAvailableWidthFromElement(element);
        return this.buildLyricsLayout(Object.assign({}, this.getLayoutStyle(), {availableWidth, spans}));
    }

    buildLyricsLayout({availableWidth, highlightedPercentage, fontFamily, fontWeight, fontStyle, fontSize, letterSpacing, wordSpacing, lineHeight:linesDistance, textAlign, justifyText, spans}) {
        const lines = [];
        if(availableWidth === 0 || availableWidth === Infinity) {
            return {
                fontFamily: fontFamily,
                fontWeight: fontWeight,
                fontStyle: fontStyle,
                fontSize: fontSize,
                letterSpacing: letterSpacing,
                wordSpacing: wordSpacing,
                lineHeight: linesDistance,
                textAlign: textAlign,
                justifyText: justifyText,
                lines: [],
                width: 0,
                height: 0,
                highlightedPercentage
            }
        }

        let totalTextWidth = 0;
        let totalTextHeight = 0;
        let lineWidth = 0;
        let lineHeight = 0;

        let noteIndex = 0;
        let lineIndex = 0;

        let line = null;
        const addLine = () => {
            if(line) {
                let trailToMove = 0;
                const wasLastWordInterrupted = line.tspans.length > 0 && line.tspans[line.tspans.length - 1].type === 'note' && line.tspans[line.tspans.length - 1].isConnectedToNext;
                if(wasLastWordInterrupted) {
                    let trailStartIndex = line.tspans.length - 1;
                    while(line.tspans[trailStartIndex] && line.tspans[trailStartIndex].type === 'note' && line.tspans[trailStartIndex].isConnectedToNext) {
                        trailToMove++;
                        trailStartIndex--;
                    }
                    if(trailToMove === line.tspans.length) {
                        // The entire line is a single interrupted word. We have no choice but to keep it
                        trailToMove = 0;
                    }
                    for(let i=0; i<trailToMove; i++) {
                        const tspan = line.tspans.pop();
                        totalTextWidth = tspan.totalTextWidth;
                        lineWidth = tspan.lineWidth;
                        lineHeight = tspan.lineHeight;
                    }
                }

                noteIndex -= trailToMove;

                if(line.tspans[line.tspans.length - 1] && line.tspans[line.tspans.length - 1].type === 'space') {
                    const tspan = line.tspans.pop();
                    totalTextWidth = tspan.totalTextWidth;
                    lineWidth = tspan.lineWidth;
                    lineHeight = tspan.lineHeight;
                }

                line.width = lineWidth;
                line.height = lineHeight;

                totalTextHeight += lineHeight;

                lineWidth = 0;

                line.tspans = line.tspans.map(tspan => {
                    delete tspan.lineWidth;
                    delete tspan.lineHeight;
                    delete tspan.totalTextWidth;
                    return tspan;
                });
                lines.push(line);
            }
            lineIndex++;
            lineHeight = 0;
            line = {
                width: 0,
                height: 0,
                x: 0,
                tspans: []
            };
        }

        while (noteIndex < spans.length) {
            const note = spans[noteIndex];

            if (note.type === 'line-break') {
                addLine();
                noteIndex++;
                continue;
            }
            
            const metrics = getTextMetrics(note.text, {
                fontFamily,
                fontWeight,
                fontStyle,
                fontSize,
                letterSpacing,
            });

            let spanWidth = metrics.advanceWidth;

            if(note.type === 'space') {
                spanWidth += wordSpacing;
            }

            if(!line || (lineWidth + spanWidth) > availableWidth && line.tspans.length > 0) {
                addLine();
                continue;
            }

            if(note.type !== 'space' || line.tspans.length > 0) { // Avoid leading spaces
                line.tspans.push({
                    text: note.text,
                    type: note.type,
                    isConnectedToNext: note.isConnectedToNext,
                    id: note.id,
                    width: spanWidth,
                    dx: 0,
                    lineWidth: lineWidth,
                    lineHeight: lineHeight,
                    totalTextWidth: totalTextWidth,
                });
                lineWidth += spanWidth;
                totalTextWidth = Math.max(totalTextWidth, lineWidth);
                lineHeight = Math.max(lineHeight, metrics.height);
            }

            noteIndex++;
        }

        addLine(); // Add the last line if it exists

        // Text alignment
        for(let i=0; i<lines.length; i++) {
            const line = lines[i];
            const isLastLine = i === lines.length - 1;

            if (justifyText && !isLastLine) {
                const spaceSpansLength = line.tspans.filter(tspan => tspan.type === 'space').length;
                if (spaceSpansLength > 0) {
                    const extraSpace = (totalTextWidth - line.width) / spaceSpansLength;
                    for (const tspan of line.tspans) {
                        if (tspan.type === 'space') tspan.dx = extraSpace;
                    }
                }
                line.width = totalTextWidth;
                line.x = 0;
            } else {
                switch (textAlign) {
                    case 'center':
                        line.x = (totalTextWidth - line.width) / 2;
                        break;
                    case 'right':
                        line.x = totalTextWidth - line.width;
                        break;
                    default: // left
                        line.x = 0;
                        break;
                }
            }
        }

        return {
            fontFamily: fontFamily,
            fontWeight: fontWeight,
            fontStyle: fontStyle,
            fontSize: fontSize,
            letterSpacing: letterSpacing,
            wordSpacing: wordSpacing,
            lineHeight: linesDistance,
            textAlign: textAlign,
            justifyText: justifyText,
            lines,
            width: totalTextWidth,
            height: totalTextHeight + (lines.length - 1) * linesDistance,
            highlightedPercentage
        };
    }

    /**
     * Finds the start and end percentage of a note's highlighting
     * within the overall lyrics layout.
     * @param {object} params - The parameters.
     * @param {string} params.noteId - The ID of the note to find.
     * @returns {{start: number, end: number}|null} - An object with start and end percentages, or null if the note is not found.
     */
    findNoteHighlightedPercentage({ noteId }) {
        const allSpans = this.#pendingLyricsLayout.lines.flatMap(line => line.tspans);
    
        // Find all tspans that belong to the original note
        const noteSpans = allSpans.filter(span => span.id.startsWith(noteId) && span.type === 'note');
        if (noteSpans.length === 0) {
            return null; // Note not found in layout
        }
    
        let cumulativeWidth = 0;
        let groupStart = -1;
        let groupEnd = -1;
    
        for (const span of allSpans) {
            // Check if the current span is the first part of our note
            if (span.id === noteSpans[0].id) {
                groupStart = cumulativeWidth;
            }
            
            // Check if the current span is the last part of our note
            if (span.id === noteSpans[noteSpans.length - 1].id) {
                groupEnd = cumulativeWidth + span.width;
            }
    
            // Update cumulative width after checks
            cumulativeWidth += span.width + (span.dx || 0);
        }
    
        // The total width is the cumulative width after iterating through all spans.
        const totalLayoutWidth = cumulativeWidth;
    
        if (totalLayoutWidth === 0 || groupStart === -1 || groupEnd === -1) return null;

        return {
            start: (groupStart / totalLayoutWidth) * 100,
            end: (groupEnd / totalLayoutWidth) * 100,
        };
    }

    applyDifferences(svg) {
        if(!this.#shouldRender) return;

        // alert(2)
        const isFontSizeChanged = this.#lyricsLayout.fontSize !== this.#pendingLyricsLayout.fontSize;
        if(isFontSizeChanged) {
            svg.setAttribute('font-size', this.#pendingLyricsLayout.fontSize);
            this.#lyricsLayout.fontSize = this.#pendingLyricsLayout.fontSize;
        }

        const isFontFamilyChanged = this.#lyricsLayout.fontFamily !== this.#pendingLyricsLayout.fontFamily;
        if(isFontFamilyChanged) {
            svg.style.fontFamily = this.#pendingLyricsLayout.fontFamily;
            this.#lyricsLayout.fontFamily = this.#pendingLyricsLayout.fontFamily;
        }

        const isFontWeightChanged = this.#lyricsLayout.fontWeight !== this.#pendingLyricsLayout.fontWeight;
        if(isFontWeightChanged) {
            svg.style.fontWeight = this.#pendingLyricsLayout.fontWeight;
            this.#lyricsLayout.fontWeight = this.#pendingLyricsLayout.fontWeight;
        }

        const isLetterSpacingChanged = this.#lyricsLayout.letterSpacing !== this.#pendingLyricsLayout.letterSpacing;
        if(isLetterSpacingChanged) {
            svg.style.letterSpacing = this.#pendingLyricsLayout.letterSpacing;
            this.#lyricsLayout.letterSpacing = this.#pendingLyricsLayout.letterSpacing;
        }

        const isWordSpacingChanged = this.#lyricsLayout.wordSpacing !== this.#pendingLyricsLayout.wordSpacing;
        if(isWordSpacingChanged) {
            svg.style.wordSpacing = this.#pendingLyricsLayout.wordSpacing + 'px';
            this.#lyricsLayout.wordSpacing = this.#pendingLyricsLayout.wordSpacing;
        }

        const isLineHeightChanged = this.#lyricsLayout.lineHeight !== this.#pendingLyricsLayout.lineHeight;
        if(isLineHeightChanged) {
            this.#lyricsLayout.lineHeight = this.#pendingLyricsLayout.lineHeight;
        }

        const isTextAlignChanged = this.#lyricsLayout.textAlign !== this.#pendingLyricsLayout.textAlign;
        if(isTextAlignChanged) {
            this.#lyricsLayout.textAlign = this.#pendingLyricsLayout.textAlign;
        }

        const isJustifyTextChanged = this.#lyricsLayout.justifyText !== this.#pendingLyricsLayout.justifyText;
        if(isJustifyTextChanged) {
            this.#lyricsLayout.justifyText = this.#pendingLyricsLayout.justifyText;
        }

        // Ensure a <defs> block exists in the SVG for our clipPaths.
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            svg.prepend(defs);
        }

        const oldLinesLength = this.#lyricsLayout.lines.length;
        const newLinesLength = this.#pendingLyricsLayout.lines.length;

        // Get all the line groups, which are the main render element for each line.
        let lineGroups = Array.from(svg.querySelectorAll('[data-type="lyrics-line-group"]'));
        lineGroups.sort((a, b) => {
            return parseInt(a.getAttribute('data-line-index')) - parseInt(b.getAttribute('data-line-index'));
        });

        let layoutChanged = false;

        // Handle changes in the number of lines.
        if(oldLinesLength !== newLinesLength) {
            layoutChanged = true;

            if(oldLinesLength > newLinesLength) {
                // Remove extra lines by iterating backwards.
                for(let i = oldLinesLength - 1; i >= newLinesLength; i--) {
                    const groupToRemove = lineGroups[i];
                    const clipPathId = groupToRemove.getAttribute('clip-path').replace(/url\(#|\)/g, '');
                    const clipPathToRemove = defs.querySelector(`#${clipPathId}`);

                    if (groupToRemove) svg.removeChild(groupToRemove);
                    if (clipPathToRemove) defs.removeChild(clipPathToRemove);

                    lineGroups.splice(i, 1);
                    this.#lyricsLayout.lines.splice(i, 1);
                }
            } else {
                // Add new lines.
                for(let i = oldLinesLength; i < newLinesLength; i++) {
                    const clipPathId = `line-clip-${i}`;

                    // 1. Create the <clipPath> which contains the text shape.
                    const newClipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
                    newClipPath.id = clipPathId;
                    const textShape = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    textShape.setAttribute('dominant-baseline', 'text-before-edge');
                    textShape.setAttribute('text-anchor', 'start');
                    textShape.setAttribute('x', '0');
                    textShape.setAttribute('y', '0');
                    newClipPath.appendChild(textShape);
                    defs.appendChild(newClipPath);

                    // 2. Create the <g> group that will be clipped.
                    const newGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
                    newGroup.setAttribute('data-line-index', i.toString());
                    newGroup.setAttribute('data-type', 'lyrics-line-group');
                    newGroup.setAttribute('clip-path', `url(#${clipPathId})`);
                    newGroup.setAttribute('transform', `translate(0, 0)`); // Initial position; will be updated later.

                    // 3. Create the color-fill rectangles inside the group.
                    const baseRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    baseRect.setAttribute('x', '0');
                    baseRect.setAttribute('y', '0');
                    baseRect.setAttribute('width', '100%');
                    baseRect.classList.add('text-color'); // Use this class for the base color fill
                    newGroup.appendChild(baseRect);

                    const karaokeRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    karaokeRect.setAttribute('x', '0');
                    karaokeRect.setAttribute('y', '0');
                    karaokeRect.setAttribute('width', '0'); // Animation will control this width
                    karaokeRect.classList.add('karaoke-color'); // Use this class for the karaoke color fill
                    newGroup.appendChild(karaokeRect);

                    svg.appendChild(newGroup);
                    lineGroups.push(newGroup);
                    this.#lyricsLayout.lines.push({tspans: [], x:0});
                }
            }
        }

        let totalHeight = 0;
        let anyHeightChanged = false;

        for(let i=0; i<newLinesLength; i++) {
            const oldLine = this.#lyricsLayout.lines[i];
            const newLineData = this.#pendingLyricsLayout.lines[i];
            const group = lineGroups[i];

            // Store width and height data on the group for reference.
            if(oldLine.width !== newLineData.width) {
                group.setAttribute('data-line-width', newLineData.width.toString());
                group.querySelectorAll('rect.text-color').forEach(rect => rect.setAttribute('width', newLineData.width.toString()));
                oldLine.width = newLineData.width;
                layoutChanged = true;
            }
            if(oldLine.height !== newLineData.height) {
                group.setAttribute('data-line-height', newLineData.height.toString());
                // Update the height of the fill rectangles.
                group.querySelectorAll('rect').forEach(rect => rect.setAttribute('height', newLineData.height.toString()));
                oldLine.height = newLineData.height;
                anyHeightChanged = true;
                layoutChanged = true;
            }

            if(anyHeightChanged || isLineHeightChanged) {
                // Update vertical position using transform on the group.
                group.setAttribute('transform', `translate(0, ${totalHeight})`);
            }

            if(oldLine.x !== newLineData.x) {
                const textShape = defs.querySelector(`#line-clip-${i} text`);
                textShape.setAttribute('x', newLineData.x.toString());
                group.querySelectorAll('rect').forEach(rect => rect.setAttribute('x', newLineData.x.toString()));
                oldLine.x = newLineData.x;
                layoutChanged = true;
            }

            totalHeight += newLineData.height + this.#pendingLyricsLayout.lineHeight;

            // Update the tspans inside the corresponding clipPath's text element.
            const clipPathId = `line-clip-${i}`;
            const textShape = defs.querySelector(`#${clipPathId} text`);
            let tspans = Array.from(textShape.querySelectorAll('tspan'));
            tspans.sort((a, b) => parseInt(a.getAttribute('data-tspan-index')) - parseInt(b.getAttribute('data-tspan-index')));

            const oldTspansLength = oldLine.tspans.length;
            const newTspansLength = newLineData.tspans.length;

            if(oldTspansLength !== newTspansLength) {
                layoutChanged = true;
                if(oldTspansLength > newTspansLength) {
                    for (let j = oldTspansLength - 1; j >= newTspansLength; j--) {
                        if (tspans[j]) textShape.removeChild(tspans[j]);
                        tspans.splice(j, 1);
                        oldLine.tspans.splice(j, 1);
                    }
                } else {
                    for(let j = oldTspansLength; j < newTspansLength; j++) {
                        const tspanData = newLineData.tspans[j];
                        const newTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                        newTspan.setAttribute('data-tspan-index', j.toString());
                        if(tspanData.dx !== 0) {
                            newTspan.setAttribute('textLength', (tspanData.width + tspanData.dx).toString());
                            newTspan.setAttribute('lengthAdjust', 'spacingAndGlyphs');
                        }
                        newTspan.textContent = tspanData.text;
                        textShape.appendChild(newTspan);
                        tspans.push(newTspan);
                        oldLine.tspans.push(tspanData);
                    }
                }
            }

            // Update text content for existing tspans.
            for(let j=0; j<newTspansLength; j++) {
                const oldTspan = oldLine.tspans[j];
                const newTspanData = newLineData.tspans[j];

                if(oldTspan.text !== newTspanData.text) {
                    tspans[j].textContent = newTspanData.text;
                    oldTspan.text = newTspanData.text;
                }

                if(oldTspan.type !== newTspanData.type) {
                    oldTspan.type = newTspanData.type;
                }

                if(oldTspan.isConnectedToNext !== newTspanData.isConnectedToNext) {
                    oldTspan.isConnectedToNext = newTspanData.isConnectedToNext;
                }

                if(oldTspan.id !== newTspanData.id) {
                    oldTspan.id = newTspanData.id;
                }

                if(oldTspan.dx !== newTspanData.dx || oldTspan.width !== newTspanData.width) {
                    if(newTspanData.dx !== 0) {
                        tspans[j].setAttribute('textLength', (newTspanData.width + newTspanData.dx).toString());
                        tspans[j].setAttribute('lengthAdjust', 'spacingAndGlyphs');
                    } else {
                        tspans[j].removeAttribute('textLength');
                        tspans[j].removeAttribute('lengthAdjust');
                    }
                    oldTspan.dx = newTspanData.dx;
                    oldTspan.width = newTspanData.width;
                }

                if(oldTspan.lineWidth !== newTspanData.lineWidth) {
                    oldTspan.lineWidth = newTspanData.lineWidth;
                }
            }
        }

        const isHighlightChanged = this.#lyricsLayout.highlightedPercentage !== this.#pendingLyricsLayout.highlightedPercentage;
        if(isHighlightChanged || layoutChanged) {
            // 1. Calculate the total width of all lyrics text
            const totalLyricsWidth = this.#pendingLyricsLayout.lines.reduce((sum, line) => sum + line.width, 0);

            // 2. Determine the target highlighted width in pixels
            let highlightWidthRemaining = totalLyricsWidth * (this.#pendingLyricsLayout.highlightedPercentage / 100);

            // 3. Distribute the highlight width across the lines
            for (let i = 0; i < newLinesLength; i++) {
                const lineData = this.#pendingLyricsLayout.lines[i];
                const group = lineGroups[i];
                const karaokeRect = group.querySelector('rect.karaoke-color');

                if (karaokeRect) {
                    // Determine how much of the remaining highlight belongs to this line
                    const highlightForThisLine = Math.max(0, Math.min(highlightWidthRemaining, lineData.width));
                    karaokeRect.setAttribute('width', highlightForThisLine.toString());

                    // Subtract this line's highlighted portion from the remainder
                    highlightWidthRemaining -= highlightForThisLine;
                }
            }

            this.#lyricsLayout.highlightedPercentage = this.#pendingLyricsLayout.highlightedPercentage;
        }


        // Update overall SVG dimensions.
        if(this.#lyricsLayout.width !== this.#pendingLyricsLayout.width) {
            this.#lyricsLayout.width = this.#pendingLyricsLayout.width;
            svg.setAttribute('width', this.#lyricsLayout.width.toString());
        }
        if(this.#lyricsLayout.height !== this.#pendingLyricsLayout.height) {
            this.#lyricsLayout.height = this.#pendingLyricsLayout.height;
            svg.setAttribute('height', this.#lyricsLayout.height.toString());
        }

        // this.#lyricsLayout = Object.assign({}, this.#pendingLyricsLayout);
        this.#shouldRender = false; // Reset render flag after applying changes.
    }

    markAsDirty() {
        this.#shouldRender = true;
    }
}

