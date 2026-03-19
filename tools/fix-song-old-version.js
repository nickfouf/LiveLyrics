const fs = require('fs');
const crypto = require('crypto');

// The file to read and the file to output
const inputFile = 'song.json';
const outputFile = 'song_fixed.json';

console.log('Loading song data...');
let data = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
let seenMeasureIds = new Set();
let fixedCount = 0;

function fixElements(elements) {
    if (!elements) return;

    for (let el of elements) {
        // Look for Lyrics or Orchestra elements
        if (el.type === 'lyrics' || el.type === 'orchestra') {
            let contentProp = el.type === 'lyrics' ? el.properties.lyricsContent : el.properties.orchestraContent;

            if (contentProp && contentProp.measures) {
                // 1. Wipe out any corrupted foreign content references
                if (el.type === 'lyrics') {
                    contentProp.foreignContent = {};
                }

                // 2. Fix duplicated measure IDs
                for (let i = 0; i < contentProp.measures.length; i++) {
                    let measure = contentProp.measures[i];
                    let oldId = measure.id;

                    if (seenMeasureIds.has(oldId)) {
                        // We found a duplicate! Generate a new UUID
                        let newId = 'measure-' + crypto.randomUUID();
                        measure.id = newId;

                        // Update the order tracking array for lyrics
                        if (el.type === 'lyrics' && contentProp.measureIdOrder) {
                            let orderIndex = contentProp.measureIdOrder.indexOf(oldId);
                            if (orderIndex !== -1) {
                                contentProp.measureIdOrder[orderIndex] = newId;
                            }
                        }

                        // Update timeline events mapping if they exist
                        if (el.eventsData && el.eventsData.content && !Array.isArray(el.eventsData.content)) {
                            if (el.eventsData.content[oldId]) {
                                el.eventsData.content[newId] = el.eventsData.content[oldId];
                                delete el.eventsData.content[oldId];
                            }
                        }
                        fixedCount++;
                        seenMeasureIds.add(newId);
                    } else {
                        // First time seeing this ID, mark it as safe
                        seenMeasureIds.add(oldId);
                    }
                }
            }
        }

        // Recursively check children (e.g., inside vcontainers)
        if (el.children) {
            fixElements(el.children);
        }
    }
}

// Process the thumbnail page and all standard pages
if (data.thumbnailPage) fixElements([data.thumbnailPage]);
if (data.pages) fixElements(data.pages);

fs.writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf-8');
console.log(`✅ Fixed file saved to '${outputFile}'. Successfully regenerated ${fixedCount} duplicated measure IDs.`);