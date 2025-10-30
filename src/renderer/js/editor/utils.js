// src/renderer/js/editor/utils.js

import { state } from './state.js';
import { VirtualLyrics } from '../renderer/elements/lyrics.js';
import { VirtualOrchestra } from '../renderer/elements/orchestra.js';
import { VirtualContainer } from '../renderer/elements/container.js';
import { VirtualAudio } from '../renderer/elements/audio.js';
import { VirtualPage } from '../renderer/elements/page.js';
import { VirtualImage } from '../renderer/elements/image.js';
import { VirtualTitle } from '../renderer/elements/title.js';
import { VirtualText } from '../renderer/elements/text.js';
import { VirtualSmartEffect } from '../renderer/elements/smartEffect.js';
import { VirtualVideo } from '../renderer/elements/video.js';

export function findDeepestAtPoint(root, x, y, conditionFn = () => true) {
    let deepest = null;
    let maxDepth = -1;

    function dfs(el, depth) {
        const rect = el.getBoundingClientRect();
        const inside =
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom;

        if (inside && conditionFn(el)) {
            if (depth > maxDepth) {
                maxDepth = depth;
                deepest = el;
            }
        }

        // Recurse into children
        for (const child of el.children) {
            dfs(child, depth + 1);
        }
    }

    dfs(root, 0);
    return deepest;
}

export function findAllAtPoint(root, x, y, conditionFn = () => true) {
    const foundElements = [];

    function dfs(el, depth) {
        const rect = el.getBoundingClientRect();
        const inside =
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom;

        if (inside && conditionFn(el)) {
            foundElements.push({ element: el, depth: depth });
        }

        // --- MODIFICATION START ---
        // Recurse into children in reverse order to find top-most elements first
        for (let i = el.children.length - 1; i >= 0; i--) {
            dfs(el.children[i], depth + 1);
        }
        // --- MODIFICATION END ---
    }

    dfs(root, 0);

    // Sort by depth, deepest first. The sub-order (from reverse traversal) will be preserved.
    foundElements.sort((a, b) => b.depth - a.depth);

    return foundElements;
}

export function lerp(start, end, t) {
    return start * (1 - t) + end * t;
}

export function lerpColor(a, b, t) {
    if (!a || !b) return a; // Fallback
    const r = Math.round(lerp(a.r, b.r, t));
    const g = Math.round(lerp(a.g, b.g, t));
    const bl = Math.round(lerp(a.b, b.b, t));
    const alpha = lerp(a.a, b.a, t);
    return { r, g, b: bl, a: alpha };
}

export function getIconForElementType(type) {
    const icons = {
        'vcontainer': '<img src="../../icons/vcontainer.svg" alt="VContainer">',
        'hcontainer': '<img src="../../icons/hcontainer.svg" alt="HContainer">',
        'acontainer': '<img src="../../icons/acontainer.svg" alt="AContainer">',
        'lyrics': '<img src="../../icons/lyrics.svg" alt="Lyrics">',
        'image': '<img src="../../icons/image.svg" alt="Image">',
        'default': '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M16,20H20V16H16M16,14H20V10H16M14,20H10V16H14M14,14H10V10H14M8,20H4V16H8M8,14H4V10H8M16,8H20V4H16M14,8H10V4H14M8,8H4V4H8V8Z" /></svg>',
        'title': '<img src="../../icons/title.svg" alt="Title">',
        'text': '<img src="../../icons/text.svg" alt="Text">',
        'orchestra': '<img src="../../icons/orchestra.svg" alt="Orchestra">',
        'smart-effect': '<img src="../../icons/smart-effect.svg" alt="Smart Effect">',
        'video': '<img src="../../icons/video.svg" alt="Video">',
        'audio': '<img src="../../icons/audio.svg" alt="Audio">',
    };
    return icons[type] || icons['default'];
}

export function getNameForElementType(type) {
    const names = {'page': 'Page', 'vcontainer': 'VContainer', 'hcontainer': 'HContainer', 'acontainer': 'AContainer', 'lyrics': 'Lyrics', 'title': 'Title', 'text': 'Text', 'image': 'Image', 'orchestra': 'Orchestra', 'smart-effect': 'Smart Effect', 'video': 'Video', 'audio': 'Audio'};
    return names[type] || 'Element';
}

/**
 * Determines the underlying data type of a property based on its key.
 * This is crucial for creating the correct type of Event object for animations.
 * @param {string} propKey - The property key (e.g., 'opacity', 'width').
 * @returns {string} The property type (e.g., 'number', 'size', 'color/gradient').
 */
