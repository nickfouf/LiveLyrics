const fs = require('fs');

// 1. Get file path
const songPath = process.argv[2] || 'song.json';
if (!fs.existsSync(songPath)) {
    console.error(`File not found: ${songPath}`);
    process.exit(1);
}

let songData;
try {
    songData = JSON.parse(fs.readFileSync(songPath, 'utf8'));
} catch (e) {
    console.error('Failed to parse the JSON file.');
    process.exit(1);
}

// Generates an ID structurally identical to the LiveLyrics format
function generateUUID() {
    return Date.now().toString() + `-${Math.random().toString(36).substr(2, 9)}`;
}

// Recursively fetches all VirtualElements from the project
function traverse(element, callback) {
    if (!element) return;
    callback(element);
    if (element.children) {
        element.children.forEach(child => traverse(child, callback));
    }
}

const allElements =[];
if (songData.thumbnailPage) traverse(songData.thumbnailPage, el => allElements.push(el));
if (songData.pages) {
    songData.pages.forEach(p => traverse(p, el => allElements.push(el)));
}

// Update Page Transitions so they don't visually speed up (1 measure of 4/4 -> 2 measures of 2/4)
if (songData.pages) {
    songData.pages.forEach(page => {
        if (page.transition && page.transition.durationUnit === 'measures') {
            page.transition.duration = page.transition.duration * 2;
        }
    });
}

const NOTE_DURATIONS = {
    w_note: 4.0, h_note: 2.0, q_note: 1.0, e_note: 0.5, s_note: 0.25,
    w_note_dotted: 6.0, h_note_dotted: 3.0, q_note_dotted: 1.5, e_note_dotted: 0.75,
};

function getNoteTypeForDuration(targetDuration) {
    for (const [type, dur] of Object.entries(NOTE_DURATIONS)) {
        if (dur === targetDuration) return type;
    }
    return 'q_note'; // Fallback
}

// This map tracks old timeline IDs to new timeline IDs so we can remap animated properties.
const globalMeasureSplitMap = {};

// --- PASS 1: Split Music Elements and Build globalMeasureSplitMap ---
for (const element of allElements) {
    const type = element.type;
    const isOrchestra = type === 'orchestra' || type === 'audio';
    const isLyrics = type === 'lyrics';

    if (!isOrchestra && !isLyrics) continue;

    let props = element.properties;
    if (!props) continue;

    let measures =[];
    let foreignContent = {};
    let measureIdOrder =[];

    // Safely extract the timeline array based on the element type
    if (isOrchestra && props.orchestraContent) {
        let orchObj = props.orchestraContent;
        if (orchObj.measures === undefined && Array.isArray(orchObj)) {
            orchObj = { measures: orchObj };
            props.orchestraContent = orchObj;
        }
        measures = orchObj.measures ||[];
    } else if (isLyrics && props.lyricsContent) {
        let lyricsObj = props.lyricsContent;
        if (lyricsObj.lyricsObject) lyricsObj = lyricsObj.lyricsObject;
        measures = lyricsObj.measures ||[];
        foreignContent = lyricsObj.foreignContent || {};
        measureIdOrder = lyricsObj.measureIdOrder ||[];
        if (measureIdOrder.length === 0 && measures.length > 0) {
            measureIdOrder = measures.map(m => m.id);
        }
    }

    // 1. Unroll Timeline IDs
    const unrolled =[];
    if (isOrchestra) {
        measures.forEach(m => {
            const count = m.count || 1;
            for (let i = 0; i < count; i++) {
                unrolled.push({
                    timelineId: `${m.id}-${i}`,
                    timeSignature: m.timeSignature,
                    content: JSON.parse(JSON.stringify(m.content ||[]))
                });
            }
        });
    } else if (isLyrics) {
        measureIdOrder.forEach(id => {
            let content =[];
            let m = measures.find(x => x.id === id);
            let timeSig = { numerator: 4, denominator: 4 };
            if (m) {
                content = m.content;
                timeSig = m.timeSignature || timeSig;
            } else if (foreignContent[id]) {
                content = foreignContent[id];
            }

            unrolled.push({
                timelineId: id,
                timeSignature: timeSig,
                content: JSON.parse(JSON.stringify(content ||[]))
            });
        });
    }

    if (unrolled.length === 0) continue;

    const newMeasures = [];
    const newMeasureIdOrder =[];

    // 2. Split 4/4 into 2/4
    for (let i = 0; i < unrolled.length; i++) {
        const m = unrolled[i];

        // Only split 4/4 measures
        if (m.timeSignature && m.timeSignature.numerator === 4 && m.timeSignature.denominator === 4) {
            let duration = 0;
            let splitIndex = -1;
            let noteToSplit = null;

            for (let j = 0; j < m.content.length; j++) {
                const note = m.content[j];
                const noteDur = NOTE_DURATIONS[note.type] || 1.0;
                duration += noteDur;

                if (duration === 2.0) {
                    splitIndex = j + 1; // Clean cut
                    break;
                } else if (duration > 2.0) {
                    splitIndex = j; // Cut involves splitting the current note
                    noteToSplit = {
                        durBefore: noteDur - (duration - 2.0),
                        durAfter: duration - 2.0
                    };
                    break;
                }
            }

            const newIdA = `m-${generateUUID()}`;
            const newIdB = `m-${generateUUID()}`;
            const newTimelineIdA = isOrchestra ? `${newIdA}-0` : newIdA;
            const newTimelineIdB = isOrchestra ? `${newIdB}-0` : newIdB;

            let splitInfo = {
                idA: newTimelineIdA,
                idB: newTimelineIdB,
                splitIndex: splitIndex !== -1 ? splitIndex : m.content.length,
                noteToSplit: !!noteToSplit
            };

            let contentA =[];
            let contentB =[];

            if (splitIndex !== -1) {
                contentA = m.content.slice(0, splitIndex);
                contentB = m.content.slice(splitIndex);

                if (noteToSplit) {
                    // Pull the overlapping note to fragment it manually across the split line
                    const crossingNote = contentB.shift();
                    const noteA = JSON.parse(JSON.stringify(crossingNote));
                    const noteB = JSON.parse(JSON.stringify(crossingNote));

                    noteA.type = getNoteTypeForDuration(noteToSplit.durBefore);
                    noteB.type = getNoteTypeForDuration(noteToSplit.durAfter);

                    if (isLyrics) {
                        noteA.isConnectedToNext = true;
                        noteA.lineBreakAfter = false;
                        noteB.text = '∅';
                    }

                    noteA.id = `note-${generateUUID()}`;
                    noteB.id = `note-${generateUUID()}`;

                    splitInfo.splitNoteNewIdA = noteA.id;
                    splitInfo.splitNoteNewIdB = noteB.id;

                    contentA.push(noteA);
                    contentB.unshift(noteB);
                }
            } else {
                contentA = m.content; // Failsafe if mathematical loop bypassed
            }

            globalMeasureSplitMap[m.timelineId] = splitInfo;

            newMeasures.push({
                id: newIdA,
                timeSignature: { numerator: 2, denominator: 4 },
                content: contentA,
                count: isOrchestra ? 1 : undefined
            });

            newMeasures.push({
                id: newIdB,
                timeSignature: { numerator: 2, denominator: 4 },
                content: contentB,
                count: isOrchestra ? 1 : undefined
            });

            if (isLyrics) {
                newMeasureIdOrder.push(newIdA, newIdB);
            }
        } else {
            // Not a 4/4 measure, leave structurally intact, just renew the ID
            const newId = `m-${generateUUID()}`;
            const newTimelineId = isOrchestra ? `${newId}-0` : newId;
            globalMeasureSplitMap[m.timelineId] = {
                idA: newTimelineId,
                idB: null,
                splitIndex: m.content.length,
                noteToSplit: false
            };

            newMeasures.push({
                id: newId,
                timeSignature: m.timeSignature,
                content: m.content,
                count: isOrchestra ? 1 : undefined
            });
            if (isLyrics) newMeasureIdOrder.push(newId);
        }
    }

    // Apply the split data back to the element object
    if (isOrchestra) {
        props.orchestraContent.measures = newMeasures;
    } else if (isLyrics) {
        let lyricsObj = props.lyricsContent;
        if (lyricsObj.lyricsObject) lyricsObj = lyricsObj.lyricsObject;
        lyricsObj.measures = newMeasures;
        lyricsObj.foreignContent = {}; // Wipe foreign content, everything is now independently 'owned'
        lyricsObj.measureIdOrder = newMeasureIdOrder;
    }
}

