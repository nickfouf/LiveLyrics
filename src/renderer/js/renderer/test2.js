import { DomManager } from "./domManager.js";
import { VirtualPage } from "./elements/page.js";
import { VirtualTitle } from "./elements/title.js";
import { VirtualContainer } from "./elements/container.js";
import { VirtualSmartEffect } from "./elements/smartEffect.js";
import { TimelineManager } from "./timeline/TimelineManager.js";
import { VirtualImage } from "./elements/image.js";

import { UnitEvent } from "./events/unitEvent.js";
import { ColorOrGradientEvent } from "./events/colorEvent.js";
import { StringEvent } from "./events/stringEvent.js";

// +++ ADD IMPORTS FOR NEW ELEMENTS +++
import { VirtualLyrics } from "./elements/lyrics.js";
import { VirtualOrchestra } from "./elements/orchestra.js";
import { VirtualVideo } from "./elements/video.js";
import {ObjectFitProperty} from "./properties/objectFit.js";
import {NumberEvent} from "./events/numberEvent.js";

const root = document.getElementById('page-container');
const timeline = new TimelineManager();
const domManager = new DomManager(root);
timeline.setDomManager(domManager);


// Create a page
const page = new VirtualPage();
page.getProperty('background').setBackground({
    mode: 'gradient',
    type: 'linear',
    angle: 135,
    colorStops: [
        { position: 0, color: { r: 20, g: 30, b: 40, a: 1 } },
        { position: 100, color: { r: 40, g: 60, b: 80, a: 1 } }
    ]
});
console.log(page)
const widthValue = page.getProperty('dimensions').getWidth();
widthValue.addEvent(new UnitEvent({ value: 1, unit: 'pw', measureIndex: 0, measureProgress: 0, ease: 'linear' }));
widthValue.addEvent(new UnitEvent({ value: 100, unit: 'pw', measureIndex: 1, measureProgress: 0, ease: 'linear' }));

const backgroundColor = page.getProperty('background').getBackground();
backgroundColor.addEvent(new ColorOrGradientEvent({ colorOrGradientObject: {
        mode: 'gradient',
        type: 'radial',
        angle: 120,
        opacity: 1,
        colorStops: [
            {
                color: { r: 74, g: 2, b: 89, a: 1 },
                position: 0,
            },
            {
                color: { r: 217, g: 39, b: 67, a: 1 },
                position: 20,
                midpoint: 20 // Influences the transition towards the next color
            },
            {
                color: { r: 252, g: 171, b: 53, a: 1 },
                position: 50,
                midpoint: 80 // Influences the transition towards the next color
            }
        ]
    }
    , measureIndex: 0, measureProgress: 0, ease: 'linear' }));
backgroundColor.addEvent(new ColorOrGradientEvent({ colorOrGradientObject: {
        mode: 'gradient',
        type: 'radial',
        angle: 45,
        opacity: 1,
        colorStops: [
            {
                color: { r: 9, g: 48, b: 64, a: 1 },
                position: 0,
            },
            {
                color: { r: 22, g: 122, b: 128, a: 0.8 },
                position: 50,
                midpoint: 35 // Influences the transition towards the next color
            },
            {
                color: { r: 153, g: 221, b: 204, a: 1 },
                position: 100,
                midpoint: 25 // Influences the transition towards the next color
            }
        ]
    }, measureIndex: 2, measureProgress: 0, ease: 'linear' }));
domManager.addPage(page);

// Add everything to the live DOM
domManager.addToDom(page);

// Create a vertical container to hold content
const contentContainer = new VirtualContainer({ name: 'Content Container', alignment: 'vertical' });
contentContainer.getProperty('dimensions').batchUpdate({
    width: { value: 80, unit: 'vw' },
    height: { value: 90, unit: 'vh' }
});
contentContainer.getProperty('inner_padding').batchUpdate({
    top: { value: 10, unit: 'px' },
    bottom: { value: 10, unit: 'px' },
    left: { value: 10, unit: 'px' },
    right: { value: 10, unit: 'px' }
});
contentContainer.getProperty('gravity').batchUpdate({ justify: 'space-around', align: 'center' });
contentContainer.getProperty('border').batchUpdate({
    enabled: true,
    width: { value: 5, unit: 'px' },
    radius: { value: 10, unit: 'px' },
    color: { r: 255, g: 255, b: 255, a: 0.1 }
});
page.addElement(contentContainer);