export function getPropertyType(propKey) {
    switch (propKey) {
        // Number (a single numeric value)
        case 'opacity':
        case 'videoSpeed':
        case 'audioVolume':
        case 'audioStartTime':
        case 'audioEndTime':
        case 'scaleX':
        case 'scaleY':
        case 'scaleZ':
        case 'rotate':
        case 'rotateX':
        case 'rotateY':
        case 'rotateZ':
        case 'skewX':
        case 'skewY':
        case 'parent-rotateX':
        case 'parent-rotateY':
        case 'parent-rotateZ':
            return 'number';

        // Size (a value and a unit)
        case 'width':
        case 'height':
        case 'top':
        case 'left':
        case 'right':
        case 'bottom':
        case 'borderSize':
        case 'borderRadius':
        case 'shadowOffsetX':
        case 'shadowOffsetY':
        case 'shadowBlur':
        case 'shadowSpread':
        case 'paddingTop':
        case 'paddingLeft':
        case 'paddingBottom':
        case 'paddingRight':
        case 'fontSize':
        case 'letterSpacing':
        case 'wordSpacing':
        case 'lineHeight':
        case 'translateX':
        case 'translateY':
        case 'translateZ':
            case 'gap':
        case 'transform-origin-x':
        case 'transform-origin-y':
        case 'transform-origin-z':
        case 'perspective':
        case 'selfPerspective':
        case 'childrenPerspective':
            return 'size';

        // Color/Gradient (a complex color or gradient object)
        case 'bgColor':
        case 'borderColor':
        case 'shadowColor':
        case 'textColor':
        case 'karaokeColor':
        case 'progressBgColor':
        case 'progressFillColor':
            return 'color/gradient';

        // Boolean (true/false)
        case 'bgEnabled':
        case 'borderEnabled':
        case 'shadowEnabled':
        case 'shadowInset':
        case 'justifyText':
        case 'audioLoop':
        case 'visible':
            return 'boolean';

        // String (text content)
        case 'content':
        case 'objectFit':
        case 'videoSrc':
        case 'audioSrc':
        case 'transform-style':
        case 'backface-visibility':
        case 'parent-transform-style':
            return 'string';

        // Dynamic String
        case 'videoState':
        case 'audioState':
            return 'dynamic-string';

        case 'alignment': // For containers
            return 'alignment';
        case 'fontFamily':
            return 'fontFamily';
        case 'fontWeight':
            return 'fontWeight';
        case 'fontStyle':
            return 'fontStyle';
        case 'textAlign':
            return 'textAlign';
        case 'justifyContent':
            return 'justifyContent';
        case 'alignItems':
            return 'alignItems';

        default:
            console.warn(`[getPropertyType] Unknown property key: ${propKey}`);
            return 'unknown';
    }
}

export function getNoteIconHTML(noteType) {
    if (!noteType || typeof noteType !== 'string' || !noteType.endsWith('_note') && !noteType.endsWith('_note_dotted')) {
        return `<img src="../../icons/delete_red.svg" alt="Invalid Note" class="lyrics-render-note-icon">`;
    }
    return `<img src="../../icons/${noteType}.svg" alt="${noteType}" class="lyrics-render-note-icon">`;
}

