import { state, updateState } from '../editor/state.js';
import { DOM } from './dom.js';
import { buildMeasureMap, findActiveTransition } from '../editor/utils.js';
import { setActivePage_Player } from './pageManager.js';
// MODIFIED: Import from the new, leaner player-specific events file.
import { getQuarterNoteDurationMs, rebuildAllEventTimelines, reprogramAllPageTransitions } from './events.js';

// --- Event-driven State Management ---
let eventHistory = [];
let animationFrameId = null;

/**
 * Calculates the current playback time in milliseconds by tracking the musical position in beats,
 * which correctly handles variable BPM during playback.
 * @param {Array} history The event history array.
 * @param {object} song The current song object containing base BPM info.
 * @returns {{currentTime: number, isPlaying: boolean}}
 */
function calculateCurrentTime(history, song) {
    if (!song || !history || history.length === 0) {
        return { currentTime: 0, isPlaying: false };
    }

    const lastPlayOrPause = [...history].reverse().find(e => e.type === 'play' || e.type === 'pause');
    const isPlaying = lastPlayOrPause ? lastPlayOrPause.type === 'play' : false;

    let musicalTimeInBeats = 0;
    let lastTimestamp = 0; // Wall-clock time of the last event. 0 if paused.
    let currentBpmConfig = { bpm: song.bpm, bpmUnit: song.bpmUnit }; // Start with song's base BPM.

    // Process history chronologically
    for (const event of history) {
        // If playing, add the beats that have passed since the last event.
        if (lastTimestamp > 0) {
            const elapsedWallTime = event.timestamp - lastTimestamp;
            const beatDuration = getQuarterNoteDurationMs(currentBpmConfig);
            if (beatDuration > 0) {
                musicalTimeInBeats += elapsedWallTime / beatDuration;
            }
        }

        // Now, update the state based on the event itself.
        switch (event.type) {
            case 'play':
                // A 'play' event's time is relative to the BPM at that moment.
                const beatDurationAtPlay = getQuarterNoteDurationMs(currentBpmConfig);
                musicalTimeInBeats = beatDurationAtPlay > 0 ? event.timeAtStart / beatDurationAtPlay : 0;
                lastTimestamp = event.timestamp; // Start the clock
                break;
            case 'pause':
                // A 'pause' event's time is relative to the BPM at that moment.
                const beatDurationAtPause = getQuarterNoteDurationMs(currentBpmConfig);
                musicalTimeInBeats = beatDurationAtPause > 0 ? event.timeAtPause / beatDurationAtPause : 0;
                lastTimestamp = 0; // Stop the clock
                break;
            case 'jump':
                // A 'jump' event's time is relative to the BPM at that moment.
                const beatDurationAtJump = getQuarterNoteDurationMs(currentBpmConfig);
                musicalTimeInBeats = beatDurationAtJump > 0 ? event.timeInMs / beatDurationAtJump : 0;
                if (isPlaying) {
                    lastTimestamp = event.timestamp; // Reset the clock's reference point
                }
                break;
            case 'update-bpm':
                // The musical time in beats does not change when BPM is updated.
                // We just update the config for the *next* interval.
                currentBpmConfig = { bpm: event.bpm, bpmUnit: event.bpmUnit };
                break;
        }
    }

    // If still playing after the last event, add the final elapsed time.
    if (isPlaying && lastTimestamp > 0) {
        const finalElapsedWallTime = Date.now() - lastTimestamp;
        const finalBeatDuration = getQuarterNoteDurationMs(currentBpmConfig);
        if (finalBeatDuration > 0) {
            musicalTimeInBeats += finalElapsedWallTime / finalBeatDuration;
        }
    }

    // Convert the final musical position back to milliseconds using the final active BPM.
    const finalBeatDuration = getQuarterNoteDurationMs(currentBpmConfig);
    const finalCurrentTime = musicalTimeInBeats * finalBeatDuration;

    return { currentTime: finalCurrentTime, isPlaying };
}

/**
 * The main state machine. Replays history to determine the correct current state and render it.
 */
