// src/renderer/js/editor/draggable.js

/**
 * Makes a dialog draggable by its header.
 * Automatically resets the position to center when the dialog is re-opened.
 * @param {string} dialogId - The ID of the dialog container (the overlay).
 */
export function makeDraggable(dialogId) {
    const dialog = document.getElementById(dialogId);
    if (!dialog) return;

    const header = dialog.querySelector('.dialog-header');
    const content = dialog.querySelector('.dialog-content');

    if (!header || !content) return;

    // Visual cue and UX
    header.style.cursor = 'grab';
    header.style.userSelect = 'none'; // Prevent text selection on header

    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    // Reset position when dialog opens (class changes to 'visible')
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                if (dialog.classList.contains('visible')) {
                    // Reset inline styles to allow CSS Flexbox to center it again
                    content.style.position = '';
                    content.style.left = '';
                    content.style.top = '';
                    content.style.margin = '';
                }
            }
        });
    });

    observer.observe(dialog, { attributes: true });

    const onMouseDown = (e) => {
        // Ignore clicks on interactive elements inside the header
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;

        isDragging = true;
        header.style.cursor = 'grabbing';

        // Calculate the current position relative to the viewport before changing context
        const rect = content.getBoundingClientRect();

        // Switch to absolute positioning to allow free movement.
        // We override the flexbox centering from the CSS.
        content.style.position = 'absolute';
        content.style.margin = '0';
        content.style.left = `${rect.left}px`;
        content.style.top = `${rect.top}px`;

        startX = e.clientX;
        startY = e.clientY;
        initialLeft = rect.left;
        initialTop = rect.top;

        // Attach listeners to document to handle fast movements outside the header
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        
        e.preventDefault(); 
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        content.style.left = `${initialLeft + dx}px`;
        content.style.top = `${initialTop + dy}px`;
    };

    const onMouseUp = () => {
        isDragging = false;
        header.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    header.addEventListener('mousedown', onMouseDown);
}

