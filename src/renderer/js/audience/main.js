import { initDOM, DOM } from './dom.js';
import { DomManager } from '../renderer/domManager.js';
import { TimelineManager } from '../renderer/timeline/TimelineManager.js';
import { state, updateState } from '../editor/state.js';
import { deserializeElement, buildMeasureMap, buildLyricsTimingMap, findActiveTransition, findVirtualElementById } from '../editor/utils.js';
import { getQuarterNoteDurationMs, rebuildAllEventTimelines, reprogramAllPageTransitions } from '../player/events.js';
import { fontLoader } from '../renderer/fontLoader.js';

// --- State-based Synchronization ---
let animationFrameId = null;
let localPlaybackState = {
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

    if (currentTime !== undefined) {
        renderFrameAtTime(currentTime);
    }
    
    animationFrameId = requestAnimationFrame(renderLoop);
}

function renderFrameAtTime(timeInMs) {
    if (!state.song || !state.song.thumbnailPage) return;
    const beatDurationMs = getQuarterNoteDurationMs();
    const currentBeats = beatDurationMs > 0 ? timeInMs / beatDurationMs : 0;
    const measureMap = state.timelineManager.getMeasureMap();

    if (measureMap.length === 0) {
        // If there are no measures, we can't calculate musical time.
        // Just ensure the thumbnail page is visible and render a "zero" state.
        updateVisiblePagesForTime(0);
        state.timelineManager.renderAt(0, 0);
        return;
    }

    let measureIndex = measureMap.findIndex(m => currentBeats >= m.startTime && currentBeats < m.startTime + m.duration);
    if (measureIndex === -1) {
        const totalDuration = measureMap.at(-1).startTime + measureMap.at(-1).duration;
        // If past the end, snap to the last measure. Otherwise (if before the start), snap to the first.
        measureIndex = (currentBeats >= totalDuration) ? measureMap.length - 1 : 0;
    }

    const currentMeasure = measureMap[measureIndex];
    const timeIntoMeasureBeats = currentBeats - (currentMeasure?.startTime || 0);
    const measureProgress = currentMeasure?.duration > 0 ? timeIntoMeasureBeats / currentMeasure.duration : 0;
    updateVisiblePagesForTime(currentBeats);
    state.timelineManager.renderAt(measureIndex, measureProgress);
}

function switchVisiblePages(activePagesSet) {
    const allPossiblePages = [state.song.thumbnailPage, ...state.song.pages].filter(Boolean);
    let shouldResize = false;
    for (const page of allPossiblePages) {
        if (activePagesSet.has(page)) {
            const wasAlreadyAdded = page.addedInDom;
            state.domManager.addToDom(page);
            if (!wasAlreadyAdded) {
                shouldResize = true;
            }
        } else {
            state.domManager.removeFromDom(page);
        }
    }
    if (shouldResize && state.timelineManager) {
        state.timelineManager.resize(true);
    }
}

function setActivePage_Audience(newPage) {
    if (!newPage || state.activePage === newPage) return;
    updateState({ activePage: newPage });
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
        if (pages[pageIndexForUI] !== state.activePage) setActivePage_Audience(pages[pageIndexForUI]);
    } else {
        if (state.activePage !== state.song.thumbnailPage) setActivePage_Audience(state.song.thumbnailPage);
    }
}

async function handleSongLoad(songMetadata, songData) {
    if (!songMetadata || !songData) {
        console.error("Audience: Aborting song load due to invalid data.");
        handleSongUnload();
        return;
    }
    if(state.domManager) state.domManager.clear();
    const thumbnailPage = deserializeElement(songData.thumbnailPage);
    const pages = songData.pages.map(p => deserializeElement(p));
    pages.forEach((page, index) => {
        const pageData = songData.pages[index];
        if (pageData.musicElementsOrder) {
            const orderedElements = pageData.musicElementsOrder
                .map(id => findVirtualElementById(page, id))
                .filter(Boolean);
            page.setMusicElementsOrder(orderedElements);
        }
    });
    updateState({
        song: {
            id: songMetadata.id,
            title: songMetadata.title,
            filePath: songMetadata.filePath,
            thumbnailPage: thumbnailPage,
            pages: pages,
            bpm: songMetadata.bpm || 120,
            bpmUnit: songMetadata.bpmUnit || 'q_note',
            fonts: songData.fonts || {}
        },
        activePage: thumbnailPage,
    });

    // --- ADDED: Load Project Fonts ---
    // Use fontLoader to register the custom fonts provided in the song file
    if (songData.fonts) {
        fontLoader.loadFonts(songData.fonts);
    }

    rebuildAllEventTimelines();
    reprogramAllPageTransitions();
    const measureMap = buildMeasureMap();
    const lyricsTimingMap = buildLyricsTimingMap(measureMap);
    state.timelineManager.setLyricsTimingMap(lyricsTimingMap);
    state.timelineManager.setMeasureMap(measureMap);
    state.timelineManager.resize(true);
}

