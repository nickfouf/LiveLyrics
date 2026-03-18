/**
 * Manages dynamic font loading via the FontFace API (JS-only).
 */
export class FontLoader {
    constructor() {
        this.addedFonts = new Set();
        this.loadedFamilies = new Set();
        this.callbacks = new Set();
        this.lastMapJSON = '';
    }

    onFontsLoaded(callback) {
        if (typeof callback === 'function') {
            this.callbacks.add(callback);
        }
    }

    async loadFonts(fontMap) {
        if (!fontMap) return;

        const mapJSON = JSON.stringify(fontMap);
        if (mapJSON === this.lastMapJSON) {
            return;
        }
        this.lastMapJSON = mapJSON;

        this.clear(false);

        const loadPromises = [];

        for (const [family, src] of Object.entries(fontMap)) {
            if (!src) continue;

            let safeSrc = src.replace(/["';]/g, "");
            safeSrc = safeSrc.replace(/\\/g, '/');

            if ((/^[a-zA-Z]:/.test(safeSrc) || safeSrc.startsWith('/')) && !safeSrc.startsWith('file:') && !safeSrc.startsWith('http')) {
                if (!safeSrc.startsWith('/')) {
                    safeSrc = '/' + safeSrc;
                }
                safeSrc = 'file://' + safeSrc;
            }

            const namespacedFamily = `lyx-${family.replace(/["';]/g, "")}`;
            const sourceUrl = `url("${safeSrc}")`;

            // Load the embedded font fallback without explicitly defining it as bold/italic.
            // This ensures that if the system font is missing, the browser will properly 
            // synthesize the bold/italic from this single embedded regular file.
            const fontFace = new FontFace(namespacedFamily, sourceUrl);
            
            this.addedFonts.add(fontFace);
            loadPromises.push(fontFace.load());

            this.loadedFamilies.add(family);
        }

        if (loadPromises.length > 0) {
            try {
                const loadedFonts = await Promise.all(loadPromises);
                
                loadedFonts.forEach(font => {
                    document.fonts.add(font);
                });

                console.log(`[FontLoader] Loaded ${Object.keys(fontMap).length} fallback fonts via FontFace API.`);
                
                this.callbacks.forEach(cb => cb());
            } catch (err) {
                console.error("[FontLoader] Error loading fonts:", err);
            }
        }
    }
    
    isFontLoaded(fontFamily) {
        return this.loadedFamilies.has(fontFamily);
    }

    clear(clearCache = true) {
        this.addedFonts.forEach(font => {
            document.fonts.delete(font);
        });
        this.addedFonts.clear();
        this.loadedFamilies.clear();
        if (clearCache) {
            this.lastMapJSON = '';
        }
    }
}

export const fontLoader = new FontLoader();

