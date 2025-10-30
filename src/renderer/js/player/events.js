// src/renderer/js/player/events.js

import { state } from '../editor/state.js';
import { buildMeasureMap, findAllElementsRecursive, pageHasMeasures, calculateGlobalMeasureOffsetForElement } from '../editor/utils.js';
import { NumberEvent } from "../renderer/events/numberEvent.js";
import { UnitEvent } from "../renderer/events/unitEvent.js";
import { StringEvent } from '../renderer/events/stringEvent.js';
import { BooleanEvent } from '../renderer/events/booleanEvent.js';


/**
 * Calculates the duration of a quarter note in milliseconds based on the song's BPM settings.
 * Can now accept an optional song-like object to calculate with,
 * otherwise it defaults to the global state.
 * @param {object} [songData=state.song] - Optional object with bpm and bpmUnit properties.
 * @returns {number} The duration of a quarter note in milliseconds.
 */
export function getQuarterNoteDurationMs(songData = state.song) {
    if (!songData) return 0;
    const bpm = songData.bpm || 120;
    const bpmUnit = songData.bpmUnit || 'q_note';

    // This map defines how many quarter notes each beat unit is worth.
    const noteMultipliers = {
        'w_note': 4,
        'h_note': 2,
        'q_note': 1,
        'e_note': 0.5,
        's_note': 0.25,
        'w_note_dotted': 6, // 4 * 1.5
        'h_note_dotted': 3, // 2 * 1.5
        'q_note_dotted': 1.5, // 1 * 1.5
        'e_note_dotted': 0.75, // 0.5 * 1.5
    };

    // The number of beat units that happen per minute is the BPM.
    // We multiply that by the quarter-note-value of the beat unit to get total quarter notes per minute.
    const multiplier = noteMultipliers[bpmUnit] || 1;
    const quarterNotesPerMinute = bpm * multiplier;

    if (quarterNotesPerMinute === 0) return 0; // Avoid division by zero

    // The duration of one quarter note is 60,000 milliseconds divided by the number of quarter notes per minute.
    return 60000 / quarterNotesPerMinute;
}

/**
 * Rebuilds all event timelines for every element in the song.
 * This is the definitive function to call after any structural change
 * (adding/deleting/reordering pages or measures) or after loading a song.
 */