function handleSongUnload() {
    stopRenderLoop();
    activeInterpolation = null; // Clear any running interpolation
    if(state.domManager) state.domManager.clear();
    fontLoader.clear(); // ADDED: Clear fonts on unload
    updateState({ song: null, activePage: null });
}

async function handlePlaybackUpdate(newState) {
    const currentSongFilePath = state.song ? state.song.filePath : null;
    const newSongFilePath = newState.song ? newState.song.filePath : null;

    if (newState.status === 'unloaded') {
        if (currentSongFilePath !== null) handleSongUnload();
        return;
    }

    if (newSongFilePath !== currentSongFilePath) {
        try {
            const result = await window.audienceAPI.openProject(newSongFilePath);
            if (!result.success) throw new Error(result.error);
            await handleSongLoad(newState.song, result.data);
        } catch (error) {
            console.error(`Audience failed to load project from ${newSongFilePath}:`, error);
            handleSongUnload();
            return;
        }
    }

    // Capture the visual time right before we update our authoritative state.
    // This is only needed for syncBeat interpolation.
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

    // Now, decide if we need to start the render loop based on special instructions
    if (newState.interpolationOnPause) {
        // This is a special pause command that requires an animation.
        activeInterpolation = {
            localStartTime: performance.now(),
            duration: newState.interpolationOnPause.duration,
            startMs: newState.interpolationOnPause.startMs,
            endMs: newState.interpolationOnPause.endMs,
            isPausing: true, // A flag to tell the render loop what to do
        };
        startRenderLoop(); // Start the loop to perform the animation.
    } else if (newState.type === 'synced' && newState.interpolation) {
        // This is a sync beat command that requires interpolation.
        // Now, calculate the authoritative time at this exact moment with the NEW state.
        const authoritativeTimeNow = getAuthoritativeTime();
        const offset = authoritativeTimeNow - visualTimeBeforeUpdate;

        activeInterpolation = {
            localStartTime: performance.now(),
            duration: newState.interpolation.duration,
            initialOffset: offset,
            startBpm: state.song.bpm, // The BPM we were just rendering with.
            endBpm: newState.interpolation.endBpm,
            isPausing: false,
        };
        startRenderLoop();
    } else {
        // This is a normal state update.
        if (newState.status === 'playing') {
            startRenderLoop();
        } else {
            stopRenderLoop();
            renderFrameAtTime(newState.timeAtReference);
        }
    }
}

// --- Main Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initDOM();
    const domManager = new DomManager(DOM.pageContainer);
    const timelineManager = new TimelineManager();
    timelineManager.setDomManager(domManager);
    updateState({ domManager, timelineManager });
    const slideObserver = new ResizeObserver(() => {
        if (state.timelineManager) state.timelineManager.resize(false);
    });
    if (DOM.presentationSlide) slideObserver.observe(DOM.presentationSlide);

    // --- ADDED: Listen for font load completion ---
    // This ensures that when fonts are ready (via fontLoader),
    // we trigger a re-calculation of the layout metrics.
    fontLoader.onFontsLoaded(() => {
        console.log('[Audience] Fonts loaded. Triggering re-render.');
        if (state.timelineManager) {
            state.timelineManager.resize(true);
        }
    });

    // --- UNIFIED IPC Listeners ---
    window.audienceAPI.onPlaybackUpdate(async (newState) => {
        await handlePlaybackUpdate(newState);
    });
});

