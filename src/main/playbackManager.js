const { performance } = require('perf_hooks');

class PlaybackManager {
    #state = {
        status: 'unloaded', // 'unloaded', 'playing', 'paused'
        type: 'normal',     // 'normal', 'synced'
        song: null,         // Will now store { id, title, filePath, bpm, bpmUnit }
        timeAtReference: 0,
        referenceTime: 0,
    };
    #broadcast;
    #measureMap = []; // ADDED: To store the song's measure structure
    #lastBeatTimestamp = 0; // For 'synced' mode
    #syncedMeasureIndex = 0; // For tracking progress in 'synced' mode

    constructor(broadcastFunction) {
        this.#broadcast = broadcastFunction;
    }

    #getCurrentTime(atTimestamp = performance.now()) {
        if (this.#state.status === 'unloaded') return 0;
        if (this.#state.status === 'paused') return this.#state.timeAtReference;
        return this.#state.timeAtReference + (atTimestamp - this.#state.referenceTime);
    }

    #getQuarterNoteDurationMs(bpm, bpmUnit) {
        const effectiveBpm = bpm || 120;
        const effectiveBpmUnit = bpmUnit || 'q_note';

        const noteMultipliers = {
            'w_note': 4,
            'h_note': 2,
            'q_note': 1,
            'e_note': 0.5,
            's_note': 0.25,
            'w_note_dotted': 6,
            'h_note_dotted': 3,
            'q_note_dotted': 1.5,
            'e_note_dotted': 0.75,
        };

        const multiplier = noteMultipliers[effectiveBpmUnit] || 1;
        const quarterNotesPerMinute = effectiveBpm * multiplier;

        if (quarterNotesPerMinute === 0) return 0;

        return 60000 / quarterNotesPerMinute;
    }

    #broadcastState(extraData = {}) {
        // The state object sent over IPC is always lean and never contains song content.
        const stateToSend = {
            status: this.#state.status,
            type: this.#state.type,
            song: this.#state.song,
            timeAtReference: this.#state.timeAtReference,
            referenceTime: this.#state.referenceTime,
            syncTime: performance.now(),
            ...extraData, // Merge in any extra data, like interpolation info
        };
        this.#broadcast('playback:update', stateToSend);
    }

    getCurrentSyncState() {
        return {
            status: this.#state.status,
            type: this.#state.type,
            song: this.#state.song,
            timeAtReference: this.#state.timeAtReference,
            referenceTime: this.#state.referenceTime,
            syncTime: performance.now()
        };
    }

    loadSong(songMetadata, measureMap = []) {
        this.#state.status = 'paused';
        this.#state.type = 'normal'; // Reset type on load
        this.#state.song = {
            id: songMetadata.id,
            title: songMetadata.title,
            filePath: songMetadata.filePath,
            bpm: songMetadata.bpm || 120,
            bpmUnit: songMetadata.bpmUnit || 'q_note',
        };
        this.#measureMap = measureMap; // Store the measure map
        this.#state.timeAtReference = 0;
        this.#state.referenceTime = 0;
        this.#lastBeatTimestamp = 0;
        this.#syncedMeasureIndex = 0;
        this.#broadcastState();
    }

    unloadSong() {
        this.#state.status = 'unloaded';
        this.#state.type = 'normal';
        this.#state.song = null;
        this.#measureMap = [];
        this.#state.timeAtReference = 0;
        this.#state.referenceTime = 0;
        this.#lastBeatTimestamp = 0;
        this.#syncedMeasureIndex = 0;
        this.#broadcastState();
    }

    updateBpm(bpm, bpmUnit, absoluteTimestamp) {
        if (!this.#state.song) return;

        const mainRelativeTimestamp = absoluteTimestamp - performance.timeOrigin;
        const currentTime = this.#getCurrentTime(mainRelativeTimestamp);

        const oldBpm = this.#state.song.bpm;
        const oldBpmUnit = this.#state.song.bpmUnit;
        const oldQuarterNoteDuration = this.#getQuarterNoteDurationMs(oldBpm, oldBpmUnit);
        const currentMusicalTime = oldQuarterNoteDuration > 0 ? currentTime / oldQuarterNoteDuration : 0;

        this.#state.song.bpm = bpm;
        this.#state.song.bpmUnit = bpmUnit;

        const newQuarterNoteDuration = this.#getQuarterNoteDurationMs(bpm, bpmUnit);
        const newCurrentTime = currentMusicalTime * newQuarterNoteDuration;

        this.#state.timeAtReference = newCurrentTime;

        if (this.#state.status === 'playing') {
            this.#state.referenceTime = mainRelativeTimestamp;
        }
        
        this.#broadcastState();
    }

    play(absoluteTimestamp, type = 'normal') {
        if (this.#state.status !== 'paused') return;
        this.#state.status = 'playing';
        this.#state.type = type; // Set the playback type
        const mainRelativeTimestamp = absoluteTimestamp - performance.timeOrigin;
        this.#state.referenceTime = mainRelativeTimestamp;
        
        if (type === 'synced') {
            this.#lastBeatTimestamp = 0;
            this.#syncedMeasureIndex = 0;
        }
        this.#broadcastState();
    }

    pause(options = {}) {
        const { timeOverride, timestamp: absoluteTimestamp } = options;
        if (this.#state.status !== 'playing' && timeOverride === undefined) return;

        const mainRelativeTimestamp = absoluteTimestamp ? absoluteTimestamp - performance.timeOrigin : undefined;
        const timeAtPause = (timeOverride !== undefined) ? timeOverride : this.#getCurrentTime(mainRelativeTimestamp);
        this.#state.status = 'paused';
        this.#state.timeAtReference = timeAtPause;
        this.#state.referenceTime = 0;
        this.#lastBeatTimestamp = 0;
        this.#syncedMeasureIndex = 0;
        this.#broadcastState();
    }

    jump(timeInMs, absoluteTimestamp) {
        if (this.#state.status === 'unloaded') return;
        this.#state.timeAtReference = Math.max(0, timeInMs);
        const mainRelativeTimestamp = absoluteTimestamp - performance.timeOrigin;

        if (this.#state.status === 'playing') {
            this.#state.referenceTime = mainRelativeTimestamp;
        } else {
            this.#state.status = 'paused';
        }
        this.#lastBeatTimestamp = 0;
        this.#syncedMeasureIndex = 0;
        this.#broadcastState();
    }

    /**
     * REVISED: Handles a beat signal for 'synced' playback using the measure map.
     * Each call to this function marks the beginning of the next measure.
     * @param {number} absoluteTimestamp - The high-resolution timestamp of the beat event.
     * @param {number} interpolationDuration - The duration in seconds to smooth the transition.
     */
    syncBeat(absoluteTimestamp, interpolationDuration) {
        if (this.#state.status !== 'playing' || this.#state.type !== 'synced' || !this.#state.song || this.#measureMap.length === 0) {
            return;
        }

        const mainRelativeTimestamp = absoluteTimestamp - performance.timeOrigin;
        const currentMeasure = this.#measureMap[this.#syncedMeasureIndex];
        const nextMeasure = this.#measureMap[this.#syncedMeasureIndex + 1];

        if (!currentMeasure) {
            console.warn(`[PlaybackManager] Sync beat called, but current measure index ${this.#syncedMeasureIndex} is out of bounds.`);
            return;
        }

        const intervalStart = this.#lastBeatTimestamp || this.#state.referenceTime;
        const intervalMs = mainRelativeTimestamp - intervalStart;

        if (intervalMs <= 0) return; // Ignore erroneous double-taps

        // --- Capture the state AT THE MOMENT of the beat ---
        const timeAtStart = this.#getCurrentTime(mainRelativeTimestamp);
        const bpmAtStart = this.#state.song.bpm;

        // --- Calculate the TARGET state ---
        let targetBpm = bpmAtStart;
        const beatsInMeasure = currentMeasure.duration;
        if (beatsInMeasure > 0) {
            const msPerBeat = intervalMs / beatsInMeasure;
            targetBpm = 60000 / msPerBeat;
        }

        const newTimeInBeats = nextMeasure ? nextMeasure.startTime : (currentMeasure.startTime + currentMeasure.duration);
        const newQuarterNoteDuration = this.#getQuarterNoteDurationMs(targetBpm, this.#state.song.bpmUnit);
        const timeAtEnd = newTimeInBeats * newQuarterNoteDuration;

        // --- Prepare the broadcast message ---
        // This object contains everything the renderer needs to perform the interpolation.
        const interpolationData = {
            interpolation: {
                startTime: mainRelativeTimestamp, // The timestamp when the interpolation should begin
                duration: interpolationDuration * 1000, // Convert seconds to ms
                startMs: timeAtStart,
                endMs: timeAtEnd,
                startBpm: bpmAtStart,
                endBpm: targetBpm,
            }
        };

        // --- Atomically update the manager's internal state to the new TARGET ---
        // This ensures consistency for new windows or subsequent beats.
        this.#state.song.bpm = targetBpm;
        this.#state.timeAtReference = timeAtEnd;
        this.#state.referenceTime = mainRelativeTimestamp;
        this.#lastBeatTimestamp = mainRelativeTimestamp;

        if (nextMeasure) {
            this.#syncedMeasureIndex++;
        }

        // --- Broadcast the new state, including the special interpolation data ---
        this.#broadcastState(interpolationData);
    }
}

module.exports = { PlaybackManager };