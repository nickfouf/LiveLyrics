// src/renderer/js/renderer/elements/orchestra.js
import { VirtualElement } from './element.js';
import { DimensionsProperty } from "../properties/dimensions.js";
import { BorderProperty } from "../properties/border.js";
import { ProgressProperty } from "../properties/progress.js";
import { MarginProperty } from "../properties/margin.js";
import { EffectsProperty } from "../properties/effects.js";
import { BoxShadowProperty } from "../properties/boxShadow.js";
import { OrchestraContentProperty } from "../properties/orchestraContent.js";
import { InnerPaddingProperty } from "../properties/innerPadding.js";
import { TransformProperty } from '../properties/transform.js';

export class VirtualOrchestra extends VirtualElement {
    constructor(options = {}) {
        super('orchestra', options.name || 'Orchestra', options);
        this.domElement = document.createElement('div');
        this.domElement.id = this.id;
        this.domElement.dataset.elementType = 'orchestra';
        this.domElement.style.width = '100%';
        this.domElement.style.height = '100%';
        this.domElement.style.position = 'relative';
        this.domElement.style.overflow = 'hidden';

        const progressFill = document.createElement('div');
        progressFill.style.position = 'absolute';
        progressFill.style.left = '0';
        progressFill.style.top = '0';
        progressFill.style.height = '100%';
        progressFill.style.width = '0%';
        progressFill.style.borderRadius = 'inherit';
        progressFill.dataset.progressFill = '';
        this.domElement.appendChild(progressFill);

        this.setProperty('orchestraContent', new OrchestraContentProperty(options.orchestraContent));
        this.setProperty('boxShadow', new BoxShadowProperty(options.boxShadow || {
            enabled: true,
            color: { r: 255, g: 255, b: 255, a: 0.5 },
            xOffset: { value: 0, unit: 'px' },
            yOffset: { value: 0, unit: 'px' },
            blurRadius: { value: 14, unit: 'px' },
            spreadRadius: { value: 2, unit: 'px' }
        }));
        this.setProperty('dimensions', new DimensionsProperty(options.dimensions || {
            width: { value: 80, unit: 'pw' },
            height: { value: 70, unit: 'px' }
        }));
        this.setProperty('border', new BorderProperty(options.border || {
            enabled: true,
            radius: { value: 15, unit: 'px' }
        }));
        this.setProperty('progress', new ProgressProperty(options.progress || {
            backgroundColor: {
                "mode": "gradient",
                "type": "linear",
                "angle": 180,
                "colorStops": [
                    {
                        "color": {
                            "r": 196,
                            "g": 196,
                            "b": 196,
                            "a": 1
                        },
                        "position": 0
                    },
                    {
                        "color": {
                            "r": 255,
                            "g": 255,
                            "b": 255,
                            "a": 1
                        },
                        "position": 53,
                        "midpoint": 25
                    },
                    {
                        "color": {
                            "r": 183,
                            "g": 183,
                            "b": 183,
                            "a": 1
                        },
                        "position": 100,
                        "midpoint": 75
                    }
                ]
            },
            fillColor: {
                "mode": "gradient",
                "type": "linear",
                "angle": 180,
                "colorStops": [
                    {
                        "color": {
                            "r": 0,
                            "g": 126,
                            "b": 255,
                            "a": 1
                        },
                        "position": 0
                    },
                    {
                        "color": {
                            "r": 0,
                            "g": 167,
                            "b": 255,
                            "a": 1
                        },
                        "position": 50,
                        "midpoint": 25
                    },
                    {
                        "color": {
                            "r": 0,
                            "g": 102,
                            "b": 255,
                            "a": 1
                        },
                        "position": 100,
                        "midpoint": 75
                    }
                ],
            }
        }));

        // --- ADDED MISSING PROPERTIES ---
        this.setProperty('margin', new MarginProperty(options.margin));
        this.setProperty('effects', new EffectsProperty(options.effects));
        this.setProperty('inner_padding', new InnerPaddingProperty(options.inner_padding));
        this.setProperty('transform', new TransformProperty(options.transform));
    }

    getProgress() {
        return this.getProperty('progress').getProgress();
    }

    setProgress(percentage) {
        const p = Math.max(0, Math.min(100, percentage));
        this.getProperty('progress').setProgress(p);
    }

    /**
     * Overrides the base applyEvents to inject automatic progress highlighting.
     */
    applyEvents(measureIndex, measureProgress, timingData) {
        // First, apply any user-defined events (e.g., opacity, position).
        super.applyEvents(measureIndex, measureProgress, timingData);

        // --- Automatic Progress Highlighting Logic ---
        const { measureMap } = timingData;
        if (!measureMap || measureMap.length === 0) {
            this.setProgress(0);
            return;
        }

        // Find the start and end indices of this element's measures in the global timeline.
        const firstMeasureIdx = measureMap.findIndex(m => m.elementId === this.id);
        if (firstMeasureIdx === -1) {
            this.setProgress(0); // This element is not in the current playback order.
            return;
        }

        const lastMeasureIdx = findLastIndex(measureMap, m => m.elementId === this.id);
        const totalMeasuresInElement = (lastMeasureIdx - firstMeasureIdx) + 1;

        // Determine where the current playback is relative to this element.
        if (measureIndex < firstMeasureIdx) {
            this.setProgress(0); // Playback is before this element.
        } else if (measureIndex > lastMeasureIdx) {
            this.setProgress(100); // Playback is after this element.
        } else {
            // Playback is within this element. Calculate the percentage.
            const measuresIntoElement = (measureIndex - firstMeasureIdx) + measureProgress;
            const percentage = (measuresIntoElement / totalMeasuresInElement) * 100;
            this.setProgress(percentage);
        }
    }
}

// Helper to find the last index, as Array.prototype.findLastIndex is not supported everywhere.
function findLastIndex(array, predicate) {
    for (let i = array.length - 1; i >= 0; i--) {
        if (predicate(array[i], i, array)) {
            return i;
        }
    }
    return -1;
}
