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
    rebuildAllEventTimelines as sharedRebuildAllEventTimelines,
    reprogramAllPageTransitions as sharedReprogramAllPageTransitions
} from '../player/events.js';
import { fontLoader } from '../renderer/fontLoader.js';


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
        shadowAngle: { prop: 'boxShadow', valueKey: 'shadowAngle' },
        shadowDistance: { prop: 'boxShadow', valueKey: 'shadowDistance' },
        shadowBlur: { prop: 'boxShadow', valueKey: 'blur' },
        shadowSpread: { prop: 'boxShadow', valueKey: 'spread' },
        shadowColor: { prop: 'boxShadow', valueKey: 'color' },
        paddingTop: { prop: 'inner_padding', valueKey: 'top' },
        paddingLeft: { prop: 'inner_padding', valueKey: 'left' },
        paddingBottom: { prop: 'inner_padding', valueKey: 'bottom' },
        paddingRight: { prop: 'inner_padding', valueKey: 'right' },
        fontSize: { prop: 'textStyle', valueKey: 'fontSize' },
        textColor: { prop: 'textStyle', valueKey: 'textColor' },

        textShadowEnabled: { prop: 'textShadow', valueKey: 'enabled' },
        textShadowColor: { prop: 'textShadow', valueKey: 'color' },
        textShadowAngle: { prop: 'textShadow', valueKey: 'textShadowAngle' },
        textShadowDistance: { prop: 'textShadow', valueKey: 'textShadowDistance' },
        textShadowBlur: { prop: 'textShadow', valueKey: 'blur' },

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
        objectPositionX: { prop: 'objectPosition', valueKey: 'xPosition' },
        objectPositionY: { prop: 'objectPosition', valueKey: 'yPosition' },
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
        justifyContent: { prop: 'gravity', valueKey: 'justifyContent' },
        alignItems: { prop: 'gravity', valueKey: 'alignItems' },
        alignment: { prop: 'alignment', valueKey: 'alignment' },
    };

    const path = keyToPath[propKey];
    if (!path || !element.hasProperty(path.prop)) {
        console.warn(`[setPropertyAsDefaultValue] Could not find path for propKey: ${propKey}`);
        return;
    }

    const propertyObject = element.getProperty(path.prop);
    if (!propertyObject || typeof propertyObject.setValue !== 'function') {
        console.error(`[setPropertyAsDefaultValue] Invalid property object for ${propKey}`);
        return;
    }

    propertyObject.setValue(path.valueKey, newValue, true);

    triggerActivePageRender(true);
    markAsDirty();
}

/**
 * Rebuilds all event timelines for every element in the song.
 */
export function rebuildAllEventTimelines() {
    sharedRebuildAllEventTimelines();
    updateTimelineAndEditorView();
}

/**
 * Programs all page transitions based on their settings.
 */
export function reprogramAllPageTransitions() {
    sharedReprogramAllPageTransitions();
    updateTimelineAndEditorView();
}

