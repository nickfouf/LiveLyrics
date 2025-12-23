// src/renderer/js/renderer/elements/video.js

import { VirtualElement } from "./element.js";
import { DimensionsProperty } from "../properties/dimensions.js";
import { MarginProperty } from "../properties/margin.js";
import { EffectsProperty } from "../properties/effects.js";
import { BorderProperty } from "../properties/border.js";
import { BoxShadowProperty } from "../properties/boxShadow.js";
import { BackgroundProperty } from "../properties/backgroundCG.js";
import { VideoSrcProperty } from "../properties/videoSrc.js";
import { VideoPlaybackProperty } from "../properties/videoPlayback.js";
import { ObjectFitProperty } from "../properties/objectFit.js";
import { ObjectPositionProperty } from "../properties/objectPosition.js";
import { TransformProperty } from "../properties/transform.js";

export class VirtualVideo extends VirtualElement {
    #isPlaybackPlaying = false;
    videoElement = null;

    get isPlaybackPlaying() {
        return this.#isPlaybackPlaying;
    }

    constructor(options = {}) {
        super('video', options.name || 'Video', options);
        this.domElement = document.createElement('div');
        this.domElement.id = this.id;
        this.domElement.dataset.elementType = 'video';
        this.domElement.style.position = 'relative';
        this.domElement.style.overflow = 'hidden';

        this.videoElement = document.createElement('video');
        this.videoElement.playsInline = true;
        this.videoElement.muted = true; // Muted to allow autoplay
        this.videoElement.style.width = '100%';
        this.videoElement.style.height = '100%';
        this.videoElement.style.display = 'block';
        this.videoElement.addEventListener('loadedmetadata', () => {
            // Seek to 10% of the duration for a thumbnail preview
            if (!this.#isPlaybackPlaying && this.videoElement.duration && isFinite(this.videoElement.duration)) {
                this.videoElement.currentTime = this.videoElement.duration * 0.1;
            }
        });
        this.domElement.appendChild(this.videoElement);

        this.setProperty('src', new VideoSrcProperty(options.src));
        this.setProperty('playback', new VideoPlaybackProperty(options.playback || { loop: false }));
        this.setProperty('objectFit', new ObjectFitProperty(options.objectFit || 'cover'));
        this.setProperty('objectPosition', new ObjectPositionProperty(options.objectPosition));
        this.setProperty('dimensions', new DimensionsProperty(options.dimensions || { width: { value: 100, unit: 'pw' }, height: { value: 100, unit: 'ph' } }));
        this.setProperty('background', new BackgroundProperty(options.background || { enabled: true, background: { r: 0, g: 0, b: 0, a: 1, mode: 'color' } }));
        this.setProperty('margin', new MarginProperty(options.margin));
        this.setProperty('border', new BorderProperty(options.border));
        this.setProperty('boxShadow', new BoxShadowProperty(options.boxShadow));
        this.setProperty('effects', new EffectsProperty(options.effects));
        this.setProperty('transform', new TransformProperty(options.transform));
    }

    handlePlaybackStateChange(isPlaying) {
        console.log("VirtualVideo: handlePlaybackStateChange:", isPlaying);
        super.handlePlaybackStateChange(isPlaying);
        this.#isPlaybackPlaying = isPlaying;
        if (!isPlaying && this.videoElement) { // When playback stops or is paused
            if (!this.videoElement.paused) {
                this.videoElement.pause();
            }
            // Seek to 10% of the duration for a thumbnail preview
            if (this.videoElement.duration && isFinite(this.videoElement.duration)) {
                this.videoElement.currentTime = this.videoElement.duration * 0.1;
            }
        }
        // The 'else if (isPlaying)' block that was resetting the time has been removed.
    }

    /**
     * Applies the state of all properties to the DOM.
     * This is where the video element is actually controlled.
     */
    render() {
        // First, apply all standard property changes (like src, dimensions, effects).
        // This is critical because it ensures the video source is set before we try to play it.
        super.render();

        if (!this.videoElement) return;

        const playbackProp = this.getProperty('playback');
        const stateValue = playbackProp.getState();
        const speedValue = playbackProp.getSpeed();
        const loopValue = playbackProp.getLoop();

        // Always check and enforce the playback state against the DOM element's actual state.
        const intendedState = stateValue.getValue();
        if (intendedState === 'playing') {
            // Only reset time if the video has ended.
            if (this.videoElement.ended) {
                this.videoElement.currentTime = 0;
            }
            // Only play if it's currently paused (or has just ended).
            if (this.videoElement.paused) {
                this.videoElement.play().catch(e => console.warn("Video play failed. User interaction might be required.", e));
            }
        } else if (intendedState === 'resume') {
            if (this.videoElement.paused) {
                this.videoElement.play().catch(e => console.warn("Video play failed. User interaction might be required.", e));
            }
        } else if (intendedState === 'paused') {
            if (!this.videoElement.paused) {
                this.videoElement.pause();
            }
        }
        stateValue.markAsRendered();


        // Apply playback speed if it has changed.
        if (speedValue.shouldRender) {
            this.videoElement.playbackRate = speedValue.getValue();
            speedValue.markAsRendered();
        }

        // Apply loop state if it has changed.
        if (loopValue.shouldRender) {
            this.videoElement.loop = loopValue.getValue();
            loopValue.markAsRendered();
        }
    }
}



