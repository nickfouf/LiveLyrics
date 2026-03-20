// 1. Initialize WebGL App
const app = new PIXI.Application({
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    backgroundColor: '#000',
});
document.body.appendChild(app.view);

// Wait for the custom font to load before rendering
document.fonts.load('32px OrchestraFont').then(initScene);

function initScene() {
    // 2. Load the Background Image into WebGL
    const bgTexture = PIXI.Texture.from('assets/bg.jpg');
    const bgSprite = new PIXI.Sprite(bgTexture);
    app.stage.addChild(bgSprite);

    // 3. Create the UI Container (Everything inside here gets Linear Burned)
    const uiContainer = new PIXI.Container();
    app.stage.addChild(uiContainer);

    // --- Solid White Background for UI Container ---
    const whiteBgSprite = new PIXI.Sprite(PIXI.Texture.WHITE);
    uiContainer.addChild(whiteBgSprite);

    // 4. Create a Reusable Top-to-Bottom Gradient Generator
    function createGradientTex(colors, stops, height) {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const grd = ctx.createLinearGradient(0, 0, 0, height);
        for (let i = 0; i < colors.length; i++) {
            grd.addColorStop(stops[i], colors[i]);
        }
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 1, height);
        return PIXI.Texture.from(canvas);
    }

    const progressGradientTex = createGradientTex(['#3c80c1', '#22abf4', '#3c80c1'],[0, 0.5, 1], 512);
    const bgGradientTex = createGradientTex(['#C4C4C4', '#FFFFFF', '#C4C4C4'],[0, 0.5, 1], 35);

    // 5. Build the Progress Bar Elements
    let barWidth = app.screen.width * 0.8;
    const barHeight = 50;
    const radius = 16;

    const barContainer = new PIXI.Container();
    uiContainer.addChild(barContainer);

    // --- A. Setup Empty Masks and Sprites ---
    const maskGraphics = new CanvasGraphics(true);
    const bgMaskSprite = new PIXI.Sprite();
    const staticMaskSprite = new PIXI.Sprite();
    const sliderMaskSprite = new PIXI.Sprite();

    // --- B. The Shadow Layer ---
    const shadowGraphics = new CanvasGraphics(true);
    const shadowSprite = new PIXI.Sprite();
    const shadowBlur = new PIXI.BlurFilter();
    shadowBlur.blur = 1;
    shadowSprite.filters = [shadowBlur];
    barContainer.addChild(shadowSprite);

    // --- C. The Unfilled Background Bar ---
    const bgBarContainer = new PIXI.Container();
    barContainer.addChild(bgBarContainer);

    const bgFillSprite = new PIXI.Sprite(bgGradientTex);
    bgFillSprite.height = barHeight;
    bgBarContainer.addChild(bgFillSprite);

    bgBarContainer.addChild(bgMaskSprite);
    bgFillSprite.mask = bgMaskSprite;

    const bgStrokeGraphics = new CanvasGraphics(true);
    const bgStrokeSprite = new PIXI.Sprite();
    barContainer.addChild(bgStrokeSprite);

    // --- D. The Static Window Mask ---
    barContainer.addChild(staticMaskSprite);

    // --- E. The Moving Slider Container ---
    const sliderContainer = new PIXI.Container();
    sliderContainer.mask = staticMaskSprite;
    barContainer.addChild(sliderContainer);

    const fillBar = new PIXI.Sprite(progressGradientTex);
    fillBar.height = barHeight;
    sliderContainer.addChild(fillBar);

    sliderContainer.addChild(sliderMaskSprite);
    fillBar.mask = sliderMaskSprite;

    // 6. Add Text and Dynamic Notes Particle System
    const textStyle = new PIXI.TextStyle({
        fontFamily: 'OrchestraFont',
        fontSize: 70,
        fill: '#2c7dc6',
        padding: 15,
    });

    const titleText = new PIXI.Text('Ορχήστρα', textStyle);
    uiContainer.addChild(titleText);

    const noteTextures = [
        PIXI.Texture.from('assets/note1.png'),
        PIXI.Texture.from('assets/note2.png')
    ];

    const activeNotes = [];
    let noteSpawnTimer = 0;

    function spawnNote(side) {
        const randomTexture = noteTextures[Math.floor(Math.random() * noteTextures.length)];
        const note = new PIXI.Sprite(randomTexture);
        note.anchor.set(0.5);

        const baseScale = 0.45 + Math.random() * 0.1;
        note.scale.set(baseScale, baseScale);
        note.alpha = 0;

        note.animData = {
            side: side,
            offsetX: (side === 'left' ? -40 : titleText.width + 40) + (Math.random() * 30 - 15),
            offsetY: (titleText.height / 2) + 10 + (Math.random() * 10),
            time: Math.random() * 100,
            speedY: 1 + Math.random() * 0.2,
            life: 1.0
        };

        uiContainer.addChildAt(note, uiContainer.getChildIndex(titleText));
        activeNotes.push(note);
    }

    spawnNote('left');
    activeNotes[activeNotes.length - 1].animData.life = 0.6;
    activeNotes[activeNotes.length - 1].animData.offsetY -= 20;

    spawnNote('right');
    activeNotes[activeNotes.length - 1].animData.life = 0.6;
    activeNotes[activeNotes.length - 1].animData.offsetY -= 20;

    // 7. Custom GLSL Linear Burn Shader
    const linearBurnShader = `
        varying vec2 vTextureCoord;
        uniform sampler2D uSampler;     
        uniform sampler2D bgSampler;    
        
        uniform vec2 bgScale;
        uniform vec2 bgOffset; // NEW: Added offset uniform
        uniform float res;
        uniform float canvasHeight;
        
        void main() {
            vec4 ui = texture2D(uSampler, vTextureCoord);
            vec2 fragCoordPhysical = vec2(gl_FragCoord.x, canvasHeight - gl_FragCoord.y);
            
            // NEW: Subtract the offset before dividing by scale
            vec2 bgUV = (fragCoordPhysical - bgOffset) / bgScale; 
            vec4 bg = texture2D(bgSampler, bgUV);
            
            vec3 burned = max(bg.rgb * ui.a + ui.rgb - ui.a, 0.0);
            gl_FragColor = vec4(burned, ui.a);
        }
    `;

    const burnFilter = new PIXI.Filter(null, linearBurnShader, {
        bgSampler: bgTexture,
        bgScale: [window.innerWidth, window.innerHeight],
        bgOffset: [0, 0], // NEW: Initialize offset
        res: app.renderer.resolution,
        canvasHeight: app.view.height
    });

    uiContainer.filters = [burnFilter];

    // 8. Positioning and Resizing Logic
    function resize() {
        let scale = 1;
        if (bgTexture.width > 1) {
            // This already achieves object-fit: cover
            scale = Math.max(app.screen.width / bgTexture.width, app.screen.height / bgTexture.height);
            bgSprite.scale.set(scale);
        } else {
            bgTexture.baseTexture.once('loaded', resize);
        }

        // NEW: Calculate horizontal center offset
        const bgX = (app.screen.width - (bgTexture.width * scale)) / 2;

        // Apply object-position: center top
        bgSprite.x = bgX;
        bgSprite.y = 0;

        whiteBgSprite.width = app.screen.width;
        whiteBgSprite.height = app.screen.height;

        const res = app.renderer.resolution;
        burnFilter.uniforms.bgScale = [bgTexture.width * scale * res, bgTexture.height * scale * res];

        // NEW: Pass the physical pixel offset to the shader
        burnFilter.uniforms.bgOffset = [bgX * res, 0];

        burnFilter.uniforms.res = res;
        burnFilter.uniforms.canvasHeight = app.view.height;

        barWidth = app.screen.width * 0.8;

        maskGraphics.reset();
        maskGraphics.roundRect(0, 0, barWidth, barHeight, radius).fill(0xffffff);
        const maskTexture = maskGraphics.renderTexture();
        const maskOffsetX = maskGraphics.bounds.minX - 2;
        const maskOffsetY = maskGraphics.bounds.minY - 2;

        bgMaskSprite.texture = maskTexture;
        bgMaskSprite.position.set(maskOffsetX, maskOffsetY);

        staticMaskSprite.texture = maskTexture;
        staticMaskSprite.position.set(maskOffsetX, maskOffsetY);

        sliderMaskSprite.texture = maskTexture;
        sliderMaskSprite.position.set(maskOffsetX, maskOffsetY);

        shadowGraphics.reset();
        const shadowExpand = 6;
        shadowGraphics.roundRect(
            -shadowExpand / 2,
            -shadowExpand / 2,
            barWidth + shadowExpand,
            barHeight + shadowExpand,
            radius + shadowExpand / 2
        ).fill({ color: 0x000000, alpha: 0.35 });
        shadowSprite.texture = shadowGraphics.renderTexture();

        const shadowOffsetX = -4;
        const shadowOffsetY = 10;
        shadowSprite.position.set(
            shadowGraphics.bounds.minX - 2 + shadowOffsetX,
            shadowGraphics.bounds.minY - 2 + shadowOffsetY
        );

        bgFillSprite.width = barWidth;
        fillBar.width = barWidth;

        bgStrokeGraphics.reset();
        bgStrokeGraphics.roundRect(0, 0, barWidth, barHeight, radius).stroke({ width: 2, color: 0x3079bf });
        bgStrokeSprite.texture = bgStrokeGraphics.renderTexture();
        bgStrokeSprite.position.set(bgStrokeGraphics.bounds.minX - 2, bgStrokeGraphics.bounds.minY - 2);

        barContainer.x = (app.screen.width - barWidth) / 2;
        barContainer.y = app.screen.height / 2 + 20;

        titleText.x = (app.screen.width - titleText.width) / 2;
        titleText.y = barContainer.y - 120;
    }

    let resizeTimeout = null;
    function scheduleResize() {
        if (resizeTimeout !== null) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            resizeTimeout = null;
            resize();
        }, 10);
    }

    window.addEventListener('resize', scheduleResize);
    resize();

    // 9. API Integration
    let measureMap = {};
    let orchestraStartIndex = -1;
    let orchestraEndIndex = -1;
    let targetProgress = 0; // The actual mapped progress tracked by API
    let progress = 0;       // The smoothly interpolated current visual progress

    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data) return;

        // A. Handle Map Ingestion - Find the target section
        if (data.type === 'page-measure-map') {
            measureMap = data.measures || {};
            orchestraStartIndex = -1;
            orchestraEndIndex = -1;

            // Get numerical indices and sort them to guarantee sequential order
            const indices = Object.keys(measureMap).map(Number).sort((a, b) => a - b);

            for (let i = 0; i < indices.length; i++) {
                const idx = indices[i];
                if (measureMap[idx].type === 'orchestra') {
                    if (orchestraStartIndex === -1) {
                        // Found the start!
                        orchestraStartIndex = idx;
                        orchestraEndIndex = idx;
                    } else if (idx === orchestraEndIndex + 1) {
                        // It is a contiguous block, expand the end index
                        orchestraEndIndex = idx;
                    } else {
                        // Break if we've already found a block but there's a gap
                        break;
                    }
                } else if (orchestraStartIndex !== -1) {
                    // Reached the end of the first contiguous block
                    break;
                }
            }
        }

        // B. Update Timeline Progress - Map it to our specific block
        else if (data.type === 'timeline-progress') {
            if (orchestraStartIndex === -1) {
                targetProgress = 0;
                return;
            }

            const currentIndex = data.measure.index;
            const measureProgress = data.measure.progress;

            if (currentIndex < orchestraStartIndex) {
                targetProgress = 0;
            } else if (currentIndex > orchestraEndIndex) {
                targetProgress = 1;
            } else {
                // Calculate progress through the targeted block
                const totalMeasures = (orchestraEndIndex - orchestraStartIndex) + 1;
                const measureOffset = currentIndex - orchestraStartIndex;
                targetProgress = (measureOffset + measureProgress) / totalMeasures;
            }
        }
    });

    // 10. Animate Progress & Floating Music Notes
    app.ticker.add((delta) => {
        // Smoothly ease the visual progress towards the API's target progress
        progress += (targetProgress - progress) * 0.1 * delta;

        // Move slider seamlessly
        sliderContainer.x = -barWidth + (barWidth * progress);

        // --- Handle Note Spawning ---
        noteSpawnTimer += delta;
        if (noteSpawnTimer > 30) {
            noteSpawnTimer = 0;
            spawnNote('left');
            spawnNote('right');
        }

        // --- Handle Floating Animation & Fade Lifecycles ---
        for (let i = activeNotes.length - 1; i >= 0; i--) {
            const note = activeNotes[i];
            const data = note.animData;

            data.life -= 0.009 * delta;
            data.offsetY -= data.speedY * delta;
            data.time += 0.04 * delta;

            const t = Math.max(0, (0.8 - data.life) / 0.8);

            note.x = titleText.x + data.offsetX + Math.sin(data.time) * 12 * t;
            note.y = titleText.y + data.offsetY;
            note.rotation = Math.sin(data.time * 0.8) * 0.4 * t;

            if (data.life > 0.8) {
                note.alpha = (1.0 - data.life) / 0.4;
            } else if (data.life < 0.4) {
                note.alpha = data.life / 0.4;
            } else {
                note.alpha = 1;
            }

            if (data.life <= 0) {
                uiContainer.removeChild(note);
                note.destroy();
                activeNotes.splice(i, 1);
            }
        }
    });
}