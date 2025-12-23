// src/renderer/js/player/events.js

import { state } from '../editor/state.js';
import { buildMeasureMap, findAllElementsRecursive, calculateGlobalMeasureOffsetForElement } from '../editor/utils.js';
import { NumberEvent } from "../renderer/events/numberEvent.js";
import { UnitEvent } from "../renderer/events/unitEvent.js";
import { StringEvent } from '../renderer/events/stringEvent.js';
import { BooleanEvent } from '../renderer/events/booleanEvent.js';


/**
 * Calculates the duration of a quarter note in milliseconds based on the song's BPM settings.
 */
export function getQuarterNoteDurationMs(songData = state.song) {
    if (!songData) return 0;
    const bpm = songData.bpm || 120;
    const bpmUnit = songData.bpmUnit || 'q_note';

    const noteMultipliers = {
        'w_note': 4,
        'h_note': 2,
        'q_note': 1,
        'e_note': 0.5,
        's_note': 0.25,
        'w_note_dotted': 6,
        'h_note_dotted': 3,
        'q_note_dotted': 1.5,
        'e_note_dotted': 0.75,
    };

    const multiplier = noteMultipliers[bpmUnit] || 1;
    const quarterNotesPerMinute = bpm * multiplier;

    if (quarterNotesPerMinute === 0) return 0;

    return 60000 / quarterNotesPerMinute;
}

/**
 * Rebuilds all event timelines for every element in the song.
 */
export function rebuildAllEventTimelines() {
    if (!state.song) return;
    const newMeasureMap = buildMeasureMap();

    const allPages = [state.song.thumbnailPage, ...state.song.pages].filter(Boolean);

    allPages.forEach(page => {
        const allElementsOnPage = findAllElementsRecursive(page);
        allElementsOnPage.push(page);

        allElementsOnPage.forEach(element => {
            if (typeof element.setEventsData !== 'function') {
                return;
            }

            const eventsDataToSet = element.tempEventsData || element.getEventsData();

            if (element.tempEventsData) {
                delete element.tempEventsData;
            }

            const newOffset = calculateGlobalMeasureOffsetForElement(element.id, newMeasureMap);
            element.setEventsData(eventsDataToSet, newOffset, newMeasureMap);
        });
    });
}


/**
 * Recalculates the start and end times for all page transitions based on the current
 * measure map and BPM.
 */
