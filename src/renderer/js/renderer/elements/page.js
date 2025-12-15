// src/renderer/js/renderer/elements/page.js

import { VirtualContainer } from "./container.js";
import { VirtualLyrics } from "./lyrics.js";
import { VirtualOrchestra } from "./orchestra.js";
import { VirtualAudio } from "./audio.js";
import { BackgroundProperty } from "../properties/backgroundCG.js";
import { ParentPerspectiveProperty } from "../properties/parentPerspective.js";
import { PerspectiveScaleProperty } from "../properties/perspectiveScale.js";

export class VirtualPage extends VirtualContainer {
    #musicElementsOrder = []; // Array of element IDs
    transition = { type: 'fade', duration: 2, durationUnit: 'beats', offsetBeats: 0, direction: 'left', perspective: { value: 2000, unit: 'px' } };
    constructor(options = {}) {
        super({ name: 'Page', ...options });

        // Override background to be enabled by default for pages
        const backgroundOptions = options.background !== undefined
            ? options.background
            : { enabled: true, background: {r: 0, g: 0, b: 0, a:1, mode:'color'} };
        this.setProperty('background', new BackgroundProperty(backgroundOptions));

        this.setProperty('parentPerspective', new ParentPerspectiveProperty(options.parentPerspective));

        this.insertPropertyBefore('perspectiveScale', new PerspectiveScaleProperty(options.perspectiveScale), 'transform');

        if (options.transition) {
            this.transition = { ...this.transition, ...options.transition };
        }
    }

    get type() {
        return 'page';
    }

    /**
     * Returns the child musical elements in their specified playback order.
     * @returns {VirtualElement[]}
     */
    getMusicElementsOrder() {
        // Helper function to find an element recursively within a container
        const findElementRecursive = (id, container) => {
            for (const child of container.getChildren()) {
                if (child.id === id) {
                    return child;
                }
                // Only recurse if the child is a container itself
                if (child instanceof VirtualContainer) {
                    const found = findElementRecursive(id, child);
                    if (found) {
                        return found;
                    }
                }
            }
            return null;
        };

        return this.#musicElementsOrder
            .map(id => findElementRecursive(id, this)) // Search recursively starting from the page itself
            .filter(el => el); // Filter out nulls if an element was deleted
    }

    /**
     * Sets the playback order for musical elements.
     * @param {VirtualElement[]} elements - An array of VirtualElement objects.
     */
    setMusicElementsOrder(elements) {
        this.#musicElementsOrder = elements.map(el => el.id);
    }

    /**
     * Appends a musical element to the end of the playback order.
     * @param {VirtualElement} element - The element to add.
     */
    addMusicElementToOrder(element) {
        if ((element instanceof VirtualLyrics || element instanceof VirtualOrchestra || element instanceof VirtualAudio) && !this.#musicElementsOrder.includes(element.id)) {
            this.#musicElementsOrder.push(element.id);
        }
    }

    /**
     * Removes a musical element from the playback order.
     * @param {VirtualElement} element - The element to remove.
     */
    removeMusicElementFromOrder(element) {
        if (element instanceof VirtualLyrics || element instanceof VirtualOrchestra || element instanceof VirtualAudio) {
            const index = this.#musicElementsOrder.indexOf(element.id);
            if (index > -1) {
                this.#musicElementsOrder.splice(index, 1);
            }
        }
    }
}