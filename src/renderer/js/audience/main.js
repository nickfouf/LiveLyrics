import {initDOM, DOM} from './dom.js';
import {DomManager} from '../renderer/domManager.js';
import {TimelineManager} from '../renderer/timeline/TimelineManager.js';
import {state, updateState} from '../editor/state.js';
import {
    deserializeElement,
    buildMeasureMap,
    buildLyricsTimingMap,
    findActiveTransition,
    findVirtualElementById
} from '../editor/utils.js';
import {getQuarterNoteDurationMs, rebuildAllEventTimelines, reprogramAllPageTransitions} from '../player/events.js';
import {fontLoader} from '../renderer/fontLoader.js';
import {MirrorManager} from '../mirror.js';

// --- State-based Synchronization ---
let animationFrameId = null;
let isRenderingActive = true; // NEW: Rendering Control Flag

let localPlaybackState = {
    status: 'unloaded',
    timeAtReference: 0,
    referenceTime: 0,
    referenceTimeOffset: 0,
    song: null,
    latency: 0,
};
let activeInterpolation = null;

function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

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
    if (isRenderingActive) animationFrameId = requestAnimationFrame(renderLoop);
}

function stopRenderLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function renderLoop() {
    if (!isRenderingActive) {
        stopRenderLoop();
        return;
    }

    let currentTime;
    const now = performance.now();

    if (activeInterpolation) {
        const elapsed = now - activeInterpolation.localStartTime;
        const progress = easeInOutQuad(Math.min(1, elapsed / activeInterpolation.duration));

        if (activeInterpolation.isPausing) {
            currentTime = activeInterpolation.startMs + (activeInterpolation.endMs - activeInterpolation.startMs) * progress;
            if (elapsed >= activeInterpolation.duration) {
                renderFrameAtTime(activeInterpolation.endMs);
                activeInterpolation = null;
                stopRenderLoop();
                return;
            }
        } else {
            const authoritativeTime = getAuthoritativeTime();
            const remainingOffset = activeInterpolation.initialOffset * (1 - progress);
            currentTime = authoritativeTime - remainingOffset;
            const interpolatedBpm = activeInterpolation.startBpm + (activeInterpolation.endBpm - activeInterpolation.startBpm) * progress;
            if (state.song.bpm !== interpolatedBpm) updateState({song: {...state.song, bpm: interpolatedBpm}});

            if (elapsed >= activeInterpolation.duration) {
                activeInterpolation = null;
                if (state.song.bpm !== localPlaybackState.song.bpm) updateState({
                    song: {
                        ...state.song,
                        bpm: localPlaybackState.song.bpm
                    }
                });
            }
        }
    } else {
        if (localPlaybackState.status !== 'playing') {
            stopRenderLoop();
            return;
        }
        currentTime = getAuthoritativeTime();
    }

    if (currentTime !== undefined) renderFrameAtTime(currentTime);
    animationFrameId = requestAnimationFrame(renderLoop);
}

function renderFrameAtTime(timeInMs) {
    if (!state.song || !state.song.thumbnailPage) return;
    const beatDurationMs = getQuarterNoteDurationMs();
    const currentBeats = beatDurationMs > 0 ? timeInMs / beatDurationMs : 0;
    const measureMap = state.timelineManager.getMeasureMap();

    if (measureMap.length === 0) {
        updateVisiblePagesForTime(0);
        state.timelineManager.renderAt(0, 0);
        return;
    }

    let measureIndex = measureMap.findIndex(m => currentBeats >= m.startTime && currentBeats < m.startTime + m.duration);
    if (measureIndex === -1) {
        const totalDuration = measureMap.at(-1).startTime + measureMap.at(-1).duration;
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
                // ADDED: Sync playback state for the newly added page so A/V triggers correctly
                page.handlePlaybackStateChange(state.playback.isPlaying);
                shouldResize = true;
            }
        } else {
            state.domManager.removeFromDom(page);
        }
    }
    if (shouldResize && state.timelineManager) state.timelineManager.resize(true);
}

