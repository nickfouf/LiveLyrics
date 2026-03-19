class CanvasGraphics {
    static _textureCache = new Map();

    constructor(useCache = true) {
        this._useCache = useCache;
        this.reset();
    }

    static clearCache() {
        CanvasGraphics._textureCache.forEach(texture => texture.destroy(true));
        CanvasGraphics._textureCache.clear();
    }

    reset() {
        this._instructions = [];
        this._pendingPath = [];
        this._bounds = this._createEmptyBounds();
        this._hasBounds = false;
    }

    moveTo(x, y) {
        this._updateBoundsPoint(x, y);
        this._pendingPath.push({ type: "moveTo", args: [x, y] });
        return this;
    }

    lineTo(x, y) {
        this._updateBoundsPoint(x, y);
        this._pendingPath.push({ type: "lineTo", args: [x, y] });
        return this;
    }

    quadraticCurveTo(cpX, cpY, x, y) {
        this._updateBoundsPoint(cpX, cpY);
        this._updateBoundsPoint(x, y);
        this._pendingPath.push({ type: "quadraticCurveTo", args: [cpX, cpY, x, y] });
        return this;
    }

    bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, x, y) {
        this._updateBoundsPoint(cp1X, cp1Y);
        this._updateBoundsPoint(cp2X, cp2Y);
        this._updateBoundsPoint(x, y);
        this._pendingPath.push({ type: "bezierCurveTo", args: [cp1X, cp1Y, cp2X, cp2Y, x, y] });
        return this;
    }

    closePath() {
        this._pendingPath.push({ type: "closePath", args: [] });
        return this;
    }

    roundRect(x, y, w, h, radius) {
        this._updateBoundsRect(x, y, w, h);
        this._pendingPath.push({ type: "roundRect", args: [x, y, w, h, radius] });
        return this;
    }

    rect(x, y, w, h) {
        this._updateBoundsRect(x, y, w, h);
        this._pendingPath.push({ type: "rect", args: [x, y, w, h] });
        return this;
    }

    circle(x, y, radius) {
        this._updateBoundsRect(x - radius, y - radius, radius * 2, radius * 2);
        this._pendingPath.push({ type: "arc", args: [x, y, radius, 0, Math.PI * 2] });
        return this;
    }

    arc(x, y, radius, startAngle, endAngle, counterclockwise = false) {
        this._updateBoundsRect(x - radius, y - radius, radius * 2, radius * 2);
        this._pendingPath.push({ type: "arc", args: [x, y, radius, startAngle, endAngle, counterclockwise ? 1 : 0] });
        return this;
    }

    fill(colorOrOptions) {
        let color = 0x000000;
        let alpha = 1;
        let preservePath = false;

        if (typeof colorOrOptions === "object" && colorOrOptions !== null) {
            color = colorOrOptions.color !== undefined
                ? (typeof colorOrOptions.color === "string" ? 0 : colorOrOptions.color)
                : 0x000000;
            alpha = colorOrOptions.alpha ?? 1;
            preservePath = !!colorOrOptions.preservePath;
        } else if (typeof colorOrOptions === "number") {
            color = colorOrOptions;
        }

        const cssColor = this._parseColor(color, alpha);
        if (this._pendingPath.length === 0) return this;

        this._instructions.push({
            action: "fill",
            style: cssColor,
            path: [...this._pendingPath],
        });

        if (!preservePath) this._pendingPath = [];
        return this;
    }

    stroke(options = {}) {
        const width = options.width ?? 1;
        const color = options.color ?? 0x000000;
        const alpha = options.alpha ?? 1;
        const preservePath = !!options.preservePath;
        const cssColor = this._parseColor(color, alpha);

        if (this._pendingPath.length === 0) return this;

        const halfWidth = width / 2;
        this._bounds.minX -= halfWidth;
        this._bounds.minY -= halfWidth;
        this._bounds.maxX += halfWidth;
        this._bounds.maxY += halfWidth;

        this._instructions.push({
            action: "stroke",
            style: cssColor,
            lineWidth: width,
            lineCap: options.cap || "butt",
            lineJoin: options.join || "miter",
            path: [...this._pendingPath],
        });

        if (!preservePath) this._pendingPath = [];
        return this;
    }

    renderTexture() {
        if (!this._hasBounds || this._instructions.length === 0) {
            return PIXI.Texture.EMPTY;
        }

        let cacheKey = null;

        if (this._useCache) {
            cacheKey = JSON.stringify(this._instructions);
            if (CanvasGraphics._textureCache.has(cacheKey)) {
                return CanvasGraphics._textureCache.get(cacheKey);
            }
        }

        const padding = 2;
        const width = Math.ceil(this._bounds.maxX - this._bounds.minX) + padding * 2;
        const height = Math.ceil(this._bounds.maxY - this._bounds.minY) + padding * 2;

        if (width <= 0 || height <= 0) return PIXI.Texture.EMPTY;

        let canvas;
        if (typeof OffscreenCanvas !== "undefined") {
            canvas = new OffscreenCanvas(width, height);
        } else {
            canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("CanvasGraphics: Failed to get 2D context.");

        const offsetX = -this._bounds.minX + padding;
        const offsetY = -this._bounds.minY + padding;

        ctx.translate(offsetX, offsetY);

        for (const instruction of this._instructions) {
            ctx.beginPath();
            for (const cmd of instruction.path) {
                switch (cmd.type) {
                    case "moveTo": ctx.moveTo(cmd.args[0], cmd.args[1]); break;
                    case "lineTo": ctx.lineTo(cmd.args[0], cmd.args[1]); break;
                    case "quadraticCurveTo": ctx.quadraticCurveTo(cmd.args[0], cmd.args[1], cmd.args[2], cmd.args[3]); break;
                    case "bezierCurveTo": ctx.bezierCurveTo(cmd.args[0], cmd.args[1], cmd.args[2], cmd.args[3], cmd.args[4], cmd.args[5]); break;
                    case "closePath": ctx.closePath(); break;
                    case "rect": ctx.rect(cmd.args[0], cmd.args[1], cmd.args[2], cmd.args[3]); break;
                    case "roundRect":
                        if ("roundRect" in ctx && typeof ctx.roundRect === "function") {
                            ctx.roundRect(cmd.args[0], cmd.args[1], cmd.args[2], cmd.args[3], cmd.args[4]);
                        } else {
                            ctx.rect(cmd.args[0], cmd.args[1], cmd.args[2], cmd.args[3]);
                        }
                        break;
                    case "arc": ctx.arc(cmd.args[0], cmd.args[1], cmd.args[2], cmd.args[3], cmd.args[4], !!cmd.args[5]); break;
                }
            }

            if (instruction.action === "fill") {
                ctx.fillStyle = instruction.style;
                ctx.fill();
            } else {
                ctx.strokeStyle = instruction.style;
                ctx.lineWidth = instruction.lineWidth || 1;
                ctx.lineCap = instruction.lineCap || "butt";
                ctx.lineJoin = instruction.lineJoin || "miter";
                ctx.stroke();
            }
        }

        const texture = PIXI.Texture.from(canvas);

        if (this._useCache && cacheKey) {
            CanvasGraphics._textureCache.set(cacheKey, texture);
        }

        return texture;
    }

    get bounds() {
        return { ...this._bounds };
    }

    _createEmptyBounds() {
        return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    }

    _updateBoundsPoint(x, y) {
        if (x < this._bounds.minX) this._bounds.minX = x;
        if (y < this._bounds.minY) this._bounds.minY = y;
        if (x > this._bounds.maxX) this._bounds.maxX = x;
        if (y > this._bounds.maxY) this._bounds.maxY = y;
        this._hasBounds = true;
    }

    _updateBoundsRect(x, y, w, h) {
        this._updateBoundsPoint(x, y);
        this._updateBoundsPoint(x + w, y + h);
    }

    _parseColor(color, alpha = 1) {
        if (typeof color === "string") return color;
        const r = (color >> 16) & 0xff;
        const g = (color >> 8) & 0xff;
        const b = color & 0xff;
        return `rgba(${r},${g},${b},${alpha})`;
    }
}

