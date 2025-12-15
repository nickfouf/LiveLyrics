const { performance } = require('perf_hooks');

class PlaybackManager {
    #state = {
        status: 'unloaded', // 'unloaded', 'playing', 'paused'
        type: 'normal',     // 'normal', 'synced'
        song: null,         // Will now store { id, title, filePath, bpm, bpmUnit, originalBpm, originalBpmUnit }
        timeAtReference: 0,
        referenceTime: 0,
    };
    #broadcast;
    #measureMap = []; // ADDED: To store the song's measure structure
    #lastBeatTimestamp = 0; // For 'synced' mode
    #syncedMeasureIndex = 0; // For tracking progress in 'synced' mode
    #previousStateSnapshot = null; // ADDED: To store the state before the last beat for undo functionality.
    #songData = null; // ADDED: To store the full song JSON

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
            canUndo: !!this.#previousStateSnapshot, // ADDED: Flag for the undo button UI
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
            syncTime: performance.now(),
            canUndo: !!this.#previousStateSnapshot,
        };
    }

    loadSong(songMetadata, measureMap = [], songData = null) {
        this.#state.status = 'paused';
        this.#state.type = 'normal'; // Reset type on load
        this.#state.song = {
            id: songMetadata.id,
            title: songMetadata.title,
            filePath: songMetadata.filePath,
            bpm: songMetadata.bpm || 120,
            bpmUnit: songMetadata.bpmUnit || 'q_note',
            originalBpm: songMetadata.bpm || 120, // Store original
            originalBpmUnit: songMetadata.bpmUnit || 'q_note', // Store original
        };
        this.#measureMap = measureMap; // Store the measure map
        this.#songData = songData; // Store the full song data
        this.#state.timeAtReference = 0;
        this.#state.referenceTime = 0;
        this.#lastBeatTimestamp = 0;
        this.#syncedMeasureIndex = 0;
        this.#previousStateSnapshot = null; // Clear undo state
        this.#broadcastState();
    }

    unloadSong() {
        this.#state.status = 'unloaded';
        this.#state.type = 'normal';
        this.#state.song = null;
        this.#measureMap = [];
        this.#songData = null; // Clear the song data
        this.#state.timeAtReference = 0;
        this.#state.referenceTime = 0;
        this.#lastBeatTimestamp = 0;
        this.#syncedMeasureIndex = 0;
        this.#previousStateSnapshot = null; // Clear undo state
        this.#broadcastState();
    }

    // ADDED: New method to get the current song data
    getCurrentSongData() {
        return this.#songData;
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
        if (this.#state.status !== 'paused' || !this.#state.song) return;
    
        const mainRelativeTimestamp = absoluteTimestamp - performance.timeOrigin;
    
        if (type === 'synced') {
            console.log(`[PlaybackManager] Starting synced play. Resetting BPM to default: ${this.#state.song.originalBpm}`);
            
            // When resuming synced playback, we must reset the BPM to the song's default
            // and adjust the current time (`timeAtReference`) to match.
            // We do this by converting the current time in milliseconds to a musical time (beats)
            // using the old BPM, and then converting that musical time back to milliseconds
            // using the new, default BPM. This keeps the playback position musically consistent.
            const oldQuarterNoteDuration = this.#getQuarterNoteDurationMs(this.#state.song.bpm, this.#state.song.bpmUnit);
            const timeInBeats = oldQuarterNoteDuration > 0 ? this.#state.timeAtReference / oldQuarterNoteDuration : 0;
    
            // Reset BPM to the song's default
            this.#state.song.bpm = this.#state.song.originalBpm;
            this.#state.song.bpmUnit = this.#state.song.originalBpmUnit;
    
            // Now, convert the musical time back to milliseconds using the NEW default BPM
            const newQuarterNoteDuration = this.#getQuarterNoteDurationMs(this.#state.song.bpm, this.#state.song.bpmUnit);
            this.#state.timeAtReference = timeInBeats * newQuarterNoteDuration;
    
            let startingMeasureIndex = this.#measureMap.findIndex(m => timeInBeats >= m.startTime && timeInBeats < m.startTime + m.duration);
            if (startingMeasureIndex === -1) {
                const totalDurationBeats = this.#measureMap.length > 0 ? this.#measureMap.at(-1).startTime + this.#measureMap.at(-1).duration : 0;
                if (timeInBeats >= totalDurationBeats && this.#measureMap.length > 0) {
                    startingMeasureIndex = this.#measureMap.length - 1;
                } else {
                    startingMeasureIndex = 0;
                }
            }
    
            this.#syncedMeasureIndex = startingMeasureIndex;
            this.#lastBeatTimestamp = mainRelativeTimestamp;
        }
    
        this.#state.status = 'playing';
        this.#state.type = type;
        this.#state.referenceTime = mainRelativeTimestamp;
    
        this.#previousStateSnapshot = null;
        this.#broadcastState();
    }
    
    pause(options = {}) {
        const { timeOverride, timestamp: absoluteTimestamp } = options;
        if (this.#state.status !== 'playing' && timeOverride === undefined) return;
    
        const mainRelativeTimestamp = absoluteTimestamp ? absoluteTimestamp - performance.timeOrigin : undefined;
        const timeAtPause = (timeOverride !== undefined) ? timeOverride : this.#getCurrentTime(mainRelativeTimestamp);
    
        // Calculate the total duration to check if we're at the end.
        const quarterNoteDuration = this.#getQuarterNoteDurationMs(this.#state.song?.bpm, this.#state.song?.bpmUnit);
        const totalDurationBeats = this.#measureMap.length > 0 ? this.#measureMap.at(-1).startTime + this.#measureMap.at(-1).duration : 0;
        const totalDurationMs = totalDurationBeats * quarterNoteDuration;
    
        // Check if the pause is happening at or after the song's end.
        // Use a small tolerance (e.g., 1ms) to account for floating point inaccuracies.
        const isAtSongEnd = totalDurationMs > 0 && timeAtPause >= totalDurationMs - 1;
    
        // Only snap to the nearest measure if in 'synced' mode AND not at the end of the song.
        if (this.#state.type === 'synced' && this.#measureMap.length > 0 && !isAtSongEnd) {
            const timeInBeats = quarterNoteDuration > 0 ? timeAtPause / quarterNoteDuration : 0;
    
            let closestMeasure = null;
            let minDiff = Infinity;
    
            for (const measure of this.#measureMap) {
                const diff = Math.abs(timeInBeats - measure.startTime);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestMeasure = measure;
                }
            }
    
            if (closestMeasure) {
                const snappedTimeInBeats = closestMeasure.startTime;
                const snappedTimeInMs = snappedTimeInBeats * quarterNoteDuration;
    
                this.#state.status = 'paused';
                this.#state.timeAtReference = snappedTimeInMs;
                this.#state.referenceTime = 0;
                this.#lastBeatTimestamp = 0;
                this.#previousStateSnapshot = null;
    
                this.#broadcastState({
                    interpolationOnPause: {
                        duration: 300,
                        startMs: timeAtPause,
                        endMs: snappedTimeInMs,
                    }
                });
                return;
            }
        }
    
        // Fallback for normal pauses or end-of-song pauses.
        this.#state.status = 'paused';
        this.#state.timeAtReference = timeAtPause;
        this.#state.referenceTime = 0;
        this.#lastBeatTimestamp = 0;
        this.#previousStateSnapshot = null;
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
        this.#previousStateSnapshot = null;
        this.#broadcastState();
    }

    syncBeat(absoluteTimestamp, interpolationDuration) {
        if (this.#state.status !== 'playing' || this.#state.type !== 'synced' || !this.#state.song || this.#measureMap.length === 0) {
            return;
        }
    
        const mainRelativeTimestamp = absoluteTimestamp - performance.timeOrigin;
    
        this.#previousStateSnapshot = {
            state: structuredClone(this.#state),
            syncedMeasureIndex: this.#syncedMeasureIndex,
            lastBeatTimestamp: this.#lastBeatTimestamp,
        };
    
        const currentMeasure = this.#measureMap[this.#syncedMeasureIndex];
        const nextMeasure = this.#measureMap[this.#syncedMeasureIndex + 1];
    
        if (!currentMeasure) {
            console.warn(`[PlaybackManager] Sync beat called, but current measure index ${this.#syncedMeasureIndex} is out of bounds.`);
            return;
        }
    
        const intervalStart = this.#lastBeatTimestamp;
        const intervalMs = mainRelativeTimestamp - intervalStart;
    
        if (intervalMs <= 0) return;
    
        const timeAtStart = this.#getCurrentTime(mainRelativeTimestamp);
        const bpmAtStart = this.#state.song.bpm;
    
        let targetBpm = bpmAtStart;
        const beatsInMeasure = currentMeasure.duration;
        if (beatsInMeasure > 0) {
            const msPerBeat = intervalMs / beatsInMeasure;
            targetBpm = 60000 / msPerBeat;
        }
    
        const newTimeInBeats = nextMeasure ? nextMeasure.startTime : (currentMeasure.startTime + currentMeasure.duration);
        const newQuarterNoteDuration = this.#getQuarterNoteDurationMs(targetBpm, this.#state.song.bpmUnit);
        const timeAtEnd = newTimeInBeats * newQuarterNoteDuration;
    
        const interpolationData = {
            interpolation: {
                startTime: mainRelativeTimestamp,
                duration: interpolationDuration * 1000,
                startMs: timeAtStart,
                endMs: timeAtEnd,
                startBpm: bpmAtStart,
                endBpm: targetBpm,
            }
        };
    
        this.#state.song.bpm = targetBpm;
        this.#state.timeAtReference = timeAtEnd;
        this.#state.referenceTime = mainRelativeTimestamp;
        this.#lastBeatTimestamp = mainRelativeTimestamp;
    
        if (nextMeasure) {
            this.#syncedMeasureIndex++;
        }
    
        this.#broadcastState(interpolationData);
    }

    jumpSynced(direction, absoluteTimestamp) {
        if (this.#state.status === 'unloaded' || !this.#measureMap || this.#measureMap.length === 0) {
            return;
        }

        const mainRelativeTimestamp = absoluteTimestamp - performance.timeOrigin;
        const currentTime = this.#getCurrentTime(mainRelativeTimestamp);
        const currentQuarterNoteDuration = this.#getQuarterNoteDurationMs(this.#state.song.bpm, this.#state.song.bpmUnit);
        const currentBeats = currentQuarterNoteDuration > 0 ? currentTime / currentQuarterNoteDuration : 0;
        const totalDurationBeats = this.#measureMap.at(-1).startTime + this.#measureMap.at(-1).duration;

        let currentMeasureIndex = this.#measureMap.findIndex(m => currentBeats >= m.startTime && currentBeats < m.startTime + m.duration);

        if (currentBeats >= totalDurationBeats) {
            currentMeasureIndex = this.#measureMap.length - 1;
        } else if (currentMeasureIndex === -1 && currentBeats < this.#measureMap[0].startTime) {
            currentMeasureIndex = -1;
        } else if (currentMeasureIndex === -1) {
            currentMeasureIndex = 0;
        }

        let targetMeasureIndex;
        if (direction > 0) {
            if (currentMeasureIndex === -1) {
                targetMeasureIndex = 0;
            } else {
                targetMeasureIndex = Math.min(this.#measureMap.length - 1, currentMeasureIndex + 1);
            }
        } else {
            const currentMeasure = this.#measureMap[currentMeasureIndex];
            const isAtStartOfMeasure = currentMeasure ? (currentBeats - currentMeasure.startTime) * currentQuarterNoteDuration < 10 : false;

            if (currentMeasureIndex <= 0) {
                targetMeasureIndex = 0;
            } else if (isAtStartOfMeasure) {
                targetMeasureIndex = currentMeasureIndex - 1;
            } else {
                targetMeasureIndex = currentMeasureIndex;
            }
        }

        const targetMeasure = this.#measureMap[targetMeasureIndex];
        if (!targetMeasure) return;

        let newTimeInMs;

        if (this.#state.status === 'playing') {
            this.#state.song.bpm = this.#state.song.originalBpm;
            this.#state.song.bpmUnit = this.#state.song.originalBpmUnit;

            const newQuarterNoteDuration = this.#getQuarterNoteDurationMs(this.#state.song.bpm, this.#state.song.bpmUnit);
            newTimeInMs = targetMeasure.startTime * newQuarterNoteDuration;

            this.#state.timeAtReference = newTimeInMs;
            this.#state.referenceTime = mainRelativeTimestamp;
            this.#lastBeatTimestamp = mainRelativeTimestamp;
        } else {
            newTimeInMs = targetMeasure.startTime * currentQuarterNoteDuration;
            this.#state.timeAtReference = Math.max(0, newTimeInMs);
            this.#state.referenceTime = 0;
            this.#lastBeatTimestamp = 0;
        }

        this.#syncedMeasureIndex = targetMeasureIndex;
        this.#previousStateSnapshot = null;
        this.#broadcastState();
    }

    undoBeat() {
        if (!this.#previousStateSnapshot) {
            console.warn("[PlaybackManager] Undo called but no previous state available.");
            return;
        }

        console.log("[PlaybackManager] Undoing last beat.");

        this.#state = this.#previousStateSnapshot.state;
        this.#syncedMeasureIndex = this.#previousStateSnapshot.syncedMeasureIndex;
        this.#lastBeatTimestamp = this.#previousStateSnapshot.lastBeatTimestamp;

        this.#previousStateSnapshot = null;

        this.#broadcastState();
    }
}

module.exports = { PlaybackManager };