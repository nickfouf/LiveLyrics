// src/renderer/js/editor/events.js

import { state, updateState } from './state.js';
import { triggerActivePageRender } from './pageManager.js';
import { DOM } from './dom.js';
import { showPage } from './rendering.js';
import { addPage, setActivePage, renderPageManager, jumpToPage } from './pageManager.js';
import { selectLayer, renderLayersPanel } from './layersPanel.js';
import { DomManager } from '../renderer/domManager.js';
import { TimelineManager } from '../renderer/timeline/TimelineManager.js';
import { VirtualPage } from '../renderer/elements/page.js';
import { VirtualContainer } from '../renderer/elements/container.js';
import { renderPropertiesPanel } from './propertiesPanel.js';
import { renderEventsPanel } from './eventsPanel.js';
import {
    buildLyricsTimingMap,
    findActiveTransition,
    buildMeasureMap,
    findAllAtPoint,
    findVirtualElementById,
    pageHasMeasures,
    getAllUsedAssets,
    showConfirmationDialog,
    serializeElement,
    deserializeElement,
    findLastPageWithMusic
} from './utils.js';
import { showLoadingDialog, hideLoadingDialog } from './loadingDialog.js';
import { showAlertDialog } from './alertDialog.js';
import { VirtualTitle } from '../renderer/elements/title.js';
import {
    rebuildAllEventTimelines as sharedRebuildAllEventTimelines
} from '../player/events.js';
import { NumberEvent } from '../renderer/events/numberEvent.js';


export function updateWindowTitle() {
    const fileName = state.song.currentFilePath ? state.song.currentFilePath.split(/[\\/]/).pop() : 'Untitled.lyx';
    const dirtyMarker = state.song.isDirty ? '*' : '';
    const titleString = `LiveLyrics - ${fileName}${dirtyMarker}`;

    if (window.editorAPI) {
        window.editorAPI.setTitle(titleString);
    }
    if (DOM.windowTitle) {
        DOM.windowTitle.innerText = titleString;
    }
}

export function markAsDirty() {
    if (!state.song.isDirty) {
        updateState({ song: { ...state.song, isDirty: true } });
        updateWindowTitle();
    }
}

/**
 * Sets a property value on an element by creating or updating an event
 * at the very beginning of the element's timeline.
 * @param {VirtualElement} element The element to modify.
 * @param {string} propKey The property key (e.g., 'opacity', 'width').
 * @param {*} newValue The new value for the property.
 */
export function setPropertyAsDefaultValue(element, propKey, newValue) {
    if (!element) return;

    const keyToPath = {
        opacity: { prop: 'effects', valueKey: 'opacity' },
        mixBlendMode: { prop: 'effects', valueKey: 'mixBlendMode' },
        width: { prop: 'dimensions', valueKey: 'width' },
        height: { prop: 'dimensions', valueKey: 'height' },
        marginEnabled: { prop: 'margin', valueKey: 'enabled' },
        top: { prop: 'margin', valueKey: 'top' },
        left: { prop: 'margin', valueKey: 'left' },
        right: { prop: 'margin', valueKey: 'right' },
        bottom: { prop: 'margin', valueKey: 'bottom' },
        bgEnabled: { prop: 'background', valueKey: 'enabled' },
        bgColor: { prop: 'background', valueKey: 'background' },
        borderEnabled: { prop: 'border', valueKey: 'enabled' },
        borderSize: { prop: 'border', valueKey: 'width' },
        borderRadius: { prop: 'border', valueKey: 'radius' },
        borderColor: { prop: 'border', valueKey: 'color' },
        shadowEnabled: { prop: 'boxShadow', valueKey: 'enabled' },
        shadowInset: { prop: 'boxShadow', valueKey: 'inset' },
        shadowOffsetX: { prop: 'boxShadow', valueKey: 'offsetX' },
        shadowOffsetY: { prop: 'boxShadow', valueKey: 'offsetY' },
        shadowBlur: { prop: 'boxShadow', valueKey: 'blur' },
        shadowSpread: { prop: 'boxShadow', valueKey: 'spread' },
        shadowColor: { prop: 'boxShadow', valueKey: 'color' },
        paddingTop: { prop: 'inner_padding', valueKey: 'top' },
        paddingLeft: { prop: 'inner_padding', valueKey: 'left' },
        paddingBottom: { prop: 'inner_padding', valueKey: 'bottom' },
        paddingRight: { prop: 'inner_padding', valueKey: 'right' },
        fontSize: { prop: 'textStyle', valueKey: 'fontSize' },
        textColor: { prop: 'textStyle', valueKey: 'textColor' },
        lineHeight: { prop: 'textStyle', valueKey: 'lineHeight' },
        letterSpacing: { prop: 'textStyle', valueKey: 'letterSpacing' },
        wordSpacing: { prop: 'textStyle', valueKey: 'wordSpacing' },
        karaokeColor: { prop: 'textStyle', valueKey: 'karaokeColor' },
        fontFamily: { prop: 'textStyle', valueKey: 'fontFamily' },
        fontWeight: { prop: 'textStyle', valueKey: 'fontWeight' },
        fontStyle: { prop: 'textStyle', valueKey: 'fontStyle' },
        textAlign: { prop: 'textStyle', valueKey: 'textAlign' },
        justifyText: { prop: 'textStyle', valueKey: 'justifyText' },
        objectFit: { prop: 'objectFit', valueKey: 'objectFit' },
        videoState: { prop: 'playback', valueKey: 'state' },
        videoSpeed: { prop: 'playback', valueKey: 'speed' },
        videoLoop: { prop: 'playback', valueKey: 'loop' },
        progressBgColor: { prop: 'progress', valueKey: 'backgroundColor' },
        progressFillColor: { prop: 'progress', valueKey: 'fillColor' },
        audioState: { prop: 'playback', valueKey: 'state' },
        audioVolume: { prop: 'playback', valueKey: 'volume' },
        audioLoop: { prop: 'playback', valueKey: 'loop' },
        audioSrc: { prop: 'src', valueKey: 'src' },
        transformEnabled: { prop: 'transform', valueKey: 'enabled' },
        translateX: { prop: 'transform', valueKey: 'translateX' },
        translateY: { prop: 'transform', valueKey: 'translateY' },
        translateZ: { prop: 'transform', valueKey: 'translateZ' },
        scaleX: { prop: 'transform', valueKey: 'scaleX' },
        scaleY: { prop: 'transform', valueKey: 'scaleY' },
        scaleZ: { prop: 'transform', valueKey: 'scaleZ' },
        rotate: { prop: 'transform', valueKey: 'rotate' },
        rotateX: { prop: 'transform', valueKey: 'rotateX' },
        rotateY: { prop: 'transform', valueKey: 'rotateY' },
        rotateZ: { prop: 'transform', valueKey: 'rotateZ' },
        skewX: { prop: 'transform', valueKey: 'skewX' },
        skewY: { prop: 'transform', valueKey: 'skewY' },
        'transform-origin-x': { prop: 'transform', valueKey: 'transform-origin-x' },
        'transform-origin-y': { prop: 'transform', valueKey: 'transform-origin-y' },
        'transform-origin-z': { prop: 'transform', valueKey: 'transform-origin-z' },
        'transform-style': { prop: 'transform', valueKey: 'transform-style' },
        selfPerspective: { prop: 'transform', valueKey: 'selfPerspective' },
        childrenPerspective: { prop: 'transform', valueKey: 'childrenPerspective' },
        'backface-visibility': { prop: 'transform', valueKey: 'backface-visibility' },
        parentPerspectiveEnabled: { prop: 'parentPerspective', valueKey: 'enabled' },
        perspective: { prop: 'parentPerspective', valueKey: 'perspective' },
        'parent-transform-style': { prop: 'parentPerspective', valueKey: 'transform-style' },
        'parent-rotateX': { prop: 'parentPerspective', valueKey: 'rotateX' },
        'parent-rotateY': { prop: 'parentPerspective', valueKey: 'rotateY' },
        'parent-rotateZ': { prop: 'parentPerspective', valueKey: 'rotateZ' },
        'parent-scale': { prop: 'parentPerspective', valueKey: 'scale' },
        'perspectiveScaleDirection': { prop: 'perspectiveScale', valueKey: 'direction' },
        visible: { prop: 'visible', valueKey: 'visible' },
        gap: { prop: 'gap', valueKey: 'gap' },
    };

    const path = keyToPath[propKey];
    if (!path || !element.hasProperty(path.prop)) {
        console.warn(`[setPropertyAsInitialEvent] Could not find path for propKey: ${propKey}`);
        return;
    }

    const propertyObject = element.getProperty(path.prop);
    if (!propertyObject || typeof propertyObject.setValue !== 'function') {
        console.error(`[setPropertyAsInitialEvent] Invalid property object for ${propKey}`);
        return;
    }

    propertyObject.setValue(path.valueKey, newValue, true);

    triggerActivePageRender(true);
    markAsDirty();
}