function setActivePage_Audience(newPage) {
    if (!newPage || state.activePage === newPage) return;
    updateState({activePage: newPage});
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
        handleSongUnload();
        return;
    }
    if (state.domManager) state.domManager.clear();
    const thumbnailPage = deserializeElement(songData.thumbnailPage);
    const pages = songData.pages.map(p => deserializeElement(p));
    pages.forEach((page, index) => {
        const pageData = songData.pages[index];
        if (pageData.musicElementsOrder) {
            const orderedElements = pageData.musicElementsOrder.map(id => findVirtualElementById(page, id)).filter(Boolean);
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

    if (songData.fonts) fontLoader.loadFonts(songData.fonts);

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
    activeInterpolation = null;
    if (state.domManager) state.domManager.clear();
    fontLoader.clear();
    updateState({song: null, activePage: null});
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

    const visualTimeBeforeUpdate = getAuthoritativeTime();

    localPlaybackState.status = newState.status;
    localPlaybackState.timeAtReference = newState.timeAtReference;
    localPlaybackState.referenceTime = newState.referenceTime;
    localPlaybackState.referenceTimeOffset = performance.now() - newState.syncTime;
    localPlaybackState.latency = newState.latency || 0;
    if (newState.song) localPlaybackState.song = newState.song;

    activeInterpolation = null;

    if (state.song && newState.song) {
        const newBpm = newState.song.bpm;
        const newBpmUnit = newState.song.bpmUnit;
        if (!newState.interpolation && (state.song.bpm !== newBpm || state.song.bpmUnit !== newBpmUnit)) {
            updateState({song: {...state.song, bpm: newBpm, bpmUnit: newBpmUnit}});
            rebuildAllEventTimelines();
            reprogramAllPageTransitions();
        }
    }

    // NEW: Update global state
    const isPlaying = newState.status === 'playing' || !!newState.interpolationOnPause;
    updateState({ playback: { ...state.playback, isPlaying } });
    state.timelineManager.notifyPlaybackState(isPlaying);

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

// --- Role Handling ---
function handleRoleUpdate({role, sourceId}) {
    console.log(`[Audience] Role changed to: ${role}`);

    if (role === 'mirror') {
        // 1. Disable Rendering Loop
        isRenderingActive = false;
        stopRenderLoop();

        // 2. Clear DOM to free resources
        if (state.song) {
            switchVisiblePages(new Set());
        } else if (state.domManager) {
            state.domManager.clear();
        }

        // 3. Hide DOM Container, Show Video
        if (DOM.pageContainer) DOM.pageContainer.style.visibility = 'hidden';
        if (sourceId) {
            MirrorManager.startStream(sourceId, 'mirror-video');
        }
    } else {
        // Master Renderer

        // 1. Stop Video Stream
        MirrorManager.stopStream('mirror-video');

        // 2. Re-enable Rendering
        isRenderingActive = true;
        if (DOM.pageContainer) DOM.pageContainer.style.visibility = 'visible';

        // 3. Force Immediate Render to repopulate DOM
        if (state.song) {
            const time = getAuthoritativeTime();
            renderFrameAtTime(time);
        }

        if (state.timelineManager) state.timelineManager.resize(true);

        if (localPlaybackState.status === 'playing') {
            startRenderLoop();
        }
    }
}

// --- Main Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initDOM();
    const domManager = new DomManager(DOM.pageContainer);
    const timelineManager = new TimelineManager();
    timelineManager.setDomManager(domManager);
    updateState({domManager, timelineManager});

    const slideObserver = new ResizeObserver(() => {
        if (state.timelineManager) state.timelineManager.resize(false);
    });
    if (DOM.presentationSlide) slideObserver.observe(DOM.presentationSlide);

    fontLoader.onFontsLoaded(() => {
        if (state.timelineManager) state.timelineManager.resize(true);
    });

    window.audienceAPI.onPlaybackUpdate(async (newState) => {
        await handlePlaybackUpdate(newState);
    });

    // NEW: Handle Role Updates
    window.audienceAPI.onSetRole((data) => handleRoleUpdate(data));
});