export function reprogramAllPageTransitions() {
    if (!state.song || !state.song.pages) return;

    const measureMap = buildMeasureMap();
    const allPages = state.song.pages;
    const allPagesWithThumbnail = [state.song.thumbnailPage, ...allPages].filter(Boolean);

    // Clear all old programmatically added transition events
    allPagesWithThumbnail.forEach(page => {
        const opacityValue = page.getProperty('effects').getOpacity();
        const transform = page.getProperty('transform');
        const parentPerspective = page.getProperty('parentPerspective');
        const perspectiveScale = page.getProperty('perspectiveScale');
        
        const zIndexProp = page.getProperty('zIndex');
        if (zIndexProp) {
            zIndexProp.getZIndex().getEvents().clearTransitionEvents();
            zIndexProp.getZIndex().applyDefaultEvent();
        }

        opacityValue.getEvents().clearTransitionEvents();
        if (transform) {
            transform.getEnabled().getEvents().clearTransitionEvents();
            transform.getTranslateX().getEvents().clearTransitionEvents();
            transform.getTranslateY().getEvents().clearTransitionEvents();
            transform.getTranslateZ().getEvents().clearTransitionEvents();
            transform.getScaleX().getEvents().clearTransitionEvents();
            transform.getScaleY().getEvents().clearTransitionEvents();
            transform.getRotateX().getEvents().clearTransitionEvents();
            transform.getRotateY().getEvents().clearTransitionEvents();
            transform.getRotateZ().getEvents().clearTransitionEvents();
            transform.getSelfPerspective().getEvents().clearTransitionEvents();
            transform.getTransformOriginZ().getEvents().clearTransitionEvents();
            transform.getBackfaceVisibility().getEvents().clearTransitionEvents();
        }
        if (parentPerspective) {
            parentPerspective.getEnabled().getEvents().clearTransitionEvents();
            parentPerspective.getPerspective().getEvents().clearTransitionEvents();
            parentPerspective.getRotateX().getEvents().clearTransitionEvents();
            parentPerspective.getRotateY().getEvents().clearTransitionEvents();
            parentPerspective.getRotateZ().getEvents().clearTransitionEvents();
            parentPerspective.getScale().getEvents().clearTransitionEvents();
            parentPerspective.getTransformStyle().getEvents().clearTransitionEvents();
        }
        if (perspectiveScale) {
            perspectiveScale.getDirection().getEvents().clearTransitionEvents();
        }
    });


    for (let i = 0; i < allPages.length; i++) {
        const destPage = allPages[i];
        const transition = destPage.transition;
        if (transition.type === 'instant') continue;

        const firstMeasureOfDestPage = measureMap.find(m => m.pageIndex === i);
        const sourcePage = (i === 0) ? state.song.thumbnailPage : allPages[i - 1];

        let transitionStartBeat;
        if (firstMeasureOfDestPage) {
            transitionStartBeat = firstMeasureOfDestPage.startTime + (transition.offsetBeats || 0);
        } else {
            let prevEndTime = 0;
            for (let j = i - 1; j >= 0; j--) {
                const prevPageMeasures = measureMap.filter(m => m.pageIndex === j);
                if (prevPageMeasures.length > 0) {
                    const lastMeasure = prevPageMeasures[prevPageMeasures.length - 1];
                    prevEndTime = lastMeasure.startTime + lastMeasure.duration;
                    break;
                }
            }
            transitionStartBeat = prevEndTime + (transition.offsetBeats || 0);
        }
        
        const startMeasureInfo = measureMap.find(m => m.startTime <= transitionStartBeat && (m.startTime + m.duration) > transitionStartBeat) 
            || (transitionStartBeat < 0 ? measureMap[0] : measureMap[measureMap.length - 1]);
            
        if (!startMeasureInfo) continue;

        const transitionStartMeasure = startMeasureInfo.globalIndex;
        const transitionStartProgress = startMeasureInfo.duration > 0 ? (transitionStartBeat - startMeasureInfo.startTime) / startMeasureInfo.duration : 0;

        let durationInBeats = 0;
        if (transition.durationUnit === 'beats') {
            durationInBeats = transition.duration || 1;
        } else { 
            if (firstMeasureOfDestPage) {
                let currentMeasureIdx = measureMap.indexOf(firstMeasureOfDestPage);
                for (let j = 0; j < (transition.duration || 1); j++) {
                    if (measureMap[currentMeasureIdx + j]) {
                        durationInBeats += measureMap[currentMeasureIdx + j].duration;
                    }
                }
            } else {
                durationInBeats = (transition.duration || 1) * 4;
            }
        }
        
        const transitionEndBeat = transitionStartBeat + durationInBeats;
        const endMeasureInfo = measureMap.find(m => m.startTime <= transitionEndBeat && (m.startTime + m.duration) > transitionEndBeat) 
            || measureMap[measureMap.length - 1];

        const transitionEndMeasure = endMeasureInfo.globalIndex;
        const transitionEndProgress = endMeasureInfo.duration > 0 ? (transitionEndBeat - endMeasureInfo.startTime) / endMeasureInfo.duration : 0;

        const midpointBeatTime = transitionStartBeat + (durationInBeats / 2);
        const midMeasureInfo = measureMap.find(m => m.startTime <= midpointBeatTime && (m.startTime + m.duration) > midpointBeatTime) || measureMap[measureMap.length - 1];
        const transitionMidMeasure = midMeasureInfo.globalIndex;
        const transitionMidProgress = midMeasureInfo.duration > 0 ? (midpointBeatTime - midMeasureInfo.startTime) / midMeasureInfo.duration : 0;

        // --- Event Object Helpers ---
        const startOpts = { ease: 'linear', measureIndex: transitionStartMeasure, measureProgress: transitionStartProgress, isTransition: true };
        const midOpts = { ease: 'linear', measureIndex: transitionMidMeasure, measureProgress: transitionMidProgress, isTransition: true };
        const endOpts = { ease: 'linear', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress, isTransition: true };
        
        const instantStartOpts = { ...startOpts, ease: 'instant' };
        const instantMidOpts = { ...midOpts, ease: 'instant' }; // <--- ADDED DEFINITION
        const instantEndOpts = { ...endOpts, ease: 'instant' };

        // Helper to set Z-Index
        const setZIndex = (page, zIndex) => {
            if (!page) return;
            const zProp = page.getProperty('zIndex');
            if (zProp) {
                zProp.getZIndex().addEvent(new NumberEvent({ value: zIndex, ...instantStartOpts }));
                zProp.getZIndex().addEvent(new NumberEvent({ value: 0, ...instantEndOpts }));
            }
        };

        // --- UPDATED Z-ORDER: Source is Top (2), Target is Behind (1) ---
        const sourceZ = 2;
        const destZ = 1;

        setZIndex(sourcePage, sourceZ);
        setZIndex(destPage, destZ);

        // --- Program Destination Page Events ---
        if (transition.type === 'fade') {
            const opacity = destPage.getProperty('effects').getOpacity();
            opacity.addEvent(new NumberEvent({ value: 0, ...startOpts }));
            opacity.addEvent(new NumberEvent({ value: 1, ...endOpts }));
        } else if (transition.type === 'dip-to-black') {
            const destOpacity = destPage.getProperty('effects').getOpacity();
            destOpacity.addEvent(new NumberEvent({ value: 0, ...startOpts }));
            destOpacity.addEvent(new NumberEvent({ value: 0, ...midOpts }));
            destOpacity.addEvent(new NumberEvent({ value: 1, ...endOpts }));
        } else if (transition.type === 'push') {
            const transform = destPage.getProperty('transform');
            transform.getEnabled().addEvent(new BooleanEvent({ value: true, ...instantStartOpts }));
            let startValue, endValue, transformProp;
            switch (transition.direction) {
                case 'left': startValue = { value: 100, unit: 'pw' }; endValue = { value: 0, unit: 'pw' }; transformProp = transform.getTranslateX(); break;
                case 'right': startValue = { value: -100, unit: 'pw' }; endValue = { value: 0, unit: 'pw' }; transformProp = transform.getTranslateX(); break;
                case 'up': startValue = { value: 100, unit: 'ph' }; endValue = { value: 0, unit: 'ph' }; transformProp = transform.getTranslateY(); break;
                case 'down': startValue = { value: -100, unit: 'ph' }; endValue = { value: 0, unit: 'ph' }; transformProp = transform.getTranslateY(); break;
            }
            if(transformProp) {
                transformProp.addEvent(new UnitEvent({ value: startValue.value, unit: startValue.unit, ...startOpts }));
                transformProp.addEvent(new UnitEvent({ value: endValue.value, unit: endValue.unit, ...endOpts }));
            }
            transform.getEnabled().addEvent(new BooleanEvent({ value: false, ...instantEndOpts }));

        } else if (transition.type === 'flip') {
            const destTransform = destPage.getProperty('transform');
            const destParentPerspective = destPage.getProperty('parentPerspective');
            const perspective = transition.perspective || { value: 2000, unit: 'px' };
            const destOpacity = destPage.getProperty('effects').getOpacity();
            destOpacity.addEvent(new NumberEvent({ value: 0, ...instantStartOpts }));
            destOpacity.addEvent(new NumberEvent({ value: 1, ...instantMidOpts })); // Uses the fix
            destOpacity.addEvent(new NumberEvent({ value: 1, ...instantEndOpts }));
            destTransform.setValue('backface-visibility', 'hidden', true);
            destParentPerspective.getEnabled().addEvent(new BooleanEvent({ value: true, ...instantStartOpts }));
            destParentPerspective.getPerspective().addEvent(new UnitEvent({ value: perspective.value, unit: perspective.unit, ...instantStartOpts }));
            destParentPerspective.getTransformStyle().addEvent(new StringEvent({ value: 'preserve-3d', ...instantStartOpts }));
            destTransform.getEnabled().addEvent(new BooleanEvent({ value: true, ...instantStartOpts }));
            let parentRotator, transformRotator, rotationEnd, destInitialRotation;
            switch (transition.direction) {
                case 'left': parentRotator = destParentPerspective.getRotateY(); transformRotator = destTransform.getRotateY(); rotationEnd = -180; destInitialRotation = 180; break;
                case 'right': parentRotator = destParentPerspective.getRotateY(); transformRotator = destTransform.getRotateY(); rotationEnd = 180; destInitialRotation = -180; break;
                case 'up': parentRotator = destParentPerspective.getRotateX(); transformRotator = destTransform.getRotateX(); rotationEnd = 180; destInitialRotation = -180; break;
                case 'down': parentRotator = destParentPerspective.getRotateX(); transformRotator = destTransform.getRotateX(); rotationEnd = -180; destInitialRotation = 180; break;
            }
            if (transformRotator) transformRotator.addEvent(new NumberEvent({ value: destInitialRotation, ...instantStartOpts }));
            if (parentRotator) {
                parentRotator.addEvent(new NumberEvent({ value: 0, ...startOpts }));
                parentRotator.addEvent(new NumberEvent({ value: rotationEnd, ...endOpts }));
            }
            destParentPerspective.getEnabled().addEvent(new BooleanEvent({ value: false, ...instantEndOpts }));
            destTransform.getEnabled().addEvent(new BooleanEvent({ value: false, ...instantEndOpts }));
            if (transformRotator) transformRotator.addEvent(new NumberEvent({ value: 0, ...instantEndOpts }));

        } else if (transition.type === 'cube') {
            const destTransform = destPage.getProperty('transform');
            const destPerspectiveScale = destPage.getProperty('perspectiveScale');
            let translateZ_val, rotatorProp, rotationStart, rotationEnd, defaultPerspectiveValue;
            if (transition.direction === 'left' || transition.direction === 'right') {
                translateZ_val = { value: 50, unit: 'pw' }; rotatorProp = 'rotateY';
                rotationStart = 0; rotationEnd = transition.direction === 'left' ? 90 : -90;
                defaultPerspectiveValue = state.domManager ? state.domManager.getWidth() : 1920;
            } else { 
                translateZ_val = { value: 50, unit: 'ph' }; rotatorProp = 'rotateX';
                rotationStart = 0; rotationEnd = transition.direction === 'up' ? -90 : 90;
                defaultPerspectiveValue = state.domManager ? state.domManager.getHeight() : 1080;
            }
            const perspective = transition.perspective || { value: defaultPerspectiveValue, unit: 'px' };
            const destParentPerspective = destPage.getProperty('parentPerspective');
            destParentPerspective.getEnabled().addEvent(new BooleanEvent({ value: true, ...instantStartOpts }));
            destParentPerspective.getPerspective().addEvent(new UnitEvent({ value: perspective.value, unit: perspective.unit, ...instantStartOpts }));
            destParentPerspective.getTransformStyle().addEvent(new StringEvent({ value: 'preserve-3d', ...instantStartOpts }));
            if (destPerspectiveScale) {
                destPerspectiveScale.getDirection().addEvent(new StringEvent({ value: transition.direction, ...instantStartOpts }));
                destPerspectiveScale.getDirection().addEvent(new StringEvent({ value: 'none', ...instantEndOpts }));
            }
            destTransform.getEnabled().addEvent(new BooleanEvent({ value: true, ...instantStartOpts }));
            let destStartRotateProp, destStartRotateVal;
            switch (transition.direction) {
                case 'left': destStartRotateProp = destTransform.getRotateY(); destStartRotateVal = -90; break;
                case 'right': destStartRotateProp = destTransform.getRotateY(); destStartRotateVal = 90; break;
                case 'up': destStartRotateProp = destTransform.getRotateX(); destStartRotateVal = 90; break;
                case 'down': destStartRotateProp = destTransform.getRotateX(); destStartRotateVal = -90; break;
            }
            if (destStartRotateProp) destStartRotateProp.addEvent(new NumberEvent({ value: destStartRotateVal, ...instantStartOpts }));
            destTransform.getTranslateZ().addEvent(new UnitEvent({ value: translateZ_val.value, unit: translateZ_val.unit, ...instantStartOpts }));
            const destRotator = destParentPerspective[rotatorProp === 'rotateY' ? 'getRotateY' : 'getRotateX']();
            destRotator.addEvent(new NumberEvent({ value: rotationStart, ...startOpts }));
            destRotator.addEvent(new NumberEvent({ value: rotationEnd, ...endOpts }));
            destParentPerspective.getEnabled().addEvent(new BooleanEvent({ value: false, ...instantEndOpts }));
            destTransform.getEnabled().addEvent(new BooleanEvent({ value: false, ...instantEndOpts }));

            if (sourcePage) {
                const sourceTransform = sourcePage.getProperty('transform');
                const sourceParentPerspective = sourcePage.getProperty('parentPerspective');
                const sourcePerspectiveScale = sourcePage.getProperty('perspectiveScale');
                sourceParentPerspective.getEnabled().addEvent(new BooleanEvent({ value: true, ...instantStartOpts }));
                sourceParentPerspective.getPerspective().addEvent(new UnitEvent({ value: perspective.value, unit: perspective.unit, ...instantStartOpts }));
                sourceParentPerspective.getTransformStyle().addEvent(new StringEvent({ value: 'preserve-3d', ...instantStartOpts }));
                if (sourcePerspectiveScale) {
                    sourcePerspectiveScale.getDirection().addEvent(new StringEvent({ value: transition.direction, ...instantStartOpts }));
                    sourcePerspectiveScale.getDirection().addEvent(new StringEvent({ value: 'none', ...instantEndOpts }));
                }
                sourceTransform.getEnabled().addEvent(new BooleanEvent({ value: true, ...instantStartOpts }));
                sourceTransform.getTranslateZ().addEvent(new UnitEvent({ value: translateZ_val.value, unit: translateZ_val.unit, ...instantStartOpts }));
                const sourceRotator = sourceParentPerspective[rotatorProp === 'rotateY' ? 'getRotateY' : 'getRotateX']();
                sourceRotator.addEvent(new NumberEvent({ value: rotationStart, ...startOpts }));
                sourceRotator.addEvent(new NumberEvent({ value: rotationEnd, ...endOpts }));
                sourceParentPerspective.getEnabled().addEvent(new BooleanEvent({ value: false, ...instantEndOpts }));
                sourceTransform.getEnabled().addEvent(new BooleanEvent({ value: false, ...instantEndOpts }));
            }
        }

        // --- Program Source Page Events ---
        if (sourcePage) {
            if (transition.type === 'fade') {
                const opacity = sourcePage.getProperty('effects').getOpacity();
                opacity.addEvent(new NumberEvent({ value: 1, ...startOpts }));
                opacity.addEvent(new NumberEvent({ value: 0, ...endOpts }));
            } else if (transition.type === 'dip-to-black') {
                const sourceOpacity = sourcePage.getProperty('effects').getOpacity();
                sourceOpacity.addEvent(new NumberEvent({ value: 1, ...startOpts }));
                sourceOpacity.addEvent(new NumberEvent({ value: 0, ...midOpts }));
            } else if (transition.type === 'fly') {
                const toTransform = destPage.getProperty('transform');
                const fromTransform = sourcePage.getProperty('transform');
                toTransform.getEnabled().addEvent(new BooleanEvent({ value: true, ...instantStartOpts }));
                fromTransform.getEnabled().addEvent(new BooleanEvent({ value: true, ...instantStartOpts }));
                const sourceOpacity = sourcePage.getProperty('effects').getOpacity();
                sourceOpacity.addEvent(new NumberEvent({ value: 1, ...startOpts }));
                sourceOpacity.addEvent(new NumberEvent({ value: 0, ...endOpts }));
                const destOpacity = destPage.getProperty('effects').getOpacity();
                destOpacity.addEvent(new NumberEvent({ value: 0, ...startOpts }));
                destOpacity.addEvent(new NumberEvent({ value: 1, ...endOpts }));
                let fromStartScale, fromEndScale, toStartScale, toEndScale;
                const factor = transition.scaleFactor !== undefined ? transition.scaleFactor : 2;
                const invFactor = 1 / factor;
                if (transition.direction === 'in') {
                    fromStartScale = 1; fromEndScale = invFactor;
                    toStartScale = factor; toEndScale = 1;
                } else {
                    fromStartScale = 1; fromEndScale = factor;
                    toStartScale = invFactor; toEndScale = 1;
                }
                const applyScale = (transformProp, startVal, endVal) => {
                    transformProp.getScaleX().addEvent(new NumberEvent({ value: startVal, ...startOpts }));
                    transformProp.getScaleX().addEvent(new NumberEvent({ value: endVal, ...endOpts }));
                    transformProp.getScaleY().addEvent(new NumberEvent({ value: startVal, ...startOpts }));
                    transformProp.getScaleY().addEvent(new NumberEvent({ value: endVal, ...endOpts }));
                };
                applyScale(fromTransform, fromStartScale, fromEndScale);
                applyScale(toTransform, toStartScale, toEndScale);
                toTransform.getEnabled().addEvent(new BooleanEvent({ value: false, ...instantEndOpts }));
                fromTransform.getEnabled().addEvent(new BooleanEvent({ value: false, ...instantEndOpts }));
                toTransform.getScaleX().addEvent(new NumberEvent({ value: 1, ...instantEndOpts }));
                toTransform.getScaleY().addEvent(new NumberEvent({ value: 1, ...instantEndOpts }));
                fromTransform.getScaleX().addEvent(new NumberEvent({ value: 1, ...instantEndOpts }));
                fromTransform.getScaleY().addEvent(new NumberEvent({ value: 1, ...instantEndOpts }));

            } else if (transition.type === 'push') {
                const transform = sourcePage.getProperty('transform');
                transform.getEnabled().addEvent(new BooleanEvent({ value: true, ...instantStartOpts }));
                let startValue, endValue, transformProp;
                switch (transition.direction) {
                    case 'left': startValue = { value: 0, unit: 'pw' }; endValue = { value: -100, unit: 'pw' }; transformProp = transform.getTranslateX(); break;
                    case 'right': startValue = { value: 0, unit: 'pw' }; endValue = { value: 100, unit: 'pw' }; transformProp = transform.getTranslateX(); break;
                    case 'up': startValue = { value: 0, unit: 'ph' }; endValue = { value: -100, unit: 'ph' }; transformProp = transform.getTranslateY(); break;
                    case 'down': startValue = { value: 0, unit: 'ph' }; endValue = { value: 100, unit: 'ph' }; transformProp = transform.getTranslateY(); break;
                }
                if(transformProp) {
                    transformProp.addEvent(new UnitEvent({ value: startValue.value, unit: startValue.unit, ...startOpts }));
                    transformProp.addEvent(new UnitEvent({ value: endValue.value, unit: endValue.unit, ...endOpts }));
                }
                transform.getEnabled().addEvent(new BooleanEvent({ value: false, ...instantEndOpts }));

            } else if (transition.type === 'flip') {
                const sourceTransform = sourcePage.getProperty('transform');
                const sourceParentPerspective = sourcePage.getProperty('parentPerspective');
                const perspective = transition.perspective || { value: 2000, unit: 'px' };
                const sourceOpacity = sourcePage.getProperty('effects').getOpacity();
                sourceOpacity.addEvent(new NumberEvent({ value: 1, ...instantStartOpts }));
                sourceOpacity.addEvent(new NumberEvent({ value: 0, ...instantMidOpts })); // Uses the fix
                sourceOpacity.addEvent(new NumberEvent({ value: 1, ...instantEndOpts }));
                sourceTransform.setValue('backface-visibility', 'hidden', true);
                sourceParentPerspective.getEnabled().addEvent(new BooleanEvent({ value: true, ...instantStartOpts }));
                sourceParentPerspective.getPerspective().addEvent(new UnitEvent({ value: perspective.value, unit: perspective.unit, ...instantStartOpts }));
                sourceParentPerspective.getTransformStyle().addEvent(new StringEvent({ value: 'preserve-3d', ...instantStartOpts }));
                sourceTransform.getEnabled().addEvent(new BooleanEvent({ value: true, ...instantStartOpts }));
                let parentRotator, rotationEnd;
                switch (transition.direction) {
                    case 'left': parentRotator = sourceParentPerspective.getRotateY(); rotationEnd = -180; break;
                    case 'right': parentRotator = sourceParentPerspective.getRotateY(); rotationEnd = 180; break;
                    case 'up': parentRotator = sourceParentPerspective.getRotateX(); rotationEnd = 180; break;
                    case 'down': parentRotator = sourceParentPerspective.getRotateX(); rotationEnd = -180; break;
                }
                if (parentRotator) {
                    parentRotator.addEvent(new NumberEvent({ value: 0, ...startOpts }));
                    parentRotator.addEvent(new NumberEvent({ value: rotationEnd, ...endOpts }));
                }
                sourceParentPerspective.getEnabled().addEvent(new BooleanEvent({ value: false, ...instantEndOpts }));
                sourceTransform.getEnabled().addEvent(new BooleanEvent({ value: false, ...instantEndOpts }));
            }
        }
    }
}

