import { VirtualProperty } from "./property.js";
import { NumberValue } from "../values/number.js";
import { DynamicStringValue } from "../values/dynamicString.js";
import { BooleanValue } from "../values/boolean.js";
import { generateUUID } from "../utils.js";

export class VideoPlaybackProperty extends VirtualProperty {
    #speed = new NumberValue(1);
    #state = new DynamicStringValue({ value: 'paused' }); // 'playing' or 'paused'
    #loop = new BooleanValue(true);

    constructor(options = {}) {
        super('playback', 'Playback');
        this.batchUpdate(options, true);
    }

    getSpeed() { return this.#speed; }
    setSpeed(value, setAsDefault = false) { return this.#speed.setValue(value, setAsDefault); }

    getState() { return this.#state; }
    setState(value, setAsDefault = false) {
        if (value !== 'playing' && value !== 'paused' && value !== 'resume') value = 'paused';
        return this.#state.batchUpdate({ value, id: generateUUID() }, setAsDefault);
    }

    getLoop() { return this.#loop; }
    setLoop(value, setAsDefault = false) { return this.#loop.setValue(value, setAsDefault); }

    batchUpdate({ speed, state, loop }, setAsDefault = false) {
        if (speed !== undefined) this.setSpeed(speed, setAsDefault);
        if (state !== undefined) this.setState(state, setAsDefault);
        if (loop !== undefined) this.setLoop(loop, setAsDefault);
    }

    getValues() {
        return {
            speed: this.getSpeed(),
            state: this.getState(),
            loop: this.getLoop()
        };
    }

    getValue(name) {
        if (name === 'speed') return this.getSpeed();
        if (name === 'state') return this.getState();
        if (name === 'loop') return this.getLoop();
        return null;
    }

    setValue(key, value, setAsDefault = false) {
        if (key === 'speed') return this.setSpeed(value, setAsDefault);
        if (key === 'state') return this.setState(value, setAsDefault);
        if (key === 'loop') return this.setLoop(value, setAsDefault);
        return null;
    }

    applyChanges(element) {
        // Logic is now handled directly in VirtualVideo.render
    }

    applyEvents(element, measureIndex, measureProgress, timingData) {
        const values = this.getValues();
        for (const key in values) {
            const value = values[key];
            if( typeof value.applyEvent !== 'function') {
                continue;
            }
            if(key==="state" && !element.isPlaybackPlaying) {
                value.applyDefaultEvent();
                continue;
            } // Only apply state changes when playback is active
            value.applyEvent(measureIndex, measureProgress);
        }
    }
}



