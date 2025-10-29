const EASING_FUNCTIONS = {
    linear: t => t,
    fast: t => t * t,
    slow: t => t * (2 - t),
    instant: t => (t < 1 ? 0 : 1),
};

export class EventsArray {
    #events;
    #defaultValue = null;
    #timelineOffset = 0;

    constructor(defaultValue = null) {
        this.#events = [];
        this.#defaultValue = defaultValue;
    }

    setDefaultValue(value) {
        this.#defaultValue = value;
    }

    getDefaultValue() {
        return this.#defaultValue;
    }

    clear() {
        this.#events = [];
    }

    clearTransitionEvents() {
        this.#events = this.#events.filter(event => !event.getIsTransition || !event.getIsTransition());
    }

    setTimelineOffset(offset) {
        this.#timelineOffset = offset || 0;
    }

    #compare(a, b) {
        if (a.getMeasureIndex() !== b.getMeasureIndex()) {
            return a.getMeasureIndex() - b.getMeasureIndex();
        }
        return a.getMeasureProgress() - b.getMeasureProgress();
    }

    #applyEase(ease, t) {
        const easeFunction = EASING_FUNCTIONS[ease];
        return typeof easeFunction === 'function' ? easeFunction(t) : EASING_FUNCTIONS.linear(t);
    }

    #areGradientsCompatible(startVal, endVal) {
        return startVal && endVal &&
            startVal.mode === 'gradient' &&
            endVal.mode === 'gradient' &&
            startVal.type === endVal.type &&
            startVal.colorStops?.length === endVal.colorStops?.length;
    }

    #interpolateColorObject(startColor, endColor, easedProgress) {
        const startR = startColor.r ?? 0;
        const startG = startColor.g ?? 0;
        const startB = startColor.b ?? 0;
        const startA = startColor.a ?? 1;

        const endR = endColor.r ?? 0;
        const endG = endColor.g ?? 0;
        const endB = endColor.b ?? 0;
        const endA = endColor.a ?? 1;

        return {
            r: Math.round(startR + (endR - startR) * easedProgress),
            g: Math.round(startG + (endG - startG) * easedProgress),
            b: Math.round(startB + (endB - startB) * easedProgress),
            a: startA + (endA - startA) * easedProgress,
            mode: 'color'
        };
    }

    #interpolateGradient(startVal, endVal, easedProgress) {
        const interpolatedStops = [];

        for (let i = 0; i < endVal.colorStops.length; i++) {
            const startStop = startVal.colorStops[i] || {};
            const endStop = endVal.colorStops[i] || {};
            const startColor = startStop.color || {};
            const endColor = endStop.color || {};
            const interpolatedColor = this.#interpolateColorObject(startColor, endColor, easedProgress);

            const newStop = {
                position: (startStop.position ?? 0) + ((endStop.position ?? 0) - (startStop.position ?? 0)) * easedProgress,
                color: interpolatedColor,
            };

            if (startStop.midpoint !== undefined && endStop.midpoint !== undefined) {
                newStop.midpoint = startStop.midpoint + (endStop.midpoint - startStop.midpoint) * easedProgress;
            }

            interpolatedStops.push(newStop);
        }

        return {
            mode: 'gradient',
            type: endVal.type,
            opacity: (startVal.opacity ?? 1) + ((endVal.opacity ?? 1) - (startVal.opacity ?? 1)) * easedProgress,
            angle: (startVal.angle ?? 0) + ((endVal.angle ?? 0) - (startVal.angle ?? 0)) * easedProgress,
            colorStops: interpolatedStops,
        };
    }

    #interpolate(startValue, endValue, easedProgress, type) {
        switch (type) {
            case 'number':
                return startValue + (endValue - startValue) * easedProgress;
            case 'boolean':
                return easedProgress < 0.5 ? startValue : endValue;
            case 'size':
                if (startValue.unit !== endValue.unit) return startValue;
                return {
                    value: startValue.value + (endValue.value - startValue.value) * easedProgress,
                    unit: endValue.unit,
                };
            case 'color':
                return this.#interpolateColorObject(startValue, endValue, easedProgress);
            case 'gradient':
                if (!this.#areGradientsCompatible(startValue, endValue)) return startValue;
                return this.#interpolateGradient(startValue, endValue, easedProgress);
            case 'color/gradient':
                const areModesSame = startValue?.mode === endValue?.mode;
                if (!areModesSame) return startValue;
                if (startValue.mode === 'color') {
                    return this.#interpolateColorObject(startValue, endValue, easedProgress);
                }
                if (startValue.mode === 'gradient') {
                    if (!this.#areGradientsCompatible(startValue, endValue)) return startValue;
                    return this.#interpolateGradient(startValue, endValue, easedProgress);
                }
                return startValue;
            case 'dynamic-string':
            case 'string':
            default:
                return startValue;
        }
    }

    getInterpolatedValue(measureIndex, measureProgress, type) {
        const numEvents = this.#events.length;
        const currentPosition = { getMeasureIndex: () => measureIndex, getMeasureProgress: () => measureProgress };

        if (numEvents === 0) {
            return this.#defaultValue;
        }

        if (this.#compare(currentPosition, this.#events[0]) < 0) {
            const startValue = this.#defaultValue;
            const endEvent = this.#events[0];
            const endValue = typeof endEvent.getFullValue === 'function' ? endEvent.getFullValue() : endEvent.getValue();

            if (startValue === null) return startValue;

            const startPos = this.#timelineOffset;
            const endPos = endEvent.getMeasureIndex() + endEvent.getMeasureProgress();
            const targetPos = measureIndex + measureProgress;
            const duration = endPos - startPos;
            const progress = duration <= 0 ? 1 : (targetPos - startPos) / duration;
            const easedProgress = this.#applyEase(endEvent.getEase(), progress);

            return this.#interpolate(startValue, endValue, easedProgress, type);
        }

        if (this.#compare(currentPosition, this.#events[numEvents - 1]) >= 0) {
            const lastEvent = this.#events[numEvents - 1];
            return typeof lastEvent.getFullValue === 'function' ? lastEvent.getFullValue() : lastEvent.getValue();
        }

        let low = 0, high = numEvents;
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            this.#compare(currentPosition, this.#events[mid]) < 0 ? high = mid : low = mid + 1;
        }

        const endEvent = this.#events[low];
        const startEvent = this.#events[low - 1];
        const startPos = startEvent.getMeasureIndex() + startEvent.getMeasureProgress();
        const endPos = endEvent.getMeasureIndex() + endEvent.getMeasureProgress();
        const targetPos = measureIndex + measureProgress;
        const duration = endPos - startPos;
        const progress = duration <= 0 ? 1 : (targetPos - startPos) / duration;
        const easedProgress = this.#applyEase(endEvent.getEase(), progress);
        const startValue = typeof startEvent.getFullValue === 'function' ? startEvent.getFullValue() : startEvent.getValue();
        const endValue = typeof endEvent.getFullValue === 'function' ? endEvent.getFullValue() : endEvent.getValue();

        return this.#interpolate(startValue, endValue, easedProgress, type);
    }

    insert(event) {
        if (typeof event?.getMeasureIndex !== 'function' || typeof event?.getMeasureProgress !== 'function') {
            throw new TypeError('Object must implement getMeasureIndex() and getMeasureProgress()');
        }
        let low = 0, high = this.#events.length;
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            this.#compare(event, this.#events[mid]) < 0 ? high = mid : low = mid + 1;
        }
        this.#events.splice(low, 0, event);
    }

    toArray() { return [...this.#events]; }
    at(index) { return this.#events[index]; }
    get length() { return this.#events.length; }
    remove(event) {
        const index = this.#events.indexOf(event);
        if (index > -1) {
            this.#events.splice(index, 1);
            return true;
        }
        return false;
    }
}