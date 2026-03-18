const fs = require('fs');
const path = require('path');

// Reference note durations to align measures by time
const NOTE_DURATIONS = {
    w_note: 1.0, h_note: 0.5, q_note: 0.25, e_note: 0.125, s_note: 0.0625,
    w_note_dotted: 1.5, h_note_dotted: 0.75, q_note_dotted: 0.375, e_note_dotted: 0.1875,
};

// Deep merges two arrays of notes for a single measure, respecting their time offsets
function mergeNoteArrays(arr1, arr2) {
    let dur1 = arr1.reduce((s, n) => s + (NOTE_DURATIONS[n.type] || 0), 0);
    let dur2 = arr2.reduce((s, n) => s + (NOTE_DURATIONS[n.type] || 0), 0);

    // Base array is the one with the longer defined rhythm (usually padded with ∅)
    let baseArr = dur1 >= dur2 ? arr1 : arr2;
    let overlayArr = dur1 >= dur2 ? arr2 : arr1;

    let merged = JSON.parse(JSON.stringify(baseArr));

    let timeBase = 0;
    for (let n of merged) {
        let timeOverlay = 0;
        let overlayNote = null;

        // Find the note in the overlay array that happens at the same time
        for (let o of overlayArr) {
            if (Math.abs(timeOverlay - timeBase) < 0.001) {
                overlayNote = o;
                break;
            }
            timeOverlay += (NOTE_DURATIONS[o.type] || 0);
        }

        // Inherit actual text/connections from the overlay note if the base note is empty (∅)
        if (overlayNote) {
            if (overlayNote.text && overlayNote.text !== '∅') {
                if (!n.text || n.text === '∅') {
                    n.text = overlayNote.text;
                    if (overlayNote.hasOwnProperty('isConnectedToNext')) n.isConnectedToNext = overlayNote.isConnectedToNext;
                    if (overlayNote.hasOwnProperty('lineBreakAfter')) n.lineBreakAfter = overlayNote.lineBreakAfter;
                }
            }
        }
        timeBase += (NOTE_DURATIONS[n.type] || 0);
    }

    return merged;
}

function mergeLyricsInPage(page) {
    if (!page) return;

    const lyricsList =[];

    function collectLyrics(node, parent) {
        if (!node) return;
        if (node.type === 'lyrics') {
            lyricsList.push({ node, parent });
        }
        if (node.children && Array.isArray(node.children)) {
            node.children.forEach(child => collectLyrics(child, node));
        }
    }

    collectLyrics(page, null);

    if (lyricsList.length > 1) {
        const target = lyricsList[0].node;

        if (!target.properties.lyricsContent) {
            target.properties.lyricsContent = { measures: [], foreignContent: {}, measureIdOrder:[] };
        }

        const targetContent = target.properties.lyricsContent;
        if (!targetContent.measures) targetContent.measures = [];
        if (!targetContent.measureIdOrder) targetContent.measureIdOrder =[];
        if (!targetContent.foreignContent) targetContent.foreignContent = {};

        const pageName = page.properties?.name || page.id;
        console.log(`\nPage '${pageName}':`);
        console.log(` -> Found ${lyricsList.length} lyrics elements. Merging into '${target.properties.name || target.id}'...`);

        for (let i = 1; i < lyricsList.length; i++) {
            const sourceInfo = lyricsList[i];
            const source = sourceInfo.node;
            const sourceParent = sourceInfo.parent;
            const sourceContent = source.properties.lyricsContent;

            if (sourceContent) {
                // 1. Merge "Owned" Measures
                if (sourceContent.measures) {
                    sourceContent.measures.forEach(sourceMeasure => {
                        let targetMeasure = targetContent.measures.find(m => m.id === sourceMeasure.id);
                        if (targetMeasure) {
                            targetMeasure.content = mergeNoteArrays(targetMeasure.content, sourceMeasure.content);
                        } else {
                            if (targetContent.foreignContent[sourceMeasure.id]) {
                                sourceMeasure.content = mergeNoteArrays(sourceMeasure.content, targetContent.foreignContent[sourceMeasure.id]);
                                delete targetContent.foreignContent[sourceMeasure.id];
                            }
                            targetContent.measures.push(sourceMeasure);
                        }
                    });
                }

                // 2. Merge "Foreign" Content
                if (sourceContent.foreignContent) {
                    for (const[measureId, foreignNotes] of Object.entries(sourceContent.foreignContent)) {
                        let targetMeasure = targetContent.measures.find(m => m.id === measureId);
                        if (targetMeasure) {
                            targetMeasure.content = mergeNoteArrays(targetMeasure.content, foreignNotes);
                        } else if (targetContent.foreignContent[measureId]) {
                            targetContent.foreignContent[measureId] = mergeNoteArrays(targetContent.foreignContent[measureId], foreignNotes);
                        } else {
                            targetContent.foreignContent[measureId] = foreignNotes;
                        }
                    }
                }

                // 3. Append measure IDs
                if (sourceContent.measureIdOrder) {
                    targetContent.measureIdOrder.push(...sourceContent.measureIdOrder);
                }
            }

            // Clean up: Remove the merged element from the DOM tree
            if (sourceParent && sourceParent.children) {
                sourceParent.children = sourceParent.children.filter(c => c.id !== source.id);
            }
            if (page.musicElementsOrder) {
                page.musicElementsOrder = page.musicElementsOrder.filter(id => id !== source.id);
            }

            console.log(`   - Merged and removed '${source.properties.name || source.id}'`);
        }

        // 4. Deduplicate consecutive measure IDs to prevent the double-rendering glitch
        let deduplicatedOrder =[];
        for (let id of targetContent.measureIdOrder) {
            if (deduplicatedOrder.length === 0 || deduplicatedOrder[deduplicatedOrder.length - 1] !== id) {
                deduplicatedOrder.push(id);
            }
        }
        targetContent.measureIdOrder = deduplicatedOrder;

        if (target.properties.name) {
            target.properties.name = "Merged Lyrics";
        }
    }
}

function processSong(inputFilename, outputFilename) {
    const inputPath = path.join(__dirname, inputFilename);
    const outputPath = path.join(__dirname, outputFilename);

    if (!fs.existsSync(inputPath)) {
        console.error(`Error: Could not find '${inputFilename}' in the current directory.`);
        return;
    }

    try {
        console.log(`Reading ${inputFilename}...`);
        const rawData = fs.readFileSync(inputPath, 'utf-8');
        const songData = JSON.parse(rawData);

        if (songData.thumbnailPage) mergeLyricsInPage(songData.thumbnailPage);
        if (songData.pages && Array.isArray(songData.pages)) {
            songData.pages.forEach(page => mergeLyricsInPage(page));
        }

        fs.writeFileSync(outputPath, JSON.stringify(songData, null, 2), 'utf-8');
        console.log(`\n✅ Successfully merged lyrics! Saved as: ${outputFilename}`);
    } catch (error) {
        console.error("❌ An error occurred while processing the song file:", error);
    }
}

processSong('song.json', 'song_merged.json');