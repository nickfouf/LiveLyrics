import { state, updateState } from '../editor/state.js';
import { setActivePage_Player } from './pageManager.js';
import { rebuildAllEventTimelines, reprogramAllPageTransitions } from './events.js';
import { deserializeElement, findVirtualElementById, buildMeasureMap, buildLyricsTimingMap } from '../editor/utils.js';
import { showAlertDialog, hideAlertDialog } from '../editor/alertDialog.js'; 
import { showLoadingDialog, hideLoadingDialog } from '../editor/loadingDialog.js';
import { VirtualPage } from '../renderer/elements/page.js';
import { VirtualContainer } from '../renderer/elements/container.js';
import { VirtualTitle } from '../renderer/elements/title.js';
import { VirtualText } from '../renderer/elements/text.js';
import { DOM } from './dom.js';
import { applyViewportScaling } from '../editor/rendering.js';
import { updatePlayerControlsUI } from './playback.js';
import { fontLoader } from '../renderer/fontLoader.js';

export let songPlaylist = []; 
let playlistElement;

function syncPlaylistWithMain() {
    if (window.playerAPI) {
        window.playerAPI.sendPlaylistUpdate({
            songs: songPlaylist,
            activeSongId: state.activeSongId
        });
    }
}

// ... (Persistence logic functions: savePlaylistPaths, saveActiveSongPath, restorePlaylist remain unchanged) ...
function savePlaylistPaths() {
    try {
        const paths = songPlaylist.map(s => s.filePath);
        localStorage.setItem('saved-playlist-paths', JSON.stringify(paths));
    } catch (e) {
        console.error("Failed to save playlist paths:", e);
    }
}

function saveActiveSongPath(filePath) {
    try {
        localStorage.setItem('saved-active-song-path', filePath || '');
    } catch (e) {
        console.error("Failed to save active song path:", e);
    }
}

