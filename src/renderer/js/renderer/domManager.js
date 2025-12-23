// src/renderer/js/renderer/domManager.js

export class DomManager {
    #pages = [];
    #root = null;
    #resizeTimeout = null;
    #resizeDelay = 10;
    #maxResizeWaitDelay = 10;
    #firstResizeCallTime = null;

    get domElement() {
        return this.#root;
    }

    constructor(rootElement) {
        this.#root = rootElement;
    }

    clear() {
        // Create a copy of the array to iterate over, as removePage modifies it.
        const pagesToRemove = [...this.#pages];
        for (const page of pagesToRemove) {
            this.removeFromDom(page);
            this.removePage(page);
        }
        // Ensure the root element is physically empty
        this.#root.innerHTML = '';
    }

    getId() {
        return this.#root.id || null;
    }

    isStaging() {
        return this.getId() === 'staging-page-container';
    }

    getManagedPages() {
        return this.#pages;
    }

    addPage(virtualElement) {
        if (virtualElement.type === 'page') {
            if(this.#pages.includes(virtualElement)) {
                return;
            }
            this.#pages.push(virtualElement);
        } else {
            console.warn('Unsupported element type:', virtualElement.type);
        }
    }

    removePage(virtualElement) {
        if (virtualElement.type === 'page') {
            const pageIndex = this.#pages.indexOf(virtualElement);
            if (pageIndex !== -1) {
                this.#pages.splice(pageIndex, 1);
            }
        } else {
            console.warn('Unsupported element type:', virtualElement.type);
        }
    }

    removeFromDom(page) {
        const pageIndex = this.#pages.indexOf(page);
        if (pageIndex === -1) {
            return;
        }
        if(page.addedInDom) {
            if (this.#root.contains(page.domElement)) {
                this.#root.removeChild(page.domElement);
            }
            page.addedInDom = false;
        }
    }

    addToDom(page) {
        if (!this.#pages.includes(page)) {
            this.addPage(page);
        }
        if(!page.addedInDom) {
            const domElement = page.domElement;
            if(this.#root.children.length === 0) {
                this.#root.appendChild(domElement);
            } else {
                const pageOrderInManager = this.#pages.filter(p => p.addedInDom);
                const currentIndexInDom = pageOrderInManager.indexOf(page);
                let nextSiblingInDom = null;
                for (let i = currentIndexInDom + 1; i < pageOrderInManager.length; i++) {
                    if (this.#root.contains(pageOrderInManager[i].domElement)) {
                        nextSiblingInDom = pageOrderInManager[i].domElement;
                        break;
                    }
                }
                if (nextSiblingInDom) {
                    this.#root.insertBefore(domElement, nextSiblingInDom);
                } else {
                    this.#root.appendChild(domElement);
                }
            }
            page.setParent(this);
            page.addedInDom = true;
        }
    }

    notifyPlaybackState(isPlaying) {
        const pagesInDom = this.#pages.filter(page => page.addedInDom);
        for (const page of pagesInDom) {
            page.handlePlaybackStateChange(isPlaying);
        }
    }

    applyEvents(measureIndex, beatProgress, timingData) {
        const pagesInDom = this.#pages.filter(page => page.addedInDom);
        for(const page of pagesInDom) {
            page.applyEvents(measureIndex, beatProgress, timingData);
        }
    }

    render() {
        const pagesInDom = this.#pages.filter(page => page.addedInDom);
        for(const page of pagesInDom) {
            page.render();
        }
    }

    #applyResize(manualResize) {
        this.#resizeTimeout = null;
        const pagesInDom = this.#pages.filter(page => page.addedInDom);
        for(const page of pagesInDom) {
            page.resize({root: this, parent: this});
        }
        this.render();
    }

    resize(manualResize = false) {
        // Manual resize is immediate and resets any pending debounced resize.
        if (manualResize) {
            this.#applyResize(true);
            if (this.#resizeTimeout) clearTimeout(this.#resizeTimeout);
            this.#resizeTimeout = null;
            this.#firstResizeCallTime = null;
            return;
        }

        const now = performance.now();

        // If this is the first call in a sequence, set the start time and trigger the start callback.
        if (this.#firstResizeCallTime === null) {
            this.#firstResizeCallTime = now;
        }

        // Clear any existing debounce timeout.
        if (this.#resizeTimeout) {
            clearTimeout(this.#resizeTimeout);
        }

        // Calculate time since the very first call in this sequence.
        const elapsed = now - this.#firstResizeCallTime;

        // If the max wait time has been exceeded, apply the resize immediately.
        if (elapsed >= this.#maxResizeWaitDelay) {
            this.#applyResize(false);
            this.#firstResizeCallTime = null; // Reset for the next sequence.
        } else {
            // Otherwise, set a new debounce timeout.
            this.#resizeTimeout = setTimeout(() => {
                this.#applyResize(false);
                this.#firstResizeCallTime = null; // Reset for the next sequence.
            }, this.#resizeDelay);
        }
    }

    getWidth() {
        return this.#root.clientWidth;
    }

    getHeight() {
        return this.#root.clientHeight;
    }

    getFontSize() {
        return 16;
    }
}




