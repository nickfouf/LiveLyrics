// src/renderer/js/audience/dom.js

/**
 * A centralized object to hold references to all frequently accessed DOM elements for the Audience window.
 * @namespace
 */
export const DOM = {};

/**
 * Initializes the DOM object by querying and storing references to key elements in the Audience window.
 * This should be called once the DOM is fully loaded.
 */
export function initDOM() {
    // Main rendering containers
    DOM.pageContainer = document.getElementById('page-container');
    DOM.presentationSlide = document.getElementById('slide-viewport');
}