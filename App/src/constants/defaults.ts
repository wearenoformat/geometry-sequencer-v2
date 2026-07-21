import type { AnimatableProperties } from '../types';

/**
 * Default values for all animatable properties.
 * 
 * This file is intentionally side-effect-free so it can be safely
 * imported by the player build (vite.player.config.ts) without
 * pulling in Supabase, Zustand, or other app-level dependencies.
 */
export const DEFAULT_ANIMATABLES: AnimatableProperties = {
    radiusX: 100,
    radiusY: 100,
    radiusOffset: 0,
    offsetMult: 0,
    rotateGlobal: 0,
    orbitRadius: 0,
    rotateOrbit: 0,
    rotateShape: 0,
    rotateX: 0,
    rotateY: 0,
    rotateLayer: 0,
    strokeWeight: 1,
    blur: 0,
    canvasBlur: 0,
    opacity: 255,
    posX: 0,
    posY: 0,
    vSpacing: 0,
    spacingX: 0,
    spacingY: 0,
    instanceRotation: 0,
    instanceRotationMult: 0,
    orbitRadius2: 0,
    rotateOrbit2: 0,
    radiusOffset2: 0,
    offsetMult2: 0,
    vSpacing2: 0,
    spacingX2: 0,
    spacingY2: 0,
    instanceRotation2: 0,
    instanceRotationMult2: 0,
    shapeArc: 360,
    starInnerRadius: 0.5,
    radialArc: 360,
    radialArc2: 360,
    glowStrength: 0,
    noise: 0,
    displacementScale: 0,
    shockwaveTime: 0,
    twistAngle: 0,
    twistRadius: 200,
    twistOffsetX: 0,
    twistOffsetY: 0,
    bulgeStrength: 0,
    bulgeRadius: 200,
    bulgeCenterX: 0,
    bulgeCenterY: 0,
    motionBlurStrength: 0,
    perspective: 1200,

    // Advanced Filters
    bloomThreshold: 0,
    bloomStrength: 0,
    bloomRadius: 0,
};
