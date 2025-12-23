import { state, updateState } from '../editor/state.js';
import { DOM } from './dom.js';
import { buildMeasureMap, findActiveTransition } from '../editor/utils.js';
import { setActivePage_Player } from './pageManager.js';
import { getQuarterNoteDurationMs, rebuildAllEventTimelines, reprogramAllPageTransitions } from './events.js';
import { handleSongActivated, handleSongUnloaded, songPlaylist } from './songsManager.js';

// --- State-based Synchronization ---
let animationFrameId = null;
export let localPlaybackState = {
    status: 'unloaded',
    timeAtReference: 0,
    referenceTime: 0,
    referenceTimeOffset: 0,
    song: null, // To store the authoritative song state from main
    latency: 0,
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
    // CORRECTED LOGIC:
    // 1. Get the renderer's current time: performance.now()
    // 2. Sync it with the main process's clock: (performance.now() - localPlaybackState.referenceTimeOffset)
    // 3. Add the latency to "look ahead" in time: (... + localPlaybackState.latency)
    const syncedNow = (performance.now() - localPlaybackState.referenceTimeOffset) + localPlaybackState.latency;
    const elapsed = syncedNow - localPlaybackState.referenceTime;
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
    let currentTime;
    const now = performance.now();

    if (activeInterpolation) {
        const elapsed = now - activeInterpolation.localStartTime;
        const progress = easeInOutQuad(Math.min(1, elapsed / activeInterpolation.duration));

        if (activeInterpolation.isPausing) {
            // Handle the new pause interpolation
            currentTime = activeInterpolation.startMs + (activeInterpolation.endMs - activeInterpolation.startMs) * progress;

            if (elapsed >= activeInterpolation.duration) {
                // Interpolation is finished. Render the final frame and stop.
                renderFrameAtTime(activeInterpolation.endMs);
                activeInterpolation = null;
                stopRenderLoop();
                return; // Exit the loop function
            }
        } else {
            // Handle syncBeat interpolation (the normal 'playing' interpolation)
            const authoritativeTime = getAuthoritativeTime();
            const remainingOffset = activeInterpolation.initialOffset * (1 - progress);
            currentTime = authoritativeTime - remainingOffset;

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
        }
    } else {
        // This part runs only for normal 'playing' status without any interpolation.
        if (localPlaybackState.status !== 'playing') {
            stopRenderLoop();
            return;
        }
        currentTime = getAuthoritativeTime();
    }

    // This block was outside the 'else' but should be inside for the normal playing case.
    // And for the interpolation case, it's handled inside the if block.
    // Let's refactor slightly.

    if (currentTime === undefined) {
        // This can happen if the loop is called when it shouldn't be.
        // Let's add a guard.
        if (localPlaybackState.status !== 'playing' && !activeInterpolation) {
            stopRenderLoop();
            return;
        }
        // If we are here, it means it's a normal playing state.
        currentTime = getAuthoritativeTime();
    }


    const measureMap = state.timelineManager.getMeasureMap();
    const beatDurationMs = getQuarterNoteDurationMs();
    const totalDurationBeats = measureMap.length > 0 ? measureMap.at(-1).startTime + measureMap.at(-1).duration : 0;
    const totalDurationMs = totalDurationBeats * beatDurationMs;
    if (totalDurationMs > 0 && currentTime >= totalDurationMs) {
        renderFrameAtTime(totalDurationMs);
        stopRenderLoop();
        const timestamp = performance.timeOrigin + performance.now();
        window.playerAPI.pause({ timeOverride: totalDurationMs, timestamp: timestamp });
        return;
    }
    updateState({ playback: { ...state.playback, timeAtPause: currentTime } });
    renderFrameAtTime(currentTime);
    animationFrameId = requestAnimationFrame(renderLoop);
}

