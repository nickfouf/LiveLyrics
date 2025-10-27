console.log('✅ renderer.js loaded successfully');

window.addEventListener('DOMContentLoaded', () => {
    const editorBtn = document.getElementById('editor-btn');
    const playerBtn = document.getElementById('player-btn');
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');
    const versionSpan = document.getElementById('app-version');

    // This check is crucial for debugging
    if (!window.electronAPI) {
        console.error('❌ electronAPI is NOT available. Check main.js webPreferences and preload.js script path.');
        return;
    }

    console.log('✅ electronAPI is available on window object.');

    // --- Menu Buttons ---
    editorBtn.addEventListener('click', () => window.electronAPI.openEditor());
    playerBtn.addEventListener('click', () => window.electronAPI.openPlayer());

    // --- Window Controls ---
    minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
    maximizeBtn.addEventListener('click', () => window.electronAPI.maximizeWindow());
    closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());

    window.electronAPI.onWindowStateChange((isMaximized) => {
        if (isMaximized) {
            maximizeBtn.classList.add('is-maximized');
        } else {
            maximizeBtn.classList.remove('is-maximized');
        }
    });

    // --- App Version Display ---
    const displayAppVersion = async () => {
        if (versionSpan) {
            try {
                const version = await window.electronAPI.getAppVersion();
                versionSpan.textContent = `v${version}`;
            } catch (error) {
                console.error('Failed to get app version:', error);
                versionSpan.textContent = 'v?.?.?';
            }
        }
    };

    displayAppVersion();
});