// --- PASS 2: Update all eventsData.content keys across all elements (Animated properties) ---
for (const element of allElements) {
    if (!element.eventsData || !element.eventsData.content) continue;

    const content = element.eventsData.content;

    // Apply mappings to modern event maps
    if (!Array.isArray(content)) {
        const newMap = {};
        for (const[oldId, notes] of Object.entries(content)) {
            const splitInfo = globalMeasureSplitMap[oldId];
            if (splitInfo) {
                if (splitInfo.idB) {
                    let contentA = notes.slice(0, splitInfo.splitIndex);
                    let contentB = notes.slice(splitInfo.splitIndex);

                    if (splitInfo.noteToSplit) {
                        const crossingNote = contentB.shift();
                        if (crossingNote) {
                            const noteA = JSON.parse(JSON.stringify(crossingNote));
                            const noteB = JSON.parse(JSON.stringify(crossingNote));

                            // Re-hook the split event instances to the correctly fragmented notes
                            noteA.id = splitInfo.splitNoteNewIdA;
                            noteB.id = splitInfo.splitNoteNewIdB;

                            contentA.push(noteA);
                            contentB.unshift(noteB);
                        }
                    }

                    if (!newMap[splitInfo.idA]) newMap[splitInfo.idA] = [];
                    newMap[splitInfo.idA] = newMap[splitInfo.idA].concat(contentA);

                    if (!newMap[splitInfo.idB]) newMap[splitInfo.idB] = [];
                    newMap[splitInfo.idB] = newMap[splitInfo.idB].concat(contentB);

                } else {
                    if (!newMap[splitInfo.idA]) newMap[splitInfo.idA] = [];
                    newMap[splitInfo.idA] = newMap[splitInfo.idA].concat(notes);
                }
            } else {
                if (!newMap[oldId]) newMap[oldId] = [];
                newMap[oldId] = newMap[oldId].concat(notes);
            }
        }
        element.eventsData.content = newMap;
    }
}

// 3. Write final JSON
const outPath = songPath.replace('.json', '_2-4.json');
fs.writeFileSync(outPath, JSON.stringify(songData, null, 2), 'utf8');
console.log(`✅ Conversion complete. Successfully saved 2/4 adaptation to: ${outPath}`);