async function restorePlaylist() {
    const savedActivePath = localStorage.getItem('saved-active-song-path');
    const raw = localStorage.getItem('saved-playlist-paths');
    if (!raw) return;

    let paths = [];
    try {
        paths = JSON.parse(raw);
    } catch (e) { return; }

    if (!Array.isArray(paths) || paths.length === 0) return;

    const hideLoading = showLoadingDialog("Restoring previous session...");
    let changed = false;

    for (const filePath of paths) {
        try {
            if (songPlaylist.some(s => s.filePath === filePath)) continue;
            const result = await window.playerAPI.openProject(filePath);
            if (result.success && result.data) {
                if (songDataHasMeasures(result.data)) {
                    const songId = `song-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                    const fileNameWithExt = filePath.split(/[\\/]/).pop();
                    const title = fileNameWithExt.replace(/\.lyx$/, '');
                    songPlaylist.push({ id: songId, title, filePath, songData: result.data });
                    changed = true;
                }
            }
        } catch (e) { console.warn(`[SongsManager] Error restoring ${filePath}:`, e); }
    }

    if (changed) {
        renderPlaylist();
        syncPlaylistWithMain();
        savePlaylistPaths(); 
    }

    if (songPlaylist.length > 0) {
        let songToLoad = null;
        if (savedActivePath) songToLoad = songPlaylist.find(s => s.filePath === savedActivePath);
        if (!songToLoad) songToLoad = songPlaylist[0];
        if (songToLoad) await loadSong(songToLoad.id);
    }
    hideLoading();
}

// ... (Helper functions: pageDataHasMeasures, songDataHasMeasures, showDefaultPlayerView remain unchanged) ...
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
        if (el.type === 'lyrics' && el.properties?.lyricsContent?.measures?.length > 0) return true;
        if ((el.type === 'orchestra' || el.type === 'audio') && el.properties?.orchestraContent?.measures?.length > 0) {
            if (el.properties.orchestraContent.measures.some(m => (m.count || 0) > 0)) return true;
        }
    }
    return false;
}

function songDataHasMeasures(songData) {
    if (!songData || !songData.pages || songData.pages.length === 0) return false;
    return songData.pages.some(page => pageDataHasMeasures(page));
}

function showDefaultPlayerView() {
    if (state.domManager) state.domManager.clear();
    const defaultPage = new VirtualPage({ name: 'Default' });
    const container = new VirtualContainer({ alignment: 'vertical' });
    const title = new VirtualTitle({ textContent: "No song loaded yet" });
    const text = new VirtualText({ textContent: "Use the songs manager panel and click at the add song button." });
    container.getProperty('gravity').setJustifyContent('center', true);
    container.getProperty('gravity').setAlignItems('center', true);
    container.getProperty('gap').setGap({ value: 20, unit: 'px' }, true);
    title.getProperty('textStyle').setFontSize({ value: 64, unit: 'px' }, true);
    title.getProperty('textStyle').setTextAlign('center', true);
    text.getProperty('textStyle').setFontSize({ value: 30, unit: 'px' }, true);
    text.getProperty('textStyle').setTextColor({ r: 200, g: 200, b: 200, a: 1, mode: 'color' }, true);
    text.getProperty('textStyle').setTextAlign('center', true);
    container.addElement(title);
    container.addElement(text);
    defaultPage.addElement(container);
    state.domManager.addToDom(defaultPage);
    updateState({
        song: null, activePage: defaultPage, selectedElement: null,
        playback: { ...state.playback, isPlaying: false, timeAtPause: 0, songHasEnded: false, }
    });
    if (DOM.pageThumbnailsContainer) DOM.pageThumbnailsContainer.innerHTML = '';
    document.getElementById('window-title').innerText = "Player";
    updatePlayerControlsUI({ status: 'unloaded', type: 'normal', song: null });
    setTimeout(() => {
        if (DOM.slideViewportWrapper) applyViewportScaling(DOM.slideViewportWrapper);
        if (state.timelineManager) { state.timelineManager.resize(true); state.timelineManager.renderAt(0, 0); }
    }, 0);
}

// --- MODIFIED: Force re-extraction on song load ---
async function loadSong(songId) {
    // MODIFIED: Immediately hide any existing alert dialogs to allow new ones to show.
    hideAlertDialog();

    const song = songPlaylist.find(s => s.id === songId);
    if (!song) {
        console.error(`Song with id ${songId} not found in playlist.`);
        return;
    }

    // NEW LOGIC: Always re-extract the project to the single temp folder.
    if (song.filePath) {
        // We use the existing loading dialog mechanism if available via ipcInvoke
        const result = await window.playerAPI.openProject(song.filePath);

        if (result.success) {
            song.songData = result.data;
        } else {
            console.error(`Failed to re-extract song assets for ${song.title}: ${result.error}`);

            const errorMsg = result.error || "Unknown file error";

            // --- 1. Send error to Android device ---
            if (window.playerAPI && window.playerAPI.sendSongLoadError) {
                window.playerAPI.sendSongLoadError(`Asset Error: ${errorMsg}`);
            }

            // --- 2. Show detailed error in Electron Alert ---
            await showAlertDialog(
                'Asset Error',
                `Could not load assets for "${song.title}". The file might be missing or corrupt.\n\nError Details:\n${errorMsg}`
            );
            return; // Stop execution so the app doesn't crash trying to load null data
        }
    }

    // --- Standard Loading Logic ---
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
    const songData = song.songData;

    const songMetadata = {
        id: song.id,
        title: song.title,
        filePath: song.filePath,
        bpm: song.songData.bpm,
        bpmUnit: song.songData.bpmUnit,
        fonts: song.songData.fonts || {},
    };

    window.playerAPI.loadSong({ songMetadata, measureMap, songData });

    saveActiveSongPath(song.filePath);
}

export async function handleSongActivated(songMetadata, songData) {
    // MODIFIED: Immediately hide any existing alert dialogs to ensure UI readiness.
    hideAlertDialog();

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
                bpm: songMetadata.bpm,
                bpmUnit: songMetadata.bpmUnit,
                fonts: songData.fonts || {},
            },
            activePage: null,
            selectedElement: null,
            activeSongId: songMetadata.id,
        });

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
        syncPlaylistWithMain();

    } catch (error) {
        hideLoadingDialog();
        console.error('Failed to activate song in renderer:', error);

        // --- NEW: Send error to Android device ---
        if (window.playerAPI && window.playerAPI.sendSongLoadError) {
            window.playerAPI.sendSongLoadError(error.message);
        }

        // --- MODIFIED: Show detailed error in Electron Alert ---
        await showAlertDialog(
            'Failed to Load Song', 
            `An error occurred while loading "${songMetadata.title}".\n\nError Details:\n${error.message}`
        );
    } finally {
        hideLoadingDialog();
    }
}

// ... (Rest of file: handleSongUnloaded, renderPlaylist, handleAddSong, addSongFromPath, initSongsManager remain unchanged) ...
export function handleSongUnloaded() {
    updateState({ activeSongId: null });
    renderPlaylist();
    showDefaultPlayerView();
    syncPlaylistWithMain();
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
    hideAlertDialog();
    showLoadingDialog("Opening project...");
    try {
        const result = await window.playerAPI.openProject(filePath);
        if (!result.success) throw new Error(result.error);
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
        savePlaylistPaths();
        await loadSong(songId);
    } catch (error) {
        hideLoadingDialog();
        console.error('Failed to open project:', error);
        await showAlertDialog('Failed to Open Project', error.message);
    }
}

export async function addSongFromPath(filePath) {
    if (!filePath) return;
    hideAlertDialog();
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
        savePlaylistPaths();
        await loadSong(songId);
    } catch (error) {
        hideLoadingDialog();
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
    restorePlaylist();
    window.playerAPI.onPlaylistRequestSync(() => syncPlaylistWithMain());
    window.playerAPI.onSongSelectRequest((songId) => loadSong(songId));
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
                syncPlaylistWithMain();
                savePlaylistPaths();
                if (songPlaylist.length === 0) window.playerAPI.unloadSong();
                else if (wasActive) loadSong(songPlaylist[Math.max(0, index - 1)].id);
            }
        } else {
            if (songId !== state.activeSongId) loadSong(songId);
        }
    });
    // ... Drag and Drop setup omitted for brevity but is unchanged ...
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
        syncPlaylistWithMain();
        savePlaylistPaths();
    });
}
