import { Application, Container, Graphics, BlurFilter, Color, Sprite, NoiseFilter, DisplacementFilter, Texture } from 'pixi.js';
import { assetCache, type AssetEntry } from './AssetCache';
import { buildColorKey, type SvgRecolorOptions } from '../utils/svgRecolor';
import { GlowFilter } from 'pixi-filters/glow';
import { ShockwaveFilter } from 'pixi-filters/shockwave';
import { TwistFilter } from 'pixi-filters/twist';
import { BulgePinchFilter } from 'pixi-filters/bulge-pinch';
import { MotionBlurFilter } from 'pixi-filters/motion-blur';
import { AdvancedBloomFilter } from 'pixi-filters/advanced-bloom';
import { ColorOverlayFilter } from 'pixi-filters/color-overlay';
import { interpolateGeneric } from '../utils/interpolation';
import { updatePrimitive } from '../rendering/PrimitiveRenderer';
import { createGradientTexture } from '../utils/gradients';
import type { Project, AnimatableProperties } from '../types';
import { DEFAULT_ANIMATABLES } from '../constants/defaults';
import { ASTRO_PATHS } from '../data/astro';
import { AMINO_PATHS } from '../data/amino';

export class GeometryRenderer {
    private layerCache: Map<string, Container> = new Map();
    private graphicsPool: Graphics[] = [];
    private containerPool: Container[] = [];
    private displacementTexture: Texture | null = null;
    private displacementSprite: Sprite | null = null;