export function rebuildAllEventTimelines() {
    if (!state.song) return;
    const newMeasureMap = buildMeasureMap();

    const allPages = [state.song.thumbnailPage, ...state.song.pages].filter(Boolean);

    allPages.forEach(page => {
        const allElementsOnPage = findAllElementsRecursive(page);
        // Also process the page itself for events like transitions
        allElementsOnPage.push(page);

        allElementsOnPage.forEach(element => {
            if (typeof element.setEventsData !== 'function') {
                return;
            }

            // On initial load, use the temporarily stored data. Otherwise, use existing data.
            const eventsDataToSet = element.tempEventsData || element.getEventsData();

            // Clean up the temporary property if it was used
            if (element.tempEventsData) {
                delete element.tempEventsData;
            }

            const newOffset = calculateGlobalMeasureOffsetForElement(element.id, newMeasureMap);

            // Force the element to re-process its event data with the new offset and timeline.
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

    // First, clear all old, programmatically added transition events
    allPagesWithThumbnail.forEach(page => {
        const opacityValue = page.getProperty('effects').getOpacity();
        const transform = page.getProperty('transform');
        const parentPerspective = page.getProperty('parentPerspective');
        const perspectiveScale = page.getProperty('perspectiveScale');

        opacityValue.getEvents().clear();
        if (transform) {
            transform.getEnabled().getEvents().clear();
            transform.getTranslateX().getEvents().clear();
            transform.getTranslateY().getEvents().clear();
            transform.getTranslateZ().getEvents().clear();
            transform.getRotateX().getEvents().clear();
            transform.getRotateY().getEvents().clear();
            transform.getRotateZ().getEvents().clear();
            transform.getSelfPerspective().getEvents().clear();
            transform.getTransformOriginZ().getEvents().clear();
        }
        if (parentPerspective) {
            parentPerspective.getEnabled().getEvents().clear();
            parentPerspective.getPerspective().getEvents().clear();
            parentPerspective.getRotateX().getEvents().clear();
            parentPerspective.getRotateY().getEvents().clear();
            parentPerspective.getRotateZ().getEvents().clear();
            parentPerspective.getScale().getEvents().clear();
            parentPerspective.getTransformStyle().getEvents().clear();
        }
        if (perspectiveScale) {
            perspectiveScale.getDirection().getEvents().clear();
        }
    });


    for (let i = 0; i < allPages.length; i++) {
        const destPage = allPages[i];
        const transition = destPage.transition;
        if (transition.type === 'instant') continue;

        const firstMeasureOfDestPage = measureMap.find(m => m.pageIndex === i);
        if (!firstMeasureOfDestPage) continue; // Skip pages with no measures

        const transitionStartMeasure = firstMeasureOfDestPage.globalIndex;
        const transitionStartBeat = firstMeasureOfDestPage.startTime;

        let transitionEndMeasure, transitionEndProgress, transitionEndBeat;
        let transitionMidMeasure, transitionMidProgress;

        if (transition.durationUnit === 'beats') {
            transitionEndBeat = transitionStartBeat + (transition.duration || 1);
            const endMeasureInfo = measureMap.find(m => m.startTime <= transitionEndBeat && (m.startTime + m.duration) > transitionEndBeat) || measureMap[measureMap.length - 1];
            transitionEndMeasure = endMeasureInfo.globalIndex;
            transitionEndProgress = endMeasureInfo.duration > 0 ? (transitionEndBeat - endMeasureInfo.startTime) / endMeasureInfo.duration : 0;
        } else { // Default to measures
            transitionEndMeasure = transitionStartMeasure + (transition.duration || 1);
            transitionEndProgress = 0;
            const endMeasureInfo = measureMap[transitionEndMeasure] || measureMap[measureMap.length - 1];
            transitionEndBeat = endMeasureInfo.startTime;
        }

        // Calculate midpoint for two-part transitions like Flip
        const transitionDurationBeats = transitionEndBeat - transitionStartBeat;
        const midpointBeatTime = transitionStartBeat + (transitionDurationBeats / 2);
        const midMeasureInfo = measureMap.find(m => m.startTime <= midpointBeatTime && (m.startTime + m.duration) > midpointBeatTime) || measureMap[measureMap.length - 1];
        transitionMidMeasure = midMeasureInfo.globalIndex;
        transitionMidProgress = midMeasureInfo.duration > 0 ? (midpointBeatTime - midMeasureInfo.startTime) / midMeasureInfo.duration : 0;


        let sourcePage = null;
        const firstMusicalPageIndex = allPages.findIndex(p => pageHasMeasures(p));

        if (i === firstMusicalPageIndex) {
            // If we are programming the transition for the VERY FIRST musical page,
            // the source is always the thumbnail page.
            sourcePage = state.song.thumbnailPage;
        } else {
            // Otherwise, use the existing logic to find the previous musical page.
            for (let j = i - 1; j >= 0; j--) {
                if (pageHasMeasures(allPages[j])) {
                    sourcePage = allPages[j];
                    break;
                }
            }
        }


        // --- Program Destination Page Events ---
        if (transition.type === 'fade') {
            const opacity = destPage.getProperty('effects').getOpacity();
            opacity.addEvent(new NumberEvent({ value: 0, ease: 'linear', measureIndex: transitionStartMeasure, measureProgress: 0 }));
            opacity.addEvent(new NumberEvent({ value: 1, ease: 'linear', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));
        } else if (transition.type === 'dip-to-black') {
            const destOpacity = destPage.getProperty('effects').getOpacity();
            // To page is invisible for the first half, then fades in
            destOpacity.addEvent(new NumberEvent({ value: 0, ease: 'linear', measureIndex: transitionStartMeasure, measureProgress: 0 }));
            destOpacity.addEvent(new NumberEvent({ value: 0, ease: 'linear', measureIndex: transitionMidMeasure, measureProgress: transitionMidProgress }));
            destOpacity.addEvent(new NumberEvent({ value: 1, ease: 'linear', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));
        } else if (transition.type === 'push') {
            const transform = destPage.getProperty('transform');
            let startValue, endValue, transformProp;
            switch (transition.direction) {
                case 'left': startValue = { value: 100, unit: 'pw' }; endValue = { value: 0, unit: 'pw' }; transformProp = transform.getTranslateX(); break;
                case 'right': startValue = { value: -100, unit: 'pw' }; endValue = { value: 0, unit: 'pw' }; transformProp = transform.getTranslateX(); break;
                case 'up': startValue = { value: 100, unit: 'ph' }; endValue = { value: 0, unit: 'ph' }; transformProp = transform.getTranslateY(); break;
                case 'down': startValue = { value: -100, unit: 'ph' }; endValue = { value: 0, unit: 'ph' }; transformProp = transform.getTranslateY(); break;
            }
            if(transformProp) {
                transformProp.addEvent(new UnitEvent({ value: startValue.value, unit: startValue.unit, ease: 'linear', measureIndex: transitionStartMeasure, measureProgress: 0 }));
                transformProp.addEvent(new UnitEvent({ value: endValue.value, unit: endValue.unit, ease: 'linear', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));
            }
        } else if (transition.type === 'flip') {
            const destTransform = destPage.getProperty('transform');
            const destParentPerspective = destPage.getProperty('parentPerspective');
            const perspective = transition.perspective || { value: 2000, unit: 'px' };

            // Program opacity to be 0 for the first half and 1 for the second.
            const destOpacity = destPage.getProperty('effects').getOpacity();
            destOpacity.addEvent(new NumberEvent({ value: 0, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
            destOpacity.addEvent(new NumberEvent({ value: 1, ease: 'instant', measureIndex: transitionMidMeasure, measureProgress: transitionMidProgress }));
            destOpacity.addEvent(new NumberEvent({ value: 1, ease: 'instant', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));


            // Set default values that persist outside the transition
            destTransform.setValue('backface-visibility', 'hidden', true);

            // Enable parent perspective and transform for the duration
            destParentPerspective.getEnabled().addEvent(new BooleanEvent({ value: true, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
            destParentPerspective.getPerspective().addEvent(new UnitEvent({ value: perspective.value, unit: perspective.unit, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
            destParentPerspective.getTransformStyle().addEvent(new StringEvent({ value: 'preserve-3d', ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
            destTransform.getEnabled().addEvent(new BooleanEvent({ value: true, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));

            // Determine rotation axis and direction
            let parentRotator, transformRotator, rotationEnd, destInitialRotation;
            switch (transition.direction) {
                case 'left':
                    parentRotator = destParentPerspective.getRotateY();
                    transformRotator = destTransform.getRotateY();
                    rotationEnd = -180;
                    destInitialRotation = 180;
                    break;
                case 'right':
                    parentRotator = destParentPerspective.getRotateY();
                    transformRotator = destTransform.getRotateY();
                    rotationEnd = 180;
                    destInitialRotation = -180;
                    break;
                case 'up':
                    parentRotator = destParentPerspective.getRotateX();
                    transformRotator = destTransform.getRotateX();
                    rotationEnd = 180;
                    destInitialRotation = -180;
                    break;
                case 'down':
                    parentRotator = destParentPerspective.getRotateX();
                    transformRotator = destTransform.getRotateX();
                    rotationEnd = -180;
                    destInitialRotation = 180;
                    break;
            }

            // Set the initial rotation for the destination page so it starts facing away
            if (transformRotator) {
                transformRotator.addEvent(new NumberEvent({ value: destInitialRotation, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
            }

            // Animate the parent's rotation
            if (parentRotator) {
                parentRotator.addEvent(new NumberEvent({ value: 0, ease: 'linear', measureIndex: transitionStartMeasure, measureProgress: 0 }));
                parentRotator.addEvent(new NumberEvent({ value: rotationEnd, ease: 'linear', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));
            }

            // Reset properties at the end
            destParentPerspective.getEnabled().addEvent(new BooleanEvent({ value: false, ease: 'instant', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));
            destTransform.getEnabled().addEvent(new BooleanEvent({ value: false, ease: 'instant', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));
            if (transformRotator) {
                transformRotator.addEvent(new NumberEvent({ value: 0, ease: 'instant', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress })); // Reset rotation
            }
        } else if (transition.type === 'cube') {
            const destTransform = destPage.getProperty('transform');
            const destPerspectiveScale = destPage.getProperty('perspectiveScale');
            let translateZ_val, rotatorProp, rotationStart, rotationEnd, defaultPerspectiveValue;

            if (transition.direction === 'left' || transition.direction === 'right') {
                translateZ_val = { value: 50, unit: 'pw' };
                rotatorProp = 'rotateY';
                rotationStart = 0;
                rotationEnd = transition.direction === 'left' ? 90 : -90;
                defaultPerspectiveValue = state.domManager.getWidth();
            } else { // up or down
                translateZ_val = { value: 50, unit: 'ph' };
                rotatorProp = 'rotateX';
                rotationStart = 0;
                rotationEnd = transition.direction === 'up' ? -90 : 90;
                defaultPerspectiveValue = state.domManager.getHeight();
            }

            const perspective = transition.perspective || { value: defaultPerspectiveValue, unit: 'px' };

            // --- Program Destination Page Events ---
            const destParentPerspective = destPage.getProperty('parentPerspective');
            destParentPerspective.getEnabled().addEvent(new BooleanEvent({ value: true, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
            destParentPerspective.getPerspective().addEvent(new UnitEvent({ value: perspective.value, unit: perspective.unit, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
            destParentPerspective.getTransformStyle().addEvent(new StringEvent({ value: 'preserve-3d', ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));

            if (destPerspectiveScale) {
                destPerspectiveScale.getDirection().addEvent(new StringEvent({ value: transition.direction, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
                destPerspectiveScale.getDirection().addEvent(new StringEvent({ value: 'none', ease: 'instant', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));
            }

            destTransform.getEnabled().addEvent(new BooleanEvent({ value: true, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
            let destStartRotateProp, destStartRotateVal;
            switch (transition.direction) {
                case 'left': destStartRotateProp = destTransform.getRotateY(); destStartRotateVal = -90; break;
                case 'right': destStartRotateProp = destTransform.getRotateY(); destStartRotateVal = 90; break;
                case 'up': destStartRotateProp = destTransform.getRotateX(); destStartRotateVal = 90; break;
                case 'down': destStartRotateProp = destTransform.getRotateX(); destStartRotateVal = -90; break;
            }
            if (destStartRotateProp) {
                destStartRotateProp.addEvent(new NumberEvent({ value: destStartRotateVal, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
            }
            destTransform.getTranslateZ().addEvent(new UnitEvent({ value: translateZ_val.value, unit: translateZ_val.unit, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));

            const destRotator = destParentPerspective[rotatorProp === 'rotateY' ? 'getRotateY' : 'getRotateX']();
            destRotator.addEvent(new NumberEvent({ value: rotationStart, ease: 'linear', measureIndex: transitionStartMeasure, measureProgress: 0 }));
            destRotator.addEvent(new NumberEvent({ value: rotationEnd, ease: 'linear', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));

            // Reset events at the end
            destParentPerspective.getEnabled().addEvent(new BooleanEvent({ value: false, ease: 'instant', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));
            destTransform.getEnabled().addEvent(new BooleanEvent({ value: false, ease: 'instant', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));


            // --- Program Source Page Events ---
            if (sourcePage) {
                const sourceTransform = sourcePage.getProperty('transform');
                const sourceParentPerspective = sourcePage.getProperty('parentPerspective');
                const sourcePerspectiveScale = sourcePage.getProperty('perspectiveScale');

                sourceParentPerspective.getEnabled().addEvent(new BooleanEvent({ value: true, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
                sourceParentPerspective.getPerspective().addEvent(new UnitEvent({ value: perspective.value, unit: perspective.unit, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
                sourceParentPerspective.getTransformStyle().addEvent(new StringEvent({ value: 'preserve-3d', ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));

                if (sourcePerspectiveScale) {
                    sourcePerspectiveScale.getDirection().addEvent(new StringEvent({ value: transition.direction, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
                    sourcePerspectiveScale.getDirection().addEvent(new StringEvent({ value: 'none', ease: 'instant', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));
                }

                sourceTransform.getEnabled().addEvent(new BooleanEvent({ value: true, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
                sourceTransform.getTranslateZ().addEvent(new UnitEvent({ value: translateZ_val.value, unit: translateZ_val.unit, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));

                const sourceRotator = sourceParentPerspective[rotatorProp === 'rotateY' ? 'getRotateY' : 'getRotateX']();
                sourceRotator.addEvent(new NumberEvent({ value: rotationStart, ease: 'linear', measureIndex: transitionStartMeasure, measureProgress: 0 }));
                sourceRotator.addEvent(new NumberEvent({ value: rotationEnd, ease: 'linear', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));

                // Reset events at the end
                sourceParentPerspective.getEnabled().addEvent(new BooleanEvent({ value: false, ease: 'instant', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));
                sourceTransform.getEnabled().addEvent(new BooleanEvent({ value: false, ease: 'instant', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));
            }
        }

        // --- Program Source Page Events ---
        if (sourcePage) {
            if (transition.type === 'fade') {
                const opacity = sourcePage.getProperty('effects').getOpacity();
                opacity.addEvent(new NumberEvent({ value: 1, ease: 'linear', measureIndex: transitionStartMeasure, measureProgress: 0 }));
                opacity.addEvent(new NumberEvent({ value: 0, ease: 'linear', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));
            } else if (transition.type === 'dip-to-black') {
                const sourceOpacity = sourcePage.getProperty('effects').getOpacity();
                // From page fades out completely in the first half
                sourceOpacity.addEvent(new NumberEvent({ value: 1, ease: 'linear', measureIndex: transitionStartMeasure, measureProgress: 0 }));
                sourceOpacity.addEvent(new NumberEvent({ value: 0, ease: 'linear', measureIndex: transitionMidMeasure, measureProgress: transitionMidProgress }));
            } else if (transition.type === 'push') {
                const transform = sourcePage.getProperty('transform');
                let startValue, endValue, transformProp;
                switch (transition.direction) {
                    case 'left': startValue = { value: 0, unit: 'pw' }; endValue = { value: -100, unit: 'pw' }; transformProp = transform.getTranslateX(); break;
                    case 'right': startValue = { value: 0, unit: 'pw' }; endValue = { value: 100, unit: 'pw' }; transformProp = transform.getTranslateX(); break;
                    case 'up': startValue = { value: 0, unit: 'ph' }; endValue = { value: -100, unit: 'ph' }; transformProp = transform.getTranslateY(); break;
                    case 'down': startValue = { value: 0, unit: 'ph' }; endValue = { value: 100, unit: 'ph' }; transformProp = transform.getTranslateY(); break;
                }
                if(transformProp) {
                    transformProp.addEvent(new UnitEvent({ value: startValue.value, unit: startValue.unit, ease: 'linear', measureIndex: transitionStartMeasure, measureProgress: 0 }));
                    transformProp.addEvent(new UnitEvent({ value: endValue.value, unit: endValue.unit, ease: 'linear', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));
                }
            } else if (transition.type === 'flip') {
                const sourceTransform = sourcePage.getProperty('transform');
                const sourceParentPerspective = sourcePage.getProperty('parentPerspective');
                const perspective = transition.perspective || { value: 2000, unit: 'px' };

                // Program opacity to be 1 for the first half and 0 for the second.
                const sourceOpacity = sourcePage.getProperty('effects').getOpacity();
                sourceOpacity.addEvent(new NumberEvent({ value: 1, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
                sourceOpacity.addEvent(new NumberEvent({ value: 0, ease: 'instant', measureIndex: transitionMidMeasure, measureProgress: transitionMidProgress }));
                // At the end of the transition, restore opacity to 1 to "undo" the change.
                sourceOpacity.addEvent(new NumberEvent({ value: 1, ease: 'instant', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));

                // Set default values
                sourceTransform.setValue('backface-visibility', 'hidden', true);

                // Enable parent perspective and transform for the duration
                sourceParentPerspective.getEnabled().addEvent(new BooleanEvent({ value: true, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
                sourceParentPerspective.getPerspective().addEvent(new UnitEvent({ value: perspective.value, unit: perspective.unit, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
                sourceParentPerspective.getTransformStyle().addEvent(new StringEvent({ value: 'preserve-3d', ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));
                sourceTransform.getEnabled().addEvent(new BooleanEvent({ value: true, ease: 'instant', measureIndex: transitionStartMeasure, measureProgress: 0 }));

                // Determine rotation axis and direction
                let parentRotator, rotationEnd;
                switch (transition.direction) {
                    case 'left':
                        parentRotator = sourceParentPerspective.getRotateY();
                        rotationEnd = -180;
                        break;
                    case 'right':
                        parentRotator = sourceParentPerspective.getRotateY();
                        rotationEnd = 180;
                        break;
                    case 'up':
                        parentRotator = sourceParentPerspective.getRotateX();
                        rotationEnd = 180;
                        break;
                    case 'down':
                        parentRotator = sourceParentPerspective.getRotateX();
                        rotationEnd = -180;
                        break;
                }

                // Animate the parent's rotation (identically to the destination page)
                if (parentRotator) {
                    parentRotator.addEvent(new NumberEvent({ value: 0, ease: 'linear', measureIndex: transitionStartMeasure, measureProgress: 0 }));
                    parentRotator.addEvent(new NumberEvent({ value: rotationEnd, ease: 'linear', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));
                }

                // Reset properties at the end
                sourceParentPerspective.getEnabled().addEvent(new BooleanEvent({ value: false, ease: 'instant', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));
                sourceTransform.getEnabled().addEvent(new BooleanEvent({ value: false, ease: 'instant', measureIndex: transitionEndMeasure, measureProgress: transitionEndProgress }));
            }
        }
    }
}
