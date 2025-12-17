/**
 * Manages dynamic font loading via the FontFace API (JS-only).
 */
export class FontLoader {
    constructor() {
        this.addedFonts = new Set(); // Track FontFace instances to remove them later
        this.loadedFamilies = new Set(); // Track family names
        this.callbacks = new Set(); // Subscribers for re-render
        this.lastMapJSON = ''; // For checking if updates are necessary
    }

    /**
     * Registers a callback to be executed when fonts have finished loading.
     * @param {Function} callback 
     */
    onFontsLoaded(callback) {
        if (typeof callback === 'function') {
            this.callbacks.add(callback);
        }
    }

    /**
     * Loads a font map into the document using the FontFace API.
     * @param {Object} fontMap - Object where keys are Font Family names and values are Asset URLs.
     */
    async loadFonts(fontMap) {
        if (!fontMap) return;

        // Optimization: Avoid reloading/clearing if the map hasn't changed.
        // This is crucial because this function might be called on every frame by the player.
        const mapJSON = JSON.stringify(fontMap);
        if (mapJSON === this.lastMapJSON) {
            return;
        }
        this.lastMapJSON = mapJSON;

        // Clear previous fonts to ensure we match the behavior of replacing the state
        // and prevent duplicates/leaks. 'false' means don't clear the JSON cache we just set.
        this.clear(false);

        const loadPromises = [];

        for (const [family, src] of Object.entries(fontMap)) {
            if (!src) continue;

            // Sanitization (keeping existing logic)
            let safeSrc = src.replace(/["';]/g, "");
            safeSrc = safeSrc.replace(/\\/g, '/');

            // Ensure file protocol or absolute path structure
            if ((/^[a-zA-Z]:/.test(safeSrc) || safeSrc.startsWith('/')) && !safeSrc.startsWith('file:') && !safeSrc.startsWith('http')) {
                if (!safeSrc.startsWith('/')) {
                    safeSrc = '/' + safeSrc;
                }
                safeSrc = 'file://' + safeSrc;
            }

            const namespacedFamily = `lyx-${family.replace(/["';]/g, "")}`;
            const sourceUrl = `url("${safeSrc}")`;

            // Create variations mapping to the same source file.
            // This replicates the behavior of the previous CSS block, ensuring
            // the font works even if bold/italic is applied in styles.
            const variations = [
                { weight: 'normal', style: 'normal' },
                { weight: 'bold', style: 'normal' },
                { weight: 'normal', style: 'italic' },
                { weight: 'bold', style: 'italic' }
            ];

            variations.forEach(vars => {
                const fontFace = new FontFace(namespacedFamily, sourceUrl, vars);
                // We add it to our tracking set immediately
                this.addedFonts.add(fontFace);
                // We start loading it
                loadPromises.push(fontFace.load());
            });

            this.loadedFamilies.add(family);
        }

        if (loadPromises.length > 0) {
            try {
                // Wait for all fonts to be fetched and parsed
                const loadedFonts = await Promise.all(loadPromises);
                
                // Add them to the document
                loadedFonts.forEach(font => {
                    document.fonts.add(font);
                });

                console.log(`[FontLoader] Loaded ${Object.keys(fontMap).length} fonts (with variations) via FontFace API.`);
                
                // Notify subscribers (triggering the re-render)
                this.callbacks.forEach(cb => cb());
            } catch (err) {
                console.error("[FontLoader] Error loading fonts:", err);
            }
        }
    }
    
    /**
     * Checks if a specific font family is currently loaded as a project asset.
     * @param {string} fontFamily 
     * @returns {boolean}
     */
    isFontLoaded(fontFamily) {
        return this.loadedFamilies.has(fontFamily);
    }

    /**
     * Clears loaded fonts.
     * @param {boolean} clearCache - Whether to clear the JSON cache (default true).
     */
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