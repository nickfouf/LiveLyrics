markdown
# Editor Frontend Architecture

This directory contains the core frontend logic for the LiveLyrics Editor window. The architecture has been refactored to use a custom, declarative rendering engine built around a **Virtual DOM**. This approach provides a more robust, performant, and maintainable foundation compared to direct DOM manipulation.

## Core Architectural Concepts

The editor's state and rendering are now driven by three main concepts:

1.  **The Virtual DOM**: The entire visual state of the application is represented by a tree of JavaScript objects, starting with `VirtualPage` and containing `VirtualContainer`, `VirtualLyrics`, etc. These objects are the **single source of truth**. All UI interactions (changing properties, dragging elements) modify this object tree, not the live DOM.

2.  **The `DomManager`**: This is the bridge between the virtual DOM and the real DOM. Its primary job is to take the current state of the virtual element tree and make the real DOM match it. It handles the initial creation of DOM elements and will be the foundation for efficient diffing-based updates in the future.

3.  **The `TimelineManager`**: This is the orchestrator of all animations and playback. It does not know *how* to render, only *when*. On each animation frame, it is given a precise musical time. It then traverses the virtual DOM, calculates the interpolated value for every animated property, updates the state of the virtual objects, and finally tells the `DomManager` to render the result.

### State & Data Flow

The flow of data is unidirectional and predictable:

1.  **Initialization**: `main.js` creates instances of `DomManager` and `TimelineManager` and stores them in `state.js`.
2.  **User Interaction**: An action in the UI (e.g., changing a color in the `propertiesPanel`) directly calls a method on a `VirtualProperty` of the selected `VirtualElement` (e.g., `element.getProperty('background').setColor(...)`).
3.  **State Change**: The `VirtualProperty` updates its internal `VirtualValue`.
4.  **Re-rendering**: The UI module then tells the `DomManager` to re-render (`domManager.render()` or `domManager.resize()`), which updates the live DOM to reflect the new state of the virtual tree.
5.  **Playback**: The `animationLoop` in `events.js` calculates the current time and calls `timelineManager.renderAt(time)`. The `TimelineManager` updates the entire virtual tree and then triggers a `domManager.render()`.
