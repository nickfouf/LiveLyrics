console.log('✅ player-renderer.js loaded successfully');

window.addEventListener('DOMContentLoaded', () => {
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');

    if (!window.playerAPI) {
        console.error('❌ playerAPI is NOT available. Check main.js webPreferences and preload-player.js script path.');
        return;
    }

    console.log('✅ playerAPI is available on window object.');

    minimizeBtn.addEventListener('click', () => window.playerAPI.minimizeWindow());
    maximizeBtn.addEventListener('click', () => window.playerAPI.maximizeWindow());
    closeBtn.addEventListener('click', () => window.playerAPI.closeWindow());

    window.playerAPI.onWindowStateChange((isMaximized) => {
        if (isMaximized) {
            maximizeBtn.classList.add('is-maximized');
        } else {
            maximizeBtn.classList.remove('is-maximized');
        }
    });
});