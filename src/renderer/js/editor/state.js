export const state = {
    // --- Core Renderer Managers ---
    domManager: null,
    stagingDomManager: null, // Manager for zero-measure pages
    timelineManager: null,
    highlightManager: null,
    systemFonts: [],
    highlightTimeout: null,

    // --- Song Data Structure (Virtual DOM) ---
    song: {
        title: "Untitled Song",
        thumbnailPage: null,
        pages: [], // This will hold VirtualPage objects
        currentFilePath: null,
        isDirty: false,
        bpm: 120,
        bpmUnit: 'q_note',
        fonts: {}, // ADDED: Map of { "Font Family": "assets/filename.ttf" }
    },

    // --- UI State ---
    activePage: null, // Direct reference to the active VirtualPage object
    activeSongId: null, // ID of the song currently loaded in the player
    selectedElement: null, // Direct reference to the selected VirtualElement object
    ui: {
        lastSelectedElementIdByPageId: {},
        propertiesPanelState: {
            scrollPositionByElementId: {},
            collapsedGroupsByElementId: {},
        },
    },

    // --- Playback State ---
    playback: {
        isPlaying: false,
        animationFrameId: null,
        animationStartTime: 0, // performance.now() when play starts
        timeAtPause: 0, // elapsed time when paused
        songHasEnded: false,
    },

    // --- Interactivity State ---
    currentDragOperation: null, // e.g., { type: 'create', elementType: 'vcontainer' }
    draggedPageIndex: null, // Index of the page being dragged in the manager

    // --- Dialog Callbacks ---
    colorPickerCallback: null,
    opaqueColorPickerCallback: null,
    gradientEditorCallback: null,
    lyricsEditorCallback: null,
    orchestraEditorCallback: null,
    eventsEditorCallback: null,
};

/**
 * Updates the global state by merging the new partial state.
 * IMPORTANT: When updating nested objects (like 'song' or 'playback'),
 * the calling function should spread the existing state to avoid overwriting it.
 * e.g., updateState({ song: { ...state.song, title: 'New Title' } });
 * @param {object} newPartialState - An object containing the properties to update.
 */
export function updateState(newPartialState) {
    Object.assign(state, newPartialState);
}



