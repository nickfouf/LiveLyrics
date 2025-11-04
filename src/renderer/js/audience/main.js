import { initDOM, DOM } from './dom.js';
import { DomManager } from '../renderer/domManager.js';
import { TimelineManager } from '../renderer/timeline/TimelineManager.js';
import { state, updateState } from '../editor/state.js';
import { deserializeElement, buildMeasureMap, buildLyricsTimingMap, findActiveTransition, findVirtualElementById } from '../editor/utils.js';
import { getQuarterNoteDurationMs, rebuildAllEventTimelines, reprogramAllPageTransitions } from '../player/events.js';

// --- State-based Synchronization ---
let animationFrameId = null;
let localPlaybackState = {
    status: 'unloaded',
    timeAtReference: 0,
    referenceTime: 0,
    referenceTimeOffset: 0,
};

function getCurrentTime() {
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
    const currentTime = getCurrentTime();
    renderFrameAtTime(currentTime);
    animationFrameId = requestAnimationFrame(renderLoop);
}

function renderFrameAtTime(timeInMs) {
    if (!state.song || !state.song.thumbnailPage) return;
    const beatDurationMs = getQuarterNoteDurationMs();
    const currentBeats = beatDurationMs > 0 ? timeInMs / beatDurationMs : 0;
    const measureMap = state.timelineManager.getMeasureMap();
    let measureIndex = measureMap.findIndex(m => currentBeats >= m.startTime && currentBeats < m.startTime + m.duration);
    if (measureIndex === -1) {
        const totalDuration = measureMap.length > 0 ? measureMap.at(-1).startTime + measureMap.at(-1).duration : 0;
        measureIndex = (totalDuration > 0 && currentBeats >= totalDuration) ? measureMap.length - 1 : 0;
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
        },
        activePage: thumbnailPage,
    });
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
    if(state.domManager) state.domManager.clear();
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

    localPlaybackState.status = newState.status;
    localPlaybackState.timeAtReference = newState.timeAtReference;
    localPlaybackState.referenceTime = newState.referenceTime;
    localPlaybackState.referenceTimeOffset = performance.now() - newState.syncTime;

    if (state.song && newState.song) {
        const newBpm = newState.song.bpm;
        const newBpmUnit = newState.song.bpmUnit;
        if (state.song.bpm !== newBpm || state.song.bpmUnit !== newBpmUnit) {
            updateState({ song: { ...state.song, bpm: newBpm, bpmUnit: newBpmUnit } });
            rebuildAllEventTimelines();
            reprogramAllPageTransitions();
        }
    }

    if (newState.status === 'playing') {
        startRenderLoop();
    } else {
        stopRenderLoop();
        renderFrameAtTime(newState.timeAtReference);
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

    // --- UNIFIED IPC Listeners ---

    // Listener for ALL playback updates (initial sync and subsequent changes)
    window.audienceAPI.onPlaybackUpdate(async (newState) => {
        // This single handler is now responsible for all state processing.
        await handlePlaybackUpdate(newState);
    });
});