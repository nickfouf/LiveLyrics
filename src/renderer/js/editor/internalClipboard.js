// src/renderer/js/editor/internalClipboard.js

class InternalClipboard {
    constructor() {
        this.storage = {
            style: null,
            element: null, // Reserved for future use
            page: null     // Reserved for future use
        };
    }

    /**
     * Saves data to a specific clipboard slot.
     * @param {'style'|'element'|'page'} type 
     * @param {any} data 
     */
    write(type, data) {
        this.storage[type] = data;
    }

    /**
     * Retrieves data from a specific clipboard slot.
     * @param {'style'|'element'|'page'} type 
     */
    read(type) {
        return this.storage[type];
    }

    /**
     * Checks if a specific slot has data.
     * @param {'style'|'element'|'page'} type 
     */
    has(type) {
        return this.storage[type] !== null && this.storage[type] !== undefined;
    }

    clear(type) {
        if (type) {
            this.storage[type] = null;
        } else {
            this.storage = { style: null, element: null, page: null };
        }
    }
}

export const internalClipboard = new InternalClipboard();