    private getDisplacementTexture(): Texture {
        if (!this.displacementTexture) {
            // Create a noise texture for displacement
            const size = 512;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Determine number of cells for the grid
                const gridSize = 64; // Size of each cell
                const rows = size / gridSize;
                const cols = size / gridSize;

                // Loop through each cell
                for (let y = 0; y < rows; y++) {
                    for (let x = 0; x < cols; x++) {
                        // Generate a random grayscale color
                        // We want smooth transitions, but for simple 'wavy' noise, random blocks or gradients work.
                        // Let's do simple random gradient circles for a 'cloudy' look
                        const gray = Math.floor(Math.random() * 255);
                        ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
                        ctx.fillRect(x * gridSize, y * gridSize, gridSize, gridSize);
                    }
                }
                // Optional: Blur the canvas to make it wavy instead of blocky
                ctx.filter = 'blur(20px)';
                ctx.drawImage(canvas, 0, 0);
                ctx.filter = 'none';
            }
            this.displacementTexture = Texture.from(canvas);
            this.displacementTexture.source.style.addressMode = 'repeat'; // Ensure it wraps
        }
        return this.displacementTexture;
    }

    constructor() { }

    private getGraphics(): Graphics {
        const g = this.graphicsPool.pop();
        if (g) {
            g.clear();
            g.visible = true;
            g.alpha = 1;
            g.rotation = 0;
            g.scale.set(1);
            g.position.set(0);
            g.filters = [];
            g.mask = null;
            return g;
        }
        return new Graphics();
    }

    private getContainer(): Container {
        const c = this.containerPool.pop();
        if (c) {
            c.removeChildren();
            c.visible = true;
            c.renderable = true;
            c.alpha = 1;
            c.rotation = 0;
            c.scale.set(1);
            c.position.set(0);
            c.filters = [];
            c.mask = null;
            return c;
        }
        return new Container();
    }

    private returnObject(obj: Container | Graphics | Sprite) {
        if (obj.mask) {
            obj.mask = null;
        }

        if (obj instanceof Sprite) {
            obj.destroy();
        } else if (obj instanceof Graphics) {
            this.graphicsPool.push(obj);
        } else if (obj instanceof Container) {
            obj.children.forEach(child => this.returnObject(child as Container | Graphics | Sprite));
            obj.removeChildren();
            this.containerPool.push(obj);
        }
    }

    public render(app: Application, project: Project, currentTime: number, isPlaying: boolean = true) {
        if (!app.renderer) return;

        // 1. Clear Stage Background
        app.renderer.background.color = new Color(project.backgroundColor || '#000000');

        const activeLayerIds = new Set<string>();

        // Recursive Render Function
        const renderRecursive = (layer: any, parentContainer: Container, ambientStyles?: any) => {
            if (!layer.visible) return;

            let activeTime = currentTime;
            let shouldRender = false;

            if (layer.config.loopIndependently) {
                const duration = layer.timeline.end - layer.timeline.start;
                if (currentTime >= layer.timeline.start && duration > 0) {
                    const timeSinceStart = currentTime - layer.timeline.start;
                    activeTime = layer.timeline.start + (timeSinceStart % duration);
                    shouldRender = true;
                } else if (currentTime >= layer.timeline.start) {
                    // Fallback for zero-duration looping: just render at start time
                    activeTime = layer.timeline.start;
                    shouldRender = true;
                }
            } else {
                if (currentTime >= layer.timeline.start && currentTime <= layer.timeline.end) {
                    shouldRender = true;
                } else if (layer.config.persistVisible && currentTime > layer.timeline.end) {
                    activeTime = layer.timeline.end;
                    shouldRender = true;
                }
            }

            if (!shouldRender) return;

            activeLayerIds.add(layer.id);

            // Get or Create Container for this Layer
            let layerContainer = this.layerCache.get(layer.id);
            if (!layerContainer) {
                layerContainer = new Container();
                this.layerCache.set(layer.id, layerContainer);
            }

            // Allow container to be re-added to correct parent/position
            parentContainer.addChild(layerContainer);

            // --- INTERPOLATION ---
            const interpolatedProps = interpolateGeneric<AnimatableProperties>(
                activeTime,
                layer.timeline.start,
                layer.keyframes
            );
            const currentProps = { ...DEFAULT_ANIMATABLES, ...interpolatedProps };

            // Access interpolated values
            const currentRadiusX = currentProps.radiusX ?? 100;
            const currentRadiusY = currentProps.radiusY ?? 100;
            const orbitRadius = currentProps.orbitRadius ?? 0;
            let opacityVal = currentProps.opacity ?? 255;

            // Apply Fade In / Out Logic (Layer level override)
            if (isPlaying) {
                const timeInto = activeTime - layer.timeline.start;
                const timeRemaining = layer.timeline.end - activeTime;

                // Fade In
                if (layer.fadeIn?.enabled && layer.fadeIn.duration > 0) {
                    if (timeInto < layer.fadeIn.duration) {
                        opacityVal *= (timeInto / layer.fadeIn.duration);
                    }
                }

                // Fade Out
                if (layer.fadeOut?.enabled && layer.fadeOut.duration > 0) {
                    if (timeRemaining < layer.fadeOut.duration) {
                        opacityVal *= (timeRemaining / layer.fadeOut.duration);
                    }
                }
            }

            const opacity = opacityVal;
            const currentRotateShape = currentProps.rotateShape ?? 0;
            const currentRotateLayer = currentProps.rotateLayer ?? 0;
            const currentPosX = currentProps.posX ?? 0;
            const currentPosY = currentProps.posY ?? 0;

            const currentStrokeWeight = ambientStyles?.strokeWeight ?? currentProps.strokeWeight ?? 1;

            const currentRotateX = currentProps.rotateX ?? 0;
            const currentRotateY = currentProps.rotateY ?? 0;

            const globalRotation = currentProps.rotateGlobal ?? 0;

            const currentBlur = currentProps.blur ?? 0;
            const currentGlowStrength = currentProps.glowStrength ?? 0;
            const currentNoise = currentProps.noise ?? 0;
            const currentDisplacement = currentProps.displacementScale ?? 0;
            const currentShockwave = currentProps.shockwaveTime ?? 0;
            const currentTwist = currentProps.twistAngle ?? 0;
            const currentTwistRadius = currentProps.twistRadius ?? 200;
            const currentTwistOffsetX = currentProps.twistOffsetX ?? 0;
            const currentTwistOffsetY = currentProps.twistOffsetY ?? 0;

            const currentBulge = currentProps.bulgeStrength ?? 0;
            const currentBulgeRadius = currentProps.bulgeRadius ?? 200;
            const currentBulgeCenterX = currentProps.bulgeCenterX ?? 0;
            const currentBulgeCenterY = currentProps.bulgeCenterY ?? 0;

            const currentMotionBlur = currentProps.motionBlurStrength ?? 0;

            const currentRadiusOffset = currentProps.radiusOffset ?? 0;
            const currentOffsetMult = currentProps.offsetMult ?? 0;
            const currentSpacingX = currentProps.spacingX ?? 0;
            const currentSpacingY = currentProps.spacingY ?? 0;
            const currentInstanceRotation = currentProps.instanceRotation ?? 0;
            const currentInstanceRotationMult = currentProps.instanceRotationMult ?? 0;

            // Group 2 Interpolated Values
            const currentSpacingX2 = currentProps.spacingX2 ?? 0;
            const currentSpacingY2 = currentProps.spacingY2 ?? 0;
            const currentOrbitRadius2 = currentProps.orbitRadius2 ?? 0;
            const currentRotateOrbit2 = currentProps.rotateOrbit2 ?? 0;
            const currentRadiusOffset2 = currentProps.radiusOffset2 ?? 0;
            const currentOffsetMult2 = currentProps.offsetMult2 ?? 0;
            const currentInstanceRotation2 = currentProps.instanceRotation2 ?? 0;
            const currentInstanceRotationMult2 = currentProps.instanceRotationMult2 ?? 0;

            const currentStarInnerRadius = currentProps.starInnerRadius ?? layer.config.starInnerRadius ?? 0.5;
            const currentShapeArc = currentProps.shapeArc ?? layer.config.shapeArc ?? 360;
            // Handle Perspective (default 1200, avoid 0 which happens if interpolated from undefined)
            let pVal = currentProps.perspective ?? 1200;
            if (pVal < 10) pVal = 1200;
            const currentPerspective = pVal;

            // Position Logic
            let baseX = 0;
            let baseY = 0;
            if (!layer.parentId) {
                baseX = app.screen.width / 2;
                baseY = app.screen.height / 2;
            }

            if (layer.type === 'group') {
                baseX += currentPosX;
                baseY += currentPosY;
            }

            layerContainer.position.set(baseX, baseY);
            layerContainer.pivot.set(0, 0);

            let finalRotation = currentRotateLayer;
            if (layer.type === 'group') {
                finalRotation += globalRotation;
            }
            layerContainer.rotation = finalRotation * (Math.PI / 180);
            layerContainer.alpha = (ambientStyles?.opacity ?? opacity) / 255;

            const zoom = (!layer.parentId) ? (project.zoom || 1) : 1;

            // Group Scale Logic (using RadiusX/Y as Scale %)
            let scaleX = 1;
            let scaleY = 1;

            if (layer.type === 'group') {
                const sx = currentRadiusX ?? 100;
                const sy = currentRadiusY ?? 100;
                scaleX = sx / 100;
                scaleY = sy / 100;
            }

            layerContainer.scale.set(zoom * scaleX, zoom * scaleY);

            const rendererResolution = window.devicePixelRatio || 1;

            const filters = [];
            if (currentBlur > 0) {
                filters.push(new BlurFilter({ strength: currentBlur, quality: 4, resolution: rendererResolution }));
            }
            if (currentGlowStrength > 0) {
                const glow = new GlowFilter({ distance: 15, outerStrength: currentGlowStrength, innerStrength: 0, color: 0xffffff, quality: 0.1 });
                glow.resolution = rendererResolution;
                filters.push(glow);
            }
            if (currentNoise > 0) {
                filters.push(new NoiseFilter({ noise: currentNoise, seed: Math.random(), resolution: rendererResolution }));
            }

            if (currentDisplacement > 0) {
                if (!this.displacementSprite) {
                    const tex = this.getDisplacementTexture();
                    this.displacementSprite = new Sprite(tex);
                    this.displacementSprite.anchor.set(0.5);
                }

                if (this.displacementSprite) {
                    this.displacementSprite.x += 1;
                    this.displacementSprite.y += 1;
                    filters.push(new DisplacementFilter({ sprite: this.displacementSprite, scale: currentDisplacement, resolution: rendererResolution }));
                }
            }

            if (currentShockwave > 0) {
                const sw = new ShockwaveFilter({
                    center: { x: 0, y: 0 },
                    radius: -1,
                    wavelength: 160,
                    amplitude: 30,
                    speed: 500,
                    time: currentShockwave
                });
                sw.resolution = rendererResolution;
                filters.push(sw);
            }
            if (currentTwist !== 0) {
                const tw = new TwistFilter({
                    angle: currentTwist,
                    radius: currentTwistRadius,
                    offset: { x: currentTwistOffsetX, y: currentTwistOffsetY },
                    padding: 50
                });
                tw.resolution = rendererResolution;
                filters.push(tw);
            }
            if (currentBulge !== 0) {
                const normalizedCenterX = 0.5 + (currentBulgeCenterX / 1000);
                const normalizedCenterY = 0.5 + (currentBulgeCenterY / 1000);

                const bp = new BulgePinchFilter({
                    center: { x: normalizedCenterX, y: normalizedCenterY },
                    radius: currentBulgeRadius,
                    strength: currentBulge
                });
                bp.resolution = rendererResolution;
                bp.padding = 500;
                filters.push(bp);
            }
            if (currentMotionBlur > 0) {
                const mb = new MotionBlurFilter({
                    velocity: { x: currentMotionBlur * 10, y: currentMotionBlur * 10 }
                });
                mb.resolution = rendererResolution;
                filters.push(mb);
            }

            const currentBloomStrength = currentProps.bloomStrength ?? 0;
            if (currentBloomStrength > 0) {
                const bloom = new AdvancedBloomFilter({
                    threshold: currentProps.bloomThreshold ?? 0.1,
                    bloomScale: currentProps.bloomStrength ?? 1,
                    brightness: currentProps.bloomStrength ?? 1,
                    blur: currentProps.bloomRadius ?? 2,
                    quality: 4
                });
                bloom.resolution = rendererResolution;
                filters.push(bloom);
            }

            layerContainer.filters = filters;

            if (layerContainer.children.length > 0) {
                const removed = layerContainer.removeChildren();
                if (layer.type !== 'group') {
                    removed.forEach(child => this.returnObject(child as Container | Graphics));
                }
            }

            // --- AMBIENT STYLE PROPAGATION ---
            let nextAmbientStyles = ambientStyles;
            if (layer.type === 'group' && layer.config.styleOverrideEnabled) {
                nextAmbientStyles = {
                    ...ambientStyles,
                    // Colors
                    strokeColor: layer.config.strokeColor,
                    fillColor: layer.config.fillColor,
                    // Stroke config
                    strokeEnabled: layer.config.strokeEnabled,
                    fillEnabled: layer.config.fillEnabled,
                    strokeWeight: currentStrokeWeight,
                    opacity: opacity,
                    // Dashing
                    strokeStyleType: layer.config.strokeStyleType,
                    dashLength: layer.config.dashLength,
                    gapLength: layer.config.gapLength,
                    // Gradient
                    gradientEnabled: layer.config.gradientEnabled,
                    strokeGradientEnabled: layer.config.strokeGradientEnabled,
                    fillGradientEnabled: layer.config.fillGradientEnabled,
                    gradientStops: layer.config.gradientStops,
                };
            }

            // If GROUP -> Recursively Render Children
            if (layer.type === 'group') {
                const children = project.layers
                    .filter(l => l.parentId === layer.id)
                    .reverse();

                children.forEach(child => renderRecursive(child, layerContainer, nextAmbientStyles));
                return;
            }

            // Wrapper for all content in this layer
            const contentWrapper = this.getContainer();

            // EFFECTIVE CONFIG (Ambient styles win if present)
            const effectiveConfig = ambientStyles ? {
                ...layer.config,
                ...ambientStyles,
                // Ensure interpolated values like opacity/weight are used correctly
            } : layer.config;

            // --- BUILD CONTENT USING POOL ---
            // paintMode controls whether primitive shapes render their fill, stroke,
            // or both. Used by createRenderableUnit when stroke and fill need
            // independent paint (e.g. stroke gradient + flat fill) — the shape is
            // built twice with the gradient mask applied to only the targeted pass.
            // Asset (SVG/PNG) layers ignore paintMode; their fill/stroke painting is
            // driven inside svgRecolor.
            const buildContent = (rotationDeg: number = 0, xVal?: number, yVal?: number, paintMode: 'both' | 'fill-only' | 'stroke-only' = 'both'): Container => {
                const rootWrapper = this.getContainer();

                rootWrapper.x = xVal ?? currentPosX;
                rootWrapper.y = yVal ?? currentPosY;

                if (rotationDeg !== 0) {
                    rootWrapper.rotation = rotationDeg * (Math.PI / 180);
                }

                // Asset-folder contents (empty for non-asset layers).
                const assetFolderAssets: AssetEntry[] =
                    layer.type === 'asset_set' && effectiveConfig.assetFolderId
                        ? assetCache.getAssetsInFolder(effectiveConfig.assetFolderId)
                        : [];

                // Resolve the asset id for this layer at instance index `i` (asset_set cycles
                // through the folder; asset_single always returns the same id).
                const resolveAssetId = (i: number): string | null => {
                    if (layer.type === 'asset_set') {
                        if (!assetFolderAssets.length) return null;
                        const entry = assetFolderAssets[i % assetFolderAssets.length];
                        return entry ? entry.id : null;
                    }
                    if (layer.type === 'asset_single') {
                        return effectiveConfig.assetId ?? null;
                    }
                    return null;
                };

                // Inner Shape Factory
                const createInnerShape = (i: number, level1Progressive: number): Container | Graphics => {
                    const rx = currentRadiusX + i * currentRadiusOffset * level1Progressive;
                    const ry = currentRadiusY + i * currentRadiusOffset * level1Progressive;

                    // Asset-based shapes: SVG → vector Graphics (preserves compound
                    // paths + fill-rule knockouts); raster (PNG/JPEG) → Sprite. Returns
                    // an empty Container placeholder while the asset loads (renderer runs
                    // every tick, so it'll appear on a subsequent frame).
                    if (layer.type === 'asset_set' || layer.type === 'asset_single') {
                        const wrapper = this.getContainer();
                        const id = resolveAssetId(i);
                        if (!id) return wrapper;
                        const mime = assetCache.getMimeType(id);
                        if (!mime) return wrapper; // metadata still loading
                        const targetMax = Math.max(Math.abs(rx), Math.abs(ry)) * 2; // full extent = diameter
                        const recolorOpts: SvgRecolorOptions = {
                            fillEnabled: effectiveConfig.fillEnabled,
                            fillColor: effectiveConfig.fillColor,
                            strokeEnabled: effectiveConfig.strokeEnabled,
                            strokeColor: effectiveConfig.strokeColor,
                            gradientEnabled: effectiveConfig.gradientEnabled,
                            strokeGradientEnabled: effectiveConfig.strokeGradientEnabled,
                            fillGradientEnabled: effectiveConfig.fillGradientEnabled,
                            gradientStops: effectiveConfig.gradientStops,
                        };
                        const colorKey = buildColorKey(recolorOpts);

                        if (mime === 'image/svg+xml') {
                            // Vector path — recolor (if any) is applied by rewriting paint
                            // attributes in the SVG source before parsing into a context.
                            const ctx = colorKey
                                ? assetCache.getGraphicsContextSync(id, colorKey, recolorOpts)
                                : assetCache.getGraphicsContextSync(id);
                            if (!ctx) return wrapper; // source still fetching
                            const graphics = new Graphics(ctx);
                            const bounds = graphics.getLocalBounds();
                            const w = bounds.width;
                            const h = bounds.height;
                            if (w > 0 && h > 0) {
                                graphics.pivot.set(bounds.x + w / 2, bounds.y + h / 2);
                                if (targetMax > 0) {
                                    graphics.scale.set(targetMax / Math.max(w, h));
                                }
                            }
                            graphics.rotation = currentRotateShape * (Math.PI / 180);
                            wrapper.addChild(graphics);
                            return wrapper;
                        }

                        // Raster path — ColorOverlayFilter replaces RGB with fillColor
                        // while preserving alpha, giving a true silhouette recolor
                        // regardless of the source's original colors.
                        const texture = assetCache.getTextureSync(id);
                        if (!texture) return wrapper;
                        const sprite = new Sprite(texture);
                        sprite.anchor.set(0.5);
                        if (effectiveConfig.fillEnabled && effectiveConfig.fillColor) {
                            const colorNum = new Color(effectiveConfig.fillColor).toNumber();
                            sprite.filters = [new ColorOverlayFilter({ color: colorNum, alpha: 1 })];
                        }
                        const texW = texture.width || 1;
                        const texH = texture.height || 1;
                        if (targetMax > 0) {
                            sprite.scale.set(targetMax / Math.max(texW, texH));
                        }
                        sprite.rotation = currentRotateShape * (Math.PI / 180);
                        wrapper.addChild(sprite);
                        return wrapper;
                    }

                    const g = this.getGraphics();

                    let progress = 0;
                    const isIChing = layer.type === 'iching' || layer.type === 'iching_lines';
                    if (isIChing) {
                        const animDuration = effectiveConfig.ichingAnimationDuration ?? 5;
                        if (animDuration > 0) {
                            const timeInto = activeTime - layer.timeline.start;
                            progress = Math.max(0, Math.min(1, timeInto / animDuration));
                        }
                    } else {
                        const duration = layer.timeline.end - layer.timeline.start;
                        if (duration > 0) {
                            const timeInto = activeTime - layer.timeline.start;
                            progress = Math.max(0, Math.min(1, timeInto / duration));
                        }
                    }

                    let renderType = layer.type;
                    let renderConfig = effectiveConfig;

                    if (layer.type === 'astrology') {
                        renderType = 'custom';
                        renderConfig = {
                            ...effectiveConfig,
                            customPath: ASTRO_PATHS[i % 12]
                        };
                    } else if (layer.type === 'amino') {
                        renderType = 'custom';
                        renderConfig = {
                            ...effectiveConfig,
                            customPaths: AMINO_PATHS[i % 20]
                        };
                    } else if (layer.type === 'iching_lines') {
                        renderConfig = {
                            ...effectiveConfig,
                            ichingInputId: (i % 64) + 1
                        };
                    }

                    if (paintMode !== 'both') {
                        renderConfig = {
                            ...renderConfig,
                            fillEnabled: paintMode === 'fill-only' ? renderConfig.fillEnabled : false,
                            strokeEnabled: paintMode === 'stroke-only' ? renderConfig.strokeEnabled : false,
                        };
                    }

                    updatePrimitive(g, renderType as any, rx, ry, renderConfig.sides, 0, renderConfig, progress, currentStrokeWeight, currentShapeArc, currentStarInnerRadius, currentRotateX, currentRotateY, currentPerspective);
                    g.rotation = currentRotateShape * (Math.PI / 180);
                    return g;
                };

                // Generic Instance Loop Helper
                const createInstanceGroup = (
                    createChild: (index: number, progressiveFn: number) => Container | Graphics,
                    count: number,
                    params: {
                        spacingX: number, spacingY: number,
                        orbitRadius: number, rotateOrbit: number,
                        radiusOffset: number, offsetMult: number,
                        radialArc: number, alignToPath: boolean,
                        instanceRotation: number, instanceRotationMult: number
                    }
                ) => {
                    const container = this.getContainer();
                    const arc = params.radialArc || 360;
                    const step = (arc === 360 || count <= 1) ? arc / count : arc / (count - 1);

                    for (let i = 0; i < count; i++) {
                        const positionAngle = (step * i + params.rotateOrbit) * (Math.PI / 180);
                        const radX = Math.cos(positionAngle) * params.orbitRadius;
                        const radY = Math.sin(positionAngle) * params.orbitRadius;
                        const linX = i * params.spacingX;
                        const linY = i * params.spacingY;
                        const progressive = params.offsetMult !== 0 ? (1 + i * params.offsetMult) : 1;
                        const rotationProgressive = params.instanceRotationMult !== 0 ? (1 + i * params.instanceRotationMult) : 1;
                        const child = createChild(i, progressive);
                        child.x = radX + linX;
                        child.y = radY + linY;
                        if (params.alignToPath) {
                            child.rotation += positionAngle;
                        }
                        child.rotation += (i * params.instanceRotation * rotationProgressive) * (Math.PI / 180);
                        container.addChild(child);
                    }
                    return container;
                };

                const count1 = layer.type === 'astrology' ? 12
                    : layer.type === 'amino' ? 20
                    : layer.type === 'iching_lines' ? 64
                    : layer.type === 'asset_set' ? Math.max(1, assetFolderAssets.length)
                    : Math.max(1, layer.config.instances);
                const params1 = {
                    spacingX: currentSpacingX,
                    spacingY: currentSpacingY,
                    orbitRadius: orbitRadius,
                    rotateOrbit: currentProps.rotateOrbit ?? 0,
                    radiusOffset: currentRadiusOffset,
                    offsetMult: currentOffsetMult,
                    radialArc: layer.config.radialArc,
                    alignToPath: layer.config.alignToPath,
                    instanceRotation: currentInstanceRotation,
                    instanceRotationMult: currentInstanceRotationMult
                };

                const count2 = Math.max(1, layer.config.instances2 || 1);
                const params2 = {
                    spacingX: currentSpacingX2,
                    spacingY: currentSpacingY2,
                    orbitRadius: currentOrbitRadius2,
                    rotateOrbit: currentRotateOrbit2,
                    radiusOffset: currentRadiusOffset2,
                    offsetMult: currentOffsetMult2,
                    radialArc: layer.config.radialArc2,
                    alignToPath: layer.config.alignToPath2,
                    instanceRotation: currentInstanceRotation2,
                    instanceRotationMult: currentInstanceRotationMult2
                };

                const createLevel1 = (_idx2: number, _prog2: number) => {
                    return createInstanceGroup((idx1, prog1) => createInnerShape(idx1, prog1), count1, params1);
                };

                if (count2 > 1) {
                    const level2Container = createInstanceGroup(createLevel1, count2, params2);
                    rootWrapper.addChild(level2Container);
                } else {
                    const level1Container = createLevel1(0, 1);
                    rootWrapper.addChild(level1Container);
                }

                return rootWrapper;
            };

            const createRenderableUnit = (rotationDeg: number = 0, xVal?: number, yVal?: number): Container => {
                const wrapper = this.getContainer();

                // Per-target gradient flags, falling back to the legacy layer-level
                // gradientEnabled (which meant "applies to both") when unset.
                const legacyGrad = effectiveConfig.gradientEnabled ?? false;
                const sg = effectiveConfig.strokeGradientEnabled ?? legacyGrad;
                const fg = effectiveConfig.fillGradientEnabled ?? legacyGrad;
                const stops = effectiveConfig.gradientStops;
                const hasGradient = (sg || fg) && !!stops && stops.length > 0;

                const addGradientMaskedBy = (maskTarget: Container) => {
                    const texture = createGradientTexture(stops!);
                    const sprite = new Sprite(texture);
                    sprite.anchor.set(0.5);
                    const diag = Math.sqrt(app.renderer.width ** 2 + app.renderer.height ** 2);
                    sprite.width = diag;
                    sprite.height = diag;
                    wrapper.addChild(sprite);
                    sprite.mask = maskTarget;
                };

                // Split-paint is only meaningful for primitive shapes where stroke
                // and fill are both painted AND the two gradient toggles disagree.
                // Asset shapes (SVG/PNG) handle their fill/stroke paint internally
                // via svgRecolor, so they always take the single-pass path.
                const isAsset = layer.type === 'asset_set' || layer.type === 'asset_single';
                const needsSplit =
                    !isAsset &&
                    hasGradient &&
                    sg !== fg &&
                    !!effectiveConfig.fillEnabled &&
                    !!effectiveConfig.strokeEnabled;

                if (!needsSplit) {
                    const content = buildContent(rotationDeg, xVal, yVal);
                    wrapper.addChild(content);
                    if (hasGradient) addGradientMaskedBy(content);
                    return wrapper;
                }

                // Mixed-mode: build fill-only and stroke-only passes so the
                // gradient mask can apply to just one. Order matters — fill paints
                // first (below), stroke paints on top.
                const fillContent = buildContent(rotationDeg, xVal, yVal, 'fill-only');
                wrapper.addChild(fillContent);
                if (fg) addGradientMaskedBy(fillContent);

                const strokeContent = buildContent(rotationDeg, xVal, yVal, 'stroke-only');
                wrapper.addChild(strokeContent);
                if (sg) addGradientMaskedBy(strokeContent);

                return wrapper;
            };

            // Symmetry Logic
            if (layer.symmetry.enabled) {
                const mode = layer.symmetry.mode;
                const is6Way = mode === '6-way';
                const is3Way = mode === '3-way';
                const isHorizontal = mode === 'horizontal';
                const isVertical = mode === 'vertical';

                const angles = is6Way
                    ? [270, 330, 30, 90, 150, 210]
                    : is3Way
                        ? [270, 30, 150]
                        : (isHorizontal
                            ? [0, 0]
                            : (isVertical
                                ? [270, 270]
                                : [0, 1]));

                angles.forEach((deg, i) => {
                    const useStandardCoords = isHorizontal;
                    const unit = useStandardCoords
                        ? createRenderableUnit(globalRotation, currentPosX, currentPosY)
                        : createRenderableUnit(globalRotation + 90, -currentPosY, currentPosX);

                    const legWrapper = this.getContainer();
                    legWrapper.rotation = deg * (Math.PI / 180);

                    if (is6Way && layer.symmetry.mirrorSegments && i % 2 !== 0) {
                        legWrapper.scale.y = -1;
                    }
                    if ((isHorizontal || isVertical) && i % 2 !== 0) {
                        legWrapper.scale.x = -1;
                    }

                    if (layer.symmetry.masked) {
                        const legMask = this.getGraphics();
                        const R = 2000;
                        const sweep = is6Way ? 60 : (is3Way ? 120 : ((isHorizontal || isVertical) ? 180 : 180));
                        const halfSweep = sweep / 2;
                        const startAngle = (-halfSweep) * (Math.PI / 180);
                        const endAngle = (halfSweep) * (Math.PI / 180);

                        legMask.clear();
                        legMask.moveTo(0, 0)
                            .arc(0, 0, R, startAngle, endAngle)
                            .lineTo(0, 0)
                            .fill(0xffffff);

                        legWrapper.addChild(legMask);
                        unit.mask = legMask;
                    }

                    legWrapper.addChild(unit);
                    contentWrapper.addChild(legWrapper);
                });
            } else {
                const unit = createRenderableUnit(globalRotation);
                contentWrapper.addChild(unit);
            }

            layerContainer.addChild(contentWrapper);
        };

        // Render Root Layers (Bottom to Top)
        // Note: We need to filter for roots, but maintain their relative order.
        const rootLayers = project.layers.filter(l => !l.parentId).reverse();
        // project.layers is assumed to be ordered as they appear in the UI list (Top to Bottom).
        // PIXI renders children in order, where the last child is on top.
        // To make the first layer in the list appear on top, we reverse the list before rendering.

        rootLayers.forEach(layer => {
            renderRecursive(layer, app.stage);
        });

        // Prune Missing Layers
        for (const [id, container] of this.layerCache.entries()) {
            if (!activeLayerIds.has(id)) {
                if (container.parent) container.parent.removeChild(container);
                this.returnObject(container);
                this.layerCache.delete(id);
            }
        }
    }

    public cleanup() {
        this.layerCache.clear();
        this.graphicsPool = [];
        this.containerPool = [];
    }
}