/**
 * Rebuilds all event timelines for every element in the song.
 * This is the definitive function to call after any structural change
 * (adding/deleting/reordering pages or measures) or after loading a song.
 */
export function rebuildAllEventTimelines() {
    // MODIFIED: Call the shared logic from player/events.js
    sharedRebuildAllEventTimelines();
    // After updating all data, refresh the timeline view to reflect changes.
    updateTimelineAndEditorView();
}


/**
 * Converts a time in beats into a measure index and progress percentage.
 * @param {number} timeInBeats The time in beats to convert.
 * @param {Array} measureMap The global measure map.
 * @returns {{measureIndex: number, measureProgress: number}}
 */
function _timeInBeatsToMeasureInfo(timeInBeats, measureMap) {
    // FIX: Handle negative beat times by clamping or finding the start
    if (timeInBeats < 0 && measureMap.length > 0) return { measureIndex: 0, measureProgress: 0 };
    if (timeInBeats <= 0) return { measureIndex: 0, measureProgress: 0 };

    let measureIndex = measureMap.findIndex(m => timeInBeats >= m.startTime && timeInBeats < m.startTime + m.duration);

    if (measureIndex !== -1) {
        const measure = measureMap[measureIndex];
        const timeIntoMeasure = timeInBeats - measure.startTime;
        const measureProgress = measure.duration > 0 ? timeIntoMeasure / measure.duration : 0;
        return { measureIndex, measureProgress };
    }

    const totalDuration = measureMap.length > 0 ? measureMap.at(-1).startTime + measureMap.at(-1).duration : 0;
    if (timeInBeats >= totalDuration) {
        return { measureIndex: measureMap.length, measureProgress: 0 };
    }
    
    if (measureMap.length > 0 && timeInBeats < measureMap[0].startTime) {
        return { measureIndex: 0, measureProgress: 0 };
    }

    // Fallback for times between measures (should be rare)
    const lastMeasureBefore = findLastIndex(measureMap, m => m.startTime <= timeInBeats);
    return { measureIndex: lastMeasureBefore, measureProgress: 0.9999 };
}


function sharedReprogramAllPageTransitions() {
    const measureMap = buildMeasureMap();
    if (!measureMap) return;

    // Clear all existing transition events from all pages first
    const allPages = [state.song.thumbnailPage, ...state.song.pages].filter(Boolean);
    for (const page of allPages) {
        if (page.hasProperty('effects')) {
            const opacityValue = page.getProperty('effects').getOpacity();
            if (opacityValue.getEvents().clearTransitionEvents) {
                opacityValue.getEvents().clearTransitionEvents();
            }
            opacityValue.applyDefaultEvent();
        }
        // In a full implementation, we would also clear transform properties here.
    }

    for (let toPageIndex = 0; toPageIndex < state.song.pages.length; toPageIndex++) {
        const toPage = state.song.pages[toPageIndex];
        const transition = toPage.transition || { type: 'instant', duration: 0, offsetBeats: 0 };

        if (transition.type === 'instant' || !transition.duration || transition.duration <= 0) {
            continue;
        }

        const firstMeasureOfPage = measureMap.find(m => m.pageIndex === toPageIndex);
        if (!firstMeasureOfPage) continue;

        // MODIFIED: Incorporate offsetBeats into the transition start time
        const transitionStartTimeBeats = firstMeasureOfPage.startTime + (transition.offsetBeats || 0);
        let durationInBeats;

        if (transition.durationUnit === 'beats') {
            durationInBeats = transition.duration || 1;
        } else { // measures
            durationInBeats = 0;
            const firstMeasureGlobalIndex = measureMap.indexOf(firstMeasureOfPage);
            for (let j = 0; j < (transition.duration || 1); j++) {
                const currentMeasureIndex = firstMeasureGlobalIndex + j;
                if (measureMap[currentMeasureIndex]) {
                    durationInBeats += measureMap[currentMeasureIndex].duration;
                } else {
                    break;
                }
            }
        }

        if (durationInBeats <= 0) continue;

        const transitionEndTimeBeats = transitionStartTimeBeats + durationInBeats;
        const fromPageIndex = findLastPageWithMusic(toPageIndex, measureMap);

        const fromPage = (fromPageIndex > -1) ? state.song.pages[fromPageIndex] : state.song.thumbnailPage;
        if (!fromPage) continue;

        const fromOpacityValue = fromPage.getProperty('effects').getOpacity();
        const toOpacityValue = toPage.getProperty('effects').getOpacity();

        const startEventTime = _timeInBeatsToMeasureInfo(transitionStartTimeBeats, measureMap);
        const endEventTime = _timeInBeatsToMeasureInfo(transitionEndTimeBeats, measureMap);

        switch (transition.type) {
            case 'fade': {
                fromOpacityValue.addEvent(new NumberEvent({ value: 1, ...startEventTime, isTransition: true }));
                fromOpacityValue.addEvent(new NumberEvent({ value: 0, ...endEventTime, isTransition: true }));

                toOpacityValue.addEvent(new NumberEvent({ value: 0, ...startEventTime, isTransition: true }));
                toOpacityValue.addEvent(new NumberEvent({ value: 1, ...endEventTime, isTransition: true }));
                break;
            }
            case 'dip-to-black': {
                const transitionMidTimeBeats = transitionStartTimeBeats + (durationInBeats / 2);
                const midEventTime = _timeInBeatsToMeasureInfo(transitionMidTimeBeats, measureMap);

                // From page fades out completely in the first half
                fromOpacityValue.addEvent(new NumberEvent({ value: 1, ...startEventTime, isTransition: true }));
                fromOpacityValue.addEvent(new NumberEvent({ value: 0, ...midEventTime, isTransition: true }));

                // To page is invisible for the first half, then fades in
                toOpacityValue.addEvent(new NumberEvent({ value: 0, ...startEventTime, isTransition: true }));
                toOpacityValue.addEvent(new NumberEvent({ value: 0, ...midEventTime, isTransition: true }));
                toOpacityValue.addEvent(new NumberEvent({ value: 1, ...endEventTime, isTransition: true }));
                break;
            }
            // Other transitions like push, flip, cube would go here
        }
    }
}


