const fs = require('fs');

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

function generateUUID() {
    return Date.now().toString() + `-${Math.random().toString(36).substr(2, 9)}`;
}

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

// Update Page Transitions so they don't visually slow down (2 measures of 2/4 -> 1 measure of 4/4)
if (songData.pages) {
    songData.pages.forEach(page => {
        if (page.transition && page.transition.durationUnit === 'measures') {
            page.transition.duration = page.transition.duration / 2;
        }
    });
}

const globalIdMap = {}; // oldTimelineId -> newTimelineId

// --- PASS 1: Rebuild Owned Measures and Build globalIdMap ---
for (const element of allElements) {
    const type = element.type;
    const isOrchestra = type === 'orchestra' || type === 'audio';
    const isLyrics = type === 'lyrics';

    if (!isOrchestra && !isLyrics) continue;

    let props = element.properties;
    if (!props) continue;

    let ownedMeasures =[];

    // Extract OWNED measures ONLY
    if (isOrchestra && props.orchestraContent) {
        let orchObj = props.orchestraContent;
        if (orchObj.measures === undefined && Array.isArray(orchObj)) {
            orchObj = { measures: orchObj };
            props.orchestraContent = orchObj;
        }
        ownedMeasures = orchObj.measures ||[];
    } else if (isLyrics && props.lyricsContent) {
        let lyricsObj = props.lyricsContent;
        if (lyricsObj.lyricsObject) lyricsObj = lyricsObj.lyricsObject;
        ownedMeasures = lyricsObj.measures ||[];
    }

    if (ownedMeasures.length === 0) continue;

    // 1. Unroll Owned Measures (INCLUDING Empty Ones)
    const unrolled =[];
    ownedMeasures.forEach(m => {
        const count = isOrchestra ? (m.count || 1) : 1;
        for (let i = 0; i < count; i++) {
            unrolled.push({
                timelineId: isOrchestra ? `${m.id}-${i}` : m.id,
                content: JSON.parse(JSON.stringify(m.content || []))
            });
        }
    });

    const newMeasures =[];

    // 2. Chunk and Merge every 2 measures
    for (let i = 0; i < unrolled.length; i += 2) {
        const mA = unrolled[i];
        const mB = unrolled[i + 1]; // Will be undefined if there's an odd number of measures

        const newBaseId = `m-${generateUUID()}`;
        const newTimelineId = isOrchestra ? `${newBaseId}-0` : newBaseId;

        // Register to mapping dict so other dependencies know where it moved
        globalIdMap[mA.timelineId] = newTimelineId;
        if (mB) {
            globalIdMap[mB.timelineId] = newTimelineId;
        }

        // Concat the content arrays (notes/beats)
        const mergedContent = [...mA.content];
        if (mB) mergedContent.push(...mB.content);

        const mergedMeasure = {
            id: newBaseId,
            timeSignature: { numerator: 4, denominator: 4 },
            content: mergedContent
        };

        if (isOrchestra) mergedMeasure.count = 1; // Explicitly unroll orchestra repetitions

        newMeasures.push(mergedMeasure);
    }

    // Apply the merged data back to the element object
    if (isOrchestra) {
        props.orchestraContent.measures = newMeasures;
    } else if (isLyrics) {
        let lyricsObj = props.lyricsContent;
        if (lyricsObj.lyricsObject) lyricsObj = lyricsObj.lyricsObject;
        lyricsObj.measures = newMeasures;
    }
}

// --- PASS 2: Update Lyrics foreignContent & measureIdOrder ---
for (const element of allElements) {
    if (element.type !== 'lyrics') continue;
    let props = element.properties;
    if (!props || !props.lyricsContent) continue;
    let lyricsObj = props.lyricsContent;
    if (lyricsObj.lyricsObject) lyricsObj = lyricsObj.lyricsObject;

    const oldForeignContent = lyricsObj.foreignContent || {};
    const newForeignContent = {};

    for (const [oldKey, notes] of Object.entries(oldForeignContent)) {
        let newId = globalIdMap[oldKey];
        if (!newId && globalIdMap[`${oldKey}-0`]) {
            newId = globalIdMap[`${oldKey}-0`]; // Legacy fallback logic
        }
        
        if (newId) {
            if (!newForeignContent[newId]) newForeignContent[newId] = [];
            newForeignContent[newId].push(...notes);
        } else {
            if (!newForeignContent[oldKey]) newForeignContent[oldKey] = [];
            newForeignContent[oldKey].push(...notes);
        }
    }
    lyricsObj.foreignContent = newForeignContent;

    const oldMeasureIdOrder = lyricsObj.measureIdOrder ||[];
    const newMeasureIdOrderSet = new Set();
    
    for (const oldId of oldMeasureIdOrder) {
        let newId = globalIdMap[oldId];
        if (!newId && globalIdMap[`${oldId}-0`]) {
            newId = globalIdMap[`${oldId}-0`];
        }
        
        if (newId) {
            newMeasureIdOrderSet.add(newId);
        } else {
            newMeasureIdOrderSet.add(oldId);
        }
    }
    lyricsObj.measureIdOrder = Array.from(newMeasureIdOrderSet);
}

// --- PASS 3: Update all eventsData.content keys across all elements (Animated properties) ---
for (const element of allElements) {
    if (!element.eventsData || !element.eventsData.content) continue;

    const content = element.eventsData.content;

    // Legacy Array formatting check
    if (Array.isArray(content)) {
        const newArray =[];
        for (let i = 0; i < content.length; i += 2) {
            const arrA = content[i] ||[];
            const arrB = content[i + 1] ||[];
            newArray.push(arrA.concat(arrB));
        }
        element.eventsData.content = newArray;
    } else {
        const newMap = {};
        for (const [oldId, notes] of Object.entries(content)) {
            let newId = globalIdMap[oldId];
            if (!newId && globalIdMap[`${oldId}-0`]) {
                newId = globalIdMap[`${oldId}-0`];
            }
            if (newId) {
                if (!newMap[newId]) newMap[newId] =[];
                newMap[newId].push(...notes);
            } else {
                if (!newMap[oldId]) newMap[oldId] = [];
                newMap[oldId].push(...notes);
            }
        }
        element.eventsData.content = newMap;
    }
}

// 3. Write final JSON
const outPath = songPath.replace('.json', '_4-4.json');
fs.writeFileSync(outPath, JSON.stringify(songData, null, 2), 'utf8');
console.log(`✅ Conversion complete. Successfully saved 4/4 adaptation to: ${outPath}`);