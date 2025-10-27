# LiveLyrics

LiveLyrics is an advanced, event-driven presentation tool for creating and displaying musically-synchronized lyrics and visuals. Built with Electron, it features a powerful editor that allows for the precise animation of any element's properties over a musical timeline.

## Features

### Editor
- **Visual Drag & Drop Interface**: Build complex layouts by dragging elements from a palette onto a presentation slide.
- **Multi-Page Presentations**: Organize your content into multiple pages, each with its own background, layout, and transitions.
- **Rich UI Elements**: Utilize a variety of elements including:
    - Layout Containers (Vertical, Horizontal, Absolute)
    - Text (Titles, paragraphs)
    - Images
    - Custom "Smart Effects"
- **Musical Event System**: The core of LiveLyrics. Animate *any* property of *any* element based on a musical timeline.
    - **Live Content**: Use special `Lyrics` and `Orchestra` elements to define the musical structure (measures and time signatures) of a page.
    - **Keyframe Animation**: Assign property changes to specific notes within a measure. The system automatically interpolates values between keyframes.
    - **Easing Functions**: Apply easing (linear, ease-in, ease-out, instant) for smooth and dynamic animations.
- **Detailed Property Inspector**: Fine-tune every aspect of an element's appearance, including dimensions, position, color, gradients, borders, shadows, and text styles.
- **Interactive Timeline**: Simulate playback, jump between measures, and control the BPM to preview your animations.
- **Layers Panel**: Easily manage element hierarchy, selection, and z-ordering.

### Player
- A dedicated, clean window for displaying the final, animated presentation. (Playback logic is currently under development).

## Core Concepts for Developers

Understanding these concepts is key to working with the LiveLyrics codebase.

1.  **Pages**: A page is a single slide in the presentation. It is the root container for all other elements and has its own properties for background and transitions.

2.  **Elements**: These are the visual building blocks dropped onto a page. Their properties (size, color, position, etc.) are the targets for animation.

3.  **Music Elements (`Lyrics` & `Orchestra`)**: These are special elements that don't have a complex visual output themselves but serve to define the musical timeline for a page. They contain a sequence of *measures*, each with a specific time signature.

4.  **The Events System**: This is what makes LiveLyrics powerful.
    - The **Events Editor** is used to animate properties of *any* element on the page.
    - It works by creating **keyframes** on musical notes placed within the measures of a `Lyrics` or `Orchestra` element.
    - **Example**: You can set the `opacity` of an Image element to `0` on the first note of a measure and `1` on the last note. The system will smoothly interpolate the opacity over the duration of that measure during playback.

## Project Structure

The project is organized into the Electron main process and renderer (frontend) code.
