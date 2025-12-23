let dialog = null;
let headerEl = null;
let messageEl = null;
let yesBtn = null;
let noBtn = null;
let resolvePromise = null;

function handleYesClick() {
    if (dialog) dialog.classList.remove('visible');
    if (resolvePromise) {
        resolvePromise(true);
        resolvePromise = null;
    }
}

function handleNoClick() {
    if (dialog) dialog.classList.remove('visible');
    if (resolvePromise) {
        resolvePromise(false);
        resolvePromise = null;
    }
}

export function initConfirmationDialog() {
    dialog = document.getElementById('confirmation-dialog');
    headerEl = document.getElementById('confirmation-dialog-header');
    messageEl = document.getElementById('confirmation-dialog-message');
    yesBtn = document.getElementById('confirmation-dialog-yes');
    noBtn = document.getElementById('confirmation-dialog-no');

    if (yesBtn && noBtn) {
        yesBtn.addEventListener('click', handleYesClick);
        noBtn.addEventListener('click', handleNoClick);
    }
}

export function showConfirmationDialog(message = 'Are you sure?', title = 'Confirmation') {
    return new Promise((resolve) => {
        if (dialog && headerEl && messageEl) {
            headerEl.textContent = title;
            messageEl.textContent = message;
            dialog.classList.add('visible');
            resolvePromise = resolve;
        } else {
            // Fallback if the dialog isn't initialized
            const confirmed = confirm(`${title}\n\n${message}`);
            resolve(confirmed);
        }
    });
}