// +++ ADD VIDEO ELEMENT +++
const video = new VirtualVideo({ name: 'Test Video' });
video.getProperty('src').setSrc('http://localhost:3000/data/video.mp4');//, false, function (err){
    //if(err) {
    //    console.error("Error loading video:", err);
    //} else {
    //    console.log("Video loaded successfully.");
    //}
//}); // Example placeholder
video.getProperty('dimensions').batchUpdate({
    width: { value: 100, unit: 'pw' },
    height: { value: 50, unit: 'ph' }
});
// Set the mode to time_stretch to use the canvas renderer
// video.getProperty('mode').setMode('noe', true);
console.log(video.getProperty('objectFit').setObjectFit)
video.getProperty("objectFit").setObjectFit("contain", true);
// video.getProperty("playback").setSpeed(0.5, true);

// Add an event to start playing the video at measure 1, beat 0
const videoState = video.getProperty('playback').getState();
videoState.addEvent(new StringEvent({
    value: 'playing',
    measureIndex: 1,
    measureProgress: 0,
    ease: 'instant'
}));

// contentContainer.addElement(video);


/*
// Create a title text element
const title = new VirtualTitle({ text: 'Welcome to the New Renderer!', name: 'Title', style: {
        textAlign: 'right',
    } });
title.getProperty('textStyle').batchUpdate({
    fontSize: { value: 48, unit: 'px' },
    textColor: { r: 255, g: 255, b: 255, a: 1 },
    // textAlign: 'center'
});
contentContainer.addElement(title);

// +++ ADD LYRICS ELEMENT +++
const lyrics = new VirtualLyrics({ name: 'Song Lyrics' });
lyrics.getProperty('lyricsContent').setLyricsObject({
    "measures": [
        {
            "timeSignature": {
                "numerator": 4,
                "denominator": 4
            },
            "content": [
                {
                    "id": "note-unique-1",
                    "type": "e_note",
                    "text": "∅",
                    "isConnectedToNext": false
                },
                {
                    "id": "note-unique-2",
                    "type": "e_note",
                    "text": "Απ'",
                    "isConnectedToNext": false
                },
                {
                    "id": "note-unique-3",
                    "type": "e_note",
                    "text": "τα",
                    "isConnectedToNext": false
                },
                {
                    "id": "note-unique-4",
                    "type": "e_note",
                    "text": "ου",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-5",
                    "type": "q_note",
                    "text": "ρά",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-6",
                    "type": "e_note",
                    "text": "νια",
                    "isConnectedToNext": false
                },
                {
                    "id": "note-unique-7",
                    "type": "e_note",
                    "text": "∅",
                    "isConnectedToNext": false
                }
            ]
        },
        {
            "timeSignature": {
                "numerator": 4,
                "denominator": 4
            },
            "content": [
                {
                    "id": "note-unique-8",
                    "type": "e_note",
                    "text": "∅",
                    "isConnectedToNext": false
                },
                {
                    "id": "note-unique-9",
                    "type": "e_note",
                    "text": "σε",
                    "isConnectedToNext": false
                },
                {
                    "id": "note-unique-10",
                    "type": "e_note",
                    "text": "έ",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-11",
                    "type": "e_note",
                    "text": "χουν",
                    "isConnectedToNext": false
                },
                {
                    "id": "note-unique-12",
                    "type": "e_note",
                    "text": "ευ",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-13",
                    "type": "e_note",
                    "text": "λο",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-14",
                    "type": "e_note",
                    "text": "γή",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-15",
                    "type": "e_note",
                    "text": "σει,",
                    "isConnectedToNext": false
                }
            ]
        },
        {
            "timeSignature": {
                "numerator": 4,
                "denominator": 4
            },
            "content": [
                {
                    "id": "note-unique-16",
                    "type": "e_note",
                    "text": "∅",
                    "isConnectedToNext": false
                },
                {
                    "id": "note-unique-17",
                    "type": "e_note",
                    "text": "κά",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-18",
                    "type": "e_note",
                    "text": "θε",
                    "isConnectedToNext": false
                },
                {
                    "id": "note-unique-19",
                    "type": "e_note",
                    "text": "σου",
                    "isConnectedToNext": false
                },
                {
                    "id": "note-unique-20",
                    "type": "q_note",
                    "text": "τά",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-21",
                    "type": "e_note",
                    "text": "μα",
                    "isConnectedToNext": false
                },
                {
                    "id": "note-unique-22",
                    "type": "e_note",
                    "text": "∅",
                    "isConnectedToNext": false
                }
            ]
        },
        {
            "timeSignature": {
                "numerator": 4,
                "denominator": 4
            },
            "content": [
                {
                    "id": "note-unique-23",
                    "type": "e_note",
                    "text": "∅",
                    "isConnectedToNext": false
                },
                {
                    "id": "note-unique-24",
                    "type": "e_note",
                    "text": "και",
                    "isConnectedToNext": false
                },
                {
                    "id": "note-unique-25",
                    "type": "e_note",
                    "text": "έ",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-26",
                    "type": "e_note",
                    "text": "να",
                    "isConnectedToNext": false
                },
                {
                    "id": "note-unique-27",
                    "type": "e_note",
                    "text": "πά",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-28",
                    "type": "e_note",
                    "text": "ρεκ",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-29",
                    "type": "e_note",
                    "text": "κλή",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-30",
                    "type": "e_note",
                    "text": "σι,",
                    "isConnectedToNext": false
                }
            ]
        },
        {
            "timeSignature": {
                "numerator": 4,
                "denominator": 4
            },
            "content": [
                {
                    "id": "note-unique-31",
                    "type": "q_note_dotted",
                    "text": "Ελ",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-32",
                    "type": "q_note_dotted",
                    "text": "λά",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-33",
                    "type": "q_note",
                    "text": "δα",
                    "isConnectedToNext": false
                }
            ]
        },
        {
            "timeSignature": {
                "numerator": 4,
                "denominator": 4
            },
            "content": [
                {
                    "id": "note-unique-34",
                    "type": "q_note_dotted",
                    "text": "μου,",
                    "isConnectedToNext": false
                },
                {
                    "id": "note-unique-35",
                    "type": "e_note",
                    "text": "πα",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-36",
                    "type": "e_note",
                    "text": "τρί",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-37",
                    "type": "e_note",
                    "text": "δα,",
                    "isConnectedToNext": false
                },
                {
                    "id": "note-unique-38",
                    "type": "e_note",
                    "text": "σ'α",
                    "isConnectedToNext": true
                },
                {
                    "id": "note-unique-39",
                    "type": "e_note",
                    "text": "γα",
                    "isConnectedToNext": true
                }
            ]
        },
        {
            "timeSignature": {
                "numerator": 4,
                "denominator": 4
            },
            "content": [
                {
                    "id": "note-unique-40",
                    "type": "q_note_dotted",
                    "text": "πώ.",
                    "isConnectedToNext": false
                }
            ]
        }
    ],
    "selectedNoteId": "note-unique-31"
});
const lyricsTextStyle = lyrics.getProperty('textStyle');
lyricsTextStyle.batchUpdate({
    fontFamily: 'Arial',
    fontWeight: 'normal',
    // fontStyle: 'italic',
    fontSize: { value: 36, unit: 'px' },
    wordSpacing: { value: 8, unit: 'px' },
    lineHeight: { value: 33.2, unit: 'px' },
    letterSpacing: { value: 0, unit: '%' },
    textColor: { r: 255, g: 255, b: 255, a: 1 },
    karaokeColor: { r: 0, g: 255, b: 0, a: 1 },
    // strokeColor: { r: 0, g: 0, b: 0, a: 1 },
    // strokeEnabled: true,
    // strokeWidth: { value: 2, unit: 'px' },
    justifyText: true,
    textAlign: 'center'
});
contentContainer.addElement(lyrics);

// Create an image element
// const image = new VirtualImage({ name: 'My Image' });
// image.getProperty('src').setSrc('https://upload.wikimedia.org/wikipedia/commons/1/11/Test-Logo.svg'); // Example placeholder
// image.getProperty('dimensions').batchUpdate({
//     width: { value: 400, unit: 'px' },
//     height: { value: 200, unit: 'px' }
// });
// image.getProperty('boxShadow').batchUpdate({
//     enabled: true,
//     color: { r: 0, g: 0, b: 0, a: 0.5 },
//     blur: { value: 15, unit: 'px' },
//     offsetY: { value: 5, unit: 'px' }
// });
//
// contentContainer.addElement(image);

const smartEffect = new VirtualSmartEffect({
    name: 'Smart Effect',
    src: './effects/ocean_waves.json' // Example placeholder
});
smartEffect.getProperty('dimensions').batchUpdate({
    width: { value: 60, unit: 'ph' },
    height: { value: 20, unit: 'ph' }
});

contentContainer.addElement(smartEffect);

// +++ ADD ORCHESTRA ELEMENT +++
const orchestra = new VirtualOrchestra({ name: 'Main Track' });
orchestra.getProperty('dimensions').setHeight({ value: 20, unit: 'px' });
orchestra.getProperty('border').batchUpdate({ enabled: true, radius: { value: 10, unit: 'px' }});
orchestra.getProperty('progress').setBackgroundColor({ mode: 'color', r: 220, g: 100, b: 100, a: 1 });
contentContainer.addElement(orchestra);


// Example of a dynamic change
setTimeout(() => {
    // title.getProperty('textContent').setTextContent('Dynamic Update Successful!');
    contentContainer.getProperty('effects').setOpacity(0.9);

    // Animate the orchestra progress
}, 2000);

*/
// Initial resize and render
domManager.resize();
// Handle window resizing
window.addEventListener('resize', () => {
    domManager.resize();
});