export function getAvailablePropertiesForElement(element) {
    if (!element) return {};
    const elementType = element.dataset.elementType;

    let props = {};

    // Define common property groups to avoid repetition
    const commonEffects = { "Effects": { "opacity": "Opacity" } };
    const commonDimensions = { "Dimensions": { "width": "Width", "height": "Height" } };
    const commonMargin = { "Margin": { "top": "Top", "left": "Left", "bottom": "Bottom", "right": "Right" } };
    const commonInnerPadding = { "Inner Padding": { "paddingTop": "Top", "paddingLeft": "Left", "paddingBottom": "Bottom", "paddingRight": "Right" } };
    const commonBackground = { "Background": { "bgEnabled": "Enabled", "bgColor": "Color/Gradient" } };
    const commonBorder = { "Border": { "borderEnabled": "Enabled", "borderSize": "Width", "borderRadius": "Radius", "borderColor": "Color" } };
    const commonBoxShadow = { "Box Shadow": { "shadowEnabled": "Enabled", "shadowInset": "Inset", "shadowOffsetX": "OffsetX", "shadowOffsetY": "OffsetY", "shadowBlur": "Blur", "shadowSpread": "Spread", "shadowColor": "Color" } };
    const commonTextStyle = { "Text Style": {
            "fontFamily": "Font Family",
            "fontWeight": "Weight",
            "fontStyle": "Style",
            "fontSize": "Size",
            "textColor": "Text Color/Gradient",
            "lineHeight": "Line Height",
            "letterSpacing": "Letter Spacing",
            "wordSpacing": "Word Spacing",
            "textAlign": "Alignment",
            "justifyText": "Justify"
        }};
    const commonTransform2D = { "Transform 2D": {
        "translateX": "Translate X",
        "translateY": "Translate Y",
        "scaleX": "Scale X",
        "scaleY": "Scale Y",
        "rotate": "Rotate",
        "skewX": "Skew X",
        "skewY": "Skew Y",
        "transform-origin-x": "Origin X",
        "transform-origin-y": "Origin Y"
    }};
    const commonTransform3D = { "Transform 3D": {
        "translateZ": "Translate Z",
        "scaleZ": "Scale Z",
        "rotateX": "Rotate X",
        "rotateY": "Rotate Y",
        "rotateZ": "Rotate Z",
        "transform-origin-z": "Origin Z",
        "transform-style": "Transform Style",
        "selfPerspective": "Self-perspective",
        "childrenPerspective": "Children Perspective",
        "backface-visibility": "Backface Visibility"
    }};

    if (elementType === 'page') {
        props["Parent's Perspective"] = {
            "perspective": "Perspective",
            "parent-transform-style": "Transform Style",
            "parent-rotateX": "Rotate X",
            "parent-rotateY": "Rotate Y",
            "parent-rotateZ": "Rotate Z"
        };
    }

    switch (elementType) {
        case 'lyrics':
            props = {
                ...props,
                ...commonTextStyle,
                ...commonDimensions,
                ...commonMargin,
                ...commonInnerPadding,
                ...commonBackground,
                ...commonBorder,
                ...commonBoxShadow,
                ...commonEffects,
                ...commonTransform2D,
                ...commonTransform3D
            };
            props["Text Style"]["karaokeColor"] = "Karaoke Color/Gradient";
            break;

        case 'orchestra':
            props = {
                ...props,
                "Bar Style": {
                    "progressBgColor": "Background Color/Gradient",
                    "progressFillColor": "Fill Color/Gradient"
                },
                ...commonDimensions,
                ...commonMargin,
                ...commonInnerPadding,
                ...commonBorder,
                ...commonBoxShadow,
                ...commonEffects,
                ...commonTransform2D,
                ...commonTransform3D
            };
            break;

        case 'title':
        case 'text':
            props = {
                ...props,
                ...commonTextStyle,
                ...commonDimensions,
                ...commonMargin,
                ...commonInnerPadding,
                ...commonBackground,
                ...commonBorder,
                ...commonBoxShadow,
                ...commonEffects,
                ...commonTransform2D,
                ...commonTransform3D
            };
            break;

        case 'image':
            props = {
                ...props,
                "Object Fit": { "objectFit": "Fit" },
                ...commonDimensions,
                ...commonMargin,
                ...commonBackground,
                ...commonBorder,
                ...commonBoxShadow,
                ...commonEffects,
                ...commonTransform2D,
                ...commonTransform3D
            };
            break;

        case 'video':
            props = {
                ...props,
                "Playback": { "videoState": "State", "videoSpeed": "Speed", "videoLoop": "Loop" },
                "Object Fit": { "objectFit": "Fit" },
                ...commonDimensions,
                ...commonMargin,
                ...commonBackground,
                ...commonBorder,
                ...commonBoxShadow,
                ...commonEffects,
                ...commonTransform2D,
                ...commonTransform3D
            };
            break;

        case 'audio':
            props = {
                ...props,
                "Playback": {
                    "audioState": "State",
                    "audioVolume": "Volume",
                    "audioLoop": "Loop"
                },
                ...commonEffects,
                ...commonMargin
            };
            break;

        case 'smart-effect':
            props = {
                ...props,
                ...commonDimensions,
                ...commonMargin,
                ...commonEffects,
                ...commonTransform2D,
                ...commonTransform3D
            };
            if (element.dataset.effectJson) {
                try {
                    const effectData = JSON.parse(element.dataset.effectJson);
                    if (effectData.parameters) {
                        props["Effect Parameters"] = {};
                        for (const [key, config] of Object.entries(effectData.parameters)) {
                            if (['number', 'color', 'gradient', 'svg_color', 'svg_gradient', 'size', 'boolean', 'string'].includes(config.type)) {
                                props["Effect Parameters"][key] = config.name || key;
                            }
                        }
                    }
                } catch (e) {
                    console.error("Could not parse effect JSON for properties dialog:", e);
                }
            }
            break;

        case 'container':
        case 'acontainer':
        case 'vcontainer':
        case 'hcontainer':
            props = {
                ...props,
                "Gravity": { "justifyContent": "Justify Content", "alignItems": "Align Items" },
                "Layout": { "gap": "Gap" },
                ...commonInnerPadding,
                ...commonDimensions,
                ...commonMargin,
                ...commonBackground,
                ...commonBorder,
                ...commonBoxShadow,
                ...commonEffects,
                ...commonTransform2D,
                ...commonTransform3D
            };
            break;

        default:
            props = {};
            break;
    }

    return props;
}


/**
 * Shows a confirmation dialog.
 * @param {string} message The message to display in the dialog.
 * @param {string} [title='Confirmation'] The title for the dialog header.
 * @returns {Promise<boolean>} A promise that resolves to true if 'Yes' is clicked, false otherwise.
 */
export function showConfirmationDialog(message, title = 'Confirmation') {
    const dialog = document.getElementById('confirmation-dialog');
    const headerEl = document.getElementById('confirmation-dialog-header');
    const messageEl = document.getElementById('confirmation-dialog-message');
    const yesBtn = document.getElementById('confirmation-dialog-yes');
    const noBtn = document.getElementById('confirmation-dialog-no');

    if (headerEl) {
        headerEl.textContent = title;
    }
    messageEl.textContent = message;
    dialog.classList.add('visible');

    return new Promise((resolve) => {
        const cleanup = () => {
            dialog.classList.remove('visible');
            yesBtn.removeEventListener('click', handleYes);
            noBtn.removeEventListener('click', handleNo);
        };

        const handleYes = () => {
            cleanup();
            resolve(true);
        };
        const handleNo = () => {
            cleanup();
            resolve(false);
        };

        yesBtn.addEventListener('click', handleYes);
        noBtn.addEventListener('click', handleNo);
    });
}

/**
 * Checks if any of the given measure IDs have associated events on the current page.
 * @param {string[]} measureIds An array of measure IDs to check.
 * @returns {boolean} True if any measure has events, false otherwise.
 */
