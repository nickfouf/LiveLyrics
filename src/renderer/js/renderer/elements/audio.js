// src/renderer/js/renderer/elements/audio.js

import { VirtualElement } from "./element.js";
import { AudioSrcProperty } from "../properties/audioSrc.js";
import { AudioPlaybackProperty } from "../properties/audioPlayback.js";
import { state } from "../../editor/state.js";
import { OrchestraContentProperty } from "../properties/orchestraContent.js";

function findLastIndex(array, predicate) {
    for (let i = array.length - 1; i >= 0; i--) {
        if (predicate(array[i], i, array)) {
            return i;
        }
    }
    return -1;
}

export class VirtualAudio extends VirtualElement {
    #isPlaybackPlaying = false;
    audioElement = null;

    get isPlaybackPlaying() {
        return this.#isPlaybackPlaying;
    }

    constructor(options = {}) {
        super('audio', options.name || 'Audio', options);

        // This is a non-visual element, so its domElement is just a placeholder.
        this.domElement = document.createElement('div');
        this.domElement.id = this.id;
        this.domElement.dataset.elementType = 'audio';
        this.domElement.style.display = 'none';

        // The actual audio player is created.
        this.audioElement = new Audio();
        this.audioElement.preload = 'auto';

        // Append the audio element to the DOM element.
        this.domElement.appendChild(this.audioElement);

        // Set properties
        this.setProperty('src', new AudioSrcProperty(options.src));
        this.setProperty('playback', new AudioPlaybackProperty(options.playback || { loop: false }));
        this.setProperty('orchestraContent', new OrchestraContentProperty(options.orchestraContent));
    }

    get addedInDom() {
        return super.addedInDom;
    }

    /**
     * When the element is removed from the DOM, we must stop any sound.
     */
    set addedInDom(value) {
        super.addedInDom = value;
        if (!value && this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
        }
    }

    handlePlaybackStateChange(isPlaying) {
        super.handlePlaybackStateChange(isPlaying);
        this.#isPlaybackPlaying = isPlaying;
        if (!isPlaying && this.audioElement) {
            if (!this.audioElement.paused) {
                this.audioElement.pause();
            }
            this.audioElement.currentTime = 0;
        }
        // The 'else if (isPlaying)' block that was resetting the time has been removed.
    }

    applyEvents(measureIndex, measureProgress, timingData) {
        // First, apply user-defined events (like state, volume, loop).
        super.applyEvents(measureIndex, measureProgress, timingData);

        // --- Automatic Seeking Logic ---
        const { measureMap } = timingData;
        if (!measureMap || measureMap.length === 0 || !this.audioElement || !this.audioElement.duration || isNaN(this.audioElement.duration)) {
            return;
        }

        // Find the start and end of this audio element in the global timeline.
        const firstMeasureIdx = measureMap.findIndex(m => m.elementId === this.id);
        if (firstMeasureIdx === -1) {
            return; // This element isn't in the timeline.
        }
        const lastMeasureIdx = findLastIndex(measureMap, m => m.elementId === this.id);

        const elementStartTimeBeats = measureMap[firstMeasureIdx].startTime;
        const elementEndTimeBeats = measureMap[lastMeasureIdx].startTime + measureMap[lastMeasureIdx].duration;
        const elementDurationBeats = elementEndTimeBeats - elementStartTimeBeats;

        // If the element has no duration in the timeline, we can't seek.
        if (elementDurationBeats <= 0) {
            return;
        }

        // Calculate the current global musical time.
        const currentMeasureInfo = measureMap[measureIndex];
        const currentMusicalTimeInBeats = currentMeasureInfo.startTime + (measureProgress * currentMeasureInfo.duration);

        // Calculate how far into the element's timeline we are.
        const timeIntoElementBeats = currentMusicalTimeInBeats - elementStartTimeBeats;

        // Calculate the progress percentage through the element's timeline duration.
        const progress = timeIntoElementBeats / elementDurationBeats;

        // Calculate the target time in the audio file.
        const targetAudioTime = this.audioElement.duration * progress;

        // Only seek if the difference is significant to avoid stuttering.
        if (Math.abs(this.audioElement.currentTime - targetAudioTime) > 0.2) { // 200ms threshold
            this.audioElement.currentTime = targetAudioTime;
        }
    }


    /**
     * Applies the state of all properties to the DOM/audio element.
     */
    render() {
        super.render();

        if (!this.audioElement || !this.addedInDom) return;

        const playbackProp = this.getProperty('playback');
        const stateValue = playbackProp.getState();
        const volumeValue = playbackProp.getVolume();
        const loopValue = playbackProp.getLoop();

        // Apply volume if it has changed
        if (volumeValue.shouldRender) {
            this.audioElement.volume = volumeValue.getValue();
            volumeValue.markAsRendered();
        }

        // Apply loop state if it has changed.
        if (loopValue.shouldRender) {
            this.audioElement.loop = loopValue.getValue();
            loopValue.markAsRendered();
        }

        // Always check and enforce the playback state against the DOM element's actual state.
        const intendedState = stateValue.getValue();
        if (intendedState === 'playing') {
            if (this.audioElement.ended) {
                this.audioElement.currentTime = 0;
            }
            if (this.audioElement.paused) {
                this.audioElement.play().catch(e => console.warn("Audio play failed.", e));
            }
        } else if (intendedState === 'resume') {
            if (this.audioElement.paused) {
                this.audioElement.play().catch(e => console.warn("Audio play failed.", e));
            }
        } else if (intendedState === 'paused') {
            if (!this.audioElement.paused) {
                this.audioElement.pause();
            }
        }
        stateValue.markAsRendered();
    }
}