/**
 * Programs all page transitions based on their settings.
 */
export function reprogramAllPageTransitions() {
    // MODIFIED: Call the new local function
    sharedReprogramAllPageTransitions();
    // After updating all data, refresh the timeline view to reflect changes.
    updateTimelineAndEditorView();
}


/**
 * Helper to find the last index of an element in an array that satisfies a condition.
 */
function findLastIndex(array, predicate) {
    for (let i = array.length - 1; i >= 0; i--) {
        if (predicate(array[i], i, array)) {
            return i;
        }
    }
    return -1;
}

// --- New Playback Conductor ---

/**
 * Manages which pages are in the DOM, adding/removing them as needed for playback.
 * @param {Set<VirtualPage>} activePagesSet - A set of VirtualPage objects that should be in the DOM.
 */
function switchVisiblePages(activePagesSet) {
    const allPossiblePages = [state.song.thumbnailPage, ...state.song.pages].filter(Boolean);
    for (const page of allPossiblePages) {
        if (activePagesSet.has(page)) {
            // Use the main DOM manager for playback to handle transitions correctly.
            state.domManager.addToDom(page);
        } else {
            state.domManager.removeFromDom(page);
        }
    }
}


/**
 * Calculates the duration of a single quarter note in milliseconds based on the UI controls.
 * @returns {number} The duration of a quarter note in ms.
 */
export function getQuarterNoteDurationMs(bpm = state.song.bpm, noteType = state.song.bpmUnit) {
    const noteMultipliers = {
        'w_note': 4,
        'h_note': 2,
        'q_note': 1,
        'e_note': 0.5,
    };

    const multiplier = noteMultipliers[noteType] || 1;
    const quarterNotesPerMinute = bpm * multiplier;

    if (quarterNotesPerMinute === 0) return Infinity;

    return (60 / quarterNotesPerMinute) * 1000;
}


/**
 * The main animation loop. Orchestrates the new rendering engine via the TimelineManager.
 */
function animationLoop(timestamp) {
    if (!state.playback.isPlaying) return;

    // 1. Time Calculation
    const elapsedMs = (timestamp - state.playback.animationStartTime) + state.playback.timeAtPause;
    const beatDurationMs = getQuarterNoteDurationMs(); // MODIFIED
    const currentMusicalTimeInBeats = beatDurationMs > 0 ? elapsedMs / beatDurationMs : 0;
    const measureMap = state.timelineManager.getMeasureMap();
    const totalDuration = measureMap.length > 0 ? measureMap.at(-1).startTime + measureMap.at(-1).duration : 0;

    // Check for song end
    if (totalDuration > 0 && currentMusicalTimeInBeats >= totalDuration) {
        const totalDurationMs = totalDuration * beatDurationMs;
        if (state.playback.animationFrameId) {
            cancelAnimationFrame(state.playback.animationFrameId);
        }
        updateState({
            playback: { ...state.playback, isPlaying: false, animationFrameId: null, timeAtPause: totalDurationMs, songHasEnded: true, }
        });
        document.getElementById('play-pause-btn').classList.remove('is-playing');
        document.body.classList.remove('is-playing');

        state.timelineManager.notifyPlaybackState(false);

        updateTimelineAndEditorView();
        return;
    }

    // 2. Find Current Measure and Progress
    let currentMeasureIndex = measureMap.findIndex(m => currentMusicalTimeInBeats >= m.startTime && currentMusicalTimeInBeats < m.startTime + m.duration);
    if (currentMeasureIndex === -1 && measureMap.length > 0) {
        currentMeasureIndex = (currentMusicalTimeInBeats >= totalDuration) ? measureMap.length - 1 : 0;
    } else if (measureMap.length === 0) {
        stop();
        return;
    }
    const currentMeasure = measureMap[currentMeasureIndex];
    const timeIntoMeasure = currentMusicalTimeInBeats - currentMeasure.startTime;
    const measureProgress = currentMeasure.duration > 0 ? timeIntoMeasure / currentMeasure.duration : 0;

    // --- START: REVISED PAGE VISIBILITY LOGIC ---
    // 3. Determine which pages need to be in the DOM
    const pagesToKeepInDom = new Set();

    // The musically current page should always be considered.
    const musicallyCurrentPageIndex = currentMeasure.pageIndex;
    if (musicallyCurrentPageIndex > -1) {
        pagesToKeepInDom.add(state.song.pages[musicallyCurrentPageIndex]);
    }

    // Check for any active visual transition and add its pages.
    const activeTransition = findActiveTransition(currentMusicalTimeInBeats, measureMap, state.song.pages);
    if (activeTransition) {
        if (activeTransition.fromPageIndex > -1) {
            pagesToKeepInDom.add(state.song.pages[activeTransition.fromPageIndex]);
        } else {
            // fromPageIndex is -1, which means it's the first transition from the thumbnail.
            pagesToKeepInDom.add(state.song.thumbnailPage);
        }
        if (activeTransition.toPageIndex > -1) {
            pagesToKeepInDom.add(state.song.pages[activeTransition.toPageIndex]);
        }
    } else {
        // If not in a transition, and before the song starts, show only the thumbnail.
        if (measureMap.length > 0 && currentMusicalTimeInBeats < measureMap[0].startTime) {
            pagesToKeepInDom.clear(); // Clear other pages
            pagesToKeepInDom.add(state.song.thumbnailPage);
        }
    }

    // Now, tell the DOM manager to ensure all these pages are present.
    switchVisiblePages(pagesToKeepInDom);


    // This part remains, to keep the editor's "active page" state in sync.
    let pageIndexForEditorState = -1;
    if (activeTransition) {
        pageIndexForEditorState = activeTransition.toPageIndex;
    } else if (currentMeasure) {
        pageIndexForEditorState = currentMeasure.pageIndex;
    }

    if (pageIndexForEditorState > -1 && state.song.pages[pageIndexForEditorState] !== state.activePage) {
        setActivePage(state.song.pages[pageIndexForEditorState]);
    } else if (pageIndexForEditorState === -1 && currentMusicalTimeInBeats < (measureMap[0]?.startTime || 0)) {
        // If before the song starts, make sure the editor shows the thumbnail page
        if (state.activePage !== state.song.thumbnailPage) {
            setActivePage(state.song.thumbnailPage);
        }
    }
    // --- END: REVISED PAGE VISIBILITY LOGIC ---


    // 4. Render Frame using the new engine
    state.timelineManager.renderAt(currentMeasureIndex, measureProgress);

    // 5. Update UI (Timeline Bar)
    const timelineBar = document.querySelector('.timeline-bar');
    if (timelineBar) {
        const progress = timelineBar.querySelector('.timeline-progress');
        const text = timelineBar.querySelector('span');
        const progressPercent = totalDuration > 0 ? (currentMusicalTimeInBeats / totalDuration) * 100 : 0;
        progress.style.width = `${Math.min(100, progressPercent)}%`;

        const beatInMeasure = Math.floor(timeIntoMeasure) + 1;
        const msProgress = (timeIntoMeasure - Math.floor(timeIntoMeasure)) * beatDurationMs;
        text.textContent = `${currentMeasureIndex + 1} | ${beatInMeasure} | ${String(Math.floor(msProgress)).padStart(4, '0')}`;
    }

    // 6. Loop
    state.playback.animationFrameId = requestAnimationFrame(animationLoop);
}

