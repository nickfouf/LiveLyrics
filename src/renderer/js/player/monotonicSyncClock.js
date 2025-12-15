/**
 * Manages a synchronized timeline with a remote device using MONOTONIC clocks.
 *
 * !!! WARNING: EXTREMELY FRAGILE !!!
 * This class will fail the moment the page is refreshed or the user navigates away
 * and comes back. A refresh resets the monotonic clock, making any previously
 * calculated offset instantly invalid. This class should only be used in highly
 * controlled environments where the page lifecycle is guaranteed to be uninterrupted.
 *
 * --- HOW IT WORKS ---
 * This implementation assumes one device is the "Master" of the timeline.
 * The other device is the "Slave" and calculates an offset to translate its
 * local time into the Master's timeline.
 *
 * offset = master_time_in_millis - slave_time_in_millis
 *
 * To maintain accuracy and correct for clock drift, you MUST periodically
 * re-run the sync handshake (e.g., every 5-10 seconds).
 */
class MonotonicSyncClock {
    constructor() {
        // The calculated offset in milliseconds: remote_millis - local_millis
        this.monotonicOffset = null;
    }

    /**
     * [MASTER/SLAVE] Starts or restarts a sync handshake.
     * Call this method and send the returned value to the other device.
     *
     * @returns {number} The current local monotonic time in MILLISECONDS.
     */
    initiateSync() {
        return performance.now();
    }

    /**
     * [MASTER/SLAVE] Completes a sync handshake.
     * Call this when you receive a monotonic time from the other device.
     *
     * @param {number} remoteMillis The monotonic timestamp in MILLISECONDS from the other device.
     */
    completeSync(remoteMillis) {
        // The offset translates our local time into the remote device's time.
        this.monotonicOffset = remoteMillis - performance.now();
    }

    /**
     * Checks if the clock has a calculated offset.
     * @returns {boolean}
     */
    isSynced() {
        return this.monotonicOffset !== null;
    }

    /**
     * Calculates how many milliseconds have passed LOCALLY since an event with a
     * given REMOTE timestamp occurred. This is the primary method for aligning events.
     *
     * @param {number} remoteTimestampInMillis The monotonic timestamp from the remote device's event.
     * @returns {number} The elapsed time in milliseconds on the local clock, or -1 if not synced.
     */
    getElapsedTimeSince(remoteTimestampInMillis) {
        if (!this.isSynced()) {
            return -1;
        }
        // 1. Translate the remote event time to our local timeline
        const eventTimeInLocalMillis = remoteTimestampInMillis - this.monotonicOffset;

        // 2. See how much time has passed on our local clock since that moment
        return performance.now() - eventTimeInLocalMillis;
    }
}

// Export a single instance to act as a singleton
export const monotonicSyncClock = new MonotonicSyncClock();