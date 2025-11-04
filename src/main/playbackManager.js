const { performance } = require('perf_hooks');

class PlaybackManager {
    #state = {
        status: 'unloaded', // 'unloaded', 'playing', 'paused'
        song: null,         // Will now store { id, title, filePath, bpm, bpmUnit }
        timeAtReference: 0,
        referenceTime: 0,
    };
    #broadcast;

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

    #broadcastState() {
        // The state object sent over IPC is always lean and never contains song content.
        const stateToSend = {
            status: this.#state.status,
            song: this.#state.song, // This is now just metadata
            timeAtReference: this.#state.timeAtReference,
            referenceTime: this.#state.referenceTime,
            syncTime: performance.now()
        };
        this.#broadcast('playback:update', stateToSend);
    }

    getCurrentSyncState() {
        return {
            status: this.#state.status,
            song: this.#state.song,
            timeAtReference: this.#state.timeAtReference,
            referenceTime: this.#state.referenceTime,
            syncTime: performance.now()
        };
    }

    loadSong(songMetadata) {
        this.#state.status = 'paused';
        this.#state.song = {
            id: songMetadata.id,
            title: songMetadata.title,
            filePath: songMetadata.filePath,
            bpm: songMetadata.bpm || 120,
            bpmUnit: songMetadata.bpmUnit || 'q_note',
        };
        this.#state.timeAtReference = 0;
        this.#state.referenceTime = 0;
        this.#broadcastState();
    }

    unloadSong() {
        this.#state.status = 'unloaded';
        this.#state.song = null;
        this.#state.timeAtReference = 0;
        this.#state.referenceTime = 0;
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

    play(absoluteTimestamp) {
        if (this.#state.status !== 'paused') return;
        this.#state.status = 'playing';
        const mainRelativeTimestamp = absoluteTimestamp - performance.timeOrigin;
        this.#state.referenceTime = mainRelativeTimestamp;
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
        this.#broadcastState();
    }
}

module.exports = { PlaybackManager };