function play() {
    if (state.playback.songHasEnded) {
        state.playback.timeAtPause = 0;
        state.playback.songHasEnded = false;
    }

    const measureMap = buildMeasureMap();
    const lyricsTimingMap = buildLyricsTimingMap(measureMap);
    state.timelineManager.setMeasureMap(measureMap);
    state.timelineManager.setLyricsTimingMap(lyricsTimingMap);

    updateState({ playback: { ...state.playback, isPlaying: true } });

    document.getElementById('play-pause-btn').classList.add('is-playing');
    document.body.classList.add('is-playing');
    state.playback.animationStartTime = performance.now();
    state.timelineManager.notifyPlaybackState(true);
    requestAnimationFrame(animationLoop);
}

function pause() {
    updateState({ playback: { ...state.playback, isPlaying: false } });
    document.getElementById('play-pause-btn').classList.remove('is-playing');
    document.body.classList.remove('is-playing');
    cancelAnimationFrame(state.playback.animationFrameId);
    state.playback.timeAtPause += performance.now() - state.playback.animationStartTime;
    state.timelineManager.notifyPlaybackState(false);

    // --- START REVISED LOGIC ---
    // Determine the single correct page that should be visible at the time of pausing.
    const measureMap = buildMeasureMap();
    const beatDurationMs = getQuarterNoteDurationMs();
    const currentMusicalTimeInBeats = beatDurationMs > 0 ? state.playback.timeAtPause / beatDurationMs : 0;
    const activeTransition = findActiveTransition(currentMusicalTimeInBeats, measureMap, state.song.pages);
    let pageToShow = null;

    if (activeTransition) {
        // When paused in a transition, the destination page is considered the active one.
        pageToShow = state.song.pages[activeTransition.toPageIndex];
    } else {
        // If not in a transition, find the page corresponding to the current measure.
        const totalDuration = measureMap.length > 0 ? measureMap.at(-1).startTime + measureMap.at(-1).duration : 0;
        let currentMeasureIndex = measureMap.findIndex(m => currentMusicalTimeInBeats >= m.startTime && currentMusicalTimeInBeats < m.startTime + m.duration);
        if (currentMeasureIndex === -1) {
            currentMeasureIndex = (totalDuration > 0 && currentMusicalTimeInBeats >= totalDuration) ? measureMap.length - 1 : 0;
        }
        const currentMeasure = measureMap[currentMeasureIndex];
        if (currentMeasure) {
            pageToShow = state.song.pages[currentMeasure.pageIndex];
        } else if (state.song.thumbnailPage) {
            // Fallback to thumbnail if no measures exist
            pageToShow = state.song.thumbnailPage;
        }
    }

    // If we found a valid page, enforce its visibility and update the editor state.
    if (pageToShow) {
        // Force the DOM to contain ONLY the target page.
        switchVisiblePages(new Set([pageToShow]));

        // Now, ensure the editor's state (activePage, panels, etc.) is in sync.
        if (pageToShow !== state.activePage) {
            setActivePage(pageToShow);
        }
    }
    // --- END REVISED LOGIC ---

    updateTimelineAndEditorView();
}

function stop() {
    if (state.playback.animationFrameId) {
        cancelAnimationFrame(state.playback.animationFrameId);
    }
    updateState({
        playback: {
            ...state.playback,
            isPlaying: false,
            animationFrameId: null,
            timeAtPause: 0,
            songHasEnded: true,
        }
    });
    document.getElementById('play-pause-btn').classList.remove('is-playing');
    document.body.classList.remove('is-playing');

    if (state.activePage) {
        switchVisiblePages(new Set([state.activePage]));
    }

    state.timelineManager.notifyPlaybackState(false);
    updateTimelineAndEditorView();
}


/**
 * Enables or disables the main playback controls based on whether the song has any measures.
 */
function updatePlaybackControlsState() {
    // console.log("Updating playback controls state...", DOM.playPauseBtn, DOM.backwardBtn, DOM.forwardBtn);
    if (!DOM.playPauseBtn || !DOM.backwardBtn || !DOM.forwardBtn) return;

    // Disable controls if the entire song has no measures.
    const hasAnyMeasures = buildMeasureMap().length > 0;

    DOM.playPauseBtn.disabled = !hasAnyMeasures;
    DOM.backwardBtn.disabled = !hasAnyMeasures;
    DOM.forwardBtn.disabled = !hasAnyMeasures;
}


/**
 * Updates the editor view and timeline display when not playing (e.g., scrubbing).
 */
