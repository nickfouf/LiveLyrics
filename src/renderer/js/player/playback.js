import { state, updateState } from '../editor/state.js';
import { DOM } from './dom.js';
import { buildMeasureMap, findActiveTransition } from '../editor/utils.js';
import { setActivePage_Player } from './pageManager.js';
import { getQuarterNoteDurationMs, rebuildAllEventTimelines, reprogramAllPageTransitions } from './events.js';
import { handleSongActivated, handleSongUnloaded, songPlaylist } from './songsManager.js';

// --- State-based Synchronization ---
let animationFrameId = null;
let localPlaybackState = {
    status: 'unloaded',
    timeAtReference: 0,
    referenceTime: 0,
    referenceTimeOffset: 0,
    song: null, // To store the authoritative song state from main
};
// State for handling smooth tempo interpolation
let activeInterpolation = null;

function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * Calculates the current time based on the authoritative state from the main process.
 * This represents the "true" timeline position without any interpolation.
 */
function getAuthoritativeTime() {
    if (!state.song || localPlaybackState.status !== 'playing') {
        return localPlaybackState.timeAtReference;
    }
    const mainNow = performance.now() - localPlaybackState.referenceTimeOffset;
    const elapsed = mainNow - localPlaybackState.referenceTime;
    return localPlaybackState.timeAtReference + elapsed;
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

function renderLoop() {
    if (localPlaybackState.status !== 'playing') {
        stopRenderLoop();
        return;
    }

    let currentTime;
    const now = performance.now();

    if (activeInterpolation) {
        const elapsed = now - activeInterpolation.localStartTime;
        const progress = easeInOutQuad(Math.min(1, elapsed / activeInterpolation.duration));

        // The authoritative time is our moving target.
        const authoritativeTime = getAuthoritativeTime();

        // The remaining offset to correct for shrinks over time.
        const remainingOffset = activeInterpolation.initialOffset * (1 - progress);

        // Our rendered time is the target minus the shrinking offset.
        currentTime = authoritativeTime - remainingOffset;

        // Interpolate BPM as well for smooth visual feedback.
        const interpolatedBpm = activeInterpolation.startBpm + (activeInterpolation.endBpm - activeInterpolation.startBpm) * progress;
        if (state.song.bpm !== interpolatedBpm) {
            updateState({ song: { ...state.song, bpm: interpolatedBpm } });
        }

        if (elapsed >= activeInterpolation.duration) {
            activeInterpolation = null;
            // Final sync to ensure the rendering state's BPM matches the authoritative one.
            if (state.song.bpm !== localPlaybackState.song.bpm) {
                updateState({ song: { ...state.song, bpm: localPlaybackState.song.bpm } });
            }
        }
    } else {
        // No interpolation, just use the authoritative time.
        currentTime = getAuthoritativeTime();
    }

    const measureMap = state.timelineManager.getMeasureMap();
    const beatDurationMs = getQuarterNoteDurationMs();
    const totalDurationBeats = measureMap.length > 0 ? measureMap.at(-1).startTime + measureMap.at(-1).duration : 0;
    const totalDurationMs = totalDurationBeats * beatDurationMs;
    if (totalDurationMs > 0 && currentTime >= totalDurationMs) {
        renderFrameAtTime(totalDurationMs);
        stopRenderLoop();
        window.playerAPI.pause({ timeOverride: totalDurationMs, timestamp: performance.timeOrigin + performance.now() });
        return;
    }
    updateState({ playback: { ...state.playback, timeAtPause: currentTime } });
    renderFrameAtTime(currentTime);
    animationFrameId = requestAnimationFrame(renderLoop);
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

export async function handlePlaybackUpdate(newState) {
    const currentSongId = state.song ? state.song.id : null;
    const newSongId = newState.song ? newState.song.id : null;

    if (newState.status === 'unloaded') {
        activeInterpolation = null; // Clear any running interpolation
        handleSongUnloaded();
        return;
    }

    if (newSongId !== currentSongId) {
        const songFromPlaylist = songPlaylist.find(s => s.id === newSongId);
        if (songFromPlaylist) {
            await handleSongActivated(newState.song, songFromPlaylist.songData);
        } else {
            console.error(`Player received instruction to load song ID ${newSongId}, but it was not found in the playlist.`);
            handleSongUnloaded();
            return;
        }
    }

    // --- REVISED: Handle interpolation for synced playback ---
    if (newState.type === 'synced' && newState.interpolation) {
        // Capture the visual time right before we update our authoritative state.
        const visualTimeBeforeUpdate = getAuthoritativeTime();

        // Update the authoritative state tracker FIRST.
        localPlaybackState.timeAtReference = newState.timeAtReference;
        localPlaybackState.referenceTime = newState.referenceTime;
        localPlaybackState.referenceTimeOffset = performance.now() - newState.syncTime;

        // Now, calculate the authoritative time at this exact moment.
        const authoritativeTimeNow = getAuthoritativeTime();
        const offset = authoritativeTimeNow - visualTimeBeforeUpdate;

        activeInterpolation = {
            localStartTime: performance.now(),
            duration: newState.interpolation.duration,
            initialOffset: offset,
            startBpm: state.song.bpm, // The BPM we were just rendering with.
            endBpm: newState.interpolation.endBpm,
        };
    } else {
        activeInterpolation = null;
    }

    // Always update the rest of the authoritative state.
    localPlaybackState.status = newState.status;
    if (!activeInterpolation) { // Don't overwrite if we just set it above
        localPlaybackState.timeAtReference = newState.timeAtReference;
        localPlaybackState.referenceTime = newState.referenceTime;
        localPlaybackState.referenceTimeOffset = performance.now() - newState.syncTime;
    }
    if (newState.song) {
        localPlaybackState.song = newState.song;
    }

    const isPlaying = newState.status === 'playing';
    updateState({ playback: { ...state.playback, isPlaying } });
    DOM.playPauseBtn.classList.toggle('is-playing', isPlaying);
    state.timelineManager.notifyPlaybackState(isPlaying);

    if (state.song && newState.song) {
        const newBpm = newState.song.bpm;
        const newBpmUnit = newState.song.bpmUnit;
        // Only update the rendering state's BPM if not interpolating.
        if (!activeInterpolation && (state.song.bpm !== newBpm || state.song.bpmUnit !== newBpmUnit)) {
            updateState({ song: { ...state.song, bpm: newBpm, bpmUnit: newBpmUnit } });
            rebuildAllEventTimelines();
            reprogramAllPageTransitions();
        }
    }

    if (isPlaying) {
        startRenderLoop();
    } else {
        stopRenderLoop();
        renderFrameAtTime(newState.timeAtReference);
    }
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

function jumpMeasure(direction) {
    if (!state.song || !state.timelineManager) return;
    const measureMap = state.timelineManager.getMeasureMap();
    if (measureMap.length === 0) return;
    const beatDurationMs = getQuarterNoteDurationMs();
    const currentTime = getAuthoritativeTime(); // Use authoritative time for jumps
    const currentBeats = beatDurationMs > 0 ? currentTime / beatDurationMs : 0;
    const totalDurationBeats = measureMap.at(-1).startTime + measureMap.at(-1).duration;
    let currentMeasureIndex = measureMap.findIndex(m => currentBeats >= m.startTime && currentBeats < m.startTime + m.duration);

    const timestamp = performance.timeOrigin + performance.now();

    if (currentBeats >= totalDurationBeats) {
        if (direction > 0) {
            const newTimeInMs = (totalDurationBeats * beatDurationMs) - 1;
            window.playerAPI.jumpToTime(Math.max(0, newTimeInMs), timestamp);
        } else {
            const newTimeInBeats = measureMap.at(-1).startTime;
            window.playerAPI.jumpToTime(newTimeInBeats * beatDurationMs, timestamp);
        }
        return;
    }

    if (currentMeasureIndex === -1 && currentBeats < measureMap[0].startTime) {
        if (direction > 0) window.playerAPI.jumpToTime(0, timestamp);
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
    window.playerAPI.jumpToTime(newTimeInMs, timestamp);
}

export function initPlayerPlayback() {
    DOM.playPauseBtn.addEventListener('click', () => {
        if (!state.song || !buildMeasureMap().length > 0) return;
        const timestamp = performance.timeOrigin + performance.now();
        if (localPlaybackState.status === 'playing') {
            window.playerAPI.pause({ timestamp });
        } else {
            window.playerAPI.play(timestamp);
        }
    });
    DOM.forwardBtn.addEventListener('click', () => jumpMeasure(1));
    DOM.backwardBtn.addEventListener('click', () => jumpMeasure(-1));
}