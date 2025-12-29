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

export function generateUUID() {
    if(window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
    } else {
        return Date.now().toString() + `-${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Performs a deep copy of a serialized element (or page) tree, remapping all
 * Element IDs, Measure IDs, and Note IDs to ensure the copy is unique
 * but maintains internal consistency (e.g. Lyrics pointing to the copied Orchestra).
 * @param {object} serializedData The serialized virtual element tree.
 * @returns {object} The deep-copied and remapped data.
 */
export function duplicateAndRemap(serializedData) {
    const clone = structuredClone(serializedData);

    const idMap = new Map(); // OldElementID -> NewElementID
    const measureMap = new Map(); // OldMeasureID -> NewMeasureID
    const noteMap = new Map(); // OldNoteID -> NewNoteID

    // --- Pass 1: Generate Mappings ---
    function generateMappingsRecursive(item) {
        // 1. Map Element ID
        const newElId = `ve-${generateUUID()}`;
        idMap.set(item.id, newElId);

        // 2. Map Measure/Note IDs in Properties
        if (item.properties) {
            // Lyrics Content
            if (item.properties.lyricsContent) {
                // Determine if we are dealing with the raw object or the wrapped value
                const lyricsData = item.properties.lyricsContent.measures ? item.properties.lyricsContent : (item.properties.lyricsContent.lyricsObject || {});
                
                if (lyricsData.measures) {
                    lyricsData.measures.forEach(m => {
                        const newMid = `measure-${generateUUID()}`;
                        measureMap.set(m.id, newMid);
                        if (m.content) {
                            m.content.forEach(n => {
                                noteMap.set(n.id, `note-${generateUUID()}`);
                            });
                        }
                    });
                }
            }
            // Orchestra Content
            if (item.properties.orchestraContent) {
                // Handle raw object or wrapped
                const orchData = item.properties.orchestraContent.measures ? item.properties.orchestraContent : (item.properties.orchestraContent || {});
                
                if (orchData.measures) {
                    orchData.measures.forEach(m => {
                        const newMid = `measure-${generateUUID()}`;
                        measureMap.set(m.id, newMid);
                        // Handle batched/repeated measures (e.g., id "xyz", count 4 -> "xyz-0", "xyz-1"...)
                        // Orchestra measures in the timeline ALWAYS use suffixes.
                        const count = m.count || 1;
                        for (let i = 0; i < count; i++) {
                            measureMap.set(`${m.id}-${i}`, `${newMid}-${i}`);
                        }
                    });
                }
            }
        }

        // 3. Map IDs in Events Data (if they exist as explicit keys)
        if (item.eventsData && item.eventsData.content) {
            const content = item.eventsData.content;
            
            // Handle Object format (Map: MeasureID -> Notes)
            if (!Array.isArray(content)) {
                Object.values(content).forEach(notes => {
                    notes.forEach(note => {
                        if (note.id) noteMap.set(note.id, `evt-${generateUUID()}`);
                    });
                });
            } 
            // Handle Array format (Legacy: List of Notes)
            else {
                content.forEach(notes => {
                    notes.forEach(note => {
                        if (note.id) noteMap.set(note.id, `evt-${generateUUID()}`);
                    });
                });
            }
        }

        if (item.children) {
            item.children.forEach(generateMappingsRecursive);
        }
    }

    generateMappingsRecursive(clone);

    // --- Pass 2: Apply Mappings ---
    function applyMappingsRecursive(item) {
        // 1. Apply Element ID
        if (idMap.has(item.id)) {
            item.id = idMap.get(item.id);
        }

        // 2. Update Page-level references
        if (item.musicElementsOrder) {
            item.musicElementsOrder = item.musicElementsOrder
                .map(oldId => idMap.get(oldId)) // If it was part of this duplication, update it
                .filter(id => id); // Remove if undefined (shouldn't happen in valid tree)
        }

        // 3. Update Properties
        if (item.properties) {
            // Lyrics: Update Owned Measures
            if (item.properties.lyricsContent) {
                const lc = item.properties.lyricsContent; // Working on the clone directly
                
                // Handle structure variation (sometimes directly on prop, sometimes in sub-object)
                const targetObj = lc.lyricsObject || lc; 

                if (targetObj.measures) {
                    targetObj.measures.forEach(m => {
                        if (measureMap.has(m.id)) m.id = measureMap.get(m.id);
                        if (m.content) {
                            m.content.forEach(n => {
                                if (noteMap.has(n.id)) n.id = noteMap.get(n.id);
                            });
                        }
                    });
                }
                // Lyrics: Update References (Foreign Content)
                if (targetObj.foreignContent) {
                    const newForeign = {};
                    Object.keys(targetObj.foreignContent).forEach(oldKey => {
                        // If the foreign measure was ALSO duplicated (part of this page/tree), use new ID.
                        // If not (e.g. duplicating a layer but referencing a measure outside that layer), keep old ID.
                        const newKey = measureMap.get(oldKey) || oldKey;
                        
                        // Deep copy notes to avoid reference issues
                        const notes = targetObj.foreignContent[oldKey].map(n => ({...n}));
                        // Remap note IDs if they were mapped (rare for foreign, but safer)
                        notes.forEach(n => { if (noteMap.has(n.id)) n.id = noteMap.get(n.id); });
                        
                        newForeign[newKey] = notes;
                    });
                    targetObj.foreignContent = newForeign;
                }
                // Lyrics: Update Measure Order
                if (targetObj.measureIdOrder) {
                    targetObj.measureIdOrder = targetObj.measureIdOrder.map(oldId => measureMap.get(oldId) || oldId);
                }
            }

            // Orchestra: Update Owned Measures
            if (item.properties.orchestraContent) {
                const oc = item.properties.orchestraContent;
                const targetObj = oc.measures ? oc : (oc || {});
                
                if (targetObj.measures) {
                    targetObj.measures.forEach(m => {
                        if (measureMap.has(m.id)) m.id = measureMap.get(m.id);
                    });
                }
            }
        }

        // 4. Update Events Data
        if (item.eventsData && item.eventsData.content) {
            const content = item.eventsData.content;

            // Handle Object format (Map: MeasureID -> Notes)
            if (!Array.isArray(content)) {
                const newContent = {};
                Object.keys(content).forEach(oldMeasureId => {
                    const newMeasureId = measureMap.get(oldMeasureId) || oldMeasureId;
                    const notes = content[oldMeasureId].map(n => ({...n}));
                    
                    notes.forEach(n => {
                        if (noteMap.has(n.id)) n.id = noteMap.get(n.id);
                    });
                    
                    newContent[newMeasureId] = notes;
                });
                item.eventsData.content = newContent;
            } 
            // Handle Array format (Legacy)
            else {
                // Iterate the array and remap IDs in place (content is already a deep clone from structuredClone)
                content.forEach(notes => {
                    notes.forEach(n => {
                        if (noteMap.has(n.id)) n.id = noteMap.get(n.id);
                    });
                });
            }
        }

        if (item.children) {
            item.children.forEach(applyMappingsRecursive);
        }
    }

    applyMappingsRecursive(clone);
    return clone;
}

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

        // Recurse into children in reverse order to find top-most elements first
        for (let i = el.children.length - 1; i >= 0; i--) {
            dfs(el.children[i], depth + 1);
        }
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
 * This tells the Events Editor which specific value editor (Color, Number, Size, etc.) to open.
 * @param {string} propKey - The property key (e.g., 'opacity', 'width').
 * @returns {string} The property type category.
 */
export function getPropertyType(propKey) {
    switch (propKey) {
        // --- Number (single numeric value) ---
        case 'opacity':
        case 'videoSpeed':
        case 'audioVolume':
        case 'audioStartTime':
        case 'audioEndTime':
        case 'shadowAngle':
        case 'textShadowAngle': 
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

        // --- Size (value + unit object: {value: 10, unit: 'px'}) ---
        case 'width':
        case 'height':
        case 'top':
        case 'left':
        case 'right':
        case 'bottom':
        case 'borderSize':
        case 'borderRadius':
        case 'shadowDistance':
        case 'textShadowDistance':
        case 'shadowBlur':
        case 'shadowSpread':
        case 'textShadowBlur':
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

        // --- Color/Gradient (Complex object with mode: 'color' or 'gradient') ---
        case 'bgColor':
        case 'borderColor':
        case 'shadowColor':
        case 'textColor':
        case 'karaokeColor':
        case 'textShadowColor':
        case 'progressBgColor':
        case 'progressFillColor':
            return 'color/gradient';

        // --- Boolean (true/false) ---
        case 'bgEnabled':
        case 'borderEnabled':
        case 'shadowEnabled':
        case 'shadowInset':
        case 'textShadowEnabled':
        case 'justifyText':
        case 'audioLoop':
        case 'videoLoop':
        case 'visible':
            return 'boolean';

        // --- String (Standard strings or fixed selection dropdowns) ---
        case 'content':
        case 'fontFamily':
        case 'fontWeight':
        case 'fontStyle':
        case 'textAlign':
        case 'objectFit':
        case 'videoSrc':
        case 'audioSrc':
        case 'transform-style':
        case 'backface-visibility':
        case 'parent-transform-style':
        case 'mixBlendMode':
        // --- ADDED ---
        case 'objectPositionX':
        case 'objectPositionY':
            return 'string';

        // --- Dynamic String (Value + ID to trigger logic in renderers) ---
        case 'videoState':
        case 'audioState':
            return 'dynamic-string';

        // --- Alignment & Layout (Specific UI types) ---
        case 'alignment':
            return 'alignment';
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

    const commonObjectPosition = { "Object Position": { "objectPositionX": "Pos X", "objectPositionY": "Pos Y" } };

    const commonEffects = { "Effects": {
            "opacity": "Opacity",
            "mixBlendMode": "Blending Mode"
        }};
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
    const commonTextShadow = { "Text Shadow": {
            "textShadowEnabled": "Enabled",
            "textShadowColor": "Color",
            "textShadowOffsetX": "Offset X",
            "textShadowOffsetY": "Offset Y",
            "textShadowBlur": "Blur"
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
                ...commonTextShadow,
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
                ...commonTextShadow,
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
                ...commonObjectPosition,
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
                ...commonObjectPosition,
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
                ...commonBorder,
                ...commonBoxShadow,
                ...commonTransform2D,
                ...commonTransform3D
            };
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
                measureCount = (data.measures || []).reduce((total, measure) => total + (measure.count || 1), 0);
            }
        } catch (e) {
            console.error('Error parsing orchestra content:', e);
        }
    }
    return measureCount;
}

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

    for (let i = 0; i < pageIndex; i++) {
        offset += measureMap.filter(m => m.pageIndex === i).length;
    }

    if (element instanceof VirtualLyrics || element instanceof VirtualOrchestra) {
        const orderedMusicElements = pageOfElement.getMusicElementsOrder();
        for (const musicEl of orderedMusicElements) {
            if (musicEl.id === element.id) {
                break;
            }
            offset += measureMap.filter(m => m.elementId === musicEl.id && m.pageIndex === pageIndex).length;
        }
    }

    return offset;
}

export function findVirtualElementById(container, elementId) {
    if (!container) return null;
    if (container.id === elementId) return container;

    if (typeof container.getChildren !== 'function') {
        return null;
    }

    function search(searchContainer) {
        for (const child of searchContainer.getChildren()) {
            if (child.id === elementId) return child;
            if (child instanceof VirtualContainer) {
                const found = search(child);
                if (found) return found;
            }
        }
        return null;
    }

    return search(container);
}

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

export function buildMeasureMap() {
    const measureMap = [];
    if (!state.song || !state.song.pages) return [];

    const bpmValue = 4;

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
        if (!lyricsData) continue;

        // Process measures owned by the element
        if (lyricsData.measures) {
            lyricsData.measures.forEach(measure => {
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

        // Process foreign content
        if (lyricsData.foreignContent) {
            for (const measureId in lyricsData.foreignContent) {
                const measureInstances = measureMap.filter(m => m.originalMeasureId === measureId);
                const foreignNotes = lyricsData.foreignContent[measureId];

                measureInstances.forEach(measureInfo => {
                    let timeWithinMeasure = 0;
                    if (foreignNotes) {
                        foreignNotes.forEach(note => {
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
            }
        }
    }

    lyricsMap.sort((a, b) => a.startTime - b.startTime);
    return lyricsMap;
}

export function findLastPageWithMusic(targetPageIndex, measureMap) {
    for (let i = measureMap.length - 1; i >= 0; i--) {
        const measure = measureMap[i];
        if (measure.pageIndex < targetPageIndex) {
            return measure.pageIndex;
        }
    }
    return -1;
}

export function findActiveTransition(musicalTime, measureMap, pages) {
    if (!measureMap || measureMap.length === 0 || !pages) return null;

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const transition = page.transition || { type: 'instant', duration: 0, offsetBeats: 0 };

        if (transition.type === 'instant' || !transition.duration || transition.duration <= 0) {
            continue;
        }

        const firstMeasureOfPage = measureMap.find(m => m.pageIndex === i);
        if (!firstMeasureOfPage) continue;

        const transitionStartTime = firstMeasureOfPage.startTime + (transition.offsetBeats || 0);

        let durationInBeats;

        if (transition.durationUnit === 'beats') {
            durationInBeats = transition.duration || 1;
        } else { // Default to measures
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

    return null;
}

export function pageHasMeasures(page) {
    if (!page) return false;
    const musicElements = findMusicElementsRecursively(page);

    for (const element of musicElements) {
        if (element instanceof VirtualLyrics) {
            if (element.getProperty('lyricsContent')?.getLyricsValue().getLyricsObject().measures.length > 0) {
                return true;
            }
        } else if (element instanceof VirtualOrchestra || element instanceof VirtualAudio) {
            const measures = element.getProperty('orchestraContent')?.getMeasures();
            if (measures && measures.length > 0) {
                if (measures.some(m => (m.count === undefined ? 1 : m.count) > 0)) {
                    return true;
                }
            }
        }
    }
    return false;
}

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
                for (let i = 0; i < (measure.count || 1); i++) {
                    measures.push({ id: `${measure.id}-${i}`, timeSignature: measure.timeSignature });
                }
            });
        }
    }
    return measures;
}

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

export function getSongMeasuresStructure() {
    if (!state.song || !state.song.pages) return [];

    const measures = [];
    state.song.pages.forEach((page, pageIndex) => {
        const orderedMusicElements = page.getMusicElementsOrder();
        const orderedIds = new Set(orderedMusicElements.map(el => el.id));
        const allMusicChildren = findMusicElementsRecursively(page);
        const unorderedMusicElements = allMusicChildren.filter(el => !orderedIds.has(el.id));
        const musicElements = [...orderedMusicElements, ...unorderedMusicElements];

        musicElements.forEach(element => {
            const elementMeasures = getElementMeasuresStructure(element);
            elementMeasures.forEach(measure => {
                measures.push({
                    ...measure,
                    pageIndex: pageIndex,
                    elementId: element.id
                });
            });
        });
    });

    return measures;
}

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

export function getAllUsedAssets() {
    const usedAssets = new Set();
    const allPages = [state.song.thumbnailPage, ...state.song.pages].filter(Boolean);

    for (const page of allPages) {
        const allElementsOnPage = findAllElementsRecursive(page);
        allElementsOnPage.push(page);

        for (const element of allElementsOnPage) {
            if (element.hasProperty('src')) {
                const srcProp = element.getProperty('src');
                if (srcProp.getSrc && typeof srcProp.getSrc === 'function') {
                    const srcValue = srcProp.getSrc().getValue();
                    if (srcValue) {
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

    if (state.song && state.song.fonts) {
        Object.values(state.song.fonts).forEach(fontPath => {
            if (fontPath) usedAssets.add(fontPath);
        });
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
            if (jsonValue !== undefined) {
                serialized.properties[key] = jsonValue;
            }
        }
    }

    const eventsData = element.getEventsData();
    if (eventsData && eventsData.content) {
        let hasContent = false;
        if (Array.isArray(eventsData.content)) {
            hasContent = eventsData.content.length > 0;
        } else if (typeof eventsData.content === 'object') {
            hasContent = Object.keys(eventsData.content).length > 0;
        }

        if (hasContent) {
            serialized.eventsData = eventsData;
        }
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

    element.id = data.id;
    element.domElement.id = data.id;

    if (data.eventsData) {
        element.tempEventsData = data.eventsData;
    }

    if (data.children && element instanceof VirtualContainer) {
        data.children.forEach(childData => {
            const childElement = deserializeElement(childData);
            element.addElement(childElement);
        });
    }

    if (data.type === 'page') {
        element.transition = data.transition || element.transition;
    }

    if (data.type === 'video' || data.type === 'audio') {
        const savedPlaybackProp = data.properties?.playback;
        if (savedPlaybackProp?.state?.value) {
            const playbackProp = element.getProperty('playback');
            if (playbackProp) {
                playbackProp.getState().setDefaultValue(savedPlaybackProp.state);
            }
        }
    }

    return element;
}

export function compareNoteObjects(noteA, noteB) {
    if (!noteA || !noteB) {
        return noteA === noteB;
    }

    const lineBreakA = noteA.lineBreakAfter === true;
    const lineBreakB = noteB.lineBreakAfter === true;

    return noteA.id === noteB.id &&
        noteA.type === noteB.type &&
        noteA.text === noteB.text &&
        noteA.isConnectedToNext === noteB.isConnectedToNext &&
        lineBreakA === lineBreakB;
}

export function compareTimeSignatureObjects(tsA, tsB) {
    if (!tsA || !tsB) {
        return tsA === tsB;
    }

    return tsA.numerator === tsB.numerator &&
        tsA.denominator === tsB.denominator;
}

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

export function compareLyricsObjects(lyricsA, lyricsB) {
    if (lyricsA === lyricsB) {
        return true;
    }

    if (!lyricsA || !lyricsB) {
        return false;
    }

    const measuresA = lyricsA.measures || [];
    const measuresB = lyricsB.measures || [];

    if (measuresA.length !== measuresB.length) {
        return false;
    }

    for (let i = 0; i < measuresA.length; i++) {
        if (!compareMeasureObjects(measuresA[i], measuresB[i])) {
            return false;
        }
    }

    if (!deepEqual(lyricsA.foreignContent || {}, lyricsB.foreignContent || {})) {
        return false;
    }

    return true;
}

export function compareLyricsLayouts(layoutA, layoutB) {
    if (layoutA === layoutB) {
        return true;
    }
    if (!layoutA || !layoutB) {
        return false;
    }

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

    if (layoutA.lines.length !== layoutB.lines.length) {
        return false;
    }

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