export function updateTimelineAndEditorView() {
    if (state.playback.isPlaying || !state.timelineManager) return;

    const measureMap = buildMeasureMap();
    const lyricsTimingMap = buildLyricsTimingMap(measureMap);
    state.timelineManager.setMeasureMap(measureMap);
    state.timelineManager.setLyricsTimingMap(lyricsTimingMap);

    const beatDurationMs = getQuarterNoteDurationMs(); // MODIFIED
    const currentMusicalTimeInBeats = beatDurationMs > 0 ? state.playback.timeAtPause / beatDurationMs : 0;
    const totalDuration = measureMap.length > 0 ? measureMap.at(-1).startTime + measureMap.at(-1).duration : 0;

    // FIX: Add tolerance for floating point precision issues when finding the measure index.
    // This prevents the UI from incorrectly snapping to the previous measure when calculating
    // the exact start time of a page/measure (e.g. 77.99999... instead of 78.0).
    const EPSILON = 0.0001;
    let currentMeasureIndex = measureMap.findIndex(m => (currentMusicalTimeInBeats + EPSILON) >= m.startTime && (currentMusicalTimeInBeats + EPSILON) < m.startTime + m.duration);

    if (currentMeasureIndex === -1) {
        currentMeasureIndex = totalDuration > 0 && currentMusicalTimeInBeats >= totalDuration ? measureMap.length - 1 : 0;
    }
    if (measureMap.length === 0) {
        currentMeasureIndex = 0;
    }

    const currentMeasure = measureMap[currentMeasureIndex] || { startTime: 0, duration: 0, pageIndex: 0 };

    // --- REVISED LOGIC ---
    // This logic handles syncing the active page to the timeline, primarily for scrubbing.
    const currentMeasureForPageSwitch = measureMap[currentMeasureIndex];
    if (currentMeasureForPageSwitch) {
        const pageFromTimeline = state.song.pages[currentMeasureForPageSwitch.pageIndex];
        // If the timeline points to a page different from the active one...
        if (pageFromTimeline && pageFromTimeline !== state.activePage) {
            // ...switch to it, but ONLY if the currently active page is a musical one.
            // This prevents the timeline from overriding a user's explicit selection of a static page.
            const activePageIsMusical = pageHasMeasures(state.activePage);
            if (activePageIsMusical) {
                setActivePage(pageFromTimeline);
            }
        }
    }
    // --- END REVISED LOGIC ---

    const timeIntoMeasure = currentMusicalTimeInBeats - currentMeasure.startTime;
    const measureProgress = currentMeasure.duration > 0 ? timeIntoMeasure / currentMeasure.duration : 0;

    // --- MODIFICATION START: More efficient rendering in edit mode ---
    // 1. Apply events to calculate virtual property values, including transitions.
    state.timelineManager.applyEventsAt(currentMeasureIndex, measureProgress);

    // 2. Override transition properties on the virtual elements before rendering.
    const managers = [state.domManager, state.stagingDomManager].filter(Boolean);
    for (const manager of managers) {
        const pagesInDom = manager.getManagedPages().filter(p => p.addedInDom);
        for (const page of pagesInDom) {
            // Reset Effects (Opacity)
            const opacityValue = page.getProperty('effects').getOpacity();
            opacityValue.setValue(opacityValue.getDefaultValue());

            // Reset Transform properties
            const transform = page.getProperty('transform');
            if (transform) {
                transform.getEnabled().setValue(transform.getEnabled().getDefaultValue());
                transform.getTranslateX().batchUpdate(transform.getTranslateX().getDefaultValue());
                transform.getTranslateY().batchUpdate(transform.getTranslateY().getDefaultValue());
                transform.getTranslateZ().batchUpdate(transform.getTranslateZ().getDefaultValue());
                transform.getScaleX().setValue(transform.getScaleX().getDefaultValue());
                transform.getScaleY().setValue(transform.getScaleY().getDefaultValue());
                transform.getScaleZ().setValue(transform.getScaleZ().getDefaultValue());
                transform.getRotate().setValue(transform.getRotate().getDefaultValue());
                transform.getRotateX().setValue(transform.getRotateX().getDefaultValue());
                transform.getRotateY().setValue(transform.getRotateY().getDefaultValue());
                transform.getRotateZ().setValue(transform.getRotateZ().getDefaultValue());
                transform.getSkewX().setValue(transform.getSkewX().getDefaultValue());
                transform.getSkewY().setValue(transform.getSkewY().getDefaultValue());
                transform.getSelfPerspective().batchUpdate(transform.getSelfPerspective().getDefaultValue());
            }

            // Reset ParentPerspective properties
            const parentPerspective = page.getProperty('parentPerspective');
            if (parentPerspective) {
                parentPerspective.getEnabled().setValue(parentPerspective.getEnabled().getDefaultValue());
                parentPerspective.getPerspective().batchUpdate(parentPerspective.getPerspective().getDefaultValue());
                parentPerspective.getTransformStyle().setValue(parentPerspective.getTransformStyle().getDefaultValue());
                parentPerspective.getRotateX().setValue(parentPerspective.getRotateX().getDefaultValue());
                parentPerspective.getRotateY().setValue(parentPerspective.getRotateY().getDefaultValue());
                parentPerspective.getRotateZ().setValue(parentPerspective.getRotateZ().getDefaultValue());
                parentPerspective.getScale().setValue(parentPerspective.getScale().getDefaultValue());
            }
        }
    }

    // 3. Render the final, corrected state to the DOM once.
    if (state.domManager) state.domManager.render();
    if (state.stagingDomManager) state.stagingDomManager.render();
    // --- MODIFICATION END ---

    const timelineBar = document.querySelector('.timeline-bar');
    if (!timelineBar) return;
    const progress = timelineBar.querySelector('.timeline-progress');
    const text = timelineBar.querySelector('span');
    const progressPercent = totalDuration > 0 ? (currentMusicalTimeInBeats / totalDuration) * 100 : 0;
    progress.style.width = `${Math.min(100, progressPercent)}%`;

    const activePageHasNoMeasures = state.activePage ? !pageHasMeasures(state.activePage) : false;
    const isAtEndOfTimeline = totalDuration > 0 && currentMusicalTimeInBeats >= totalDuration;

    if (activePageHasNoMeasures && isAtEndOfTimeline) {
        const nextMeasureIndex = measureMap.length;
        text.textContent = `${nextMeasureIndex + 1} | 1 | 0000`;
    } else {
        let displayTimeIntoMeasure = timeIntoMeasure;
        // If we are at the exact end of the song, display it as the end of the last beat, not the start of a non-existent next one.
        if (totalDuration > 0 && currentMusicalTimeInBeats >= totalDuration) {
            displayTimeIntoMeasure = Math.max(0, currentMeasure.duration - 0.00001);
        }

        const beatInMeasure = Math.floor(displayTimeIntoMeasure) + 1;
        const msProgress = (displayTimeIntoMeasure - Math.floor(displayTimeIntoMeasure)) * beatDurationMs;
        text.textContent = `${currentMeasureIndex + 1} | ${beatInMeasure} | ${String(Math.floor(msProgress)).padStart(4, '0')}`;
    }

    updatePlaybackControlsState();
}


function jumpToMeasure(direction) {
    const wasPlaying = state.playback.isPlaying;
    if (wasPlaying) {
        // Temporarily stop the animation loop. We will restart it later if needed.
        cancelAnimationFrame(state.playback.animationFrameId);
    }

    const measureMap = state.timelineManager.getMeasureMap();
    if (measureMap.length === 0) {
        // If there are no measures, we can't jump. If it was playing, stop it.
        if (wasPlaying) stop();
        return;
    }

    const beatDurationMs = getQuarterNoteDurationMs();
    const totalDurationInBeats = measureMap.at(-1).startTime + measureMap.at(-1).duration;
    const currentMusicalTime = beatDurationMs > 0 ? state.playback.timeAtPause / beatDurationMs : 0;

    const EPSILON = 0.0001; // Defined here

    let currentMeasureIndex = measureMap.findIndex(m => (currentMusicalTime + EPSILON) >= m.startTime && (currentMusicalTime + EPSILON) < m.startTime + m.duration);

    if (currentMeasureIndex === -1) {
        // If not in any measure, determine if we are at the end or beginning.
        // Use epsilon here as well for consistency
        currentMeasureIndex = ((currentMusicalTime + EPSILON) >= totalDurationInBeats) ? measureMap.length - 1 : 0;
    }

    let newTimeInBeats;

    if (direction === 1) { // Forward
        if (currentMeasureIndex === measureMap.length - 1) {
            // If on the last measure, jump to the very end of the song.
            newTimeInBeats = totalDurationInBeats;
        } else {
            // Otherwise, jump to the start of the next measure.
            const targetMeasureIndex = currentMeasureIndex + 1;
            newTimeInBeats = measureMap[targetMeasureIndex].startTime;
        }
    } else { // Backward (direction === -1)
        // If we are at or before the start of the very first measure, just clamp to the beginning.
        // Use epsilon-adjusted time for the start check
        if (currentMeasureIndex === 0 && ((currentMusicalTime + EPSILON) - measureMap[0].startTime) < 0.01) {
            newTimeInBeats = 0;
        } else {
            // Otherwise, determine if we should jump to the start of the current measure or the previous one.
            const isAtStartOfMeasure = ((currentMusicalTime + EPSILON) - measureMap[currentMeasureIndex].startTime) < 0.01;
            const targetMeasureIndex = isAtStartOfMeasure ? currentMeasureIndex - 1 : currentMeasureIndex;
            newTimeInBeats = measureMap[targetMeasureIndex].startTime;
        }
    }

    // Update the state with the new time.
    state.playback.timeAtPause = newTimeInBeats * beatDurationMs;
    // The song has ended if we are at or past the total duration.
    state.playback.songHasEnded = newTimeInBeats >= totalDurationInBeats;

    // Refresh the UI to reflect the new position.
    updateTimelineAndEditorView();

    if (wasPlaying) {
        // If playback was active, we need to resume it from the new position.
        // We don't call play() as that has other side effects.
        // We just restart the animation loop with the updated time.
        state.playback.animationStartTime = performance.now();
        state.playback.animationFrameId = requestAnimationFrame(animationLoop);
    }
}


// --- UI Setup ---

function setupTimelineControls() {
    const playPauseBtn = document.getElementById('play-pause-btn');
    playPauseBtn.addEventListener('click', () => {
        if (state.timelineManager.getMeasureMap().length === 0) {
            updateTimelineAndEditorView();
        }
        if (state.timelineManager.getMeasureMap().length === 0) return;

        if (!state.playback.isPlaying) {
            play();
        } else {
            pause();
        }
    });

    document.getElementById('forward-btn').addEventListener('click', () => jumpToMeasure(1));
    document.getElementById('backward-btn').addEventListener('click', () => jumpToMeasure(-1));
}

