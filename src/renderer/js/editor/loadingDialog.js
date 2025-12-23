let dialog = null;

/**
 * Injects the loading dialog HTML into the document body.
 * Should be called once on application startup.
 */
export function initLoadingDialog() {
    const dialogHTML = `
        <div id="loading-dialog" class="dialog-overlay">
            <div class="dialog-content">
                <div class="loading-text">Loading file into project...</div>
                <div class="dots"><span></span><span></span><span></span></div>
                <button id="loading-dialog-cancel" class="action-btn secondary-btn">Cancel</button>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', dialogHTML);
    dialog = document.getElementById('loading-dialog');

    document.getElementById('loading-dialog-cancel').addEventListener('click', () => {
        // Notify the main process to cancel the ongoing file copy
        if (window.editorAPI && window.editorAPI.cancelFileCopy) {
            window.editorAPI.cancelFileCopy();
        }
        // The dialog will be hidden by the calling function's finally block
    });
}

export function hideLoadingDialog() {
    if (dialog) {
        dialog.classList.remove('visible');
    }
}

/**
 * Shows the loading dialog.
 * @param {string} [message="Loading file into project..."] - An optional message to display.
 * @returns {Function} A function that can be called to hide the dialog.
 */
export function showLoadingDialog(message = "Loading file into project...") {
    if (!dialog) {
        console.error("Loading dialog has not been initialized.");
        return () => {};
    }

    const textElement = dialog.querySelector('.loading-text');
    if (textElement) {
        textElement.textContent = message;
    }

    dialog.classList.add('visible');

    // Return a function to hide the dialog, making it easy to use with try/finally
    return hideLoadingDialog;
}

