// src/renderer/js/renderer/elements/lyrics.js

import { VirtualElement } from "./element.js";
import { LyricsLayoutProperty } from "../properties/lyricsLayout.js";
import { LyricsContentProperty } from "../properties/lyricsContent.js";
import { HighlightedPercentage } from "../properties/highlightedPercentage.js";
import { TextStyleLyricsProperty } from "../properties/TextStyleLyrics.js";
import { DimensionsProperty } from "../properties/dimensions.js";
import { MarginProperty } from "../properties/margin.js";
import { EffectsProperty } from "../properties/effects.js";
import { BorderProperty } from "../properties/border.js";
import { BoxShadowProperty } from "../properties/boxShadow.js";
import { InnerPaddingProperty } from "../properties/innerPadding.js";
import { BackgroundProperty } from "../properties/backgroundCG.js";
// ADDED IMPORT
import { calculateSyllableTimings } from '../language_parser.js';
import { getTextMetrics } from '../textMetrics.js';
import { TransformProperty } from '../properties/transform.js';
import { resolveFontFamily } from '../utils.js';


export class VirtualLyrics extends VirtualElement {
    constructor(options = {}) {
        const lyricsContentData = options.lyricsContent || {
            measures: []
        };

        super('lyrics', options.name || 'Lyrics', options);

        this.domElement = document.createElement('div');
        this.domElement.id = this.id;
        this.domElement.dataset.elementType = 'lyrics';

        const shadowRoot = this.domElement.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
            .text-color { fill: var(--text-color, #ffffff); }
            .karaoke-color { fill: var(--karaoke-color, blue); }
            .stroke-color { stroke: var(--stroke-color, black); stroke-width: 3px; }
        `;
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

        shadowRoot.appendChild(style);
        shadowRoot.appendChild(svg);

        const defaultTextStyle = {
            fontSize: { value: 42, unit: 'px' }
        };
        const finalTextStyle = { ...defaultTextStyle, ...(options.textStyle || {}) };

        // FIX: Pass options.background
        this.setProperty('background', new BackgroundProperty(options.background || { enabled: false }));
        this.setProperty('lyricsContent', new LyricsContentProperty(lyricsContentData));
        this.setProperty('textStyle', new TextStyleLyricsProperty(finalTextStyle));
        this.setProperty('highlightedPercentage', new HighlightedPercentage(options.highlightedPercentage));
        this.setProperty('boxShadow', new BoxShadowProperty(options.boxShadow));
        this.setProperty('dimensions', new DimensionsProperty(options.dimensions || {
            width: { value: 100, unit: 'auto' },
            height: { value: 20, unit: 'auto' }
        }));
        const lyricsProperty = new LyricsLayoutProperty({
            fontsize: "16px",
        });

        lyricsProperty.setLyricsObject({element: this, lyricsObject: lyricsContentData});
        this.setProperty('lyricsLayout', lyricsProperty);

        this.setProperty('margin', new MarginProperty(options.margin));
        this.setProperty('effects', new EffectsProperty(options.effects));
        this.setProperty('border', new BorderProperty(options.border));
        this.setProperty('inner_padding', new InnerPaddingProperty(options.inner_padding));
        this.setProperty('transform', new TransformProperty(options.transform));
    }

    setParent(parent) {
        super.setParent(parent);
        this.getProperty('lyricsLayout').rebuildLayout({element: this});
    }

    getProgress() {
        return this.getProperty('highlightedPercentage').getProgress();
    }

    setProgress(percentage) {
        const p = Math.max(0, Math.min(100, percentage));
        this.getProperty('highlightedPercentage').setProgress(p);
    }

    /**
     * Overrides the base applyEvents to inject automatic note-by-note highlighting
     * based on the global timeline.
     */
    applyEvents(measureIndex, measureProgress, timingData) {
        // Apply user-defined events first (e.g., opacity, position).
        super.applyEvents(measureIndex, measureProgress, timingData);

        // --- Automatic Global Note Highlighting Logic ---
        const { measureMap, lyricsTimingMap } = timingData;
        if (!measureMap || measureMap.length === 0 || !lyricsTimingMap) {
            this.setProgress(0);
            return;
        }

        const measureInfo = measureMap[measureIndex];
        if (!measureInfo) return;

        const currentMusicalTimeInBeats = measureInfo.startTime + (measureProgress * measureInfo.duration);
        const elementNotes = lyricsTimingMap.filter(n => n.elementId === this.id);

        if (elementNotes.length === 0) {
            this.setProgress(0);
            return;
        }

        const firstNote = elementNotes[0];
        if (currentMusicalTimeInBeats < firstNote.startTime) {
            this.setProgress(0);
            return;
        }

        const lastNote = elementNotes[elementNotes.length - 1];
        if (currentMusicalTimeInBeats >= lastNote.startTime + lastNote.duration) {
            this.setProgress(100);
            return;
        }

        let lastPassedSungNote = null;
        let activeNote = null;
        const layoutProp = this.getProperty('lyricsLayout');
        const lyricsLayout = layoutProp.getLyricsLayoutValue().getLyricsLayout();
        const sungNoteIds = new Set(lyricsLayout.lines.flatMap(line => line.tspans.map(span => span.id.split('-part-')[0])));

        for (const note of elementNotes) {
            const noteEndTime = note.startTime + note.duration;
            if (currentMusicalTimeInBeats >= note.startTime) {
                const isSungNote = sungNoteIds.has(note.noteId);
                if (isSungNote) lastPassedSungNote = note;
                if (currentMusicalTimeInBeats < noteEndTime && isSungNote) activeNote = note;
            } else {
                break;
            }
        }

        let finalPercentage = 0;

        if (activeNote) {
            // --- NEW INTELLIGENT HIGHLIGHTING LOGIC ---
            const noteTimings = layoutProp.getLyricsLayoutValue().findNoteHighlightedPercentage({ noteId: activeNote.noteId });

            if (noteTimings) {
                const lyricsObject = this.getProperty('lyricsContent').getLyricsValue().getLyricsObject();
                const originalNote = lyricsObject.measures.flatMap(m => m.content).find(n => n.id === activeNote.noteId);

                if (!originalNote) {
                    const progressInNote = activeNote.duration > 0 ? (currentMusicalTimeInBeats - activeNote.startTime) / activeNote.duration : 1;
                    finalPercentage = noteTimings.start + (noteTimings.end - noteTimings.start) * progressInNote;
                } else {
                    const originalSyllableText = originalNote.text;
                    const timeIntoNote = (currentMusicalTimeInBeats - activeNote.startTime) * 1000;
                    const noteDurationMs = activeNote.duration * 1000;

                    const charTimings = calculateSyllableTimings(originalSyllableText, noteDurationMs);

                    const textStyle = this.getProperty('textStyle');

                    // --- MODIFIED: Use resolved font family for metrics ---
                    const fontStyles = {
                        fontFamily: resolveFontFamily(textStyle.getFontFamily().getValue()),
                        fontSize: textStyle.getFontSize().getCSSValue(),
                        fontWeight: textStyle.getFontWeight().getValue(),
                        fontStyle: textStyle.getFontStyle().getValue(),
                        letterSpacing: textStyle.getLetterSpacing().getCSSValue(),
                    };

                    const charWidths = Array.from(originalSyllableText).map(c => getTextMetrics(c, fontStyles).width);
                    const totalSyllableWidth = charWidths.reduce((sum, w) => sum + w, 0);

                    let cumulativeDuration = 0;
                    let cumulativeWidth = 0;
                    let foundTime = false;

                    for (let i = 0; i < charTimings.length; i++) {
                        const charTime = charTimings[i];
                        const charWidth = charWidths[i];
                        const charStartDuration = cumulativeDuration;
                        const charEndDuration = cumulativeDuration + charTime.duration;

                        if (timeIntoNote >= charStartDuration && timeIntoNote < charEndDuration) {
                            const progressInChar = charTime.duration > 0 ? (timeIntoNote - charStartDuration) / charTime.duration : 1;
                            const visualProgressInSyllable = cumulativeWidth + (progressInChar * charWidth);
                            const percentageThroughSyllable = totalSyllableWidth > 0 ? visualProgressInSyllable / totalSyllableWidth : 1;

                            const groupStartPercent = noteTimings.start;
                            const groupWidthPercent = noteTimings.end - noteTimings.start;

                            finalPercentage = groupStartPercent + (percentageThroughSyllable * groupWidthPercent);
                            foundTime = true;
                            break;
                        }

                        cumulativeDuration = charEndDuration;
                        cumulativeWidth += charWidth;
                    }

                    if (!foundTime) {
                        finalPercentage = noteTimings.end;
                    }
                }
            } else {
                const progressInNote = activeNote.duration > 0 ? (currentMusicalTimeInBeats - activeNote.startTime) / activeNote.duration : 1;
                if (noteTimings) {
                    finalPercentage = noteTimings.start + (noteTimings.end - noteTimings.start) * progressInNote;
                }
            }
        } else if (lastPassedSungNote) {
            const noteTimings = layoutProp.getLyricsLayoutValue().findNoteHighlightedPercentage({ noteId: lastPassedSungNote.noteId });
            if (noteTimings) {
                finalPercentage = noteTimings.end;
            }
        }
        this.setProgress(finalPercentage);
    }
}
