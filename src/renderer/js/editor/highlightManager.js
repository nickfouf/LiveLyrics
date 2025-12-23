// renderer/js/editor/highlightManager.js
import { DOM } from './dom.js';

export class HighlightManager {
    #highlightElement = null;
    #nameLabelElement = null;
    #targetVirtualElement = null;
    #hideTimeout = null;
    #resizeObserver = null;
    #offsetParent = null;

    constructor() {
        // --- Highlight Border Element ---
        this.#highlightElement = document.createElement('div');
        this.#highlightElement.style.position = 'absolute';
        this.#highlightElement.style.pointerEvents = 'none';
        this.#highlightElement.style.border = '2px solid #0078d4';
        this.#highlightElement.style.zIndex = '900'; // High z-index
        this.#highlightElement.style.display = 'none'; // Initially hidden

        // Set initial opacity to 0 and add transition
        this.#highlightElement.style.opacity = '0';
        this.#highlightElement.style.transition = 'opacity 150ms ease-in-out, background-color 150ms ease-in-out';


        // --- Name Label Element ---
        this.#nameLabelElement = document.createElement('div');
        this.#nameLabelElement.style.position = 'absolute';
        this.#nameLabelElement.style.pointerEvents = 'none';
        this.#nameLabelElement.style.display = 'none';
        this.#nameLabelElement.style.backgroundColor = '#0078d4';
        this.#nameLabelElement.style.color = 'white';
        this.#nameLabelElement.style.padding = '2px 8px';
        this.#nameLabelElement.style.borderRadius = '4px';
        this.#nameLabelElement.style.fontSize = '12px';
        this.#nameLabelElement.style.fontFamily = 'sans-serif';
        this.#nameLabelElement.style.whiteSpace = 'nowrap';
        this.#nameLabelElement.style.zIndex = '901';
        this.#nameLabelElement.style.transform = 'translateX(-50%)';
        // Set initial opacity to 0 and add transition
        this.#nameLabelElement.style.opacity = '0';
        this.#nameLabelElement.style.transition = 'opacity 150ms ease-in-out, background-color 150ms ease-in-out';


        // Append both to the main editor area
        if (DOM.mainEditorArea) {
            DOM.mainEditorArea.appendChild(this.#highlightElement);
            DOM.mainEditorArea.appendChild(this.#nameLabelElement);
            this.#offsetParent = DOM.mainEditorArea;
        } else {
            console.error("HighlightManager: DOM.mainEditorArea not found. Highlighting will not work.");
            return;
        }

        this.#resizeObserver = new ResizeObserver(() => {
            this.update();
        });
    }

    /**
     * Highlights a given virtual element.
     * @param {VirtualElement} targetVirtualElement The virtual element to highlight.
     * @param {'click' | 'drag-valid' | 'drag-invalid'} mode The mode of highlighting.
     */
    highlight(targetVirtualElement, mode = 'click') {
        if (!targetVirtualElement || !targetVirtualElement.domElement || !this.#highlightElement) return;

        // --- State Management ---
        // Stop any pending hide operations
        if (this.#hideTimeout) {
            clearTimeout(this.#hideTimeout);
            this.#hideTimeout = null;
        }

        // Stop observing the old target if it's different
        if (this.#targetVirtualElement && this.#targetVirtualElement !== targetVirtualElement) {
            this.#resizeObserver.unobserve(this.#targetVirtualElement.domElement);
        }
        this.#targetVirtualElement = targetVirtualElement;
        this.#resizeObserver.observe(this.#targetVirtualElement.domElement);

        // --- Apply Styles based on Mode ---
        this.#highlightElement.style.backgroundColor = 'transparent'; // Reset first

        switch (mode) {
            case 'drag-valid':
                this.#highlightElement.style.border = '2px solid #0078d4';
                this.#highlightElement.style.backgroundColor = 'rgba(0, 120, 212, 0.2)';
                this.#nameLabelElement.style.backgroundColor = '#0078d4';
                break;
            case 'drag-invalid':
                this.#highlightElement.style.border = '2px solid #e81123';
                this.#highlightElement.style.backgroundColor = 'rgba(232, 17, 35, 0.2)';
                this.#nameLabelElement.style.backgroundColor = '#e81123';
                break;
            case 'click':
            default:
                this.#highlightElement.style.border = '2px solid #0078d4';
                this.#nameLabelElement.style.backgroundColor = '#0078d4';
                // Set timeout to auto-hide for clicks
                this.#hideTimeout = setTimeout(() => this.hide(), 1200);
                break;
        }

        // --- Update UI ---
        const name = this.#targetVirtualElement.getProperty('name').name;
        this.#nameLabelElement.textContent = name;

        this.update();

        // --- Fade-in ---
        this.#highlightElement.style.display = 'block';
        this.#nameLabelElement.style.display = 'block';

        requestAnimationFrame(() => {
            this.#highlightElement.style.opacity = '1';
            this.#nameLabelElement.style.opacity = '1';
        });
    }

    /**
     * Hides the highlight overlay and its label with a fade-out animation.
     */
    hide() {
        if (!this.#highlightElement || this.#highlightElement.style.opacity === '0') {
            return; // Already hidden or hiding
        }
    
        // Clear any pending auto-hide timeout
        if (this.#hideTimeout) {
            clearTimeout(this.#hideTimeout);
            this.#hideTimeout = null;
        }
    
        // Start the fade-out transition
        this.#highlightElement.style.opacity = '0';
        this.#nameLabelElement.style.opacity = '0';
    
        // Use a timeout that matches the transition duration. This is more robust
        // than 'transitionend' which might not fire if the element is obscured by a dialog.
        setTimeout(() => {
            // Only hide if a new highlight hasn't been triggered in the meantime.
            // If opacity is 1, it means a new highlight started during the fade-out.
            if (this.#highlightElement.style.opacity === '0') {
                this.#highlightElement.style.display = 'none';
                this.#nameLabelElement.style.display = 'none';
    
                if (this.#targetVirtualElement) {
                    this.#resizeObserver.unobserve(this.#targetVirtualElement.domElement);
                    this.#targetVirtualElement = null;
                }
            }
        }, 150); // Matches the CSS transition duration
    }

    /**
     * Updates the position and size of the highlight overlay and its label to match the target.
     */
    update() {
        if (!this.#targetVirtualElement || !this.#highlightElement || !this.#offsetParent) {
            return;
        }
        // Don't update if it's in the process of hiding
        if (this.#highlightElement.style.display === 'none') return;


        const parentRect = this.#offsetParent.getBoundingClientRect();
        const targetRect = this.#targetVirtualElement.domElement.getBoundingClientRect();

        // Update border position
        this.#highlightElement.style.top = `${targetRect.top - parentRect.top - 2}px`;
        this.#highlightElement.style.left = `${targetRect.left - parentRect.left - 2}px`;
        this.#highlightElement.style.width = `${targetRect.width}px`;
        this.#highlightElement.style.height = `${targetRect.height}px`;

        // Update name label position
        const labelTop = targetRect.top - parentRect.top - this.#nameLabelElement.offsetHeight - 4 - 2; // 4px gap
        const labelLeft = targetRect.left - parentRect.left + (targetRect.width / 2) - 2;
        this.#nameLabelElement.style.top = `${labelTop}px`;
        this.#nameLabelElement.style.left = `${labelLeft}px`;
    }
}



