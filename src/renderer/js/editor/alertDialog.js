let dialog = null;
let headerEl = null;
let messageEl = null;
let okBtn = null;
let resolvePromise = null;

function handleOkClick() {
    if (dialog) {
        dialog.classList.remove('visible');
    }
    if (resolvePromise) {
        resolvePromise();
        resolvePromise = null;
    }
}

export function initAlertDialog() {
    dialog = document.getElementById('alert-dialog');
    headerEl = document.getElementById('alert-dialog-header');
    messageEl = document.getElementById('alert-dialog-message');
    okBtn = document.getElementById('alert-dialog-ok');

    if (okBtn) {
        okBtn.addEventListener('click', handleOkClick);
    }
}

export function showAlertDialog(title = 'Alert', message = '') {
    return new Promise((resolve) => {
        if (dialog && headerEl && messageEl) {
            headerEl.textContent = title;
            messageEl.textContent = message;
            dialog.classList.add('visible');
            resolvePromise = resolve;
        } else {
            // Fallback if the dialog isn't initialized
            alert(`${title}\n\n${message}`);
            resolve();
        }
    });
}

// --- ADDED: Helper to programmatically hide the dialog ---
export function hideAlertDialog() {
    handleOkClick();
}