function handleAndRender() {
    if (!state.song) {
        stopRenderLoop();
        return;
    }
    if (eventHistory.length === 0) {
        stopRenderLoop();
        renderFrameAtTime(0);
        return;
    }

    // --- 1. Sync local BPM state from event history ---
    let currentBpm = state.song.bpm;
    let currentBpmUnit = state.song.bpmUnit;
    for (const event of eventHistory) {
        if (event.type === 'update-bpm') {
            currentBpm = event.bpm;
            currentBpmUnit = event.bpmUnit;
        }
    }
    if (state.song.bpm !== currentBpm || state.song.bpmUnit !== currentBpmUnit) {
        updateState({ song: { ...state.song, bpm: currentBpm, bpmUnit: currentBpmUnit } });
        rebuildAllEventTimelines();
        reprogramAllPageTransitions();
    }

    // --- 2. Calculate final time using the new robust function ---
    const { currentTime, isPlaying } = calculateCurrentTime(eventHistory, state.song);

    // --- 3. Render the Final State ---
    updateState({ playback: { ...state.playback, isPlaying, timeAtPause: currentTime } });
    DOM.playPauseBtn.classList.toggle('is-playing', isPlaying);
    state.timelineManager.notifyPlaybackState(isPlaying);

    if (isPlaying) {
        startRenderLoop();
    } else {
        stopRenderLoop();
        renderFrameAtTime(currentTime);
    }
}

function renderLoop() {
    const { currentTime, isPlaying } = calculateCurrentTime(eventHistory, state.song);
    if (!isPlaying) {
        stopRenderLoop();
        renderFrameAtTime(currentTime); // Render one last frame at the paused position
        return;
    }

    const measureMap = state.timelineManager.getMeasureMap();
    const beatDurationMs = getQuarterNoteDurationMs();
    const totalDurationBeats = measureMap.length > 0 ? measureMap.at(-1).startTime + measureMap.at(-1).duration : 0;
    const totalDurationMs = totalDurationBeats * beatDurationMs;

    if (totalDurationMs > 0 && currentTime >= totalDurationMs) {
        renderFrameAtTime(totalDurationMs);
        stopRenderLoop();
        window.playerAPI.pause(totalDurationMs);
        return;
    }

    updateState({ playback: { ...state.playback, timeAtPause: currentTime } });
    renderFrameAtTime(currentTime);
    animationFrameId = requestAnimationFrame(renderLoop);
}

function startRenderLoop() {
    stopRenderLoop();
    animationFrameId = requestAnimationFrame(renderLoop);
}

function stopRenderLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function renderFrameAtTime(timeInMs) {
    if (!state.song || !state.song.thumbnailPage) return;
    const beatDurationMs = getQuarterNoteDurationMs();
    const currentBeats = beatDurationMs > 0 ? timeInMs / beatDurationMs : 0;
    const measureMap = state.timelineManager.getMeasureMap();
    const totalDurationBeats = measureMap.length > 0 ? measureMap.at(-1).startTime + measureMap.at(-1).duration : 0;
    let measureIndex = measureMap.findIndex(m => currentBeats >= m.startTime && currentBeats < m.startTime + m.duration);
    if (measureIndex === -1) {
        measureIndex = (totalDurationBeats > 0 && currentBeats >= totalDurationBeats) ? measureMap.length - 1 : 0;
    }
    const currentMeasure = measureMap[measureIndex];
    const timeIntoMeasureBeats = currentBeats - (currentMeasure?.startTime || 0);
    const measureProgress = currentMeasure?.duration > 0 ? timeIntoMeasureBeats / currentMeasure.duration : 0;
    updateVisiblePagesForTime(currentBeats);
    state.timelineManager.renderAt(measureIndex, measureProgress);
    updateTimelineUI({ measureIndex, totalDurationBeats, currentBeats });
}

function switchVisiblePages(activePagesSet) {
    const allPossiblePages = [state.song.thumbnailPage, ...state.song.pages].filter(Boolean);
    let shouldResize = false;
    for (const page of allPossiblePages) {
        if (activePagesSet.has(page)) {
            const wasAlreadyAdded = page.addedInDom;
            state.domManager.addToDom(page);
            if (!wasAlreadyAdded) shouldResize = true;
        } else {
            state.domManager.removeFromDom(page);
        }
    }
    if (shouldResize && state.timelineManager) state.timelineManager.resize(true);
}

