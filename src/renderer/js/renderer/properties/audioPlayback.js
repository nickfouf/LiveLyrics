// src/renderer/js/renderer/properties/audioPlayback.js

import { VirtualProperty } from "./property.js";
import { NumberValue } from "../values/number.js";
import { DynamicStringValue } from "../values/dynamicString.js";
import { BooleanValue } from "../values/boolean.js";
import { generateUUID } from "../utils.js";

export class AudioPlaybackProperty extends VirtualProperty {
    #state = new DynamicStringValue({ value: 'paused' }); // 'playing' or 'paused'
    #volume = new NumberValue(1); // 0.0 to 1.0
    #loop = new BooleanValue(true);

    constructor(options = {}) {
        super('playback', 'Playback');
        this.batchUpdate(options, true);
    }

    getState() { return this.#state; }
    setState(value, setAsDefault = false) {
        if (value !== 'playing' && value !== 'paused' && value !== 'resume') value = 'paused';
        return this.#state.batchUpdate({ value, id: generateUUID() }, setAsDefault);
    }

    getVolume() { return this.#volume; }
    setVolume(value, setAsDefault = false) {
        const clamped = Math.max(0, Math.min(1, value));
        return this.#volume.setValue(clamped, setAsDefault);
    }

    getLoop() { return this.#loop; }
    setLoop(value, setAsDefault = false) { return this.#loop.setValue(value, setAsDefault); }


    batchUpdate({ state, volume, loop }, setAsDefault = false) {
        if (state !== undefined) this.setState(state, setAsDefault);
        if (volume !== undefined) this.setVolume(volume, setAsDefault);
        if (loop !== undefined) this.setLoop(loop, setAsDefault);
    }

    getValues() {
        return {
            state: this.getState(),
            volume: this.getVolume(),
            loop: this.getLoop()
        };
    }

    getValue(name) {
        if (name === 'state') return this.getState();
        if (name === 'volume') return this.getVolume();
        if (name === 'loop') return this.getLoop();
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if (key === 'state') return this.setState(value, setAsDefault);
        if (key === 'volume') return this.setVolume(value, setAsDefault);
        if (key === 'loop') return this.setLoop(value, setAsDefault);
        return null;
    }

    // Logic is handled directly in VirtualAudio.render, so this is not needed.
    applyChanges(element) {}

    applyEvents(element, measureIndex, measureProgress, timingData) {
        const values = this.getValues();
        for (const key in values) {
            const value = values[key];
            if (typeof value.applyEvent !== 'function') {
                continue;
            }
            // Only apply state changes when main playback is active
            if (key === "state" && !element.isPlaybackPlaying) {
                value.applyDefaultEvent();
                continue;
            }
            value.applyEvent(measureIndex, measureProgress);
        }
    }
}