export function measuresHaveEvents(measureIds) {
    const elementsWithEvents = document.querySelectorAll('[data-events-content]');
    for (const element of elementsWithEvents) {
        try {
            const eventsData = JSON.parse(element.dataset.eventsContent || '{}');
            for (const measureId of measureIds) {
                const measureEvents = eventsData[measureId];
                if (measureEvents && measureEvents.content) {
                    const hasExplicitEvent = measureEvents.content.some(note =>
                        note.events &&
                        note.events.enabled === true &&
                        note.events.values &&
                        Object.keys(note.events.values).length > 0
                    );
                    if (hasExplicitEvent) {
                        return true;
                    }
                }
            }
        } catch (e) {
            console.error("Error parsing events content in measuresHaveEvents:", e);
        }
    }
    return false;
}

export function getMeasuresFromElement(element) {
    let measureCount = 0;
    if (!element) return 0;
    const elementType = element.dataset.elementType;

    if (elementType === 'lyrics') {
        try {
            const lyricsContent = element.dataset.lyricsContent || element.getAttribute('data-lyrics-content');
            if (lyricsContent) {
                const data = JSON.parse(lyricsContent);
                measureCount = (data.measures || []).length;
            }
        } catch (e) {
            console.error('Error parsing lyrics content:', e);
        }
    } else if (elementType === 'orchestra') {
        try {
            const orchestraContent = element.dataset.orchestraContent || element.getAttribute('data-orchestra-content');
            if (orchestraContent) {
                const data = JSON.parse(orchestraContent);
                // REVERTED: Calculate total from batched counts
                measureCount = (data.measures || []).reduce((total, measure) => total + (measure.count || 1), 0);
            }
        } catch (e) {
            console.error('Error parsing orchestra content:', e);
        }
    }
    return measureCount;
}

/**
 * Calculates the starting global measure index for a given element.
 * @param {string} elementId The ID of the element.
 * @param {Array} measureMap The global measure map for the song.
 * @returns {number} The global measure index where this element's musical content begins.
 */
export function calculateGlobalMeasureOffsetForElement(elementId, measureMap) {
    let element = null;
    let pageOfElement = null;

    // Find the element and its containing page across the entire song
    for (const page of state.song.pages) {
        const found = findVirtualElementById(page, elementId);
        if (found) {
            element = found;
            pageOfElement = page;
            break;
        }
    }

    if (!element || !pageOfElement) {
        return 0;
    }

    const pageIndex = state.song.pages.indexOf(pageOfElement);
    if (pageIndex === -1) {
        return 0;
    }

    let offset = 0;

    // Add measures from all previous pages
    for (let i = 0; i < pageIndex; i++) {
        offset += measureMap.filter(m => m.pageIndex === i).length;
    }

    // If the element is a musical element, add the offset from preceding musical elements on the same page.
    // If it's not a musical element, its timeline starts at the beginning of the page's timeline, so we do nothing more.
    if (element instanceof VirtualLyrics || element instanceof VirtualOrchestra) {
        const orderedMusicElements = pageOfElement.getMusicElementsOrder();
        for (const musicEl of orderedMusicElements) {
            if (musicEl.id === element.id) {
                break; // We've reached our target element
            }
            // This element comes before our target, so add its measures to the offset
            offset += measureMap.filter(m => m.elementId === musicEl.id && m.pageIndex === pageIndex).length;
        }
    }

    return offset;
}


/**
 * Scans all elements with event data on the current page and updates the global state.
 */