function updateVisiblePagesForTime(musicalTimeInBeats) {
    const measureMap = state.timelineManager.getMeasureMap();
    const pages = state.song.pages;
    const pagesToKeepInDom = new Set();
    let currentMeasureIndex = measureMap.findIndex(m => musicalTimeInBeats >= m.startTime && musicalTimeInBeats < m.startTime + m.duration);
    if (currentMeasureIndex === -1 && measureMap.length > 0) {
        const totalDuration = measureMap.at(-1).startTime + measureMap.at(-1).duration;
        currentMeasureIndex = (musicalTimeInBeats >= totalDuration) ? measureMap.length - 1 : 0;
    }
    const currentMeasure = measureMap[currentMeasureIndex];
    if (currentMeasure) {
        const musicallyCurrentPageIndex = currentMeasure.pageIndex;
        if (musicallyCurrentPageIndex > -1) pagesToKeepInDom.add(pages[musicallyCurrentPageIndex]);
    }
    const activeTransition = findActiveTransition(musicalTimeInBeats, measureMap, pages);
    if (activeTransition) {
        if (activeTransition.fromPageIndex > -1) pagesToKeepInDom.add(pages[activeTransition.fromPageIndex]);
        else pagesToKeepInDom.add(state.song.thumbnailPage);
        if (activeTransition.toPageIndex > -1) pagesToKeepInDom.add(pages[activeTransition.toPageIndex]);
    } else {
        if (measureMap.length > 0 && musicalTimeInBeats < measureMap[0].startTime) {
            pagesToKeepInDom.clear();
            pagesToKeepInDom.add(state.song.thumbnailPage);
        } else if (measureMap.length === 0 && state.song.thumbnailPage) {
            pagesToKeepInDom.add(state.song.thumbnailPage);
        }
    }
    if (pagesToKeepInDom.size === 0 && state.activePage) pagesToKeepInDom.add(state.activePage);
    switchVisiblePages(pagesToKeepInDom);
    let pageIndexForUI = -1;
    if (activeTransition) {
        if (musicalTimeInBeats === 0 && activeTransition.fromPageIndex === -1) pageIndexForUI = -1;
        else pageIndexForUI = activeTransition.toPageIndex;
    } else if (currentMeasure) {
        pageIndexForUI = currentMeasure.pageIndex;
    }
    if (pageIndexForUI > -1) {
        if (pages[pageIndexForUI] !== state.activePage) setActivePage_Player(pages[pageIndexForUI]);
    } else {
        if (state.activePage !== state.song.thumbnailPage) setActivePage_Player(state.song.thumbnailPage);
    }
}

export function handlePlaybackEvent(event) {
    switch (event.type) {
        case 'load':
            eventHistory = [{ type: 'pause', timeAtPause: 0, timestamp: event.timestamp }];
            break;
        case 'unload':
            eventHistory = [];
            break;
        case 'play':
        case 'pause':
            eventHistory = [event];
            break;
        default:
            eventHistory.push(event);
            break;
    }
    console.log("Event History:", eventHistory);
    handleAndRender();
}