let selectionCycle = {
    x: null,
    y: null,
    elements: [], // will store {element, depth}
    currentIndex: -1,
    timeout: null,
};
const CLICK_TOLERANCE = 5; // pixels

function resetSelectionCycle() {
    selectionCycle.x = null;
    selectionCycle.y = null;
    selectionCycle.elements = [];
    selectionCycle.currentIndex = -1;
    if (selectionCycle.timeout) {
        clearTimeout(selectionCycle.timeout);
        selectionCycle.timeout = null;
    }
}

export function initSlideInteractivity() {
    DOM.presentationSlide.addEventListener('click', (e) => {
        if (!state.activePage) return;

        const clickX = e.clientX;
        const clickY = e.clientY;

        const isNewClickLocation = Math.abs(clickX - (selectionCycle.x || 0)) > CLICK_TOLERANCE ||
            Math.abs(clickY - (selectionCycle.y || 0)) > CLICK_TOLERANCE;

        if (isNewClickLocation || selectionCycle.elements.length === 0) {
            resetSelectionCycle();
            selectionCycle.x = clickX;
            selectionCycle.y = clickY;

            const candidates = findAllAtPoint(state.activePage.domElement, clickX, clickY, (el) => {
                return el.id && el.dataset && el.dataset.elementType;
            });

            if (candidates.length === 0) {
                selectLayer(state.activePage);
                return;
            }

            // Add the page itself as the last item in the cycle
            candidates.push({ element: state.activePage.domElement, depth: -1 });

            selectionCycle.elements = candidates;
            selectionCycle.currentIndex = 0;
        } else {
            selectionCycle.currentIndex++;
            if (selectionCycle.currentIndex >= selectionCycle.elements.length) {
                selectionCycle.currentIndex = 0; // Wrap around
            }
        }

        if (selectionCycle.timeout) clearTimeout(selectionCycle.timeout);
        selectionCycle.timeout = setTimeout(resetSelectionCycle, 1500);

        const elementToSelect = selectionCycle.elements[selectionCycle.currentIndex].element;

        if (elementToSelect) {
            const virtualElement = findVirtualElementById(state.activePage, elementToSelect.id);
            if (virtualElement) {
                selectLayer(virtualElement);
            }
        } else {
            selectLayer(state.activePage);
            resetSelectionCycle();
        }
    });
}

// ... (remaining boilerplate functions setupTitleBar, setupDrawerControls, etc.)
// ... (rest of the file remains unchanged)
function confirmCloseIfNeeded() {
    if (state.song.isDirty) {
        return showConfirmationDialog(
            "You have unsaved changes that will be lost. Do you want to continue?",
            "Unsaved Changes"
        );
    }
    return Promise.resolve(true);
}

function setupTitleBar() {
    DOM.minimizeBtn.addEventListener('click', () => window.editorAPI.minimizeWindow());
    DOM.maximizeBtn.addEventListener('click', () => window.editorAPI.maximizeWindow());
    DOM.closeBtn.addEventListener('click', async () => {
        if (await confirmCloseIfNeeded()) {
            window.editorAPI.closeWindow();
        }
    });
    window.editorAPI.onWindowStateChange((isMaximized) => {
        DOM.maximizeBtn.classList.toggle('is-maximized', isMaximized);
    });
}

function setupDrawerControls() {
    DOM.elementsPanelHeader.addEventListener('click', () => {
        DOM.elementsPanel.classList.add('collapsed');
        DOM.elementsPanelHandle.classList.add('visible');
    });
    DOM.elementsPanelHandle.addEventListener('click', () => {
        DOM.elementsPanel.classList.remove('collapsed');
        DOM.elementsPanelHandle.classList.remove('visible');
    });
    DOM.eventsPanelHeader.addEventListener('click', () => {
        DOM.eventsPanel.classList.add('collapsed');
        DOM.eventsPanelHandle.classList.add('visible');
    });
    DOM.eventsPanelHandle.addEventListener('click', () => {
        DOM.eventsPanel.classList.remove('collapsed');
        DOM.eventsPanelHandle.classList.remove('visible');
    });
    DOM.propertiesDrawerHeader.addEventListener('click', () => DOM.propertiesPanel.classList.toggle('collapsed'));
    DOM.propertiesPanelHandle.addEventListener('click', () => DOM.propertiesPanel.classList.remove('collapsed'));
    DOM.layersDrawerHeader.addEventListener('click', () => DOM.layersPanel.classList.toggle('collapsed'));
    DOM.layersPanelHandle.addEventListener('click', () => DOM.layersPanel.classList.remove('collapsed'));
}

function setupPropertiesPanelDelegation() {
    if (DOM.propertiesPanelBody) {
        DOM.propertiesPanelBody.addEventListener('click', e => {
            const header = e.target.closest('.prop-group-header');
            if (header && !e.target.closest('button, .prop-reset-btn')) {
                header.closest('.prop-group').classList.toggle('collapsed');
            }
        });
    }
}

function setupMainMenu() {
    DOM.newSongBtn.addEventListener('click', () => showPage('new-song-page'));
    DOM.openSongBtn.addEventListener('click', async () => {
        const filePath = await window.editorAPI.openSong();
        if (filePath) {
            await loadSong(filePath);
        }
    });
    DOM.editorBackToMainBtn.addEventListener('click', () => window.editorAPI.goToMainMenu());
    DOM.exitBtn.addEventListener('click', () => window.editorAPI.closeWindow());
}

function setupNewSongMenu() {
    DOM.songTitleInput.addEventListener('input', () => {
        DOM.createSongBtn.disabled = DOM.songTitleInput.value.trim() === '';
    });
    DOM.backToMenuBtn.addEventListener('click', () => showPage('main-menu-page'));

    let currentResizeActionId = 0;

    DOM.createSongBtn.addEventListener('click', async () => { // MODIFIED: Made async
        const songTitle = DOM.songTitleInput.value.trim();
        if (!songTitle) return;

        // ADDED: Initialize the temporary project folder before creating the new song
        if (window.editorAPI && window.editorAPI.initTempFolder) {
            await window.editorAPI.initTempFolder();
        }

        if (DOM.resizingOverlay) {
            DOM.resizingOverlay.style.opacity = '0';
            DOM.resizingOverlay.style.transition = 'opacity 150ms ease-in-out';
            DOM.resizingOverlay.style.display = 'none';
        }

        const resizeCallbacks = {
            onResizeStart: () => {
                currentResizeActionId++;
                DOM.resizingOverlay.style.display = 'flex';
                requestAnimationFrame(() => {
                    DOM.resizingOverlay.style.opacity = '1';
                });
            },
            onResizeEnd: () => {
                if (DOM.resizingOverlay.style.opacity === '0') return;
                DOM.resizingOverlay.style.opacity = '0';
                const hideActionId = currentResizeActionId;
                DOM.resizingOverlay.addEventListener('transitionend', function onTransitionEnd() {
                    if (hideActionId === currentResizeActionId) {
                        DOM.resizingOverlay.style.display = 'none';
                    }
                }, { once: true });
            }
        };

        const domManager = new DomManager(DOM.pageContainer, resizeCallbacks);
        const stagingDomManager = new DomManager(DOM.stagingPageContainer, resizeCallbacks);
        const timelineManager = new TimelineManager();
        timelineManager.setDomManager(domManager);

        const thumbnailPage = new VirtualPage({ name: 'Thumbnail' });
        const firstPage = new VirtualPage();

        // Create a title element with the song's name.
        const titleElement = new VirtualTitle({ textContent: songTitle }, 'Song Title');
        
        // Create a vertical container to hold the title.
        const vContainer = new VirtualContainer({ name: 'Title Container', alignment: 'vertical' });

        // Add the title to the container.
        vContainer.addElement(titleElement);

        // Add the container to the thumbnail page.
        thumbnailPage.addElement(vContainer);

        updateState({
            domManager,
            stagingDomManager,
            timelineManager,
            song: {
                title: songTitle,
                thumbnailPage: thumbnailPage,
                pages: [firstPage],
                currentFilePath: null,
                isDirty: true,
                bpm: 120,
                bpmUnit: 'q_note',
            },
            playback: {
                ...state.playback,
                isPlaying: false,
                timeAtPause: 0,
                songHasEnded: false,
            },
            activePage: null,
            selectedElement: null,
        });

        jumpToPage(thumbnailPage);

        // The window title should reflect the unsaved file status, not the song's internal title.
        updateWindowTitle();
        showPage('editor-page');
    });
}

