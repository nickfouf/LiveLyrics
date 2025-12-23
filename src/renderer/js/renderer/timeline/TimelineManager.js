export class TimelineManager {
    #domManager = null;
    #currentMeasureIndex = 0;
    #currentMeasureProgress = 0;
    #measureMap = [];
    #lyricsTimingMap = [];

    constructor(measures) {

    }

    setMeasureMap(measureMap) {
        this.#measureMap = measureMap || [];
    }

    setLyricsTimingMap(lyricsTimingMap) {
        this.#lyricsTimingMap = lyricsTimingMap || [];
    }

    getMeasureMap() {
        return this.#measureMap;
    }

    getDomManager() {
        return this.#domManager;
    }

    setDomManager(domManager) {
        this.#domManager = domManager;
    }

    notifyPlaybackState(isPlaying) {
        if (!this.#domManager) {
            console.warn('No DOM Manager set for this Timeline Manager.');
            return;
        }
        this.#domManager.notifyPlaybackState(isPlaying);
    }

    resize(manualResize = false) {
        if(!this.#domManager) {
            console.warn('No DOM Manager set for this Timeline Manager.');
            return;
        }

        const timingData = { measureMap: this.#measureMap, lyricsTimingMap: this.#lyricsTimingMap };
        if(this.#domManager.isStaging()) this.#domManager.applyEvents(0, 0, timingData);
        else this.#domManager.applyEvents(this.#currentMeasureIndex, this.#currentMeasureProgress, timingData);

        this.#domManager.resize(manualResize);
    }

    rerender() {
        if(!this.#domManager) {
            console.warn('No DOM Manager set for this Timeline Manager.');
            return;
        }

        const timingData = { measureMap: this.#measureMap, lyricsTimingMap: this.#lyricsTimingMap };
        if(this.#domManager.isStaging()) this.#domManager.applyEvents(0, 0, timingData);
        else this.#domManager.applyEvents(this.#currentMeasureIndex, this.#currentMeasureProgress, timingData);

        this.#domManager.render();
    }

    applyEventsAt(measureIndex, measureProgress) {
        if (!this.#domManager) {
            console.warn('No DOM Manager set for this Timeline Manager.');
            return;
        }
        this.#currentMeasureIndex = measureIndex;
        this.#currentMeasureProgress = measureProgress;
        const timingData = {
            measureMap: this.#measureMap,
            lyricsTimingMap: this.#lyricsTimingMap
        };
        this.#domManager.applyEvents(measureIndex, measureProgress, timingData);
    }

    renderAt(measureIndex, measureProgress) {
        if(!this.#domManager) {
            console.warn('No DOM Manager set for this Timeline Manager.');
            return;
        }
        this.applyEventsAt(measureIndex, measureProgress);
        this.#domManager.render();
    }
}



