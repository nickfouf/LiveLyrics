class MonotonicSyncClock {
    constructor() {
        this.monotonicOffset = null;
    }

    initiateSync() {
        return performance.now();
    }

    completeSync(remoteMillis) {
        this.monotonicOffset = remoteMillis - performance.now();
    }

    isSynced() {
        return this.monotonicOffset !== null;
    }

    getElapsedTimeSince(remoteTimestampInMillis) {
        if (!this.isSynced()) {
            return -1;
        }
        const eventTimeInLocalMillis = remoteTimestampInMillis - this.monotonicOffset;
        return performance.now() - eventTimeInLocalMillis;
    }
}

const monotonicSyncClock = new MonotonicSyncClock();

module.exports = { monotonicSyncClock };