function setupEditorHeader() {
    DOM.closeProjectBtn.addEventListener('click', async () => {
        if (!(await confirmCloseIfNeeded())) {
            return;
        }
        if(state.playback.isPlaying) stop();

        DOM.songTitleInput.value = '';
        DOM.createSongBtn.disabled = true;

        if(DOM.pageContainer) DOM.pageContainer.innerHTML = '';
        if(DOM.stagingPageContainer) DOM.stagingPageContainer.innerHTML = '';

        updateState({
            domManager: null,
            stagingDomManager: null,
            timelineManager: null,
            song: { title: "Untitled Song", thumbnailPage: null, pages: [], currentFilePath: null, isDirty: false },
            activePage: null,
            selectedElement: null
        });

        renderLayersPanel();
        renderPropertiesPanel();
        renderEventsPanel();
        renderPageManager();

        window.editorAPI.setTitle("LiveLyrics");
        DOM.windowTitle.innerText = "LiveLyrics";
        showPage('main-menu-page');
    });
}

/**
 * Sets up the behavior for all custom select dropdowns.
 */
function setupCustomSelects() {
    // Close all custom selects when clicking anywhere else
    document.addEventListener('click', (e) => {
        document.querySelectorAll('.custom-select').forEach(sel => {
            if (!sel.contains(e.target)) {
                sel.querySelector('.select-items').classList.add('select-hide');
            }
        });
    });

    document.querySelectorAll('.custom-select').forEach(customSelect => {
        const selected = customSelect.querySelector('.select-selected');
        const items = customSelect.querySelector('.select-items');

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other open selects
            document.querySelectorAll('.custom-select .select-items').forEach(otherItems => {
                if (otherItems !== items) {
                    otherItems.classList.add('select-hide');
                }
            });
            // Toggle the current one
            items.classList.toggle('select-hide');
        });

        items.querySelectorAll('div').forEach(option => {
            option.addEventListener('click', function() {
                // --- MODIFICATION START ---
                // 1. Get old duration before changing the state
                const oldBeatDurationMs = getQuarterNoteDurationMs();

                // 2. Update the UI and state
                const value = this.dataset.value;
                const content = this.innerHTML;
                selected.innerHTML = content;
                selected.dataset.value = value;
                items.classList.add('select-hide');

                updateState({ song: { ...state.song, bpmUnit: value } });
                markAsDirty();

                // 3. Get new duration after the state has been updated
                const newBeatDurationMs = getQuarterNoteDurationMs();

                // 4. If speed changed and we're not at the start, adjust time to preserve musical position
                if (oldBeatDurationMs !== newBeatDurationMs && state.playback.timeAtPause > 0) {
                    const currentMusicalTimeInBeats = oldBeatDurationMs > 0 ? state.playback.timeAtPause / oldBeatDurationMs : 0;
                    const newTimeAtPause = currentMusicalTimeInBeats * newBeatDurationMs;
                    updateState({ playback: { ...state.playback, timeAtPause: newTimeAtPause } });
                }

                // 5. Now, update the view. It will use the corrected timeAtPause.
                updateTimelineAndEditorView();
                // --- MODIFICATION END ---
            });
        });
    });
}

// --- SAVE/LOAD LOGIC ---
function serializeSong() {
    return {
        title: state.song.title,
        bpm: state.song.bpm,
        bpmUnit: state.song.bpmUnit,
        fonts: state.song.fonts || {},
        thumbnailPage: serializeElement(state.song.thumbnailPage),
        pages: state.song.pages.map(page => serializeElement(page))
    };
}

async function saveAs() {
    try {
        const songData = serializeSong();
        const usedAssets = getAllUsedAssets();

        const newPath = await window.editorAPI.showSaveAsDialog({
            title: 'Save Song As',
            defaultPath: `${songData.title}.lyx`,
            filters: [{ name: 'LiveLyrics Project', extensions: ['lyx'] }]
        });

        if (!newPath) {
            return; // User cancelled
        }

        showLoadingDialog('Saving project...');
        await window.editorAPI.saveProject(newPath, { songData, usedAssets });

        updateState({ song: { ...state.song, currentFilePath: newPath, isDirty: false } });
        updateWindowTitle();
    } catch (error) {
        hideLoadingDialog(); // --- FIX: Hide dialog BEFORE showing the alert
        console.error('Save As failed:', error);
        await showAlertDialog('Save Failed', `Could not save the project. Reason: ${error.message}`);
    } finally {
        hideLoadingDialog();
    }
}

async function save() {
    if (!state.song.currentFilePath) {
        await saveAs();
        return;
    }
    showLoadingDialog('Saving project...');
    try {
        const songData = serializeSong();
        const usedAssets = getAllUsedAssets();
        await window.editorAPI.saveProject(state.song.currentFilePath, { songData, usedAssets });
        updateState({ song: { ...state.song, isDirty: false } });
        updateWindowTitle();
    } catch (error) {
        hideLoadingDialog(); // --- FIX: Hide dialog BEFORE showing the alert
        console.error('Save failed:', error);
        await showAlertDialog('Save Failed', `Could not save the project. Reason: ${error.message}`);
    } finally {
        hideLoadingDialog();
    }
}

