/**
 * Manages dynamic font loading via CSS @font-face injection.
 */
export class FontLoader {
    constructor() {
        this.styleElement = document.getElementById('dynamic-project-fonts');
        if (!this.styleElement) {
            this.styleElement = document.createElement('style');
            this.styleElement.id = 'dynamic-project-fonts';
            document.head.appendChild(this.styleElement);
        }
        this.loadedFonts = new Set();
    }

    /**
     * Loads a font map into the document.
     * @param {Object} fontMap - Object where keys are Font Family names and values are Asset URLs.
     */
    loadFonts(fontMap) {
        if (!fontMap) return;

        let cssRules = '';
        
        for (const [family, src] of Object.entries(fontMap)) {
            if (!src) continue;

            // Sanitization to prevent CSS injection issues
            const safeFamily = family.replace(/["';]/g, "");
            const safeSrc = src.replace(/["';]/g, "");

            // We define separate rules for different weights/styles using the same source file
            // to ensure the browser uses this font for all variations of the family name.
            // In a more complex system, we might import separate files for bold/italic.
            cssRules += `
                @font-face {
                    font-family: "${safeFamily}";
                    src: url("${safeSrc}");
                    font-weight: normal;
                    font-style: normal;
                }
                @font-face {
                    font-family: "${safeFamily}";
                    src: url("${safeSrc}");
                    font-weight: bold;
                    font-style: normal;
                }
                @font-face {
                    font-family: "${safeFamily}";
                    src: url("${safeSrc}");
                    font-weight: normal;
                    font-style: italic;
                }
                @font-face {
                    font-family: "${safeFamily}";
                    src: url("${safeSrc}");
                    font-weight: bold;
                    font-style: italic;
                }
            `;
            this.loadedFonts.add(family);
        }

        this.styleElement.textContent = cssRules;
        if (Object.keys(fontMap).length > 0) {
            console.log(`[FontLoader] Loaded ${Object.keys(fontMap).length} project fonts.`);
        }
    }
    
    /**
     * Clears loaded fonts.
     */
    clear() {
        this.styleElement.textContent = '';
        this.loadedFonts.clear();
    }
}

export const fontLoader = new FontLoader();