export function recalculateEventControlledProperties() {
    state.eventControlledProperties.clear();
    const elementsWithEvents = document.querySelectorAll('[data-events-content]');

    for (const element of elementsWithEvents) {
        try {
            const eventsData = JSON.parse(element.dataset.eventsContent || '{}');
            for (const measure of Object.values(eventsData)) {
                if (measure.content) {
                    for (const note of measure.content) {
                        if (note.events?.enabled && note.events.values) {
                            for (const propKey of Object.keys(note.events.values)) {
                                if (!propKey.endsWith('_easing')) {
                                    state.eventControlledProperties.add(propKey);
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Error recalculating event controlled properties for element:", element.id, e);
        }
    }
}

/**
 * Finds a virtual element recursively by its ID within a given container.
 * @param {VirtualContainer} container - The container element to start the search from.
 * @param {string} elementId - The ID to search for.
 * @returns {VirtualElement|null} The found element or null.
 */
export function findVirtualElementById(container, elementId) {
    if (!container) return null;
    if (container.id === elementId) return container;

    // Check if the container has a getChildren method
    if (typeof container.getChildren !== 'function') {
        return null;
    }

    function search(searchContainer) {
        for (const child of searchContainer.getChildren()) {
            if (child.id === elementId) return child;
            // Recurse only if the child is a container itself
            if (child instanceof VirtualContainer) {
                const found = search(child);
                if (found) return found;
            }
        }
        return null;
    }

    return search(container);
}

/**
 * Recursively finds all music elements (Lyrics and Orchestra) within a container.
 * @param {VirtualContainer} container The container to search within.
 * @returns {Array<VirtualLyrics|VirtualOrchestra>} An array of the found music elements.
 */
export function findMusicElementsRecursively(container) {
    const musicElements = [];
    if (!container || typeof container.getChildren !== 'function') {
        return musicElements;
    }

    for (const child of container.getChildren()) {
        if (child instanceof VirtualLyrics || child instanceof VirtualOrchestra || child instanceof VirtualAudio) {
            musicElements.push(child);
        }
        if (child instanceof VirtualContainer) {
            musicElements.push(...findMusicElementsRecursively(child));
        }
    }
    return musicElements;
}

/**
 * Creates a time-ordered map of all measures across all pages for playback timing.
 * This is the bridge between the application's virtual element structure and the TimelineManager.
 * @returns {Array} An array of measure timing information.
 */
export function buildMeasureMap() {
    const measureMap = [];
    if (!state.song || !state.song.pages) return [];

    const bpmValue = 4; // The BPM is based on a quarter note

    state.song.pages.forEach((page, pageIndex) => {
        const orderedMusicElements = page.getMusicElementsOrder();
        const orderedIds = new Set(orderedMusicElements.map(el => el.id));
        const allMusicChildren = findMusicElementsRecursively(page);
        const unorderedMusicElements = allMusicChildren.filter(el => !orderedIds.has(el.id));
        const musicElements = [...orderedMusicElements, ...unorderedMusicElements];


        musicElements.forEach(element => {
            let measuresProp;
            let isOrchestra = false;

            if (element.type === 'lyrics' && element.getProperty('lyricsContent')) {
                measuresProp = element.getProperty('lyricsContent').getLyricsValue().getLyricsObject().measures;
            } else if ((element.type === 'orchestra' || element.type === 'audio') && element.getProperty('orchestraContent')) {
                measuresProp = element.getProperty('orchestraContent').getMeasures();
                isOrchestra = true;
            }

            if (measuresProp) {
                measuresProp.forEach(measure => {
                    const {numerator, denominator} = measure.timeSignature;
                    const durationInBeats = numerator * (bpmValue / denominator);
                    const count = isOrchestra ? (measure.count || 1) : 1;
                    for (let i = 0; i < count; i++) {
                        measureMap.push({
                            elementId: element.id,
                            originalMeasureId: isOrchestra ? `${measure.id}-${i}` : measure.id,
                            pageIndex: pageIndex,
                            duration: durationInBeats,
                            timeSignature: { numerator, denominator}
                        });
                    }
                });
            }
        });
    });

    // Add start times and global index to the map
    let cumulativeTime = 0;
    return measureMap.map((measure, index) => {
        const measureWithStart = {
            ...measure,
            startTime: cumulativeTime,
            globalIndex: index
        };
        cumulativeTime += measure.duration;
        return measureWithStart;
    });
}


/**
 * Creates a time-ordered map of all event keyframes across all pages.
 * @param {Array} measureMap - The pre-built measure map to use as a time source.
 * @returns {Array} The flat note map for interpolation.
 */
export function buildFlatNoteMap(measureMap) {
    const flatNoteMap = [];
    if (!state.song || !state.song.pages || !measureMap) return [];

    const NOTE_DURATIONS_IN_BEATS = {
        w_note: 4.0, h_note: 2.0, q_note: 1.0, e_note: 0.5, s_note: 0.25,
        w_note_dotted: 6.0, h_note_dotted: 3.0, q_note_dotted: 1.5, e_note_dotted: 0.75,
    };

    const allElementsOnAllPages = state.song.pages.flatMap(page => findAllElementsRecursive(page));

    for (const element of allElementsOnAllPages) {
        const eventsData = element.getEventsData(); // { content: [ [notes...], [notes...], ... ] }
        if (!eventsData || !eventsData.content) continue;

        const globalMeasureOffset = calculateGlobalMeasureOffsetForElement(element.id, measureMap);

        eventsData.content.forEach((measureNotes, localMeasureIndex) => {
            if (!measureNotes || measureNotes.length === 0) return;

            const actualMeasureIndex = localMeasureIndex + globalMeasureOffset;
            const measureInfo = measureMap[actualMeasureIndex];
            if (!measureInfo) return;

            let noteTimeOffsetInBeats = 0;
            measureNotes.forEach(note => {
                flatNoteMap.push({
                    elementId: element.id,
                    musicalTime: measureInfo.startTime + noteTimeOffsetInBeats,
                    noteData: note,
                });
                noteTimeOffsetInBeats += NOTE_DURATIONS_IN_BEATS[note.type] || 0;
            });
        });
    }


    flatNoteMap.sort((a, b) => a.musicalTime - b.musicalTime);
    return flatNoteMap;
}

/**
 * Creates a time-ordered map of all lyric syllables across all pages.
 * @param {Array} measureMap - The pre-built measure map to use as a time source.
 * @returns {Array} The flat lyrics map for animation.
 */
export function buildLyricsTimingMap(measureMap) {
    const lyricsMap = [];
    if (!state.song || !state.song.pages || !measureMap) return [];

    const NOTE_DURATIONS_IN_BEATS = {
        w_note: 4.0, h_note: 2.0, q_note: 1.0, e_note: 0.5, s_note: 0.25,
        w_note_dotted: 6.0, h_note_dotted: 3.0, q_note_dotted: 1.5, e_note_dotted: 0.75,
    };

    const allLyricsElements = new Map();

    state.song.pages.forEach(page => {
        const musicElements = findMusicElementsRecursively(page);
        musicElements.forEach(el => {
            if (el.type === 'lyrics') {
                allLyricsElements.set(el.id, el.getProperty('lyricsContent').getLyricsValue().getLyricsObject());
            }
        });
    });


    for (const [elementId, lyricsData] of allLyricsElements.entries()) {
        if (!lyricsData.measures) continue;

        lyricsData.measures.forEach(measure => {
            // Find all instances of this measure in the playback map (for repeated sections, etc.)
            const measureInstances = measureMap.filter(m => m.originalMeasureId === measure.id && m.elementId === elementId);

            measureInstances.forEach(measureInfo => {
                let timeWithinMeasure = 0;
                if (measure.content) {
                    measure.content.forEach(note => {
                        const duration = NOTE_DURATIONS_IN_BEATS[note.type] || 0;
                        lyricsMap.push({
                            elementId: elementId,
                            noteId: note.id,
                            startTime: measureInfo.startTime + timeWithinMeasure,
                            duration: duration,
                        });
                        timeWithinMeasure += duration;
                    });
                }
            });
        });
    }

    lyricsMap.sort((a, b) => a.startTime - b.startTime);
    return lyricsMap;
}

/**
 * Finds the last page index that has musical content before a given target page index.
 * @param {number} targetPageIndex The index of the page we are transitioning to.
 * @param {Array} measureMap The pre-built map of all measures.
 * @returns {number} The index of the last page with music, or -1 if none.
 */
export function findLastPageWithMusic(targetPageIndex, measureMap) {
    // Iterate backwards for efficiency
    for (let i = measureMap.length - 1; i >= 0; i--) {
        const measure = measureMap[i];
        if (measure.pageIndex < targetPageIndex) {
            // The first one we find will be the highest index before the target.
            return measure.pageIndex;
        }
    }
    return -1; // No preceding page has music (e.g., for page 0)
}

/**
 * Finds if a transition should be active at a specific musical time.
 * @param {number} musicalTime The current time in beats.
 * @param {Array} measureMap The pre-built map of all measures.
 * @param {Array} pages The array of all pages in the song.
 * @returns {object|null} An object with transition details or null if no transition is active.
 */
export function findActiveTransition(musicalTime, measureMap, pages) {
    if (!measureMap || measureMap.length === 0 || !pages) return null;

    // Iterate through each page to check if the musicalTime falls into its transition period
    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const transition = page.transition || { type: 'instant', duration: 0 };

        // We only care about transitions that have a duration
        if (transition.type === 'instant' || !transition.duration || transition.duration <= 0) {
            continue;
        }

        // Find the start time of the first measure on this page
        const firstMeasureOfPage = measureMap.find(m => m.pageIndex === i);
        if (!firstMeasureOfPage) continue; // Skip pages with no measures

        const transitionStartTime = firstMeasureOfPage.startTime;

        let durationInBeats;

        if (transition.durationUnit === 'beats') {
            durationInBeats = transition.duration || 1;
        } else { // Default to measures
            durationInBeats = 0;
            const firstMeasureGlobalIndex = measureMap.indexOf(firstMeasureOfPage);

            // Sum the duration of the measures covered by the transition
            for (let j = 0; j < (transition.duration || 1); j++) {
                const currentMeasureIndex = firstMeasureGlobalIndex + j;
                if (measureMap[currentMeasureIndex]) {
                    durationInBeats += measureMap[currentMeasureIndex].duration;
                } else {
                    // If we run out of measures in the song, the transition is cut short.
                    break;
                }
            }
        }

        const transitionEndTime = transitionStartTime + durationInBeats;

        if (musicalTime >= transitionStartTime && musicalTime < transitionEndTime) {
            const fromPageIndex = findLastPageWithMusic(i, measureMap);
            return {
                fromPageIndex: fromPageIndex,
                toPageIndex: i,
                startTimeBeats: transitionStartTime,
                durationBeats: durationInBeats,
                transitionDef: transition,
            };
        }
    }

    return null; // No active transition found
}

/**
 * Checks if a VirtualPage contains any measures from its child elements.
 * @param {VirtualPage} page The page to check.
 * @returns {boolean} True if the page has one or more measures.
 */
export function pageHasMeasures(page) {
    if (!page) return false;
    const musicElements = findMusicElementsRecursively(page);

    for (const element of musicElements) {
        if (element instanceof VirtualLyrics) {
            if (element.getProperty('lyricsContent')?.getLyricsValue().getLyricsObject().measures.length > 0) {
                return true;
            }
        } else if (element instanceof VirtualOrchestra || element instanceof VirtualAudio) { // Explicitly include VirtualAudio
            const measures = element.getProperty('orchestraContent')?.getMeasures();
            if (measures && measures.length > 0) {
                // An orchestra/audio element only contributes to the timeline if it has measures with a count > 0
                if (measures.some(m => (m.count === undefined ? 1 : m.count) > 0)) {
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * Gets the measure structure (ID and time signature) for a given musical element.
 * This handles lyrics and orchestra elements, including repeated measures.
 * @param {VirtualElement} element The virtual element to inspect.
 * @returns {Array<{id: string, timeSignature: object}>} An array of measure objects.
 */
export function getElementMeasuresStructure(element) {
    if (!element) return [];
    const measures = [];
    if (element.type === 'lyrics') {
        const lyricsContent = element.getProperty('lyricsContent');
        const lyricsObject = lyricsContent?.getLyricsValue().getLyricsObject();
        if (lyricsObject?.measures) {
            lyricsObject.measures.forEach(m => {
                measures.push({ id: m.id, timeSignature: m.timeSignature });
            });
        }
    } else if (element.type === 'orchestra' || element.type === 'audio') {
        const orchestraContent = element.getProperty('orchestraContent');
        const orchestraMeasures = orchestraContent?.getMeasures();
        if ( orchestraMeasures) {
            orchestraMeasures.forEach(measure => {
                // Handle repeated measures correctly
                for (let i = 0; i < (measure.count || 1); i++) {
                    measures.push({ id: `${measure.id}-${i}`, timeSignature: measure.timeSignature });
                }
            });
        }
    }
    return measures;
}

/**
 * Gets the measure structure for an entire page by combining measures from all its music elements in order.
 * @param {VirtualPage} page The page to inspect.
 * @returns {Array<{id: string, timeSignature: object}>} An array of measure objects.
 */
export function getPageMeasuresStructure(page) {
    if (!page) return [];

    const measures = [];
    const orderedMusicElements = page.getMusicElementsOrder();
    const orderedIds = new Set(orderedMusicElements.map(el => el.id));
    const allMusicChildren = findMusicElementsRecursively(page);
    const unorderedMusicElements = allMusicChildren.filter(el => !orderedIds.has(el.id));
    const musicElements = [...orderedMusicElements, ...unorderedMusicElements];

    musicElements.forEach(element => {
        measures.push(...getElementMeasuresStructure(element));
    });

    return measures;
}

/**
 * Recursively finds all virtual elements within a given container.
 * @param {VirtualContainer} container The container to search within.
 * @returns {VirtualElement[]} An array of all descendant elements.
 */
export function findAllElementsRecursive(container) {
    const elements = [];
    if (!container || typeof container.getChildren !== 'function') {
        return elements;
    }

    for (const child of container.getChildren()) {
        elements.push(child);
        if (child instanceof VirtualContainer) {
            elements.push(...findAllElementsRecursive(child));
        }
    }
    return elements;
}

/**
 * Scans the entire song structure and collects all unique asset source URLs.
 * @returns {string[]} An array of unique asset URLs currently in use.
 */
export function getAllUsedAssets() {
    const usedAssets = new Set();
    const allPages = [state.song.thumbnailPage, ...state.song.pages].filter(Boolean);

    for (const page of allPages) {
        const allElementsOnPage = findAllElementsRecursive(page);
        allElementsOnPage.push(page); // Also check the page itself

        for (const element of allElementsOnPage) {
            if (element.hasProperty('src')) {
                const srcProp = element.getProperty('src');
                if (srcProp.getSrc && typeof srcProp.getSrc === 'function') {
                    const srcValue = srcProp.getSrc().getValue();
                    if (srcValue) {
                        // Handle smart effects where src is an object { filePath, content }
                        if (typeof srcValue === 'object' && srcValue.filePath) {
                            usedAssets.add(srcValue.filePath);
                        } else if (typeof srcValue === 'string') {
                            usedAssets.add(srcValue);
                        }
                    }
                }
            }
        }
    }

    return Array.from(usedAssets);
}

export function serializeElement(element) {
    const serialized = {
        type: element.type,
        id: element.id,
        properties: {}
    };

    const properties = element.getProperties();
    for (const key in properties) {
        if (typeof properties[key].toJSON === 'function') {
            const jsonValue = properties[key].toJSON();
            if (jsonValue !== undefined) { // Check for undefined
                serialized.properties[key] = jsonValue;
            }
        }
    }

    const eventsData = element.getEventsData();
    if (eventsData && eventsData.content && eventsData.content.length > 0) {
        serialized.eventsData = eventsData;
    }

    if (element instanceof VirtualContainer) {
        serialized.children = element.getChildren().map(child => serializeElement(child));
    }

    if (element.type === 'page') {
        serialized.musicElementsOrder = element.getMusicElementsOrder().map(el => el.id);
        serialized.transition = element.transition;
    }

    return serialized;
}

export function deserializeElement(data) {
    let element;
    const options = data.properties || {};

    // Create the correct element type
    switch (data.type) {
        case 'page': element = new VirtualPage(options); break;
        case 'container': element = new VirtualContainer(options); break;
        case 'image': element = new VirtualImage(options); break;
        case 'lyrics': element = new VirtualLyrics(options); break;
        case 'title': element = new VirtualTitle(options); break;
        case 'text': element = new VirtualText(options); break;
        case 'orchestra': element = new VirtualOrchestra(options); break;
        case 'smart-effect': element = new VirtualSmartEffect(options); break;
        case 'video': element = new VirtualVideo(options); break;
        case 'audio': element = new VirtualAudio(options); break;
        default: throw new Error(`Unknown element type during deserialization: ${data.type}`);
    }

    // --- START: MODIFICATION ---
    // Overwrite the auto-generated ID with the one from the saved data to preserve references.
    element.id = data.id;
    // FIX: Also update the actual DOM element's ID to match. This is the crucial fix.
    element.domElement.id = data.id;
    // --- END: MODIFICATION ---

    // Temporarily store event data; it will be processed after the full structure is built.
    if (data.eventsData) {
        element.tempEventsData = data.eventsData;
    }

    // Re-apply children recursively
    if (data.children && element instanceof VirtualContainer) {
        data.children.forEach(childData => {
            const childElement = deserializeElement(childData);
            element.addElement(childElement);
        });
    }

    // Re-apply page-specific properties
    if (data.type === 'page') {
        element.transition = data.transition || element.transition;
        // Music order will be set after all elements are created
    }

    return element;
}

/**
 * Compares two note objects for equality.
 * @param {object} noteA - The first note object.
 * @param {object} noteB - The second note object.
 * @returns {boolean} - True if the objects are equal, false otherwise.
 */
export function compareNoteObjects(noteA, noteB) {
    if (!noteA || !noteB) {
        return noteA === noteB;
    }

    // Ensure lineBreakAfter is treated as a boolean for comparison
    const lineBreakA = noteA.lineBreakAfter === true;
    const lineBreakB = noteB.lineBreakAfter === true;

    return noteA.id === noteB.id &&
        noteA.type === noteB.type &&
        noteA.text === noteB.text &&
        noteA.isConnectedToNext === noteB.isConnectedToNext &&
        lineBreakA === lineBreakB;
}

/**
 * Compares two time signature objects for equality.
 * @param {object} tsA - The first time signature object.
 * @param {object} tsB - The second time signature object.
 * @returns {boolean} - True if the objects are equal, false otherwise.
 */
export function compareTimeSignatureObjects(tsA, tsB) {
    if (!tsA || !tsB) {
        return tsA === tsB;
    }

    return tsA.numerator === tsB.numerator &&
        tsA.denominator === tsB.denominator;
}

/**
 * Compares two measure objects for equality.
 * @param {object} measureA - The first measure object.
 * @param {object} measureB - The second measure object.
 * @returns {boolean} - True if the objects are equal, false otherwise.
 */
export function compareMeasureObjects(measureA, measureB) {
    if (!measureA || !measureB) {
        return measureA === measureB;
    }

    if (measureA.id !== measureB.id ||
        measureA.content.length !== measureB.content.length ||
        !compareTimeSignatureObjects(measureA.timeSignature, measureB.timeSignature)) {
        return false;
    }

    for (let i = 0; i < measureA.content.length; i++) {
        if (!compareNoteObjects(measureA.content[i], measureB.content[i])) {
            return false;
        }
    }

    return true;
}

/**
 * Compares two lyrics objects for equality.
 * @param {object} lyricsA - The first lyrics object.
 * @param {object} lyricsB - The second lyrics object.
 * @returns {boolean} - True if the objects are equal, false otherwise.
 */
export function compareLyricsObjects(lyricsA, lyricsB) {
    if (lyricsA === lyricsB) {
        return true;
    }

    if (!lyricsA || !lyricsB) {
        return false;
    }

    const measuresA = lyricsA.measures;
    const measuresB = lyricsB.measures;

    if (measuresA.length !== measuresB.length) {
        return false;
    }

    for (let i = 0; i < measuresA.length; i++) {
        if (!compareMeasureObjects(measuresA[i], measuresB[i])) {
            return false;
        }
    }

    return true;
}

export function compareLyricsLayouts(layoutA, layoutB) {
    // Handle strict equality and cases where one or both are null/undefined.
    if (layoutA === layoutB) {
        return true;
    }
    if (!layoutA || !layoutB) {
        return false;
    }

    // Compare top-level style and dimension properties.
    if (
        layoutA.fontFamily !== layoutB.fontFamily ||
        layoutA.fontWeight !== layoutB.fontWeight ||
        layoutA.fontStyle !== layoutB.fontStyle ||
        layoutA.fontSize !== layoutB.fontSize ||
        layoutA.letterSpacing !== layoutB.letterSpacing ||
        layoutA.wordSpacing !== layoutB.wordSpacing ||
        layoutA.lineHeight !== layoutB.lineHeight ||
        layoutA.width !== layoutB.width ||
        layoutA.height !== layoutB.height ||
        layoutA.textAlign !== layoutB.textAlign ||
        layoutA.justifyText !== layoutB.justifyText ||
        layoutA.highlightedPercentage !== layoutB.highlightedPercentage
    ) {
        return false;
    }

    // Compare the lines array.
    if (layoutA.lines.length !== layoutB.lines.length) {
        return false;
    }

    // Deep compare each line and its tspans.
    for (let i = 0; i < layoutA.lines.length; i++) {
        const lineA = layoutA.lines[i];
        const lineB = layoutB.lines[i];

        if (lineA.width !== lineB.width || lineA.height !== lineB.height || lineA.x !== lineB.x) {
            return false;
        }

        if (lineA.tspans.length !== lineB.tspans.length) {
            return false;
        }

        for (let j = 0; j < lineA.tspans.length; j++) {
            const tspanA = lineA.tspans[j];
            const tspanB = lineA.tspans[j];

            // Compare individual tspan properties.
            if (
                tspanA.text !== tspanB.text ||
                tspanA.type !== tspanB.type ||
                tspanA.isConnectedToNext !== tspanB.isConnectedToNext ||
                tspanA.id !== tspanB.id ||
                tspanA.width !== tspanB.width ||
                tspanA.dx !== tspanB.dx
            ) {
                return false;
            }
        }
    }

    // If all checks have passed, the layouts are considered equal.
    return true;
}

export function deepEqual(a, b) {
    if (a === b) return true;
    if (Number.isNaN(a) && Number.isNaN(b)) return true;

    if (a && b && typeof a === 'object' && typeof b === 'object') {
        if (Array.isArray(a) !== Array.isArray(b)) return false;

        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;

        for (let key of keysA) {
            if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
            if (!deepEqual(a[key], b[key])) return false;
        }
        return true;
    }
    return false;
}