function renderFrameAtTime(timeInMs) {
    if (!state.song || !state.song.thumbnailPage) return;
    const beatDurationMs = getQuarterNoteDurationMs();
    const rawBeats = beatDurationMs > 0 ? timeInMs / beatDurationMs : 0;
    
    // --- FIX: Added EPSILON to correct floating point drift ---
    const EPSILON = 0.0001;
    const currentBeats = rawBeats + EPSILON;

    const measureMap = state.timelineManager.getMeasureMap();

    if (measureMap.length === 0) {
        // If there are no measures, render a "zero" state and update UI accordingly.
        updateVisiblePagesForTime(0);
        state.timelineManager.renderAt(0, 0);
        updateTimelineUI({ measureIndex: 0, totalDurationBeats: 0, currentBeats: 0 });
        return;
    }

    const totalDurationBeats = measureMap.at(-1).startTime + measureMap.at(-1).duration;
    let measureIndex = measureMap.findIndex(m => currentBeats >= m.startTime && currentBeats < m.startTime + m.duration);
    if (measureIndex === -1) {
        // If past the end, snap to the last measure. Otherwise (if before the start), snap to the first.
        measureIndex = (currentBeats >= totalDurationBeats) ? measureMap.length - 1 : 0;
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

/**
 * ADDED: Centralized function to update the state of all player controls.
 * @param {object} playbackState - The current playback state from the main process.
 */
export function updatePlayerControlsUI(playbackState) {
    const hasSong = playbackState.status !== 'unloaded';
    const hasMeasures = hasSong && buildMeasureMap().length > 0;
    const isSyncedMode = playbackState.type === 'synced';
    const isPlaying = playbackState.status === 'playing';

    // --- REVISED: Normal Playback Controls Logic ---
    // Enabled if there are measures AND (it's paused OR it's not in synced mode).
    const enableNormalControls = hasMeasures && (playbackState.status === 'paused' || !isSyncedMode);
    DOM.playPauseBtn.disabled = !enableNormalControls;
    DOM.backwardBtn.disabled = !enableNormalControls;
    DOM.forwardBtn.disabled = !enableNormalControls;

    // Set play/pause icon state only if controls are relevant
    if (enableNormalControls) {
        DOM.playPauseBtn.classList.toggle('is-playing', isPlaying);
    } else {
        DOM.playPauseBtn.classList.remove('is-playing');
    }

    // --- BPM Controls ---
    const bpmValueInput = document.getElementById('bpm-value-input');
    const bpmNoteSelect = document.getElementById('bpm-note-select-custom');
    if (bpmValueInput && bpmNoteSelect) {
        // BPM controls follow the same logic as the playback buttons.
        const enableBpmControls = enableNormalControls;
        bpmValueInput.disabled = !enableBpmControls;
        bpmNoteSelect.querySelector('.select-selected').setAttribute('tabindex', enableBpmControls ? '0' : '-1');

        // Update BPM display from state
        if (hasSong && playbackState.song) { // Added check for playbackState.song
            bpmValueInput.value = playbackState.song.bpm || 120;
            const selectedDiv = bpmNoteSelect.querySelector('.select-selected');
            const optionDiv = bpmNoteSelect.querySelector(`.select-items div[data-value="${playbackState.song.bpmUnit || 'q_note'}"]`);
            if (optionDiv) {
                selectedDiv.dataset.value = playbackState.song.bpmUnit || 'q_note';
                selectedDiv.innerHTML = optionDiv.innerHTML;
            }
        } else {
            bpmValueInput.value = 120;
        }
    }

    // --- Page Thumbnail Controls ---
    // Add a 'disabled' class to the container when playing.
    // You will need to add CSS to handle this class, e.g.:
    // .page-thumbnails-container.disabled .page-thumbnail { pointer-events: none; opacity: 0.6; }
    if (DOM.pageThumbnailsContainer) {
        DOM.pageThumbnailsContainer.classList.toggle('disabled', isPlaying);
    }
}


export async function handlePlaybackUpdate(newState) {
    const currentSongId = state.song ? state.song.id : null;
    const newSongId = newState.song ? newState.song.id : null;

    if (newState.status === 'unloaded') {
        handleSongUnloaded();
        updatePlayerControlsUI(newState); // ADDED: Update UI on unload
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

    // Capture the visual time right before we update our authoritative state.
    const visualTimeBeforeUpdate = getAuthoritativeTime();

    // Always update the authoritative state tracker first.
    localPlaybackState.status = newState.status;
    localPlaybackState.timeAtReference = newState.timeAtReference;
    localPlaybackState.referenceTime = newState.referenceTime;
    localPlaybackState.referenceTimeOffset = performance.now() - newState.syncTime;
    localPlaybackState.latency = newState.latency || 0;
    if (newState.song) {
        localPlaybackState.song = newState.song;
    }

    // Clear any previous interpolation state
    activeInterpolation = null;

    // Update the rendering state's BPM unless a syncBeat interpolation is about to start
    if (state.song && newState.song) {
        const newBpm = newState.song.bpm;
        const newBpmUnit = newState.song.bpmUnit;
        if (!newState.interpolation && (state.song.bpm !== newBpm || state.song.bpmUnit !== newBpmUnit)) {
            updateState({ song: { ...state.song, bpm: newBpm, bpmUnit: newBpmUnit } });
            rebuildAllEventTimelines();
            reprogramAllPageTransitions();
        }
    }

    // --- REVISED: Centralize all UI updates ---
    updatePlayerControlsUI(newState);

    // Update global state for other parts of the app
    const isPlaying = newState.status === 'playing' || !!newState.interpolationOnPause;
    updateState({ playback: { ...state.playback, isPlaying } });
    state.timelineManager.notifyPlaybackState(isPlaying);


    // Now, decide if we need to start the render loop based on special instructions
    if (newState.interpolationOnPause) {
        activeInterpolation = {
            localStartTime: performance.now(),
            duration: newState.interpolationOnPause.duration,
            startMs: newState.interpolationOnPause.startMs,
            endMs: newState.interpolationOnPause.endMs,
            isPausing: true,
        };
        startRenderLoop();
    } else if (newState.type === 'synced' && newState.interpolation) {
        const authoritativeTimeNow = getAuthoritativeTime();
        const offset = authoritativeTimeNow - visualTimeBeforeUpdate;

        activeInterpolation = {
            localStartTime: performance.now(),
            duration: newState.interpolation.duration,
            initialOffset: offset,
            startBpm: state.song.bpm,
            endBpm: newState.interpolation.endBpm,
            isPausing: false,
        };
        startRenderLoop();
    } else {
        if (newState.status === 'playing') {
            startRenderLoop();
        } else {
            stopRenderLoop();
            renderFrameAtTime(newState.timeAtReference);
        }
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
    const rawBeats = beatDurationMs > 0 ? currentTime / beatDurationMs : 0;
    
    // --- FIX: Added EPSILON to correct floating point drift ---
    const EPSILON = 0.0001;
    const currentBeats = rawBeats + EPSILON;

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

/**
 * Jumps the timeline to the beginning of a specific page.
 * @param {VirtualPage} newPage The page to jump to.
 */
export function jumpToPage_Player(newPage) {
    const newPageIndex = state.song.pages.indexOf(newPage);
    if (newPageIndex === -1 && newPage !== state.song.thumbnailPage) return;

    setActivePage_Player(newPage);

    const measureMap = buildMeasureMap();
    const firstMeasureOfPage = measureMap.find(m => m.pageIndex === newPageIndex);

    let timeOfNewPageInBeats = 0;
    if (firstMeasureOfPage) {
        timeOfNewPageInBeats = firstMeasureOfPage.startTime;
    } else if (newPageIndex > 0) { // If jumping to a page with no measures, go to the end of the previous page
        const lastMeasureBeforePage = [...measureMap].reverse().find(m => m.pageIndex < newPageIndex);
        if (lastMeasureBeforePage) {
            timeOfNewPageInBeats = lastMeasureBeforePage.startTime + lastMeasureBeforePage.duration;
        }
    }

    const beatDurationMs = getQuarterNoteDurationMs();
    const newTimeAtPause = timeOfNewPageInBeats * beatDurationMs;

    updateState({
        playback: {
            ...state.playback,
            timeAtPause: newTimeAtPause
        }
    });

    const timestamp = performance.timeOrigin + performance.now();
    window.playerAPI.jumpToTime(newTimeAtPause, timestamp);
}




