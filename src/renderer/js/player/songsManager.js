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
import { applyViewportScaling } from '../editor/rendering.js';
import { updatePlayerControlsUI } from './playback.js';
import { fontLoader } from '../renderer/fontLoader.js'; // Ensure imported

export let songPlaylist = []; // Array to hold { id, title, filePath, songData };
let playlistElement;

/**
 * Sends the current playlist state to the main process for synchronization.
 */
function syncPlaylistWithMain() {
    if (window.playerAPI) {
        window.playerAPI.sendPlaylistUpdate({
            songs: songPlaylist,
            activeSongId: state.activeSongId
        });
    }
}

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

function songDataHasMeasures(songData) {
    if (!songData || !songData.pages || songData.pages.length === 0) {
        return false;
    }
    return songData.pages.some(page => pageDataHasMeasures(page));
}

function showDefaultPlayerView() {
    if (state.domManager) state.domManager.clear();

    // Create the virtual elements for the default view
    const defaultPage = new VirtualPage({ name: 'Default' });
    const container = new VirtualContainer({ alignment: 'vertical' });
    const title = new VirtualTitle({ textContent: "No song loaded yet" });
    const text = new VirtualText({ textContent: "Use the songs manager panel and click at the add song button." });
    
    // Style the elements
    container.getProperty('gravity').setJustifyContent('center', true);
    container.getProperty('gravity').setAlignItems('center', true);
    container.getProperty('gap').setGap({ value: 20, unit: 'px' }, true);
    title.getProperty('textStyle').setFontSize({ value: 64, unit: 'px' }, true);
    title.getProperty('textStyle').setTextAlign('center', true);
    text.getProperty('textStyle').setFontSize({ value: 30, unit: 'px' }, true);
    text.getProperty('textStyle').setTextColor({ r: 200, g: 200, b: 200, a: 1, mode: 'color' }, true);
    text.getProperty('textStyle').setTextAlign('center', true);
    
    // Assemble the virtual elements
    container.addElement(title);
    container.addElement(text);
    defaultPage.addElement(container);

    // Directly add the constructed page to the visible DOM.
    state.domManager.addToDom(defaultPage);
    
    // Update the global state to reflect that no song is loaded.
    const unloadedState = {
        status: 'unloaded',
        type: 'normal',
        song: null,
    };
    updateState({
        song: null,
        activePage: defaultPage,
        selectedElement: null,
        playback: { ...state.playback, isPlaying: false, timeAtPause: 0, songHasEnded: false, }
    });

    // Clear the page manager thumbnails and update the rest of the UI
    if (DOM.pageThumbnailsContainer) {
        DOM.pageThumbnailsContainer.innerHTML = '';
    }
    document.getElementById('window-title').innerText = "Player";
    
    // --- REVISED: Use the centralized UI update function ---
    updatePlayerControlsUI(unloadedState);

    // Manually trigger a viewport scale calculation AND render the initial state.
    setTimeout(() => {
        if (DOM.slideViewportWrapper) {
            applyViewportScaling(DOM.slideViewportWrapper);
        }
        if (state.timelineManager) {
            state.timelineManager.resize(true);
            state.timelineManager.renderAt(0, 0);
        }
    }, 0);
}

async function loadSong(songId) {
    const song = songPlaylist.find(s => s.id === songId);
    if (!song) {
        console.error(`Song with id ${songId} not found in playlist.`);
        return;
    }

    // MODIFIED: This function now sends both metadata and the measure map to the main process.
    // First, we need to temporarily load the song data into the state to build the map.
    const tempThumbnailPage = deserializeElement(song.songData.thumbnailPage);
    const tempPages = song.songData.pages.map(p => deserializeElement(p));
    updateState({
        song: {
            ...song.songData,
            thumbnailPage: tempThumbnailPage,
            pages: tempPages,
        }
    });
    const measureMap = buildMeasureMap();
    const songData = song.songData; // The full song data

    // Now, create the lean metadata object for the main process.
    const songMetadata = {
        id: song.id,
        title: song.title,
        filePath: song.filePath,
        bpm: song.songData.bpm,
        bpmUnit: song.songData.bpmUnit,
        fonts: song.songData.fonts || {}, // ADDED: Pass fonts to main process
    };

    // Send the command to the main process.
    window.playerAPI.loadSong({ songMetadata, measureMap, songData });
}

/**
 * Activates a song in the renderer using its metadata and content.
 * @param {object} songMetadata The authoritative metadata from the main process state.
 * @param {object} songData The full song content from the local cache.
 */
