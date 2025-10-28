import { state, updateState } from '../editor/state.js';
import { setActivePage_Player } from './pageManager.js';
import { rebuildAllEventTimelines, reprogramAllPageTransitions } from './events.js';
import { deserializeElement, findVirtualElementById, buildMeasureMap, buildLyricsTimingMap } from '../editor/utils.js';
import { showAlertDialog } from '../editor/alertDialog.js';
import { showLoadingDialog, hideLoadingDialog } from '../editor/loadingDialog.js';
import { VirtualPage } from '../renderer/elements/page.js';
import { VirtualContainer } from '../renderer/elements/container.js';
import { VirtualTitle } from '../renderer/elements/title.js';
import { VirtualText } from '../renderer/elements/text.js';
import { DOM } from './dom.js';

let songPlaylist = []; // Array to hold { id, title, filePath, songData };
let playlistElement;

/**
 * Checks if a raw page data object contains any musical measures.
 * @param {object} pageData The raw page data from the project file.
 * @returns {boolean} True if the page has measures, false otherwise.
 */
function pageDataHasMeasures(pageData) {
    if (!pageData) return false;

    function findMusicElements(element) {
        let elements = [];
        if (element.type === 'lyrics' || element.type === 'orchestra' || element.type === 'audio') {
            elements.push(element);
        }
        if (element.children && element.children.length > 0) {
            for (const child of element.children) {
                elements = elements.concat(findMusicElements(child));
            }
        }
        return elements;
    }

    const musicElements = findMusicElements(pageData);
    for (const el of musicElements) {
        if (el.type === 'lyrics' && el.properties?.lyricsContent?.measures?.length > 0) {
            return true;
        }
        if ((el.type === 'orchestra' || el.type === 'audio') && el.properties?.orchestraContent?.measures?.length > 0) {
            if (el.properties.orchestraContent.measures.some(m => (m.count || 0) > 0)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Checks if a raw song data object contains any pages with musical measures.
 * @param {object} songData The raw song data from the project file.
 * @returns {boolean} True if the song has at least one measure, false otherwise.
 */
function songDataHasMeasures(songData) {
    if (!songData || !songData.pages || songData.pages.length === 0) {
        return false;
    }
    return songData.pages.some(page => pageDataHasMeasures(page));
}

function showDefaultPlayerView() {
    // Clear existing content from managers before loading new content.
    if (state.domManager) state.domManager.clear();

    const defaultPage = new VirtualPage({ name: 'Default' });
    const container = new VirtualContainer({ alignment: 'vertical' });
    const title = new VirtualTitle({ textContent: "No song loaded yet" });
    const text = new VirtualText({ textContent: "Use the songs manager panel and click at the add song button." });

    // Some styling for the default view
    container.getProperty('gravity').setJustifyContent('center', true);
    container.getProperty('gravity').setAlignItems('center', true);
    container.getProperty('gap').setGap({ value: 20, unit: 'px' }, true);
    title.getProperty('textStyle').setFontSize({ value: 32, unit: 'px' }, true);
    title.getProperty('textStyle').setTextAlign('center', true);
    text.getProperty('textStyle').setFontSize({ value: 18, unit: 'px' }, true);
    text.getProperty('textStyle').setTextColor({ r: 200, g: 200, b: 200, a: 1, mode: 'color' }, true);
    text.getProperty('textStyle').setTextAlign('center', true);


    container.addElement(title);
    container.addElement(text);
    defaultPage.addElement(container);

    updateState({
        song: {
            title: "Player",
            thumbnailPage: defaultPage,
            pages: [],
            currentFilePath: null,
            isDirty: false,
        },
        activePage: null,
        selectedElement: null,
        playback: {
            ...state.playback,
            isPlaying: false,
            timeAtPause: 0,
            songHasEnded: false,
        }
    });

    rebuildAllEventTimelines(); // Important to clear old timeline data
    setActivePage_Player(defaultPage);
    
    // FIXED: Tell the main process to go to time 0, which will trigger a render.
    window.playerAPI.jumpToTime(0);

    if (DOM.pageThumbnailsContainer) {
        DOM.pageThumbnailsContainer.innerHTML = '';
    }

    document.getElementById('window-title').innerText = "Player";
    document.getElementById('play-pause-btn').disabled = true;
    document.getElementById('backward-btn').disabled = true;
    document.getElementById('forward-btn').disabled = true;

    // Disable BPM controls
    const bpmValueInput = document.getElementById('bpm-value-input');
    const bpmNoteSelect = document.getElementById('bpm-note-select-custom');
    if (bpmValueInput && bpmNoteSelect) {
        bpmValueInput.disabled = true;
        bpmValueInput.value = 120;

        const selectedDiv = bpmNoteSelect.querySelector('.select-selected');
        selectedDiv.setAttribute('tabindex', '-1'); // Disable it
        const optionDiv = bpmNoteSelect.querySelector(`.select-items div[data-value="q_note"]`);
        if (optionDiv) {
            selectedDiv.dataset.value = 'q_note';
            selectedDiv.innerHTML = optionDiv.innerHTML;
        }
    }
}

async function loadSong(songId) {
    const song = songPlaylist.find(s => s.id === songId);
    if (!song) {
        console.error(`Song with id ${songId} not found in playlist.`);
        return;
    }
    // The main process will now handle loading and broadcasting.
    window.playerAPI.loadSong({ id: song.id, data: song.songData, filePath: song.filePath, title: song.title });
}

function clearRenderer() {
    window.playerAPI.unloadSong();
}

export async function handleSongLoaded(song) {
    showLoadingDialog('Loading song...');
    try {
        if (DOM.pageManager) {
            DOM.pageManager.style.display = 'flex';
        }
        // Clear existing content from managers before loading new content.
        if (state.domManager) state.domManager.clear();

        const songData = song.data;

        const thumbnailPage = deserializeElement(songData.thumbnailPage);
        const pages = songData.pages.map(p => deserializeElement(p));

        pages.forEach((page, index) => {
            const pageData = songData.pages[index];
            if (pageData.musicElementsOrder) {
                const orderedElements = pageData.musicElementsOrder
                    .map(id => findVirtualElementById(page, id))
                    .filter(Boolean);
                page.setMusicElementsOrder(orderedElements);
            }
        });

        updateState({
            song: {
                title: songData.title,
                thumbnailPage: thumbnailPage,
                pages: pages,
                currentFilePath: song.filePath,
                isDirty: false,
                bpm: songData.bpm || 120,
                bpmUnit: songData.bpmUnit || 'q_note',
            },
            activePage: null,
            selectedElement: null,
            playback: {
                ...state.playback,
                isPlaying: false,
                timeAtPause: 0,
                songHasEnded: false,
            },
            activeSongId: song.id,
        });

        rebuildAllEventTimelines();
        reprogramAllPageTransitions();

        const measureMap = buildMeasureMap();
        const lyricsTimingMap = buildLyricsTimingMap(measureMap);
        state.timelineManager.setMeasureMap(measureMap);
        state.timelineManager.setLyricsTimingMap(lyricsTimingMap);

        setActivePage_Player(thumbnailPage);
        
        // FIXED: Tell the main process to go to time 0, which will trigger the initial render.
        window.playerAPI.jumpToTime(0);

        document.getElementById('window-title').innerText = `Player - ${song.title}`;
        renderPlaylist();

        // Enable and update BPM controls
        const bpmValueInput = document.getElementById('bpm-value-input');
        const bpmNoteSelect = document.getElementById('bpm-note-select-custom');
        if (bpmValueInput && bpmNoteSelect) {
            bpmValueInput.disabled = !songDataHasMeasures(songData);
            bpmValueInput.value = songData.bpm || 120;

            const selectedDiv = bpmNoteSelect.querySelector('.select-selected');
            selectedDiv.setAttribute('tabindex', songDataHasMeasures(songData) ? '0' : '-1');
            const optionDiv = bpmNoteSelect.querySelector(`.select-items div[data-value="${songData.bpmUnit || 'q_note'}"]`);
            if (optionDiv) {
                selectedDiv.dataset.value = songData.bpmUnit || 'q_note';
                selectedDiv.innerHTML = optionDiv.innerHTML;
            }
        }

        // Enable playback controls
        const hasMeasures = songDataHasMeasures(songData);
        document.getElementById('play-pause-btn').disabled = !hasMeasures;
        document.getElementById('backward-btn').disabled = !hasMeasures;
        document.getElementById('forward-btn').disabled = !hasMeasures;

    } catch (error) {
        console.error('Failed to load song into renderer:', error);
        await showAlertDialog('Failed to Load Song', error.message);
    } finally {
        hideLoadingDialog();
    }
}

export function handleSongUnloaded() {
    updateState({ activeSongId: null });
    renderPlaylist();
    showDefaultPlayerView();
}

function renderPlaylist() {
    if (!playlistElement) return;
    playlistElement.innerHTML = '';

    songPlaylist.forEach(song => {
        const li = document.createElement('li');
        li.className = 'song-item';
        if (song.id === state.activeSongId) {
            li.classList.add('active');
        }
        li.draggable = true;
        li.dataset.songId = song.id;
        li.innerHTML = `
            <div class="song-details">
                <span class="song-title-primary" title="${song.title}">${song.title}</span>
                <span class="song-path-secondary" title="${song.filePath}">${song.filePath}</span>
            </div>
            <button class="delete-song-btn">&times;</button>
        `;
        playlistElement.appendChild(li);
    });
}

async function handleAddSong() {
    const filePath = await window.playerAPI.openSong();
    if (!filePath) return;

    // Check if the song already exists in the playlist
    const existingSong = songPlaylist.find(song => song.filePath === filePath);
    if (existingSong) {
        // If it exists, find its DOM element and highlight it
        const songItemElement = playlistElement.querySelector(`[data-song-id="${existingSong.id}"]`);
        if (songItemElement) {
            songItemElement.classList.add('highlight-duplicate');
            // Remove the highlight after 1 second
            setTimeout(() => {
                songItemElement.classList.remove('highlight-duplicate');
            }, 1000);
        }
        return; // Prevent adding the duplicate
    }

    showLoadingDialog("Opening project...");
    try {
        const songData = await window.playerAPI.openProject(filePath);

        // MODIFIED: Validate that the song has measures before adding it.
        if (!songDataHasMeasures(songData)) {
            await showAlertDialog('Loading song failed', 'The selected song project does not contain any measures and cannot be played.');
            return;
        }

        const songId = `song-${Date.now()}`;
        const fileNameWithExt = filePath.split(/[\\/]/).pop();
        const title = fileNameWithExt.replace(/\.lyx$/, '');

        const newSong = { id: songId, title, filePath, songData };
        songPlaylist.push(newSong);

        // Always load the newly added song into the renderer
        await loadSong(songId);

    } catch (error) {
        console.error('Failed to open project:', error);
        await showAlertDialog('Failed to Open Project', error.message);
    } finally {
        hideLoadingDialog();
    }
}


export function initSongsManager() {
    playlistElement = document.getElementById('song-playlist');
    const addSongBtn = document.getElementById('add-song-btn');

    addSongBtn.addEventListener('click', handleAddSong);

    playlistElement.addEventListener('click', e => {
        const songItem = e.target.closest('.song-item');
        if (!songItem) return;

        const songId = songItem.dataset.songId;

        if (e.target.closest('.delete-song-btn')) {
            const index = songPlaylist.findIndex(s => s.id === songId);
            if (index > -1) {
                const wasActive = state.activeSongId === songId;
                songPlaylist.splice(index, 1);
                renderPlaylist(); // Re-render the list immediately

                if (wasActive) {
                    if(songPlaylist.length > 0) {
                        const newActiveIndex = Math.max(0, index - 1);
                        loadSong(songPlaylist[newActiveIndex].id);
                    } else {
                        clearRenderer();
                    }
                }
            }
        } else {
            if (songId !== state.activeSongId) {
                loadSong(songId);
            }
        }
    });

    let draggedId = null;
    playlistElement.addEventListener('dragstart', e => {
        const item = e.target.closest('.song-item');
        if(item) {
            draggedId = item.dataset.songId;
            setTimeout(() => item.classList.add('dragging'), 0);
        }
    });

    playlistElement.addEventListener('dragend', e => {
        const item = e.target.closest('.song-item');
        if(item) item.classList.remove('dragging');
        draggedId = null;
        document.querySelectorAll('.song-item.drag-over-before, .song-item.drag-over-after').forEach(el => {
            el.classList.remove('drag-over-before', 'drag-over-after');
        });
    });

    playlistElement.addEventListener('dragover', e => {
        e.preventDefault();
        const targetItem = e.target.closest('.song-item');
        if (!targetItem || targetItem.dataset.songId === draggedId) return;
        const rect = targetItem.getBoundingClientRect();
        const y = e.clientY - rect.top;
        document.querySelectorAll('.song-item.drag-over-before, .song-item.drag-over-after').forEach(el => {
            el.classList.remove('drag-over-before', 'drag-over-after');
        });
        targetItem.classList.toggle('drag-over-before', y < rect.height / 2);
        targetItem.classList.toggle('drag-over-after', y >= rect.height / 2);
    });

    playlistElement.addEventListener('drop', e => {
        e.preventDefault();
        const targetItem = e.target.closest('.song-item');
        if (!targetItem || !draggedId) return;

        const draggedIndex = songPlaylist.findIndex(s => s.id === draggedId);
        let targetIndex = songPlaylist.findIndex(s => s.id === targetItem.dataset.songId);

        const [draggedSong] = songPlaylist.splice(draggedIndex, 1);

        const rect = targetItem.getBoundingClientRect();
        const y = e.clientY - rect.top;
        if (y >= rect.height / 2) {
            targetIndex++;
        }

        if (draggedIndex < targetIndex) {
            targetIndex--;
        }

        songPlaylist.splice(targetIndex, 0, draggedSong);
        renderPlaylist();
    });
}