const bpm = 120; // beats per minute
const beatDuration = 60 / bpm; // seconds per beat

const measures = [
    { timeSignature: { numerator: 4, denominator: 4 }, tempo: bpm },
    { timeSignature: { numerator: 4, denominator: 4 }, tempo: bpm },
    { timeSignature: { numerator: 3, denominator: 4 }, tempo: bpm },
    { timeSignature: { numerator: 4, denominator: 4 }, tempo: bpm },
    { timeSignature: { numerator: 4, denominator: 4 }, tempo: bpm },
    { timeSignature: { numerator: 4, denominator: 4 }, tempo: bpm },
    { timeSignature: { numerator: 4, denominator: 4 }, tempo: bpm },
    { timeSignature: { numerator: 4, denominator: 4 }, tempo: bpm },
    { timeSignature: { numerator: 4, denominator: 4 }, tempo: bpm },
    { timeSignature: { numerator: 4, denominator: 4 }, tempo: bpm },
];

// --- SETUP TIMELINE ---
const measureMap = [];
let cumulativeBeats = 0;
for (let i = 0; i < measures.length; i++) {
    const measure = measures[i];
    const duration = measure.timeSignature.numerator; // beats per measure
    measureMap.push({
        index: i,
        startTime: cumulativeBeats,
        duration: duration,
        tempo: measure.tempo
    });
    cumulativeBeats += duration;
}
timeline.setMeasureMap(measureMap);

// --- RENDER LOOP ---
timeline.renderAt(0, 0);

let startTime = performance.now();
function renderLoop() {
    const elapsedSec = (performance.now() - startTime) / 1000;

    // Convert time → beats based on bpm
    const totalBeats = elapsedSec / beatDuration;

    // Find current measure
    let currentMeasure = 0;
    for (let i = 0; i < measureMap.length; i++) {
        const m = measureMap[i];
        const nextStart = i < measureMap.length - 1 ? measureMap[i + 1].startTime : Infinity;
        if (totalBeats >= m.startTime && totalBeats < nextStart) {
            currentMeasure = i;
            break;
        }
    }

    const measure = measureMap[currentMeasure];
    const beatInMeasure = totalBeats - measure.startTime;
    const progress = Math.min(beatInMeasure / measure.duration, 1);

    timeline.renderAt(currentMeasure, progress);
    domManager.resize(true);

    // Loop the piece if desired:
    if (totalBeats >= cumulativeBeats) {
        startTime = performance.now(); // restart
    }

    // setTimeout(renderLoop, 1000);
    requestAnimationFrame(renderLoop);
}

requestAnimationFrame(renderLoop);