export async function handleSongActivated(songMetadata, songData) {
    showLoadingDialog('Loading song...');
    try {
        if (DOM.pageManager) {
            DOM.pageManager.style.display = 'flex';
        }
        if (state.domManager) state.domManager.clear();

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
                id: songMetadata.id,
                title: songMetadata.title,
                filePath: songMetadata.filePath,
                thumbnailPage: thumbnailPage,
                pages: pages,
                bpm: songMetadata.bpm, // Use authoritative BPM from main process
                bpmUnit: songMetadata.bpmUnit,
                fonts: songData.fonts || {}, // ADDED: Ensure fonts are in local state
            },
            activePage: null,
            selectedElement: null,
            activeSongId: songMetadata.id,
        });

        // ADDED: Load fonts immediately for the Player renderer
        if (state.song.fonts) {
            fontLoader.loadFonts(state.song.fonts);
        }

        rebuildAllEventTimelines();
        reprogramAllPageTransitions();

        const measureMap = buildMeasureMap();
        const lyricsTimingMap = buildLyricsTimingMap(measureMap);
        state.timelineManager.setMeasureMap(measureMap);
        state.timelineManager.setLyricsTimingMap(lyricsTimingMap);

        setActivePage_Player(thumbnailPage);

        document.getElementById('window-title').innerText = `Player - ${songMetadata.title}`;
        renderPlaylist();
        syncPlaylistWithMain(); // Sync with main process after activation

    } catch (error) {
        hideLoadingDialog(); // --- FIX: Hide dialog BEFORE showing the alert
        console.error('Failed to activate song in renderer:', error);
        await showAlertDialog('Failed to Load Song', error.message);
    } finally {
        hideLoadingDialog();
    }
}

export function handleSongUnloaded() {
    updateState({ activeSongId: null });
    renderPlaylist();
    showDefaultPlayerView();
    syncPlaylistWithMain(); // Sync with main process after unload
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
    const existingSong = songPlaylist.find(song => song.filePath === filePath);
    if (existingSong) {
        const songItemElement = playlistElement.querySelector(`[data-song-id="${existingSong.id}"]`);
        if (songItemElement) {
            songItemElement.classList.add('highlight-duplicate');
            setTimeout(() => {
                songItemElement.classList.remove('highlight-duplicate');
            }, 1000);
        }
        return;
    }
    showLoadingDialog("Opening project...");
    try {
        const result = await window.playerAPI.openProject(filePath);
        if (!result.success) {
            throw new Error(result.error);
        }
        const songData = result.data;
        if (!songDataHasMeasures(songData)) {
            await showAlertDialog('Loading song failed', 'The selected song project does not contain any measures and cannot be played.');
            hideLoadingDialog();
            return;
        }
        const songId = `song-${Date.now()}`;
        const fileNameWithExt = filePath.split(/[\\/]/).pop();
        const title = fileNameWithExt.replace(/\.lyx$/, '');
        const newSong = { id: songId, title, filePath, songData };
        songPlaylist.push(newSong);
        await loadSong(songId);
    } catch (error) {
        hideLoadingDialog();
        console.error('Failed to open project:', error);
        await showAlertDialog('Failed to Open Project', error.message);
    }
}

export async function addSongFromPath(filePath) {
    if (!filePath) return;
    const existingSong = songPlaylist.find(song => song.filePath === filePath);
    if (existingSong) {
        const songItemElement = playlistElement.querySelector(`[data-song-id="${existingSong.id}"]`);
        if (songItemElement) {
            songItemElement.classList.add('highlight-duplicate');
            setTimeout(() => songItemElement.classList.remove('highlight-duplicate'), 1000);
        }
        if (state.activeSongId !== existingSong.id) {
            await loadSong(existingSong.id);
        }
        return;
    }
    showLoadingDialog("Opening project...");
    try {
        const result = await window.playerAPI.openProject(filePath);
        if (!result.success) throw new Error(result.error);
        const songData = result.data;
        if (!songDataHasMeasures(songData)) {
            throw new Error('The selected song project does not contain any measures and cannot be played.');
        }
        const songId = `song-${Date.now()}`;
        const title = filePath.split(/[\\/]/).pop().replace(/\.lyx$/, '');
        const newSong = { id: songId, title, filePath, songData };
        songPlaylist.push(newSong);
        await loadSong(songId);
    } catch (error) {
        hideLoadingDialog(); // --- FIX: Hide dialog BEFORE showing the alert
        console.error('Failed to open project from path:', error);
        await showAlertDialog('Failed to Open Project', error.message);
    } finally {
        hideLoadingDialog();
    }
}

export function initSongsManager() {
    playlistElement = document.getElementById('song-playlist');
    const addSongBtn = document.getElementById('add-song-btn');
    addSongBtn.addEventListener('click', handleAddSong);

    // Listen for sync requests from the main process
    window.playerAPI.onPlaylistRequestSync(() => {
        console.log('[Player] Main process requested playlist sync.');
        syncPlaylistWithMain();
    });

    // Listen for song selection requests from the main process (sent by Android)
    window.playerAPI.onSongSelectRequest((songId) => {
        console.log(`[Player] Received request to select song: ${songId}`);
        loadSong(songId);
    });

    playlistElement.addEventListener('click', e => {
        const songItem = e.target.closest('.song-item');
        if (!songItem) return;
        const songId = songItem.dataset.songId;
        if (e.target.closest('.delete-song-btn')) {
            const index = songPlaylist.findIndex(s => s.id === songId);
            if (index > -1) {
                const wasActive = state.activeSongId === songId;
                songPlaylist.splice(index, 1);
                renderPlaylist();
                syncPlaylistWithMain(); // Sync after deletion
                if (songPlaylist.length === 0) {
                    window.playerAPI.unloadSong();
                } else if (wasActive) {
                    const newActiveIndex = Math.max(0, index - 1);
                    loadSong(songPlaylist[newActiveIndex].id);
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
        syncPlaylistWithMain(); // Sync after reordering
    });
}