async function loadSong(filePath) {
    showLoadingDialog('Opening project...');
    try {
        const result = await window.editorAPI.openProject(filePath);

        if (!result.success) {
            throw new Error(result.error);
        }

        const songData = result.data;

        // --- Reset Editor State ---
        if (DOM.pageContainer) DOM.pageContainer.innerHTML = '';
        if (DOM.stagingPageContainer) DOM.stagingPageContainer.innerHTML = '';

        const resizeCallbacks = {
            onResizeStart: () => { /* ... */ },
            onResizeEnd: () => { /* ... */ }
        };
        const domManager = new DomManager(DOM.pageContainer, resizeCallbacks);
        const stagingDomManager = new DomManager(DOM.stagingPageContainer, resizeCallbacks);
        const timelineManager = new TimelineManager();
        timelineManager.setDomManager(domManager);

        // --- Reconstruct Virtual DOM ---
        const thumbnailPage = deserializeElement(songData.thumbnailPage);
        const pages = songData.pages.map(p => deserializeElement(p));

        // --- START: MODIFICATION ---
        // Second pass for the thumbnail page's music element order
        if (songData.thumbnailPage && songData.thumbnailPage.musicElementsOrder) {
            const orderedElements = songData.thumbnailPage.musicElementsOrder
                .map(id => findVirtualElementById(thumbnailPage, id))
                .filter(Boolean);
            thumbnailPage.setMusicElementsOrder(orderedElements);
        }
        // --- END: MODIFICATION ---

        // Second pass to set music element order (requires all elements to exist first)
        pages.forEach((page, index) => {
            const pageData = songData.pages[index];
            if (pageData.musicElementsOrder) {
                const orderedElements = pageData.musicElementsOrder
                    .map(id => findVirtualElementById(page, id))
                    .filter(Boolean);
                page.setMusicElementsOrder(orderedElements);
            }
        });

        // --- Update Global State ---
        updateState({
            domManager,
            stagingDomManager,
            timelineManager,
            song: {
                title: songData.title,
                thumbnailPage: thumbnailPage,
                pages: pages,
                currentFilePath: filePath,
                isDirty: false,
                bpm: songData.bpm || 120,
                bpmUnit: songData.bpmUnit || 'q_note',
            },
            activePage: null,
            selectedElement: null,
        });

        // --- Finalize UI ---
        if (DOM.bpmValueInput) {
            DOM.bpmValueInput.value = state.song.bpm;
        }
        const bpmNoteSelect = document.getElementById('bpm-note-select-custom');
        if (bpmNoteSelect) {
            const selectedDiv = bpmNoteSelect.querySelector('.select-selected');
            const optionDiv = bpmNoteSelect.querySelector(`.select-items div[data-value="${state.song.bpmUnit}"]`);
            if (selectedDiv && optionDiv) {
                selectedDiv.dataset.value = state.song.bpmUnit;
                selectedDiv.innerHTML = optionDiv.innerHTML;
            }
        }

        jumpToPage(thumbnailPage);
        // Update the window title to show the opened file name.
        updateWindowTitle();
        showPage('editor-page');
        rebuildAllEventTimelines(); // Re-process all element events with the new structure
        reprogramAllPageTransitions(); // ADDED: Re-process all page transitions

        hideLoadingDialog(); // Hide dialog on success
    } catch (error) {
        console.error('Failed to load song:', error);
        hideLoadingDialog(); // Hide dialog on failure, BEFORE showing alert
        await showAlertDialog('Failed to Open Project', error.message);
    }
}


/**
 * Sets up the interactive dropdown menubar in the editor header.
 */
function setupMenuBar() {
    // Close all menus if the click is outside a menu item
    document.addEventListener('click', (e) => {
        const openMenuItem = document.querySelector('.menu-item.open');
        if (openMenuItem && !openMenuItem.contains(e.target)) {
            openMenuItem.classList.remove('open');
        }
    });

    document.querySelectorAll('.menu-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent the document click listener from firing immediately
            const parentItem = button.closest('.menu-item');
            const wasOpen = parentItem.classList.contains('open');

            // Close all other open menus
            document.querySelectorAll('.menu-item.open').forEach(item => {
                item.classList.remove('open');
            });

            // If the clicked menu wasn't already open, open it
            if (!wasOpen) {
                parentItem.classList.add('open');
            }
        });
    });

    // ADDED: Close dropdown when any item inside it is clicked
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item) {
                const parentMenu = menu.closest('.menu-item.open');
                if (parentMenu) {
                    parentMenu.classList.remove('open');
                }
            }
        });
    });

    // Save/Save As/Open functionality
    document.getElementById('save-btn').addEventListener('click', save);
    document.getElementById('save-as-btn').addEventListener('click', saveAs);
    document.getElementById('open-song-menu-btn').addEventListener('click', async () => {
        const filePath = await window.editorAPI.openSong();
        if (filePath) {
            if (!(await confirmCloseIfNeeded())) {
                return;
            }
            await loadSong(filePath);
        }
    });
}

/**
 * ADDED: Handles a file open request from the main process.
 * @param {string} filePath The path of the file to open.
 */
export async function handleExternalFileOpen(filePath) {
    if (!filePath) return;

    if (await confirmCloseIfNeeded()) {
        await loadSong(filePath);
    }
}

export function setupEventListeners() {
    setupTitleBar();
    setupDrawerControls();
    setupMainMenu();
    setupNewSongMenu();
    setupEditorHeader();
    setupTimelineControls();
    setupCustomSelects();
    setupMenuBar(); // ADDED

    // ADDED: Back to main menu button in editor header
    if (DOM.backToMainMenuBtn) {
        DOM.backToMainMenuBtn.addEventListener('click', async () => {
            if (await confirmCloseIfNeeded()) {
                if(state.playback.isPlaying) stop();
                window.editorAPI.goToMainMenu();
            }
        });
    }
    DOM.addPageBtn.addEventListener('click', addPage);

    DOM.bpmValueInput.addEventListener('change', (e) => {
        const newBpm = parseInt(e.target.value, 10);
        if (!isNaN(newBpm) && newBpm > 0) {
            // 1. Get old beat duration
            const oldBpm = state.song.bpm;
            const oldBeatDurationMs = getQuarterNoteDurationMs(oldBpm, state.song.bpmUnit);

            updateState({ song: { ...state.song, bpm: newBpm } });
            markAsDirty();

            // 2. Get new beat duration
            const newBeatDurationMs = getQuarterNoteDurationMs();

            // 3. If speed changed, recalculate timeAtPause to preserve musical position
            if (oldBeatDurationMs !== newBeatDurationMs && state.playback.timeAtPause > 0) {
                const currentMusicalTimeInBeats = oldBeatDurationMs > 0 ? state.playback.timeAtPause / oldBeatDurationMs : 0;
                const newTimeAtPause = currentMusicalTimeInBeats * newBeatDurationMs;
                updateState({ playback: { ...state.playback, timeAtPause: newTimeAtPause } });
            }
            updateTimelineAndEditorView();
        }
    });

    // --- MODIFICATION START: Using e.code for keyboard shortcuts ---
    document.addEventListener('keydown', async (e) => {
        const isDialogVisible = document.querySelector('.dialog-overlay.visible');
        if (isDialogVisible) {
            return;
        }

        if (!DOM.editorPage.classList.contains('active')) {
            return;
        }

        // Handle global shortcuts (Save, Open) first, regardless of input focus.
        if (e.ctrlKey || e.metaKey) { // Use metaKey for macOS Command
            switch (e.code) { // Changed from e.key.toLowerCase() to e.code
                case 'KeyS': // Changed from 's'
                    e.preventDefault();
                    if (e.shiftKey) {
                        await saveAs();
                    } else {
                        await save();
                    }
                    break;
                case 'KeyO': // Changed from 'o'
                    e.preventDefault();
                    const filePath = await window.editorAPI.openSong();
                    if (filePath) {
                        if (!(await confirmCloseIfNeeded())) {
                            return;
                        }
                        await loadSong(filePath);
                    }
                    break;
            }
        }

        // For other shortcuts, ignore if an input is focused.
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
            return;
        }

        if (e.code === 'Space') { // Already correctly using e.code
            e.preventDefault();
            if (DOM.playPauseBtn && !DOM.playPauseBtn.disabled) {
                DOM.playPauseBtn.click();
            }
        }
    });
    // --- MODIFICATION END ---

    const slideObserver = new ResizeObserver(() => {
        // During playback, the animation loop handles rendering. In edit mode, we must
        // call a function that correctly overrides transition properties before resizing.
        if (state.playback.isPlaying) {
            // During playback, a simple resize is sufficient as the next animation frame will correct everything.
            state.timelineManager.resize(false);
        } else {
            // In edit mode, triggerActivePageRender correctly applies events,
            // overrides transitions, and then resizes/renders.
            triggerActivePageRender(true);
        }

        if (state.highlightManager) {
            state.highlightManager.update();
        }
    });
    if (DOM.presentationSlide) slideObserver.observe(DOM.presentationSlide);
}