function updateTimelineUI({ measureIndex, totalDurationBeats, currentBeats }) {
    const timelineBar = document.querySelector('.timeline-bar');
    if (timelineBar) {
        const progress = timelineBar.querySelector('.timeline-progress');
        const text = timelineBar.querySelector('span');
        const progressPercent = totalDurationBeats > 0 ? (currentBeats / totalDurationBeats) * 100 : 0;
        progress.style.width = `${Math.min(100, progressPercent)}%`;
        const beatDurationMs = getQuarterNoteDurationMs();
        const measureMap = state.timelineManager.getMeasureMap();
        if (measureMap.length > 0 && measureMap[measureIndex]) {
            const currentMeasure = measureMap[measureIndex];
            const timeIntoMeasureBeats = currentBeats - currentMeasure.startTime;
            let beatInMeasure;
            let msProgressInBeat;
            if (currentBeats >= totalDurationBeats) {
                beatInMeasure = currentMeasure.duration;
                msProgressInBeat = beatDurationMs > 0 ? beatDurationMs - 1 : 0;
            } else {
                beatInMeasure = Math.floor(timeIntoMeasureBeats) + 1;
                msProgressInBeat = (timeIntoMeasureBeats - Math.floor(timeIntoMeasureBeats)) * beatDurationMs;
            }
            text.textContent = `${measureIndex + 1} | ${beatInMeasure} | ${String(Math.floor(msProgressInBeat)).padStart(4, '0')}`;
        } else {
            text.textContent = '- | - | ----';
        }
    }
}

function play() {
    const { currentTime } = calculateCurrentTime(eventHistory, state.song);
    const measureMap = state.timelineManager.getMeasureMap();
    const beatDurationMs = getQuarterNoteDurationMs();
    const totalDurationBeats = measureMap.length > 0 ? measureMap.at(-1).startTime + measureMap.at(-1).duration : 0;
    const totalDurationMs = totalDurationBeats * beatDurationMs;
    if (totalDurationMs > 0 && currentTime >= totalDurationMs) {
        window.playerAPI.jumpToTime(0);
    }
    window.playerAPI.play();
}

function pause() {
    window.playerAPI.pause();
}

function jumpMeasure(direction) {
    if (!state.song || !state.timelineManager) return;
    const measureMap = state.timelineManager.getMeasureMap();
    if (measureMap.length === 0) return;
    const beatDurationMs = getQuarterNoteDurationMs();
    const { currentTime } = calculateCurrentTime(eventHistory, state.song);
    const currentBeats = beatDurationMs > 0 ? currentTime / beatDurationMs : 0;
    const totalDurationBeats = measureMap.at(-1).startTime + measureMap.at(-1).duration;
    let currentMeasureIndex = measureMap.findIndex(m => currentBeats >= m.startTime && currentBeats < m.startTime + m.duration);
    if (currentBeats >= totalDurationBeats) {
        if (direction > 0) {
            const newTimeInMs = (totalDurationBeats * beatDurationMs) - 1;
            window.playerAPI.jumpToTime(Math.max(0, newTimeInMs));
        } else {
            const newTimeInBeats = measureMap.at(-1).startTime;
            window.playerAPI.jumpToTime(newTimeInBeats * beatDurationMs);
        }
        return;
    }
    if (currentMeasureIndex === -1 && currentBeats < measureMap[0].startTime) {
        if (direction > 0) window.playerAPI.jumpToTime(0);
        return;
    }
    if (currentMeasureIndex === -1) currentMeasureIndex = measureMap.length - 1;
    let newTimeInBeats;
    if (direction > 0) {
        if (currentMeasureIndex === measureMap.length - 1) newTimeInBeats = totalDurationBeats;
        else newTimeInBeats = measureMap[currentMeasureIndex + 1].startTime;
    } else {
        const currentMeasure = measureMap[currentMeasureIndex];
        const isAtStartOfMeasure = (currentBeats - currentMeasure.startTime) * beatDurationMs < 10;
        if (isAtStartOfMeasure && currentMeasureIndex > 0) newTimeInBeats = measureMap[currentMeasureIndex - 1].startTime;
        else newTimeInBeats = currentMeasure.startTime;
    }
    let newTimeInMs = newTimeInBeats * beatDurationMs;
    if (newTimeInBeats >= totalDurationBeats && newTimeInMs > 1) newTimeInMs -= 1;
    window.playerAPI.jumpToTime(newTimeInMs);
}

export function initPlayerPlayback() {
    DOM.playPauseBtn.addEventListener('click', () => {
        if (!state.song || !buildMeasureMap().length > 0) return;
        if (state.playback.isPlaying) pause();
        else play();
    });
    DOM.forwardBtn.addEventListener('click', () => jumpMeasure(1));
    DOM.backwardBtn.addEventListener('click', () => jumpMeasure(-1));
}