/**
 * Calculates the duration of a single quarter note in milliseconds based on the UI controls.
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

    const elapsedMs = (timestamp - state.playback.animationStartTime) + state.playback.timeAtPause;
    const beatDurationMs = getQuarterNoteDurationMs(); 
    const currentMusicalTimeInBeats = beatDurationMs > 0 ? elapsedMs / beatDurationMs : 0;
    const measureMap = state.timelineManager.getMeasureMap();
    const totalDuration = measureMap.length > 0 ? measureMap.at(-1).startTime + measureMap.at(-1).duration : 0;

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

    const pagesToKeepInDom = new Set();

    const musicallyCurrentPageIndex = currentMeasure.pageIndex;
    if (musicallyCurrentPageIndex > -1) {
        pagesToKeepInDom.add(state.song.pages[musicallyCurrentPageIndex]);
    }

    const activeTransition = findActiveTransition(currentMusicalTimeInBeats, measureMap, state.song.pages);
    if (activeTransition) {
        if (activeTransition.fromPageIndex > -1) {
            pagesToKeepInDom.add(state.song.pages[activeTransition.fromPageIndex]);
        } else {
            pagesToKeepInDom.add(state.song.thumbnailPage);
        }
        if (activeTransition.toPageIndex > -1) {
            pagesToKeepInDom.add(state.song.pages[activeTransition.toPageIndex]);
        }
    } else {
        if (measureMap.length > 0 && currentMusicalTimeInBeats < measureMap[0].startTime) {
            pagesToKeepInDom.clear();
            pagesToKeepInDom.add(state.song.thumbnailPage);
        }
    }

    // Switch visible pages based on timeline requirements
    const allPossiblePages = [state.song.thumbnailPage, ...state.song.pages].filter(Boolean);
    for (const page of allPossiblePages) {
        if (pagesToKeepInDom.has(page)) {
            state.domManager.addToDom(page);
        } else {
            state.domManager.removeFromDom(page);
        }
    }

    let pageIndexForEditorState = -1;
    if (activeTransition) {
        pageIndexForEditorState = activeTransition.toPageIndex;
    } else if (currentMeasure) {
        pageIndexForEditorState = currentMeasure.pageIndex;
    }

    if (pageIndexForEditorState > -1 && state.song.pages[pageIndexForEditorState] !== state.activePage) {
        setActivePage(state.song.pages[pageIndexForEditorState]);
    } else if (pageIndexForEditorState === -1 && currentMusicalTimeInBeats < (measureMap[0]?.startTime || 0)) {
        if (state.activePage !== state.song.thumbnailPage) {
            setActivePage(state.song.thumbnailPage);
        }
    }

    state.timelineManager.renderAt(currentMeasureIndex, measureProgress);

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

    const measureMap = buildMeasureMap();
    const beatDurationMs = getQuarterNoteDurationMs();
    const currentMusicalTimeInBeats = beatDurationMs > 0 ? state.playback.timeAtPause / beatDurationMs : 0;
    const activeTransition = findActiveTransition(currentMusicalTimeInBeats, measureMap, state.song.pages);
    let pageToShow = null;

    if (activeTransition) {
        pageToShow = state.song.pages[activeTransition.toPageIndex];
    } else {
        const totalDuration = measureMap.length > 0 ? measureMap.at(-1).startTime + measureMap.at(-1).duration : 0;
        let currentMeasureIndex = measureMap.findIndex(m => currentMusicalTimeInBeats >= m.startTime && currentMusicalTimeInBeats < m.startTime + m.duration);
        if (currentMeasureIndex === -1) {
            currentMeasureIndex = (totalDuration > 0 && currentMusicalTimeInBeats >= totalDuration) ? measureMap.length - 1 : 0;
        }
        const currentMeasure = measureMap[currentMeasureIndex];
        if (currentMeasure) {
            pageToShow = state.song.pages[currentMeasure.pageIndex];
        } else if (state.song.thumbnailPage) {
            pageToShow = state.song.thumbnailPage;
        }
    }

    if (pageToShow) {
        // Enforce visibility of just this page
        const allPages = [state.song.thumbnailPage, ...state.song.pages].filter(Boolean);
        for (const p of allPages) {
            if (p === pageToShow) state.domManager.addToDom(p);
            else state.domManager.removeFromDom(p);
        }

        if (pageToShow !== state.activePage) {
            setActivePage(pageToShow);
        }
    }

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
        const allPages = [state.song.thumbnailPage, ...state.song.pages].filter(Boolean);
        for (const p of allPages) {
            if (p === state.activePage) state.domManager.addToDom(p);
            else state.domManager.removeFromDom(p);
        }
    }

    state.timelineManager.notifyPlaybackState(false);
    updateTimelineAndEditorView();
}

function updatePlaybackControlsState() {
    if (!DOM.playPauseBtn || !DOM.backwardBtn || !DOM.forwardBtn) return;
    const hasAnyMeasures = buildMeasureMap().length > 0;
    DOM.playPauseBtn.disabled = !hasAnyMeasures;
    DOM.backwardBtn.disabled = !hasAnyMeasures;
    DOM.forwardBtn.disabled = !hasAnyMeasures;
}

export function updateTimelineAndEditorView() {
    if (state.playback.isPlaying || !state.timelineManager) return;

    const measureMap = buildMeasureMap();
    const lyricsTimingMap = buildLyricsTimingMap(measureMap);
    state.timelineManager.setMeasureMap(measureMap);
    state.timelineManager.setLyricsTimingMap(lyricsTimingMap);

    const beatDurationMs = getQuarterNoteDurationMs();
    const currentMusicalTimeInBeats = beatDurationMs > 0 ? state.playback.timeAtPause / beatDurationMs : 0;
    const totalDuration = measureMap.length > 0 ? measureMap.at(-1).startTime + measureMap.at(-1).duration : 0;

    const EPSILON = 0.0001;
    let currentMeasureIndex = measureMap.findIndex(m => (currentMusicalTimeInBeats + EPSILON) >= m.startTime && (currentMusicalTimeInBeats + EPSILON) < m.startTime + m.duration);

    if (currentMeasureIndex === -1) {
        currentMeasureIndex = totalDuration > 0 && currentMusicalTimeInBeats >= totalDuration ? measureMap.length - 1 : 0;
    }
    if (measureMap.length === 0) {
        currentMeasureIndex = 0;
    }

    const currentMeasure = measureMap[currentMeasureIndex] || { startTime: 0, duration: 0, pageIndex: 0 };

    const currentMeasureForPageSwitch = measureMap[currentMeasureIndex];
    if (currentMeasureForPageSwitch) {
        const pageFromTimeline = state.song.pages[currentMeasureForPageSwitch.pageIndex];
        if (pageFromTimeline && pageFromTimeline !== state.activePage) {
            const activePageIsMusical = pageHasMeasures(state.activePage);
            if (activePageIsMusical) {
                setActivePage(pageFromTimeline);
            }
        }
    }

    const timeIntoMeasure = currentMusicalTimeInBeats - currentMeasure.startTime;
    const measureProgress = currentMeasure.duration > 0 ? timeIntoMeasure / currentMeasure.duration : 0;

    state.timelineManager.applyEventsAt(currentMeasureIndex, measureProgress);

    const managers = [state.domManager, state.stagingDomManager].filter(Boolean);
    for (const manager of managers) {
        const pagesInDom = manager.getManagedPages().filter(p => p.addedInDom);
        for (const page of pagesInDom) {
            const opacityValue = page.getProperty('effects').getOpacity();
            opacityValue.setValue(opacityValue.getDefaultValue());

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

    if (state.domManager) state.domManager.render();
    if (state.stagingDomManager) state.stagingDomManager.render();

    const timelineBar = document.querySelector('.timeline-bar');
    if (timelineBar) {
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
            if (totalDuration > 0 && currentMusicalTimeInBeats >= totalDuration) {
                displayTimeIntoMeasure = Math.max(0, currentMeasure.duration - 0.00001);
            }

            const beatInMeasure = Math.floor(displayTimeIntoMeasure) + 1;
            const msProgress = (displayTimeIntoMeasure - Math.floor(displayTimeIntoMeasure)) * beatDurationMs;
            text.textContent = `${currentMeasureIndex + 1} | ${beatInMeasure} | ${String(Math.floor(msProgress)).padStart(4, '0')}`;
        }
    }

    updatePlaybackControlsState();
}

function jumpToMeasure(direction) {
    const wasPlaying = state.playback.isPlaying;
    if (wasPlaying) {
        cancelAnimationFrame(state.playback.animationFrameId);
    }

    const measureMap = state.timelineManager.getMeasureMap();
    if (measureMap.length === 0) {
        if (wasPlaying) stop();
        return;
    }

    const beatDurationMs = getQuarterNoteDurationMs();
    const totalDurationInBeats = measureMap.at(-1).startTime + measureMap.at(-1).duration;
    const currentMusicalTime = beatDurationMs > 0 ? state.playback.timeAtPause / beatDurationMs : 0;

    const EPSILON = 0.0001;

    let currentMeasureIndex = measureMap.findIndex(m => (currentMusicalTime + EPSILON) >= m.startTime && (currentMusicalTime + EPSILON) < m.startTime + m.duration);

    if (currentMeasureIndex === -1) {
        currentMeasureIndex = ((currentMusicalTime + EPSILON) >= totalDurationInBeats) ? measureMap.length - 1 : 0;
    }

    let newTimeInBeats;

    if (direction === 1) { 
        if (currentMeasureIndex === measureMap.length - 1) {
            newTimeInBeats = totalDurationInBeats;
        } else {
            const targetMeasureIndex = currentMeasureIndex + 1;
            newTimeInBeats = measureMap[targetMeasureIndex].startTime;
        }
    } else { 
        if (currentMeasureIndex === 0 && ((currentMusicalTime + EPSILON) - measureMap[0].startTime) < 0.01) {
            newTimeInBeats = 0;
        } else {
            const isAtStartOfMeasure = ((currentMusicalTime + EPSILON) - measureMap[currentMeasureIndex].startTime) < 0.01;
            const targetMeasureIndex = isAtStartOfMeasure ? currentMeasureIndex - 1 : currentMeasureIndex;
            newTimeInBeats = measureMap[targetMeasureIndex].startTime;
        }
    }

    state.playback.timeAtPause = newTimeInBeats * beatDurationMs;
    state.playback.songHasEnded = newTimeInBeats >= totalDurationInBeats;

    updateTimelineAndEditorView();

    if (wasPlaying) {
        state.playback.animationStartTime = performance.now();
        state.playback.animationFrameId = requestAnimationFrame(animationLoop);
    }
}

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
    elements: [],
    currentIndex: -1,
    timeout: null,
};
const CLICK_TOLERANCE = 5;

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

            candidates.push({ element: state.activePage.domElement, depth: -1 });

            selectionCycle.elements = candidates;
            selectionCycle.currentIndex = 0;
        } else {
            selectionCycle.currentIndex++;
            if (selectionCycle.currentIndex >= selectionCycle.elements.length) {
                selectionCycle.currentIndex = 0;
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

    DOM.createSongBtn.addEventListener('click', async () => { 
        const songTitle = DOM.songTitleInput.value.trim();
        if (!songTitle) return;

        if (window.editorAPI && window.editorAPI.initTempFolder) {
            await window.editorAPI.initTempFolder();
        }

        if (DOM.resizingOverlay) {
            DOM.resizingOverlay.style.opacity = '0';
            DOM.resizingOverlay.style.transition = 'opacity 150ms ease-in-out';
            DOM.resizingOverlay.style.display = 'none';
        }

        const domManager = new DomManager(DOM.pageContainer);
        const stagingDomManager = new DomManager(DOM.stagingPageContainer);
        const timelineManager = new TimelineManager();
        timelineManager.setDomManager(domManager);

        const thumbnailPage = new VirtualPage({ name: 'Thumbnail' });
        const firstPage = new VirtualPage();

        const titleElement = new VirtualTitle({ textContent: songTitle }, 'Song Title');
        const vContainer = new VirtualContainer({ name: 'Title Container', alignment: 'vertical' });
        vContainer.addElement(titleElement);
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

function setupCustomSelects() {
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
            document.querySelectorAll('.custom-select .select-items').forEach(otherItems => {
                if (otherItems !== items) {
                    otherItems.classList.add('select-hide');
                }
            });
            items.classList.toggle('select-hide');
        });

        items.querySelectorAll('div').forEach(option => {
            option.addEventListener('click', function() {
                const oldBeatDurationMs = getQuarterNoteDurationMs();

                const value = this.dataset.value;
                const content = this.innerHTML;
                selected.innerHTML = content;
                selected.dataset.value = value;
                items.classList.add('select-hide');

                updateState({ song: { ...state.song, bpmUnit: value } });
                markAsDirty();

                const newBeatDurationMs = getQuarterNoteDurationMs();

                if (oldBeatDurationMs !== newBeatDurationMs && state.playback.timeAtPause > 0) {
                    const currentMusicalTimeInBeats = oldBeatDurationMs > 0 ? state.playback.timeAtPause / oldBeatDurationMs : 0;
                    const newTimeAtPause = currentMusicalTimeInBeats * newBeatDurationMs;
                    updateState({ playback: { ...state.playback, timeAtPause: newTimeAtPause } });
                }

                updateTimelineAndEditorView();
            });
        });
    });
}

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
            return; 
        }

        showLoadingDialog('Saving project...');
        await window.editorAPI.saveProject(newPath, { songData, usedAssets });

        updateState({ song: { ...state.song, currentFilePath: newPath, isDirty: false } });
        updateWindowTitle();
    } catch (error) {
        hideLoadingDialog();
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
        hideLoadingDialog();
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

        if (DOM.pageContainer) DOM.pageContainer.innerHTML = '';
        if (DOM.stagingPageContainer) DOM.stagingPageContainer.innerHTML = '';

        fontLoader.clear();

        const domManager = new DomManager(DOM.pageContainer);
        const stagingDomManager = new DomManager(DOM.stagingPageContainer);
        const timelineManager = new TimelineManager();
        timelineManager.setDomManager(domManager);

        const thumbnailPage = deserializeElement(songData.thumbnailPage);
        const pages = songData.pages.map(p => deserializeElement(p));

        if (songData.thumbnailPage && songData.thumbnailPage.musicElementsOrder) {
            const orderedElements = songData.thumbnailPage.musicElementsOrder
                .map(id => findVirtualElementById(thumbnailPage, id))
                .filter(Boolean);
            thumbnailPage.setMusicElementsOrder(orderedElements);
        }

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
                fonts: songData.fonts || {}
            },
            activePage: null,
            selectedElement: null,
        });

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

        if (songData.fonts) {
            fontLoader.loadFonts(songData.fonts);
        }

        jumpToPage(thumbnailPage);
        updateWindowTitle();
        showPage('editor-page');
        rebuildAllEventTimelines();
        reprogramAllPageTransitions();

        hideLoadingDialog();
    } catch (error) {
        console.error('Failed to load song:', error);
        hideLoadingDialog();
        await showAlertDialog('Failed to Open Project', error.message);
    }
}

function setupMenuBar() {
    document.addEventListener('click', (e) => {
        const openMenuItem = document.querySelector('.menu-item.open');
        if (openMenuItem && !openMenuItem.contains(e.target)) {
            openMenuItem.classList.remove('open');
        }
    });

    document.querySelectorAll('.menu-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation(); 
            const parentItem = button.closest('.menu-item');
            const wasOpen = parentItem.classList.contains('open');

            document.querySelectorAll('.menu-item.open').forEach(item => {
                item.classList.remove('open');
            });

            if (!wasOpen) {
                parentItem.classList.add('open');
            }
        });
    });

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
    setupMenuBar(); 

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
            const oldBpm = state.song.bpm;
            const oldBeatDurationMs = getQuarterNoteDurationMs(oldBpm, state.song.bpmUnit);

            updateState({ song: { ...state.song, bpm: newBpm } });
            markAsDirty();

            const newBeatDurationMs = getQuarterNoteDurationMs();

            if (oldBeatDurationMs !== newBeatDurationMs && state.playback.timeAtPause > 0) {
                const currentMusicalTimeInBeats = oldBeatDurationMs > 0 ? state.playback.timeAtPause / oldBeatDurationMs : 0;
                const newTimeAtPause = currentMusicalTimeInBeats * newBeatDurationMs;
                updateState({ playback: { ...state.playback, timeAtPause: newTimeAtPause } });
            }
            updateTimelineAndEditorView();
        }
    });

    document.addEventListener('keydown', async (e) => {
        const isDialogVisible = document.querySelector('.dialog-overlay.visible');
        if (isDialogVisible) {
            return;
        }

        if (!DOM.editorPage.classList.contains('active')) {
            return;
        }

        if (e.ctrlKey || e.metaKey) { 
            switch (e.code) { 
                case 'KeyS': 
                    e.preventDefault();
                    if (e.shiftKey) {
                        await saveAs();
                    } else {
                        await save();
                    }
                    break;
                case 'KeyO': 
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

        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
            return;
        }

        if (e.code === 'Space') { 
            e.preventDefault();
            if (DOM.playPauseBtn && !DOM.playPauseBtn.disabled) {
                DOM.playPauseBtn.click();
            }
        }
    });

    const slideObserver = new ResizeObserver(() => {
        if (state.playback.isPlaying) {
            state.timelineManager.resize(false);
        } else {
            triggerActivePageRender(true);
        }

        if (state.highlightManager) {
            state.highlightManager.update();
        }
    });
    if (DOM.presentationSlide) slideObserver.observe(DOM.presentationSlide);
}

