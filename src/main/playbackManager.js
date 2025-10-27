const { performance } = require('perf_hooks');

class PlaybackManager {
    #state = {
        isPlaying: false,
        songLoaded: false,
        startTime: 0, // performance.now() when play was last called
        timeAtPause: 0, // The playback time in ms when paused
        currentSong: null,
    };
    #broadcast;
    #eventHistory = []; // Authoritative history of events since last play/pause.

    constructor(broadcastFunction) {
        this.#broadcast = broadcastFunction;
    }

    #getCurrentTime() {
        if (!this.#state.songLoaded) return 0;
        let currentTime = this.#state.timeAtPause;
        if (this.#state.isPlaying) {
            currentTime += performance.now() - this.#state.startTime;
        }
        return currentTime;
    }

    getCurrentSyncState() {
        return {
            currentSong: this.#state.currentSong,
            eventHistory: this.#eventHistory,
        };
    }

    loadSong(song) {
        this.#state.songLoaded = true;
        this.#state.currentSong = song;
        this.#state.timeAtPause = 0;
        this.#state.isPlaying = false;

        const event = { type: 'load', song, timestamp: Date.now() };
        this.#eventHistory = [{ type: 'pause', timeAtPause: 0, timestamp: event.timestamp }];
        // Broadcast on a dedicated 'playback:load' channel.
        this.#broadcast('playback:load', event);
    }

    unloadSong() {
        this.#state.songLoaded = false;
        this.#state.currentSong = null;
        this.#state.isPlaying = false;
        this.#state.timeAtPause = 0;

        const event = { type: 'unload', timestamp: Date.now() };
        this.#eventHistory = [];
        // Broadcast on a dedicated 'playback:unload' channel.
        this.#broadcast('playback:unload', event);
    }

    updateBpm(bpm, bpmUnit) {
        if (!this.#state.songLoaded || !this.#state.currentSong) return;
        this.#state.currentSong.data.bpm = bpm;
        this.#state.currentSong.data.bpmUnit = bpmUnit;
        const event = { type: 'update-bpm', bpm, bpmUnit, timestamp: Date.now() };
        this.#eventHistory.push(event);
        this.#broadcast('playback:event', event);
    }



    play() {
        if (this.#state.isPlaying || !this.#state.songLoaded) return;
        this.#state.isPlaying = true;
        this.#state.startTime = performance.now();
        const event = { type: 'play', timeAtStart: this.#state.timeAtPause, timestamp: Date.now() };
        this.#eventHistory = [event];
        this.#broadcast('playback:event', event);
    }

    pause(timeOverride) {
        if (!this.#state.isPlaying && timeOverride === undefined) return;
        const timeAtPause = (timeOverride !== undefined) ? timeOverride : this.#getCurrentTime();
        this.#state.timeAtPause = timeAtPause;
        this.#state.isPlaying = false;
        const event = { type: 'pause', timeAtPause, timestamp: Date.now() };
        this.#eventHistory = [event];
        this.#broadcast('playback:event', event);
    }

    jump(timeInMs) {
        this.#state.timeAtPause = Math.max(0, timeInMs);
        if (this.#state.isPlaying) {
            // If we jump while playing, the reference start time must be reset.
            this.#state.startTime = performance.now();
        }
        const event = { type: 'jump', timeInMs, timestamp: Date.now() };
        this.#eventHistory.push(event);
        this.#broadcast('playback:event', event);
    }
}

module.exports = { PlaybackManager };