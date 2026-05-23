
const PACKAGE_JSON = `
{
  "name": "geometry-animation-export",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "pixi.js": "^8.15.0",
    "pixi-filters": "^6.1.5",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@types/react": "^19.2.5",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^4.7.0",
    "typescript": "~5.9.3",
    "vite": "^6.4.1"
  }
}
`;

const README_MD = `
# Geometry Animation Project

This is an exported React project containing your geometry animation.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Run the development server:
   \`\`\`bash
   npm run dev
   \`\`\`

3. Build for production:
   \`\`\`bash
   npm run build
   \`\`\`
`;

const VITE_CONFIG = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});`;

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Geometry Animation</title>
  </head>
  <body style="margin: 0; padding: 0; overflow: hidden; background: #000;">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

const MAIN_TSX = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`;

const APP_TSX = `import React, { useState, useEffect } from 'react';
import GeometryPlayer from './components/GeometryPlayer';
import projectData from './project.json';
import { Project } from './types';

function App() {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      if (isPlaying) {
        setCurrentTime(prev => {
           // @ts-ignore
           const duration = projectData.duration || 10;
           return (prev + dt) % duration;
        });
      }
      animationFrameId = requestAnimationFrame(loop);
    }
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying]);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
       <GeometryPlayer
          project={projectData as unknown as Project}
          width={window.innerWidth}
          height={window.innerHeight}
          currentTime={currentTime}
          isPlaying={isPlaying}
          // @ts-ignore
          backgroundColor={projectData.backgroundColor}
       />
       
       <div style={{
         position: 'absolute', 
         bottom: 20, 
         left: 20, 
         background: 'rgba(0,0,0,0.5)', 
         color: 'white', 
         padding: '10px 20px', 
         borderRadius: 8,
         display: 'flex',
         gap: 10,
         alignItems: 'center',
         fontFamily: 'sans-serif'
       }}>
          <button 
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              background: '#D4AF37',
              border: 'none',
              borderRadius: 4,
              padding: '5px 10px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {isPlaying ? 'PAUSE' : 'PLAY'}
          </button>
          <span>Time: {currentTime.toFixed(2)}s</span>
       </div>
    </div>
  );
}

export default App;
`;

const GEOMETRY_PLAYER = `
import React, { useEffect, useRef } from 'react';
import { Application, Color } from 'pixi.js';
import { GeometryRenderer } from '../rendering/GeometryRenderer';
import type { Project } from '../types';

interface GeometryPlayerProps {
    project: Project;
    width: number;
    height: number;
    currentTime: number;
    isPlaying: boolean;
    backgroundColor?: string;
    onTick?: (deltaTime: number) => void;
    disableTicker?: boolean;
}

const GeometryPlayer: React.FC<GeometryPlayerProps> = ({
    project,
    width,
    height,
    currentTime,
    isPlaying,
    backgroundColor = '#000000',
    onTick,
    disableTicker = false
}) => {
    const appRef = useRef<Application | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<GeometryRenderer | null>(null);

    // Track latest props in refs for use in ticker
    const propsRef = useRef({ project, currentTime, isPlaying, onTick, disableTicker });

    useEffect(() => {
        propsRef.current = { project, currentTime, isPlaying, onTick, disableTicker };
    }, [project, currentTime, isPlaying, onTick, disableTicker]);

    // Initialize Pixi Application
    useEffect(() => {
        if (appRef.current) return;
        if (!containerRef.current) return;

        let aborted = false;

        const init = async () => {
            const app = new Application();
            try {
                await app.init({
                    width,
                    height,
                    backgroundColor: backgroundColor,
                    antialias: true,
                    autoDensity: true,
                    resolution: window.devicePixelRatio || 1,
                    preference: 'webgl'
                });
            } catch (e) {
                console.error("PixiJS Init Failed:", e);
                return;
            }

            if (aborted) return;

            if (containerRef.current) {
                containerRef.current.appendChild(app.canvas);
                app.canvas.style.display = 'block';
                app.canvas.style.width = '100%';
                app.canvas.style.height = '100%';
                app.canvas.style.objectFit = 'contain';
                app.renderer.resize(width, height);
            }
            appRef.current = app;
            rendererRef.current = new GeometryRenderer();

            app.ticker.add((ticker) => {
                if (!app.renderer || !rendererRef.current) return;

                const { project, currentTime, isPlaying, onTick, disableTicker } = propsRef.current;

                if (!disableTicker && isPlaying && onTick) {
                    const dt = ticker.elapsedMS / 1000;
                    onTick(dt);
                }

                try {
                    // Use rendererRef.current with FRESH props
                    rendererRef.current.render(app, project, currentTime, isPlaying);
                } catch (err) {
                    console.error("PixiJS Render Error:", err);
                    app.ticker.stop();
                }
            });
        };

        init();

        return () => {
            aborted = true;
            if (appRef.current) {
                appRef.current.ticker.stop();
                appRef.current.destroy(true, { children: true, texture: true });
                appRef.current = null;
            }
            if (rendererRef.current) {
                rendererRef.current.cleanup();
                rendererRef.current = null;
            }
        };
    }, []); // Run once on mount

    // Handle Props Changes (Resize & BG)
    useEffect(() => {
        if (appRef.current && appRef.current.renderer) {
            if (appRef.current.screen.width !== width || appRef.current.screen.height !== height) {
                // Resize only if changed
                appRef.current.renderer.resize(width, height);
            }
            appRef.current.renderer.background.color = new Color(backgroundColor);
        }
    }, [width, height, backgroundColor]);

    // Force Render when props change even if ticker is unused (e.g. paused or export preview)
    // NOTE: If isPlaying is true, the ticker handles it. If false, we need this effect to update the view on scrub.
    useEffect(() => {
        if (appRef.current && rendererRef.current && !isPlaying) {
            rendererRef.current.render(appRef.current, project, currentTime, false);
        }
    }, [project, currentTime, isPlaying]);


    return <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden', background: backgroundColor }} />;
};

export default GeometryPlayer;

`;
const TYPES_TS = `

export type ShapeType = 'polygon' | 'star' | 'circle' | 'diamond' | 'vesica' | 'line' | 'custom' | 'molecule' | 'iching' | 'iching_lines' | 'polyhedron' | 'group' | 'astrology' | 'amino';
// export type KeyState = 'start' | 'middle' | 'end'; // Removed
export type InternalLinesType = 'none' | 'center' | 'all';
export type GridLayoutType = 'radial' | 'hexagonal' | 'linear' | '';
export type InspectorTabType = 'controls' | 'raw';
export type ViewType = 'dashboard' | 'editor' | 'player' | 'landing' | 'admin';

export interface ProjectMetadata {
    id: string;
    name: string;
    lastModified: number;
    thumbnailData?: string;
    folderId?: string | null;
    order?: number;
}

export interface Folder {
    id: string;
    name: string;
    isOpen: boolean; // For UI state
}

export interface Profile {
    id: string;
    email: string;
    is_admin: boolean;
}

export interface GradientStop {
    id: string;
    offset: number; // 0-100
    color: string;
}
export type EasingType =
    | 'linear'
    | 'easeInSine' | 'easeOutSine' | 'easeInOutSine'
    | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'
    | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
    | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart'
    | 'easeInQuint' | 'easeOutQuint' | 'easeInOutQuint'
    | 'easeInExpo' | 'easeOutExpo' | 'easeInOutExpo'
    | 'easeInCirc' | 'easeOutCirc' | 'easeInOutCirc'
    | 'easeInBack' | 'easeOutBack' | 'easeInOutBack'
    | 'easeInElastic' | 'easeOutElastic' | 'easeInOutElastic'
    | 'easeInBounce' | 'easeOutBounce' | 'easeInOutBounce'
    | 'custom';

export interface Keyframe<T = number> {
    id: string;
    time: number; // Time in seconds relative to layer start
    value: T;
    easing: EasingType;
    bezier?: [number, number, number, number]; // For 'custom' easing if needed
}

export type AnimationProperty = Keyframe<any>[];

// Simplified AnimationConfig that maps property names to standard types, 
// but we will use the Keyframe[] structure in the actual Layer object.
// However, to maintain type safety for WHICH properties exist:
// Defines the structure of the value object within a keyframe
export interface AnimatableProperties {
    radiusX: number;
    radiusY: number;
    radiusOffset: number;
    offsetMult: number;
    rotateGlobal: number;
    orbitRadius: number;
    rotateOrbit: number;
    rotateShape: number;
    rotateX: number;
    rotateY: number;
    rotateLayer: number;
    perspective: number;
    strokeWeight: number;
    blur: number;
    glowStrength: number;
    noise: number;
    displacementScale: number;
    shockwaveTime: number;
    twistAngle: number;
    twistRadius: number;
    twistOffsetX: number;
    twistOffsetY: number;
    bulgeStrength: number;
    bulgeRadius: number;
    bulgeCenterX: number;
    bulgeCenterY: number;
    motionBlurStrength: number;
    canvasBlur: number;
    opacity: number;
    posX: number;
    posY: number;
    vSpacing: number; // Deprecated? Or used for Linear Y? Let's use spacingX/Y specifically.
    spacingX: number;
    spacingY: number;
    instanceRotation: number;
    instanceRotationMult: number;

    // Group 2
    orbitRadius2: number;
    rotateOrbit2: number;
    radiusOffset2: number;
    offsetMult2: number;
    vSpacing2: number;
    spacingX2: number;
    spacingY2: number;
    instanceRotation2: number;
    instanceRotationMult2: number;

    // Config animatables
    shapeArc: number;
    starInnerRadius: number;

    // Advanced Filters
    // Advanced Bloom
    bloomThreshold: number;
    bloomStrength: number;
    bloomRadius: number;
}

export interface LayerKeyframe extends Keyframe<AnimatableProperties> { }

// Deprecated AnimationConfig
// export interface AnimationConfig { ... }

export interface LayerConfig {
    sides: number;
    customPath?: string; // SVG path data for 'custom' shape
    customPaths?: string[]; // Array of SVG path data for complex custom shapes
    instances: number;
    density: number; // Deprecated but kept for compatibility if needed, or repurposed
    densitySelective: boolean; // Deprecated
    // New Flags
    drawOutline: boolean;
    drawSpokes: boolean;
    drawWeb: boolean;
    drawStar: boolean;
    starSkip: number;
    starInnerRadius: number; // 0-1, default 0.5

    internalLines: InternalLinesType;
    gridLayout: GridLayoutType;
    gridSpacing: number;
    instances2: number;
    gridLayout2: GridLayoutType;
    strokeColor: string;
    strokeEnabled: boolean;
    strokeStyleType: 'solid' | 'dotted' | 'dashed';
    dashLength: number;
    gapLength: number;

    fillColor: string;
    fillEnabled: boolean;
    scaleLocked: boolean;
    dotsEnabled: boolean;
    dotSize: number;
    dotType: 'filled' | 'outlined';
    dotOffset: boolean;

    // Circle Specific
    shapeArc: number; // 0-360

    // Gradient Specific
    gradientEnabled?: boolean;
    strokeGradientEnabled?: boolean;
    fillGradientEnabled?: boolean;
    gradientStops?: { id: string; offset: number; color: string }[];


    // Line Specific
    lineAnchor: 'center' | 'start' | 'end';

    // Radial Layout Specific
    radialArc: number; // 0-360
    alignToPath: boolean;

    // Molecule Specific
    molecule?: string;
    moleculeSize?: number;
    moleculeFill?: boolean;

    // Polyhedron Specific
    polyhedronName?: string;

    // I-Ching Specific
    ichingInputId?: number; // 1-64
    ichingHighlightIndex?: number; // 1-6 (0 for none)

    // Group 2 Radial Specific
    radialArc2?: number; // 0-360
    alignToPath2?: boolean;
    // Timeline / Sequencing
    loopIndependently?: boolean;
    persistVisible?: boolean; // New: Keep visible after end

    // Group Style Overrides
    styleOverrideEnabled?: boolean;
}

export interface SymmetryConfig {
    enabled: boolean;
    mode: '3-way' | '6-way' | 'horizontal' | 'vertical';
    masked: boolean;
    mirrorSegments?: boolean;
}

export interface Layer {
    id: string;
    name: string;
    type: ShapeType;
    parentId?: string; // For grouping
    collapsed?: boolean; // For UI
    visible: boolean;
    timeline: {
        start: number;
        end: number;
    };
    fadeIn: {
        enabled: boolean;
        duration: number;
    };
    fadeOut: {
        enabled: boolean;
        duration: number;
    };
    config: LayerConfig;
    keyframes: LayerKeyframe[];
    symmetry: SymmetryConfig;
}

export interface Project {
    id: string;
    name: string;
    duration: number;
    backgroundColor?: string;
    lastModified?: number;
    gradientColor?: string;
    layers: Layer[];
    zoom?: number; // Zoom factor for the entire animation
    folderId?: string | null;
    globalLineColor?: string;
    globalStrokeWeight?: number;
    globalStyleEnabled?: boolean;
    globalGradientEnabled?: boolean;
    globalGradientStops?: { id: string; offset: number; color: string }[];
}

export interface ExportSettings {
    width: number;
    height: number;
    isActive: boolean;
    pixelRatio?: number;
}

export interface AppState {
    currentView: ViewType;
    project: Project;
    savedProjects: ProjectMetadata[];
    folders: Folder[];

    // Folder Actions
    createFolder: (name: string) => Promise<string | undefined>;
    deleteFolder: (id: string, deleteProjects?: boolean) => void;
    moveProject: (projectId: string, folderId: string | null, targetProjectId?: string, position?: 'before' | 'after') => void;
    toggleFolder: (folderId: string) => void;
    renameFolder: (id: string, name: string) => void;
    reorderFolders: (startIndex: number, endIndex: number) => void;
    currentTime: number;
    isPlaying: boolean;
    isLooping: boolean; // New
    activeLayerId: string | null;
    selectedLayerIds: string[]; // New
    activeKeyframeId: string | null; // Changed from activeKeyState
    activeInspectorTab: InspectorTabType;
    clipboardLayers: Layer[];
    clipboardKeyframe: Keyframe<any> | null; // Changed from clipboardKeyState which was complex
    exportSettings: ExportSettings;

    saveIndex: () => Promise<void>;

    // Admin State & Actions
    isAdmin: boolean;
    adminProfiles: Profile[];
    fetchProfiles: () => Promise<void>;
    adminFetchProjects: (userId: string) => Promise<ProjectMetadata[]>;
    adminFetchFolders: (userId: string) => Promise<Folder[]>;
    adminCopyProject: (projectId: string, targetUserId: string, targetFolderId?: string | null) => Promise<void>;
    adminCopyFolder: (folderId: string, targetUserId: string) => Promise<void>;
    adminGetProjectData: (projectId: string) => Promise<Project | null>;

    // History
    history: Project[];
    future: Project[];
    undo: () => void;
    redo: () => void;

    // Actions
    setView: (view: ViewType) => void;
    setProject: (project: Project) => void;
    setCurrentTime: (time: number) => void;
    setIsPlaying: (isPlaying: boolean) => void;
    setIsLooping: (isLooping: boolean) => void; // New
    setActiveLayerId: (id: string | null) => void;
    setSelectedLayerIds: (ids: string[]) => void; // New
    setActiveKeyframeId: (id: string | null, layerId?: string) => void; // Changed
    setActiveInspectorTab: (tab: InspectorTabType) => void;
    addLayer: () => void;
    updateLayer: (id: string, updates: Partial<Layer>, skipHistory?: boolean) => void;
    toggleLayerVisibility: (id: string) => void;
    deleteLayer: (id: string) => void;
    moveLayer: (layerId: string, targetId: string | null, position: 'above' | 'below' | 'inside') => void;
    duplicateLayer: (id: string) => void;
    copySelection: () => void;
    pasteClipboard: () => void;
    toggleLayerCollapse: (layerId: string) => void;

    // Keyframe Actions
    addKeyframe: (layerId: string, overrideTime?: number) => void;
    updateKeyframe: (layerId: string, keyframeId: string, updates: Partial<LayerKeyframe>, skipHistory?: boolean) => void;
    deleteKeyframe: (layerId: string, keyframeId: string) => void;
    addFolder: () => void;

    copyKeyframe: (keyframeId: string) => void; // Simplify copy/paste for now to single keyframe stats
    pasteKeyframe: () => void;

    updateProject: (updates: Partial<Project>, skipHistory?: boolean) => void;
    fetchProjects: () => Promise<void>;
    renameProject: (id: string, name: string) => Promise<void>;
    saveProject: () => Promise<void>;
    loadProject: (id: string, view?: 'editor' | 'dashboard' | 'player') => void;
    createNewProject: () => void;
    duplicateProject: (id: string) => void;
    setGlobalLineColor: (color: string) => void;
    deleteProject: (id: string) => Promise<void>;
    setSavedProjects: (projects: ProjectMetadata[]) => void;
    setExportSettings: (settings: ExportSettings) => void;
    restyleAllLayers: () => void;
}

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
    bloomThreshold: 0, // Advanced Bloom (0-1 usually, but component might use 0-100? Filters usually use 0-1)
    bloomStrength: 0,
    bloomRadius: 0,
};

`;
const GEOMETRY_RENDERER = `
import { Application, Container, Graphics, BlurFilter, Color, Sprite, NoiseFilter, DisplacementFilter, Texture } from 'pixi.js';
import { GlowFilter } from 'pixi-filters/glow';
import { ShockwaveFilter } from 'pixi-filters/shockwave';
import { TwistFilter } from 'pixi-filters/twist';
import { BulgePinchFilter } from 'pixi-filters/bulge-pinch';
import { MotionBlurFilter } from 'pixi-filters/motion-blur';
import { AdvancedBloomFilter } from 'pixi-filters/advanced-bloom';
import { interpolateGeneric } from '../utils/interpolation';
import { updatePrimitive } from '../rendering/PrimitiveRenderer';
import { createGradientTexture } from '../utils/gradients';
import type { Project, AnimatableProperties } from '../types';
import { DEFAULT_ANIMATABLES } from '../types';
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
                        ctx.fillStyle = \`rgb(\${gray},\${gray},\${gray})\`;
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
            const buildContent = (rotationDeg: number = 0, xVal?: number, yVal?: number, paintMode: 'both' | 'fill-only' | 'stroke-only' = 'both'): Container => {
                const rootWrapper = this.getContainer();

                rootWrapper.x = xVal ?? currentPosX;
                rootWrapper.y = yVal ?? currentPosY;

                if (rotationDeg !== 0) {
                    rootWrapper.rotation = rotationDeg * (Math.PI / 180);
                }

                // Inner Shape Factory
                const createInnerShape = (i: number, level1Progressive: number) => {
                    const rx = currentRadiusX + i * currentRadiusOffset * level1Progressive;
                    const ry = currentRadiusY + i * currentRadiusOffset * level1Progressive;
                    const g = this.getGraphics();

                    let progress = 0;
                    const duration = layer.timeline.end - layer.timeline.start;
                    if (duration > 0) {
                        const timeInto = activeTime - layer.timeline.start;
                        progress = Math.max(0, Math.min(1, timeInto / duration));
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

                const count1 = layer.type === 'astrology' ? 12 : layer.type === 'amino' ? 20 : layer.type === 'iching_lines' ? 64 : Math.max(1, layer.config.instances);
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

                const needsSplit =
                    hasGradient &&
                    sg !== fg &&
                    !!effectiveConfig.fillEnabled &&
                    !!effectiveConfig.strokeEnabled;

                if (!needsSplit) {
                    const content = buildContent(rotationDeg, xVal, yVal);
                    wrapper.addChild(content);
                    if (hasGradient) addGradientMaskedBy(content);
                } else {
                    const fillContent = buildContent(rotationDeg, xVal, yVal, 'fill-only');
                    wrapper.addChild(fillContent);
                    if (fg) addGradientMaskedBy(fillContent);

                    const strokeContent = buildContent(rotationDeg, xVal, yVal, 'stroke-only');
                    wrapper.addChild(strokeContent);
                    if (sg) addGradientMaskedBy(strokeContent);
                }

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

`;
const PRIMITIVE_RENDERER = `

import { Graphics, Color, GraphicsPath, Matrix } from 'pixi.js';
import type { ShapeType, LayerConfig } from '../types';
import { getUnitPolygon, getUnitCustomShapes, getUnitStar } from '../utils/geometry';
import { drawIChingHexagram, drawIChingLines } from './shapes/IChingRenderer';
import { drawMolecule } from './shapes/MoleculeRenderer';

import { drawPolyhedron } from './shapes/PolyhedronRenderer';

// Helper to draw a dashed line between two points
const dashLine = (g: Graphics, x1: number, y1: number, x2: number, y2: number, dashLen: number, gapLen: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    let curr = 0;
    while (curr < len) {
        // Start of dash
        const dStart = curr;
        const dEnd = Math.min(len, curr + dashLen);

        g.moveTo(x1 + cos * dStart, y1 + sin * dStart);
        g.lineTo(x1 + cos * dEnd, y1 + sin * dEnd);

        curr += dashLen + gapLen;
    }
};

// Helper to draw a dashed polygon path
const dashPolygon = (g: Graphics, points: { x: number, y: number }[], dashLen: number, gapLen: number, close: boolean) => {
    for (let i = 0; i < points.length; i++) {
        const nextIdx = (i + 1) % points.length;
        if (!close && i === points.length - 1) break;

        const p1 = points[i];
        const p2 = points[nextIdx];
        dashLine(g, p1.x, p1.y, p2.x, p2.y, dashLen, gapLen);
    }
};

// Helper to draw a dashed ellipse/arc/circle
const dashArc = (g: Graphics, cx: number, cy: number, rx: number, ry: number, startAngle: number, endAngle: number, dashLen: number, gapLen: number) => {
    const totalAngle = Math.abs(endAngle - startAngle);
    const avgR = (rx + ry) / 2;
    const curveLen = totalAngle * avgR;

    // Check if dash+gap is too small compared to curve to avoid infinite loops
    const segmentLen = Math.max(0.1, dashLen + gapLen);

    let curr = 0;
    while (curr < curveLen) {
        const sDist = curr;
        const eDist = Math.min(curveLen, curr + dashLen);

        // Convert distances back to angles
        const sAngle = startAngle + (sDist / curveLen) * totalAngle;
        const eAngle = startAngle + (eDist / curveLen) * totalAngle;

        // Draw Arc Segment
        if (Math.abs(rx - ry) < 0.1) {
            g.arc(cx, cy, rx, sAngle, eAngle);
        } else {
            // Manual ellipse segment
            const res = 10;
            for (let k = 0; k <= res; k++) {
                const t = sAngle + (eAngle - sAngle) * (k / res);
                const px = cx + rx * Math.cos(t);
                const py = cy + ry * Math.sin(t);
                if (k === 0) g.moveTo(px, py);
                else g.lineTo(px, py);
            }
        }

        curr += segmentLen;
    }
};

// Helper to draw an elliptical arc
const ellipticalArc = (g: Graphics, cx: number, cy: number, rx: number, ry: number, startAngle: number, endAngle: number) => {
    if (Math.abs(rx - ry) < 0.1) {
        g.arc(cx, cy, rx, startAngle, endAngle);
        return;
    }
    const res = 40; // Resolution for ellipse
    for (let k = 0; k <= res; k++) {
        const t = startAngle + (endAngle - startAngle) * (k / res);
        const px = cx + rx * Math.cos(t);
        const py = cy + ry * Math.sin(t);
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
    }
};

export const updatePrimitive = (g: Graphics, type: ShapeType, rx: number, ry: number, sides: number, density: number, layerConfig: LayerConfig, progress: number, currentStrokeWeight: number, currentShapeArc: number = 360, currentStarInnerRadius: number = 0.5, rotateX: number = 0, rotateY: number = 0, currentPerspective: number = 1200) => {
    g.clear();
    const strokeColor = new Color(layerConfig.strokeColor || '#ffffff');
    const fillColor = new Color(layerConfig.fillColor || '#ffffff');

    // Config for Dashing
    // 'dashed' is the universal key for patterned strokes now.
    // 'dotted' legacy fallback: force small dash
    const isDashes = layerConfig.strokeEnabled && (layerConfig.strokeStyleType === 'dashed' || layerConfig.strokeStyleType === 'dotted');

    let dashLen = layerConfig.dashLength || 10;
    const gapLen = layerConfig.gapLength || 10;

    // Fallback if type is legacy 'dotted' but UI hasn't updated config yet
    if (layerConfig.strokeStyleType === 'dotted') {
        dashLen = 0.1; // Force small dash
    }

    const strokeStyle = {
        width: currentStrokeWeight,
        color: strokeColor,
        cap: 'round' as 'round',  // Always round to support nice dots and rounded dashes
        join: 'round' as 'round',
        pixelLine: false
    };

    const applyFill = () => {
        if (layerConfig.fillEnabled) g.fill({ color: fillColor });
    };

    const strokeCurrent = () => {
        if (layerConfig.strokeEnabled) g.stroke(strokeStyle);
    };

    const isDashed = isDashes; // Alias

    switch (type) {
        case 'polygon': {
            const isCustomShape = !!(layerConfig.customPaths?.length || layerConfig.customPath);

            let points: { x: number, y: number }[] = [];

            if (isCustomShape) {
                const pathDatas = layerConfig.customPaths?.length ? layerConfig.customPaths : [layerConfig.customPath].filter(Boolean) as string[];

                // Amino acids (customPaths) are all filled shapes — no strokes needed.
                // Circles use arc commands, connectors are filled rectangles.
                const isAminoPaths = !!layerConfig.customPaths?.length;

                if (isAminoPaths) {
                    const combinedPath = new GraphicsPath();
                    for (const pd of pathDatas) {
                        if (pd) combinedPath.addPath(new GraphicsPath(pd));
                    }

                    const b = combinedPath.bounds;
                    const width = b.maxX - b.minX;
                    const height = b.maxY - b.minY;

                    if (width > 0 || height > 0) {
                        const maxSize = Math.max(width, height);
                        const centerX = b.minX + width / 2;
                        const centerY = b.minY + height / 2;
                        const scaleX = (2 / maxSize) * rx;
                        const scaleY = (2 / maxSize) * ry;
                        const transform = new Matrix()
                            .translate(-centerX, -centerY)
                            .scale(scaleX, scaleY);

                        combinedPath.transform(transform);

                        // Fill all amino shapes using the stroke color (since they're outlines by nature)
                        g.path(combinedPath);
                        g.fill({ color: strokeColor });
                    }
                } else {
                    // Standard rendering for single customPath (astro, etc.)
                    const combinedPath = new GraphicsPath();
                    for (const pd of pathDatas) {
                        if (pd) combinedPath.addPath(new GraphicsPath(pd));
                    }

                    const b = combinedPath.bounds;
                    const width = b.maxX - b.minX;
                    const height = b.maxY - b.minY;

                    if (width > 0 || height > 0) {
                        const maxSize = Math.max(width, height);
                        const centerX = b.minX + width / 2;
                        const centerY = b.minY + height / 2;

                        const scaleX = (2 / maxSize) * rx;
                        const scaleY = (2 / maxSize) * ry;

                        const transform = new Matrix()
                            .translate(-centerX, -centerY)
                            .scale(scaleX, scaleY);

                        combinedPath.transform(transform);

                        if (layerConfig.fillEnabled) {
                            try {
                                combinedPath.checkForHoles = true;
                                g.path(combinedPath);
                                applyFill();
                            } catch (e) {
                                console.warn("Polygon native fill evenodd failed", e);
                                g.path(combinedPath);
                                applyFill();
                            }
                        }

                        if (layerConfig.strokeEnabled && layerConfig.drawOutline !== false && !isDashed) {
                            g.path(combinedPath);
                            strokeCurrent();
                        }

                        if (layerConfig.strokeEnabled && layerConfig.drawOutline !== false && isDashed) {
                            const pathsList = getUnitCustomShapes(pathDatas);
                            for (const pts of pathsList) {
                                if (pts.length === 0) continue;
                                const polyPoints = pts.map(p => ({ x: p.x * rx, y: p.y * ry }));
                                dashPolygon(g, polyPoints, dashLen, gapLen, true);
                            }
                            strokeCurrent();
                        }
                    }
                }
            } else {
                points = getUnitPolygon(sides);
                const polyPoints = points.map(p => ({ x: p.x * rx, y: p.y * ry }));

                if (isDashed && layerConfig.strokeEnabled) {
                    // Dash needs manual lines, so fill solid polygon first if needed
                    if (layerConfig.fillEnabled) {
                        g.poly(polyPoints.flatMap(p => [p.x, p.y]));
                        applyFill();
                    }
                    dashPolygon(g, polyPoints, dashLen, gapLen, true);
                    strokeCurrent();
                } else {
                    // Standard solid polygon path
                    if (layerConfig.fillEnabled || layerConfig.strokeEnabled) {
                        g.poly(polyPoints.flatMap(p => [p.x, p.y]));
                        if (layerConfig.fillEnabled) applyFill();
                        if (layerConfig.strokeEnabled && layerConfig.drawOutline !== false) strokeCurrent();
                    }
                }
            }

            // For Spokes, StarSkip, Web, and Dots we use the points array natively generated above.
            // Complex multi-path custom SVGs shouldn't use these features typically,
            // but if enabled, they will apply to the main outer bounds subpath.

            if (!isCustomShape) {
                // Spokes
                if (layerConfig.drawSpokes) {
                    points.forEach(p => {
                        const tx = p.x * rx;
                        const ty = p.y * ry;
                        if (isDashed) {
                            dashLine(g, 0, 0, tx, ty, dashLen, gapLen);
                        } else {
                            g.moveTo(0, 0);
                            g.lineTo(tx, ty);
                        }
                    });
                    strokeCurrent();
                }

                // DrawStar / StarSkip
                if (layerConfig.drawStar && layerConfig.starSkip) {
                    const s = layerConfig.starSkip;
                    const len = points.length;
                    if (s >= 2 && s < len) {
                        const visited = new Set<number>();
                        for (let start = 0; start < len; start++) {
                            if (visited.has(start)) continue;
                            const pathPoints: { x: number, y: number }[] = [];
                            let curr = start;
                            while (!visited.has(curr)) {
                                visited.add(curr);
                                pathPoints.push({ x: points[curr].x * rx, y: points[curr].y * ry });
                                curr = (curr + s) % len;
                            }
                            pathPoints.push({ x: points[start].x * rx, y: points[start].y * ry });

                            if (isDashed) {
                                dashPolygon(g, pathPoints, dashLen, gapLen, false);
                            } else {
                                g.poly(pathPoints.flatMap(p => [p.x, p.y]));
                            }
                            strokeCurrent();
                        }
                    }
                }

                // Web
                if (layerConfig.drawWeb) {
                    for (let i = 0; i < points.length; i++) {
                        for (let j = i + 1; j < points.length; j++) {
                            const p1 = { x: points[i].x * rx, y: points[i].y * ry };
                            const p2 = { x: points[j].x * rx, y: points[j].y * ry };
                            if (isDashed) {
                                dashLine(g, p1.x, p1.y, p2.x, p2.y, dashLen, gapLen);
                            } else {
                                g.moveTo(p1.x, p1.y);
                                g.lineTo(p2.x, p2.y);
                            }
                        }
                    }
                    strokeCurrent();
                }

                // Dots (Existing Feature - Corners)
                if (layerConfig.dotsEnabled) {
                    const size = layerConfig.dotSize || 4;
                    const offset = layerConfig.dotOffset ? size / 2 : 0;
                    points.forEach(p => {
                        const px = p.x * (rx + offset);
                        const py = p.y * (ry + offset);
                        g.circle(px, py, size / 2);
                        if (layerConfig.dotType === 'filled') g.fill({ color: layerConfig.strokeColor || '#fff' });
                        else g.stroke({ width: 1, color: layerConfig.strokeColor || '#fff' });
                    });
                }
            }
            break;
        }

        case 'star': {
            const innerRatio = currentStarInnerRadius ?? layerConfig.starInnerRadius ?? 0.5;
            const unitPoints = getUnitStar(sides);

            const getCoord = (idx: number, applyOffset = false) => {
                const pt = unitPoints[idx];
                const size = layerConfig.dotSize || 4;
                const offset = (applyOffset && layerConfig.dotOffset) ? size / 2 : 0;
                const r1x = rx * innerRatio, r1y = ry * innerRatio;
                const px = (pt.type === 'outer') ? pt.x * (rx + offset) : pt.x * (r1x + offset);
                const py = (pt.type === 'outer') ? pt.y * (ry + offset) : pt.y * (r1y + offset);
                return { x: px, y: py };
            };

            const allPoints: { x: number, y: number }[] = [];
            for (let i = 0; i < unitPoints.length; i++) allPoints.push(getCoord(i));

            if (isDashed && layerConfig.strokeEnabled) {
                if (layerConfig.fillEnabled) {
                    g.poly(allPoints.flatMap(p => [p.x, p.y]));
                    applyFill();
                }
                dashPolygon(g, allPoints, dashLen, gapLen, true);
                strokeCurrent();
            } else {
                if (layerConfig.fillEnabled || layerConfig.strokeEnabled) {
                    g.poly(allPoints.flatMap(p => [p.x, p.y]));
                    if (layerConfig.fillEnabled) applyFill();
                    if (layerConfig.strokeEnabled && layerConfig.drawOutline !== false) strokeCurrent();
                }
            }

            // Spokes
            if (layerConfig.drawSpokes) {
                for (let i = 0; i < unitPoints.length; i++) {
                    if (unitPoints[i].type === 'outer') {
                        const p = getCoord(i);
                        if (isDashed) dashLine(g, 0, 0, p.x, p.y, dashLen, gapLen);
                        else { g.moveTo(0, 0); g.lineTo(p.x, p.y); }
                    }
                }
                strokeCurrent();
            }

            // Star Skip for Star
            if (layerConfig.drawStar && layerConfig.starSkip) {
                const outerIndices = unitPoints.map((p, i) => ({ p, index: i })).filter(item => item.p.type === 'outer');
                const s = layerConfig.starSkip;
                const len = outerIndices.length;

                if (s >= 2 && s < len) {
                    const visited = new Set<number>();
                    for (let start = 0; start < len; start++) {
                        if (visited.has(start)) continue;
                        const pathPoints: { x: number, y: number }[] = [];
                        let curr = start;
                        while (!visited.has(curr)) {
                            visited.add(curr);
                            pathPoints.push(getCoord(outerIndices[curr].index));
                            curr = (curr + s) % len;
                        }
                        pathPoints.push(getCoord(outerIndices[start].index)); // Close

                        if (isDashed) dashPolygon(g, pathPoints, dashLen, gapLen, false);
                        else g.poly(pathPoints.flatMap(p => [p.x, p.y]));
                        strokeCurrent();
                    }
                }
            }

            // Web
            if (layerConfig.drawWeb) {
                for (let i = 0; i < unitPoints.length; i++) {
                    for (let j = i + 1; j < unitPoints.length; j++) {
                        const p1 = getCoord(i);
                        const p2 = getCoord(j);
                        if (isDashed) dashLine(g, p1.x, p1.y, p2.x, p2.y, dashLen, gapLen);
                        else { g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); }
                    }
                }
                strokeCurrent();
            }

            // Dots
            if (layerConfig.dotsEnabled) {
                const size = layerConfig.dotSize || 4;
                for (let i = 0; i < unitPoints.length; i++) {
                    const p = getCoord(i, true);
                    g.circle(p.x, p.y, size / 2);
                }
                if (layerConfig.dotType === 'filled') g.fill({ color: layerConfig.strokeColor || '#fff' });
                else g.stroke({ width: 1, color: layerConfig.strokeColor || '#fff' });
            }
            break;
        }

        case 'circle': {
            const endAngle = currentShapeArc * (Math.PI / 180);

            if (isDashed && layerConfig.strokeEnabled) {
                // Dash stroke needs separate logic
                if (layerConfig.fillEnabled) {
                    if (currentShapeArc >= 360) g.ellipse(0, 0, rx, ry);
                    else {
                        g.moveTo(0, 0);
                        ellipticalArc(g, 0, 0, rx, ry, 0, endAngle);
                        g.closePath();
                    }
                    applyFill();
                }
                dashArc(g, 0, 0, rx, ry, 0, endAngle, dashLen, gapLen);
                strokeCurrent();
            } else {
                // Standard solid path
                if (layerConfig.fillEnabled || layerConfig.strokeEnabled) {
                    if (currentShapeArc >= 360) g.ellipse(0, 0, rx, ry);
                    else {
                        if (layerConfig.fillEnabled) {
                            // If filled, we usually stroke the pie slice edges too? Yes, we drew center lines
                            g.moveTo(0, 0);
                            ellipticalArc(g, 0, 0, rx, ry, 0, endAngle);
                            g.closePath();
                        } else {
                            ellipticalArc(g, 0, 0, rx, ry, 0, endAngle);
                        }
                    }
                    if (layerConfig.fillEnabled) applyFill();
                    if (layerConfig.strokeEnabled) strokeCurrent();
                }
            }

            // Dots
            if (layerConfig.dotsEnabled) {
                const dotRad = (layerConfig.dotSize || 4) / 2;
                const offset = layerConfig.dotOffset ? dotRad : 0;
                const angleOff = (rx > 0.01) ? offset / rx : 0;

                const sA = 0 - angleOff;
                const eA = (currentShapeArc * Math.PI / 180) + angleOff;

                g.circle(Math.cos(sA) * rx, Math.sin(sA) * ry, dotRad);
                g.circle(Math.cos(eA) * rx, Math.sin(eA) * ry, dotRad);

                if (layerConfig.dotType === 'filled') g.fill({ color: layerConfig.strokeColor || '#fff' });
                else g.stroke({ width: 1, color: layerConfig.strokeColor || '#fff' });
            }

            break;
        }

        case 'line': {
            const anchor = layerConfig.lineAnchor || 'center';
            let p1x = -rx, p2x = rx;
            if (anchor === 'start') { p1x = 0; p2x = rx * 2; }
            if (anchor === 'end') { p1x = -rx * 2; p2x = 0; }

            if (layerConfig.strokeEnabled) {
                if (isDashed) {
                    dashLine(g, p1x, 0, p2x, 0, dashLen, gapLen);
                } else {
                    g.moveTo(p1x, 0);
                    g.lineTo(p2x, 0);
                }
                strokeCurrent();
            }

            if (layerConfig.dotsEnabled) {
                const size = (layerConfig.dotSize || 4) / 2;
                const offset = layerConfig.dotOffset ? size : 0;
                let d1 = p1x, d2 = p2x;
                if (offset > 0 && Math.abs(p2x - p1x) > 0.0001) {
                    const dir = Math.sign(p2x - p1x);
                    d1 -= dir * offset; d2 += dir * offset;
                }
                g.circle(d1, 0, size);
                g.circle(d2, 0, size);
                if (layerConfig.dotType === 'filled') g.fill({ color: layerConfig.strokeColor || '#fff' });
                else g.stroke({ width: 1, color: layerConfig.strokeColor || '#fff' });
            }
            break;
        }

        case 'vesica': {
            const h = ry * Math.sqrt(3) / 2;

            if (layerConfig.fillEnabled) {
                g.moveTo(0, -h);
                // vesica is the intersection of two circles/ellipses
                // -r*0.5 is the x-center offset
                ellipticalArc(g, -rx * 0.5, 0, rx, ry, -Math.PI / 3, Math.PI / 3);
                ellipticalArc(g, rx * 0.5, 0, rx, ry, 2 * Math.PI / 3, 4 * Math.PI / 3);
                g.closePath();
                applyFill();
            }

            if (layerConfig.strokeEnabled) {
                if (isDashed) {
                    dashArc(g, -rx * 0.5, 0, rx, ry, -Math.PI / 3, Math.PI / 3, dashLen, gapLen);
                    dashArc(g, rx * 0.5, 0, rx, ry, 2 * Math.PI / 3, 4 * Math.PI / 3, dashLen, gapLen);
                } else {
                    g.moveTo(0, -h);
                    ellipticalArc(g, -rx * 0.5, 0, rx, ry, -Math.PI / 3, Math.PI / 3);
                    ellipticalArc(g, rx * 0.5, 0, rx, ry, 2 * Math.PI / 3, 4 * Math.PI / 3);
                    g.closePath();
                }
                strokeCurrent();
            }
            break;
        }

        case 'molecule':
            drawMolecule(g, rx, ry, layerConfig, strokeColor, fillColor, rotateX, rotateY);
            break;
        case 'iching_lines':
            drawIChingLines(g, rx, ry, layerConfig, strokeColor, currentStrokeWeight);
            break;
        case 'iching':
            drawIChingHexagram(g, rx, ry, layerConfig, progress, strokeColor, fillColor);
            break;
        case 'polyhedron':
            // Using currentShapeArc (mapped from rotateShape) as rotateZ
            // Assuming currentShapeArc defaults to 360, but rotateShape acts as 0-360 deg.
            // If currentShapeArc is actually 360 when no keyframe, that's fine as 360=0 deg.
            drawPolyhedron(g, rx, ry, layerConfig, strokeColor, fillColor, rotateX, rotateY, currentShapeArc, currentStrokeWeight, currentPerspective);
            break;
        case 'custom':
            updatePrimitive(g, 'polygon', rx, ry, sides, density, layerConfig, progress, currentStrokeWeight, currentShapeArc, currentStarInnerRadius, rotateX, rotateY, currentPerspective);
            break;
        case 'diamond':
            updatePrimitive(g, 'polygon', rx, ry, 4, density, layerConfig, progress, currentStrokeWeight, currentShapeArc, currentStarInnerRadius, rotateX, rotateY, currentPerspective);
            break;
    }
};

`;

const INTERPOLATION_TS = `
import type { EasingType, Keyframe } from '../types';

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Easing Library
export const easings: Record<string, (t: number) => number> = {
    linear: (t) => t,

    // Sine
    easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
    easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
    easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,

    // Quad
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
    easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,

    // Cubic
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,

    // Quart
    easeInQuart: (t) => t * t * t * t,
    easeOutQuart: (t) => 1 - Math.pow(1 - t, 4),
    easeInOutQuart: (t) => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,

    // Quint
    easeInQuint: (t) => t * t * t * t * t,
    easeOutQuint: (t) => 1 - Math.pow(1 - t, 5),
    easeInOutQuint: (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2,

    // Expo
    easeInExpo: (t) => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
    easeOutExpo: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
    easeInOutExpo: (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,

    // Circ
    easeInCirc: (t) => 1 - Math.sqrt(1 - Math.pow(t, 2)),
    easeOutCirc: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
    easeInOutCirc: (t) => t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,

    // Back
    easeInBack: (t) => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return c3 * t * t * t - c1 * t * t;
    },
    easeOutBack: (t) => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    easeInOutBack: (t) => {
        const c1 = 1.70158;
        const c2 = c1 * 1.525;
        return t < 0.5
            ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
            : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
    },

    // Elastic
    easeInElastic: (t) => {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
    },
    easeOutElastic: (t) => {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    easeInOutElastic: (t) => {
        const c5 = (2 * Math.PI) / 4.5;
        return t === 0 ? 0 : t === 1 ? 1 : t < 0.5
            ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
            : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
    },

    // Bounce
    easeOutBounce: (t) => {
        const n1 = 7.5625;
        const d1 = 2.75;
        if (t < 1 / d1) return n1 * t * t;
        else if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
        else if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
        else return n1 * (t -= 2.625 / d1) * t + 0.984375;
    },
    easeInBounce: (t) => 1 - easings.easeOutBounce(1 - t),
    easeInOutBounce: (t) => t < 0.5 ? (1 - easings.easeOutBounce(1 - 2 * t)) / 2 : (1 + easings.easeOutBounce(2 * t - 1)) / 2,
};

export const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
};

export const rgbToHex = (r: number, g: number, b: number) => {
    return '#' + [r, g, b].map(x => {
        const hex = Math.round(pMath.clamp(x, 0, 255)).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
};

const pMath = {
    clamp: (val: number, min: number, max: number) => Math.min(Math.max(val, min), max)
};

// Cubic Bezier Solver
const NEWTON_ITERATIONS = 4;

const A = (aA1: number, aA2: number) => 1.0 - 3.0 * aA2 + 3.0 * aA1;
const B = (aA1: number, aA2: number) => 3.0 * aA2 - 6.0 * aA1;
const C = (aA1: number) => 3.0 * aA1;

const calcBezier = (aT: number, aA1: number, aA2: number) => {
    return ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT;
};

const getSlope = (aT: number, aA1: number, aA2: number) => {
    return 3.0 * A(aA1, aA2) * aT * aT + 2.0 * B(aA1, aA2) * aT + C(aA1);
};

const newtonRaphsonIterate = (aX: number, aGuessT: number, mX1: number, mX2: number) => {
    for (let i = 0; i < NEWTON_ITERATIONS; ++i) {
        const currentSlope = getSlope(aGuessT, mX1, mX2);
        if (currentSlope === 0.0) return aGuessT;
        const currentX = calcBezier(aGuessT, mX1, mX2) - aX;
        aGuessT -= currentX / currentSlope;
    }
    return aGuessT;
};

export const solveCubicBezier = (x: number, mX1: number, mY1: number, mX2: number, mY2: number) => {
    if (mX1 === mY1 && mX2 === mY2) return x; // Linear
    let tGuess = x;
    tGuess = newtonRaphsonIterate(x, tGuess, mX1, mX2);
    return calcBezier(tGuess, mY1, mY2);
};

function applyEasing(t: number, easing: EasingType, bezier?: [number, number, number, number]): number {
    if (easing === 'custom' && bezier) {
        return solveCubicBezier(t, bezier[0], bezier[1], bezier[2], bezier[3]);
    }
    return easings[easing]?.(t) ?? t;
}

function interpolateValues<T>(start: T, end: T, t: number): T {
    // Both numbers
    if (typeof start === 'number' && typeof end === 'number') {
        return (start + (end - start) * t) as unknown as T;
    }

    // Handle missing start or end (treat as 0 for numbers)
    if (typeof start === 'number' && end === undefined) {
        return (start + (0 - start) * t) as unknown as T;
    }
    if (start === undefined && typeof end === 'number') {
        return (0 + (end - 0) * t) as unknown as T;
    }

    // Objects (recurse on union of keys)
    if ((typeof start === 'object' && start !== null) || (typeof end === 'object' && end !== null)) {
        const s = (start || {}) as any;
        const e = (end || {}) as any;
        const result: any = {};

        // Get unique keys from both objects
        const keys = new Set([...Object.keys(s), ...Object.keys(e)]);

        keys.forEach(key => {
            result[key] = interpolateValues(s[key], e[key], t);
        });

        return result as T;
    }

    return start ?? end;
}

/**
 * Interpolates between keyframes for any numeric value or object of numeric values.
 */
export function interpolateGeneric<T>(
    currentTime: number,
    layerStartTime: number,
    keyframes: Keyframe<T>[]
): T {
    if (!keyframes || keyframes.length === 0) {
        return {} as T;
    }

    // Optimization: assume sorted if we maintain sort on insert
    const sorted = keyframes; // Assumption: Caller ensures sort for performance

    // Calculate local time
    const localTime = Math.max(0, currentTime - layerStartTime);

    // Handle boundaries
    if (localTime <= sorted[0].time) return sorted[0].value;
    if (localTime >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;

    // Find segment
    // Binary search could be faster for many keyframes, linear is fine for < 100
    let startIndex = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
        if (localTime >= sorted[i].time && localTime < sorted[i + 1].time) {
            startIndex = i;
            break;
        }
    }

    const startKey = sorted[startIndex];
    const endKey = sorted[startIndex + 1];

    const segmentDuration = endKey.time - startKey.time;
    if (segmentDuration === 0) return endKey.value;

    const t = (localTime - startKey.time) / segmentDuration;
    const easedT = applyEasing(t, startKey.easing, startKey.bezier);

    return interpolateValues(startKey.value, endKey.value, easedT);
}
export const easePolyIn = (t: number) => t * t * t;

`;
const GRADIENTS_TS = `
import { Texture } from 'pixi.js';

const gradientTextureCache = new Map<string, Texture>();

export const createGradientTexture = (stops: { offset: number, color: string }[]) => {
    // Generate a simple 1x256 gradient texture
    // We use a fixed width (256) for the texture quality.
    // The Sprite will be scaled to cover the screen.
    const key = JSON.stringify(stops);
    if (gradientTextureCache.has(key)) return gradientTextureCache.get(key)!;

    const width = 256;
    const height = 1;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) return Texture.WHITE;

    const grad = ctx.createLinearGradient(0, 0, width, 0);
    const sortedStops = [...stops].sort((a, b) => a.offset - b.offset);

    sortedStops.forEach(stop => {
        grad.addColorStop(stop.offset / 100, stop.color);
    });

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const texture = Texture.from(canvas);
    gradientTextureCache.set(key, texture);
    return texture;
};

`;

const GEOMETRY_TS = `

const polygonCache = new Map<number, { x: number, y: number }[]>();
const starCache = new Map<number, { x: number, y: number, type: 'inner' | 'outer' }[]>();
const customShapeCache = new Map<string, { x: number, y: number }[]>();

export const getUnitPolygon = (sides: number) => {
    if (polygonCache.has(sides)) return polygonCache.get(sides)!;
    const points = [];
    const angle = 360 / sides;
    const offset = -90;
    for (let a = 0; a < 360; a += angle) {
        const sx = Math.cos((a + offset) * Math.PI / 180);
        const sy = Math.sin((a + offset) * Math.PI / 180);
        points.push({ x: sx, y: sy });
    }
    polygonCache.set(sides, points);
    return points;
};

export const getUnitStar = (npoints: number) => {
    if (starCache.has(npoints)) return starCache.get(npoints)!;
    const points: { x: number, y: number, type: 'inner' | 'outer' }[] = [];
    const angle = 360 / npoints;
    const halfAngle = angle / 2.0;
    const offset = -90;
    for (let a = 0; a < 360; a += angle) {
        // Outer point (Tip)
        const ox = Math.cos((a + offset) * Math.PI / 180);
        const oy = Math.sin((a + offset) * Math.PI / 180);
        points.push({ x: ox, y: oy, type: 'outer' });

        // Inner point (Valley)
        const ix = Math.cos((a + halfAngle + offset) * Math.PI / 180);
        const iy = Math.sin((a + halfAngle + offset) * Math.PI / 180);
        points.push({ x: ix, y: iy, type: 'inner' });
    }
    starCache.set(npoints, points);
    return points;
};

export const getUnitCustomShape = (pathData: string) => {
    if (customShapeCache.has(pathData)) return customShapeCache.get(pathData)!;

    // Split complex SVG paths into their constituent sub-paths
    // Match 'M' or 'm' followed by any characters until the next 'M' or 'm'
    const subPaths = pathData.match(/[Mm][^Mm]*/g) || [pathData];

    const allPoints = [];
    const svgNS = 'http://www.w3.org/2000/svg';
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (let subData of subPaths) {
        subData = subData.trim();
        if (!subData) continue;

        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', subData);
        const len = path.getTotalLength();
        if (len === 0) continue;

        // Sample
        const points = [];
        const samples = Math.max(10, Math.min(200, Math.floor(len / 2)));
        for (let i = 0; i < samples; i++) {
            const pt = path.getPointAtLength((i / samples) * len);
            points.push({ x: pt.x, y: pt.y });

            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
        }

        const endPt = path.getPointAtLength(len);
        points.push({ x: endPt.x, y: endPt.y });
        if (endPt.x < minX) minX = endPt.x;
        if (endPt.x > maxX) maxX = endPt.x;
        if (endPt.y < minY) minY = endPt.y;
        if (endPt.y > maxY) maxY = endPt.y;

        allPoints.push(...points); // Flatten for the single path legacy format
    }

    if (allPoints.length === 0) return [];

    const width = maxX - minX;
    const height = maxY - minY;
    // Prevent division by zero
    if (width === 0 && height === 0) return [];

    const maxSize = Math.max(width, height);
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;

    const normalizedPoints = allPoints.map(p => ({
        x: (p.x - centerX) / (maxSize / 2),
        y: (p.y - centerY) / (maxSize / 2)
    }));

    customShapeCache.set(pathData, normalizedPoints);
    return normalizedPoints;
};

const customShapesCache = new Map<string, { x: number, y: number }[][]>();

export const getUnitCustomShapes = (pathDatas: string[]) => {
    // We can use a hash of pathDatas or simple string joined by pipe for caching
    const cacheKey = pathDatas.join('|');
    if (customShapesCache.has(cacheKey)) return customShapesCache.get(cacheKey)!;

    const allPathsPoints: { x: number, y: number }[][] = [];
    const svgNS = 'http://www.w3.org/2000/svg';

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (const pathData of pathDatas) {
        if (!pathData) continue;

        // Split complex SVG paths into their constituent sub-paths
        // Match 'M' or 'm' followed by any characters until the next 'M' or 'm'
        const subPaths = pathData.match(/[Mm][^Mm]*/g) || [pathData];

        for (let subData of subPaths) {
            subData = subData.trim();
            if (!subData) continue;

            const path = document.createElementNS(svgNS, 'path');
            path.setAttribute('d', subData);
            const len = path.getTotalLength();
            if (len === 0) continue;

            // Sample points for this specific sub-path
            const points = [];

            // Adjust samples based on length to keep small details but don't oversample
            const samples = Math.max(10, Math.min(200, Math.floor(len / 2)));

            for (let i = 0; i < samples; i++) {
                const pt = path.getPointAtLength((i / samples) * len);
                points.push({ x: pt.x, y: pt.y });
                // Track global bounds across all paths and sub-paths
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.y > maxY) maxY = pt.y;
            }
            // Always add the end point directly to close gaps for precision
            const endPt = path.getPointAtLength(len);
            points.push({ x: endPt.x, y: endPt.y });
            if (endPt.x < minX) minX = endPt.x;
            if (endPt.x > maxX) maxX = endPt.x;
            if (endPt.y < minY) minY = endPt.y;
            if (endPt.y > maxY) maxY = endPt.y;

            allPathsPoints.push(points);
        }
    }

    if (allPathsPoints.length === 0) return [];

    const width = maxX - minX;
    const height = maxY - minY;

    // Prevent division by zero
    if (width === 0 && height === 0) return [];

    const maxSize = Math.max(width, height);
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;

    const normalizedPaths = allPathsPoints.map(points =>
        points.map(p => ({
            x: (p.x - centerX) / (maxSize / 2),
            y: (p.y - centerY) / (maxSize / 2)
        }))
    );

    customShapesCache.set(cacheKey, normalizedPaths);
    return normalizedPaths;
};

`;
const ICHING_RENDERER = `
import { Graphics, Color } from 'pixi.js';
import type { LayerConfig } from '../../types';
import { drawRotatedRect } from './ShapeUtils';
import { getHexagramConfig } from '../../utils/iching';
import { solveCubicBezier } from '../../utils/interpolation';

export const drawIChingHexagram = (g: Graphics, rx: number, ry: number, layerConfig: LayerConfig, progress: number, strokeColor: Color, fillColor: Color) => {
    const id = layerConfig.ichingInputId || 1;
    const highlightIndex = layerConfig.ichingHighlightIndex || 0;
    const hexagram = getHexagramConfig(id);

    const stackHeight = ry * 2;
    const lineWidth = rx * 2;
    const h = stackHeight / 9;
    const spacing = h * 0.6;
    const totalContentHeight = 6 * h + 5 * spacing;
    const yOffsetStart = totalContentHeight / 2 - h / 2;

    const phaseA_End = 0.3;
    const phaseB_End = 0.7;

    const effectiveFillColor = layerConfig.fillEnabled ? fillColor : (layerConfig.strokeEnabled ? strokeColor : new Color(0xffffff));

    for (let i = 0; i < 6; i++) {
        const lineIndex = i + 1;
        const yPos = yOffsetStart - i * (h + spacing);
        const topY = yPos - h / 2;

        // Phase A: Growth
        let easeWidth = 0;
        if (progress <= phaseA_End) {
            if (progress < 0) easeWidth = 0;
            else {
                const localP = progress / phaseA_End;
                const growthStart = i * 0.12;
                const growthDuration = 0.4;
                const growthP = Math.max(0, Math.min(1, (localP - growthStart) / growthDuration));
                easeWidth = solveCubicBezier(growthP, 0.2, 0.6, 0.35, 1.0);
            }
        } else {
            easeWidth = 1.0;
        }

        const currentW = lineWidth * easeWidth;
        if (currentW <= 0.01) continue;

        // Phase B: Gap Wave
        let gapOpenAmount = 0;
        if (progress > 0.1) {
            const waveGlobalP = Math.max(0, (progress - 0.25) * 2.5);
            if (waveGlobalP > 0) {
                const waveHead = waveGlobalP * 7;
                const dist = waveHead - i;
                if (hexagram[i] && dist > 0) {
                    const linearP = Math.max(0, Math.min(1, dist * 0.4));
                    gapOpenAmount = solveCubicBezier(linearP, 0.1, 2.2, 0.25, 1.0);
                }
            }
        }
        gapOpenAmount = Math.max(0, gapOpenAmount);

        const maxGap = Math.min(lineWidth * 0.3, h * 2);
        let currentGap = maxGap * gapOpenAmount;
        const halfW = currentW / 2;

        if (currentGap < 0.5) {
            g.rect(-halfW, topY, currentW, h);
            g.fill({ color: effectiveFillColor });
        } else {
            const halfG = currentGap / 2;
            const segW = halfW - halfG;
            if (segW > 0) {
                g.rect(-halfW, topY, segW, h);
                g.fill({ color: effectiveFillColor });
                g.rect(halfG, topY, segW, h);
                g.fill({ color: effectiveFillColor });
            }
        }

        // Phase C: Highlight
        if (lineIndex === highlightIndex && progress > phaseB_End) {
            const localP = (progress - phaseB_End) / (1.0 - phaseB_End);
            const popP = Math.min(1, localP * 2.5);
            const popScale = solveCubicBezier(popP, 0.175, 0.885, 0.32, 1.275);
            const slideP = Math.max(0, (localP - 0.4) * 1.66);
            const slideEase = solveCubicBezier(slideP, 0.2, 0.6, 0.35, 1.0);

            const dSize = h / Math.sqrt(2);
            const anchorRight = lineWidth / 2;
            const anchorLeft = -anchorRight;

            if (popP > 0) {
                drawRotatedRect(g, anchorLeft, yPos, dSize * popScale, dSize * popScale, 45, effectiveFillColor);
                drawRotatedRect(g, anchorRight, yPos, dSize * popScale, dSize * popScale, 45, effectiveFillColor);
            }
            if (slideP > 0) {
                const maxOffset = h;
                const offsetDist = maxOffset * slideEase;
                drawRotatedRect(g, anchorLeft - offsetDist, yPos, dSize, dSize, 45, effectiveFillColor);
                drawRotatedRect(g, anchorRight + offsetDist, yPos, dSize, dSize, 45, effectiveFillColor);
            }
        }
    }
};

export const drawIChingLines = (g: Graphics, rx: number, ry: number, layerConfig: LayerConfig, strokeColor: Color, strokeWeight: number) => {
    const id = layerConfig.ichingInputId || 1;
    const hexagram = getHexagramConfig(id);

    // We only draw strokes if stroke is enabled
    if (!layerConfig.strokeEnabled || strokeWeight <= 0) return;

    g.setStrokeStyle({ width: strokeWeight, color: strokeColor, alignment: 0.5, cap: 'round' });

    const lineWidth = rx * 2;
    const halfW = lineWidth / 2;
    const gapSize = lineWidth * 0.3; // size of the empty gap in broken lines

    for (let i = 0; i < 6; i++) {
        // i=0 is bottom (ry), i=5 is top (-ry)
        const t = i / 5;
        const yPos = ry - t * 2 * ry;

        const isBroken = hexagram[i]; // true for broken line (Yin), false for solid (Yang)

        if (!isBroken) {
            // Solid line
            g.moveTo(-halfW, yPos);
            g.lineTo(halfW, yPos);
        } else {
            // Broken line
            const halfGap = gapSize / 2;
            const segW = halfW - halfGap;

            // Left segment
            g.moveTo(-halfW, yPos);
            g.lineTo(-halfW + segW, yPos);

            // Right segment
            g.moveTo(halfGap, yPos);
            g.lineTo(halfGap + segW, yPos);
        }
    }
    g.stroke();
};

`;

const MOLECULE_RENDERER = `

import { Graphics, Color } from 'pixi.js';
import type { LayerConfig } from '../../types';
import { MOLECULES, ATOM_PROPERTIES } from '../../data/molecules';
import { rotatePoint, project3D } from '../../utils/math3d';

interface DrawCommand {
    type: 'atom' | 'bond';
    z: number;
    draw: () => void;
}

export const drawMolecule = (g: Graphics, rx: number, _ry: number, layerConfig: LayerConfig, strokeColor: Color, fillColor: Color, rotateX: number, rotateY: number) => {
    if (layerConfig?.molecule && MOLECULES[layerConfig.molecule]) {
        const data = MOLECULES[layerConfig.molecule];
        const scale = rx / 10;
        const filled = layerConfig.moleculeFill ?? false;

        const commands: DrawCommand[] = [];

        // Bonds
        if (Array.isArray(data.bonds)) {
            data.bonds.forEach(bond => {
                if (!bond || bond.length < 2) return;
                const a1 = data.atoms[bond[0]];
                const a2 = data.atoms[bond[1]];
                if (!a1 || !a2) return;

                const p1Raw = rotatePoint(a1.x * scale, a1.y * scale, a1.z * scale, rotateX, rotateY);
                const p2Raw = rotatePoint(a2.x * scale, a2.y * scale, a2.z * scale, rotateX, rotateY);

                const p1 = project3D(p1Raw);
                const p2 = project3D(p2Raw);
                const avgZ = (p1Raw.z + p2Raw.z) / 2;
                const thickness = (p1.scale + p2.scale) / 2;

                commands.push({
                    type: 'bond',
                    z: avgZ,
                    draw: () => {
                        g.moveTo(p1.x, p1.y);
                        g.lineTo(p2.x, p2.y);
                        g.stroke({ width: 1 * thickness, color: strokeColor, cap: 'round', join: 'round' });
                    }
                });
            });
        }

        // Atoms
        if (Array.isArray(data.atoms)) {
            data.atoms.forEach(atom => {
                const pRaw = rotatePoint(atom.x * scale, atom.y * scale, atom.z * scale, rotateX, rotateY);
                const p = project3D(pRaw);
                const props = (ATOM_PROPERTIES && ATOM_PROPERTIES[atom.element]) ? ATOM_PROPERTIES[atom.element] : { size: 0.2 };
                const size = props.size * scale * 2 * p.scale;

                commands.push({
                    type: 'atom',
                    z: pRaw.z,
                    draw: () => {
                        if (filled) {
                            g.circle(p.x, p.y, size);
                            g.fill({ color: fillColor });
                        } else {
                            g.circle(p.x, p.y, size);
                            g.stroke({ width: 1, color: strokeColor });
                        }
                    }
                });
            });
        }

        // Sort by Z (depth)
        commands.sort((a, b) => a.z - b.z);

        // Execute
        commands.forEach(cmd => cmd.draw());
    }
};

`;
const POLYHEDRON_RENDERER = `

import { Graphics, Color } from 'pixi.js';
import type { LayerConfig } from '../../types';
import { rotatePoint, project3D } from '../../utils/math3d';

interface PolyhedronData {
    vertices: { x: number, y: number, z: number }[];
    edges: [number, number][];
    edgeLengthRatio?: number;
}

const phi = (1 + Math.sqrt(5)) / 2;

export const POLYHEDRA: Record<string, PolyhedronData> = {
    'tetrahedron': {
        vertices: [
            { x: 1, y: 1, z: 1 },
            { x: 1, y: -1, z: -1 },
            { x: -1, y: 1, z: -1 },
            { x: -1, y: -1, z: 1 }
        ],
        edges: [
            [0, 1], [0, 2], [0, 3],
            [1, 2], [1, 3],
            [2, 3]
        ]
    },
    'cube': {
        vertices: [
            { x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: -1, y: 1, z: -1 },
            { x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 }
        ],
        edges: [
            [0, 1], [1, 2], [2, 3], [3, 0], // Back face
            [4, 5], [5, 6], [6, 7], [7, 4], // Front face
            [0, 4], [1, 5], [2, 6], [3, 7]  // Connecting edges
        ]
    },
    'octahedron': {
        vertices: [
            { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
            { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
            { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }
        ],
        edges: [
            [0, 2], [2, 1], [1, 3], [3, 0], // Middle square (if flat) - actually these connect to poles
            [0, 4], [2, 4], [1, 4], [3, 4], // Top pyramid
            [0, 5], [2, 5], [1, 5], [3, 5]  // Bottom pyramid
        ]
    },
    'dodecahedron': {
        vertices: [
            // (±1, ±1, ±1)
            { x: -1, y: -1, z: -1 }, { x: -1, y: -1, z: 1 },
            { x: -1, y: 1, z: -1 }, { x: -1, y: 1, z: 1 },
            { x: 1, y: -1, z: -1 }, { x: 1, y: -1, z: 1 },
            { x: 1, y: 1, z: -1 }, { x: 1, y: 1, z: 1 },
            // (0, ±1/phi, ±phi)
            { x: 0, y: -1 / phi, z: -phi }, { x: 0, y: -1 / phi, z: phi },
            { x: 0, y: 1 / phi, z: -phi }, { x: 0, y: 1 / phi, z: phi },
            // (±1/phi, ±phi, 0)
            { x: -1 / phi, y: -phi, z: 0 }, { x: -1 / phi, y: phi, z: 0 },
            { x: 1 / phi, y: -phi, z: 0 }, { x: 1 / phi, y: phi, z: 0 },
            // (±phi, 0, ±1/phi)
            { x: -phi, y: 0, z: -1 / phi }, { x: -phi, y: 0, z: 1 / phi },
            { x: phi, y: 0, z: -1 / phi }, { x: phi, y: 0, z: 1 / phi }
        ],
        edges: [] // Will be calculated dynamically
    },
    'icosahedron': {
        vertices: [
            // (0, ±1, ±phi)
            { x: 0, y: 1, z: phi }, { x: 0, y: 1, z: -phi }, { x: 0, y: -1, z: phi }, { x: 0, y: -1, z: -phi },
            // (±1, ±phi, 0)
            { x: 1, y: phi, z: 0 }, { x: 1, y: -phi, z: 0 }, { x: -1, y: phi, z: 0 }, { x: -1, y: -phi, z: 0 },
            // (±phi, 0, ±1)
            { x: phi, y: 0, z: 1 }, { x: phi, y: 0, z: -1 }, { x: -phi, y: 0, z: 1 }, { x: -phi, y: 0, z: -1 }
        ],
        edges: [] // Will calc dynamic
    },
    'rhombic triacontahedron': {
        vertices: [
            // (±1, ±1, ±1) (8)
            { x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: -1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: -1, z: -1 },
            { x: -1, y: 1, z: 1 }, { x: -1, y: 1, z: -1 }, { x: -1, y: -1, z: 1 }, { x: -1, y: -1, z: -1 },
            // (0, ±phi, ±1/phi) (12)
            { x: 0, y: phi, z: 1 / phi }, { x: 0, y: phi, z: -1 / phi }, { x: 0, y: -phi, z: 1 / phi }, { x: 0, y: -phi, z: -1 / phi },
            { x: 1 / phi, y: 0, z: phi }, { x: 1 / phi, y: 0, z: -phi }, { x: -1 / phi, y: 0, z: phi }, { x: -1 / phi, y: 0, z: -phi },
            { x: phi, y: 1 / phi, z: 0 }, { x: phi, y: -1 / phi, z: 0 }, { x: -phi, y: 1 / phi, z: 0 }, { x: -phi, y: -1 / phi, z: 0 },
            // (0, ±1, ±phi^2) (12) -> Icosidodecahedron Dual check
            // Actually, simply scaling the Icosahedron vertices (0, ±1, ±phi) to match magnitude works too?
            // Let's use the known set: (±1, ±1, ±1) and (0, ±phi, ±1/phi) and (±1/phi, ±phi, 0)??
            // Re-verified: The vertices are (±1, ±1, ±1) and (0, ±1/phi, ±phi) cyclic permutations.
            // Wait, (0, ±1/phi, ±phi) cyclic has 12 vertices. 8+12 = 20 (Dodecahedron).
            // Where are the other 12?
            // The other 12 are (0, ±phi, ±1) cyclic? No.
            // Vertices of Rhombic Triacontahedron are:
            // 1. (±1, ±1, ±1) [8]
            // 2. (0, ±phi, ±1/phi) cyclic [12] -> These form Dodecahedron together?
            // 3. (0, ±1, ±phi^2) cyclic [12] -> These are the Icosahedron-like ones?
            // Let's try the set (0, ±1, ±phi^2) cyclic.
            { x: 0, y: 1, z: phi * phi }, { x: 0, y: 1, z: -phi * phi }, { x: 0, y: -1, z: phi * phi }, { x: 0, y: -1, z: -phi * phi },
            { x: phi * phi, y: 0, z: 1 }, { x: phi * phi, y: 0, z: -1 }, { x: -phi * phi, y: 0, z: 1 }, { x: -phi * phi, y: 0, z: -1 },
            { x: 1, y: phi * phi, z: 0 }, { x: 1, y: -phi * phi, z: 0 }, { x: -1, y: phi * phi, z: 0 }, { x: -1, y: -phi * phi, z: 0 }
        ],
        edges: [] // Dynamic
    },
    'truncated cube': {
        vertices: [
            // (±1, ±1, ±(1+sqrt(2))) perms
            // Using val = 2.414
            ...[1, -1].flatMap(x => [1, -1].flatMap(y => [2.414, -2.414].map(z => ({ x, y, z })))), // Z-axis
            ...[1, -1].flatMap(x => [2.414, -2.414].flatMap(y => [1, -1].map(z => ({ x, y, z })))), // Y-axis
            ...[2.414, -2.414].flatMap(x => [1, -1].flatMap(y => [1, -1].map(z => ({ x, y, z }))))  // X-axis
        ],
        edges: [] // Dynamic
    },
    'truncated tetrahedron': {
        vertices: [
            // Permutations of (±1, ±1, ±3) with even minus signs
            // (3, 1, 1) -> 3 perms
            { x: 3, y: 1, z: 1 }, { x: 1, y: 3, z: 1 }, { x: 1, y: 1, z: 3 },
            // (-3, -1, 1) -> 3 perms
            { x: -3, y: -1, z: 1 }, { x: -3, y: 1, z: -1 }, { x: 1, y: -1, z: -3 }, // Wait, logic:
            // Perms of (-3, -1, 1)
            { x: -3, y: -1, z: 1 }, { x: -3, y: 1, z: -1 }, { x: 1, y: -3, z: -1 },
            { x: -1, y: -3, z: 1 }, { x: -1, y: 1, z: -3 }, { x: 1, y: -1, z: -3 }, // Mixed... let's list clearly
            // 4 corners of tetra: (1,1,1), (1,-1,-1), (-1,1,-1), (-1,-1,1)
            // Cut (1,1,1) -> (3,1,1), (1,3,1), (1,1,3)
            { x: 3, y: 1, z: 1 }, { x: 1, y: 3, z: 1 }, { x: 1, y: 1, z: 3 },
            // Cut (1,-1,-1) -> (3,-1,-1), (1,-3,-1), (1,-1,-3)
            { x: 3, y: -1, z: -1 }, { x: 1, y: -3, z: -1 }, { x: 1, y: -1, z: -3 },
            // Cut (-1,1,-1) -> (-3,1,-1), (-1,3,-1), (-1,1,-3)
            { x: -3, y: 1, z: -1 }, { x: -1, y: 3, z: -1 }, { x: -1, y: 1, z: -3 },
            // Cut (-1,-1,1) -> (-3,-1,1), (-1,-3,1), (-1,-1,3)
            { x: -3, y: -1, z: 1 }, { x: -1, y: -3, z: 1 }, { x: -1, y: -1, z: 3 }
        ],
        edges: [] // Dynamic
    },
    'triakis octahedron': {
        vertices: [
            // Octahedron (Inner/Base) - Scale 1.5
            { x: 1.5, y: 0, z: 0 }, { x: -1.5, y: 0, z: 0 },
            { x: 0, y: 1.5, z: 0 }, { x: 0, y: -1.5, z: 0 },
            { x: 0, y: 0, z: 1.5 }, { x: 0, y: 0, z: -1.5 },
            // Cube (Outer/Peaks) - Scale 2.5
            { x: 2.5, y: 2.5, z: 2.5 }, { x: 2.5, y: 2.5, z: -2.5 },
            { x: 2.5, y: -2.5, z: 2.5 }, { x: 2.5, y: -2.5, z: -2.5 },
            { x: -2.5, y: 2.5, z: 2.5 }, { x: -2.5, y: 2.5, z: -2.5 },
            { x: -2.5, y: -2.5, z: 2.5 }, { x: -2.5, y: -2.5, z: -2.5 }
        ],
        edges: [
            // Manual Edges
            // 1. Octahedron Edges (0-5)
            [0, 2], [0, 3], [0, 4], [0, 5],
            [1, 2], [1, 3], [1, 4], [1, 5],
            [2, 4], [2, 5], [3, 4], [3, 5],
            // 2. Pyramid Edges (Cube 6-13 to Octa 0-5)
            // Each Cube vertex connects to 3 mutually adjacent Octa vertices
            // (2.5, 2.5, 2.5) -> (1.5,0,0), (0,1.5,0), (0,0,1.5) => 6 -> 0, 2, 4
            [6, 0], [6, 2], [6, 4],
            // (2.5, 2.5, -2.5) -> (1.5, 0, 0), (0, 1.5, 0), (0, 0, -1.5) => 7 -> 0, 2, 5
            [7, 0], [7, 2], [7, 5],
            // (2.5, -2.5, 2.5) -> (1.5, 0, 0), (0, -1.5, 0), (0, 0, 1.5) => 8 -> 0, 3, 4
            [8, 0], [8, 3], [8, 4],
            // (2.5, -2.5, -2.5) -> (1.5, 0, 0), (0, -1.5, 0), (0, 0, -1.5) => 9 -> 0, 3, 5
            [9, 0], [9, 3], [9, 5],
            // (-2.5, 2.5, 2.5) -> (-1.5, 0, 0), (0, 1.5, 0), (0, 0, 1.5) => 10 -> 1, 2, 4
            [10, 1], [10, 2], [10, 4],
            // (-2.5, 2.5, -2.5) -> (-1.5, 0, 0), (0, 1.5, 0), (0, 0, -1.5) => 11 -> 1, 2, 5
            [11, 1], [11, 2], [11, 5],
            // (-2.5, -2.5, 2.5) -> (-1.5, 0, 0), (0, -1.5, 0), (0, 0, 1.5) => 12 -> 1, 3, 4
            [12, 1], [12, 3], [12, 4],
            // (-2.5, -2.5, -2.5) -> (-1.5, 0, 0), (0, -1.5, 0), (0, 0, -1.5) => 13 -> 1, 3, 5
            [13, 1], [13, 3], [13, 5]
        ]
    },
    'cuboctahedron': {
        vertices: [
            // Permutations of (±1, ±1, 0)
            { x: 1, y: 1, z: 0 }, { x: 1, y: -1, z: 0 }, { x: -1, y: 1, z: 0 }, { x: -1, y: -1, z: 0 },
            { x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: -1 }, { x: -1, y: 0, z: 1 }, { x: -1, y: 0, z: -1 },
            { x: 0, y: 1, z: 1 }, { x: 0, y: 1, z: -1 }, { x: 0, y: -1, z: 1 }, { x: 0, y: -1, z: -1 }
        ],
        edges: [] // Dynamic
    },
    'rhombic dodecahedron': {
        vertices: [
            // (±1, ±1, ±1) (Cube)
            { x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: -1, y: 1, z: -1 },
            { x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 },
            // (±2, 0, 0) & perms (Octahedron)
            { x: 2, y: 0, z: 0 }, { x: -2, y: 0, z: 0 },
            { x: 0, y: 2, z: 0 }, { x: 0, y: -2, z: 0 },
            { x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: -2 }
        ],
        edges: [] // Dynamic
    },
    'truncated octahedron': {
        vertices: [
            // Permutations of (0, ±1, ±2)
            { x: 0, y: 1, z: 2 }, { x: 0, y: 1, z: -2 }, { x: 0, y: -1, z: 2 }, { x: 0, y: -1, z: -2 },
            { x: 0, y: 2, z: 1 }, { x: 0, y: 2, z: -1 }, { x: 0, y: -2, z: 1 }, { x: 0, y: -2, z: -1 },

            { x: 1, y: 0, z: 2 }, { x: 1, y: 0, z: -2 }, { x: -1, y: 0, z: 2 }, { x: -1, y: 0, z: -2 },
            { x: 2, y: 0, z: 1 }, { x: 2, y: 0, z: -1 }, { x: -2, y: 0, z: 1 }, { x: -2, y: 0, z: -1 },

            { x: 1, y: 2, z: 0 }, { x: 1, y: -2, z: 0 }, { x: -1, y: 2, z: 0 }, { x: -1, y: -2, z: 0 },
            { x: 2, y: 1, z: 0 }, { x: 2, y: -1, z: 0 }, { x: -2, y: 1, z: 0 }, { x: -2, y: -1, z: 0 }
        ],
        edges: [] // Dynamic
    },
    'stella octangula': {
        vertices: [
            // Tetra 1
            { x: 1, y: 1, z: 1 }, { x: 1, y: -1, z: -1 }, { x: -1, y: 1, z: -1 }, { x: -1, y: -1, z: 1 },
            // Tetra 2
            { x: -1, y: -1, z: -1 }, { x: -1, y: 1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: -1 }
        ],
        edges: [
            // Tetra 1
            [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
            // Tetra 2
            [4, 5], [4, 6], [4, 7], [5, 6], [5, 7], [6, 7]
        ]
    },
    'small stellated dodecahedron': {
        vertices: [
            // Same as Icosahedron
            // (0, ±1, ±phi)
            { x: 0, y: 1, z: phi }, { x: 0, y: 1, z: -phi }, { x: 0, y: -1, z: phi }, { x: 0, y: -1, z: -phi },
            // (±1, ±phi, 0)
            { x: 1, y: phi, z: 0 }, { x: 1, y: -phi, z: 0 }, { x: -1, y: phi, z: 0 }, { x: -1, y: -phi, z: 0 },
            // (±phi, 0, ±1)
            { x: phi, y: 0, z: 1 }, { x: phi, y: 0, z: -1 }, { x: -phi, y: 0, z: 1 }, { x: -phi, y: 0, z: -1 }
        ],
        edges: [], // Dynamic
        edgeLengthRatio: phi // Connect to "second" neighbors via pentagram
    }
};

const _validateEdges = (name: string) => {
    const p = POLYHEDRA[name];
    if (p.edges.length > 0) return;

    const vertices = p.vertices;
    // Find min distance (edge length) - robust enough for regular polyhedra
    let minD = Infinity;

    // Sample distance
    for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
            const dx = vertices[i].x - vertices[j].x;
            const dy = vertices[i].y - vertices[j].y;
            const dz = vertices[i].z - vertices[j].z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d < minD && d > 0.001) minD = d;
        }
    }

    // If a specific ratio is requested (e.g. for stellated shapes), target that distance
    // Using simple property check on the object (TS assumes it exists on PolyhedronData now)
    const targetD = (p as any).edgeLengthRatio ? minD * (p as any).edgeLengthRatio : minD;
    const epsilon = 0.01;

    for (let i = 0; i < vertices.length; i++) {
        for (let j = i + 1; j < vertices.length; j++) {
            const dx = vertices[i].x - vertices[j].x;
            const dy = vertices[i].y - vertices[j].y;
            const dz = vertices[i].z - vertices[j].z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (Math.abs(d - targetD) < epsilon) {
                p.edges.push([i, j]);
            }
        }
    }
};

export const drawPolyhedron = (g: Graphics, rx: number, _ry: number, layerConfig: LayerConfig, strokeColor: Color, _fillColor: Color, rotateX: number, rotateY: number, rotateZ: number, strokeWeight: number, perspective: number) => {
    const name = layerConfig.polyhedronName?.toLowerCase() || 'tetrahedron';
    const pData = POLYHEDRA[name] || POLYHEDRA['tetrahedron'];

    // Ensure edges are calculated
    if (pData.edges.length === 0) _validateEdges(name);

    const scale = rx; // Use radiusX as scale
    // const filled = layerConfig.fillEnabled ?? false; // Not implementing fill correct depth sorting yet, just wireframe

    // 1. Project Vertices
    const projectedPoints = pData.vertices.map(v => {
        // Rotate Point in 3D
        // rotatePoint signature from math3d: (x, y, z, rotX, rotY, rotZ) -> {x, y, z}
        // Assuming math3d handles degrees
        const pRot = rotatePoint(v.x * scale, v.y * scale, v.z * scale, rotateX, rotateY, rotateZ);

        // Project to 2D
        const pProj = project3D(pRot, perspective);

        return { x: pProj.x, y: pProj.y, z: pRot.z, scale: pProj.scale };
    });

    // 2. Draw Edges
    if (layerConfig.strokeEnabled) {
        const weight = strokeWeight || 1;
        const color = strokeColor;

        pData.edges.forEach(([i, j]) => {
            const p1 = projectedPoints[i];
            const p2 = projectedPoints[j];

            g.moveTo(p1.x, p1.y);
            g.lineTo(p2.x, p2.y);
            g.stroke({ width: weight, color: color, cap: 'round', join: 'round' });
        });
    }

    // 3. Draw Dots (Vertices)
    if (layerConfig.dotsEnabled) {
        const size = layerConfig.dotSize || 4;
        projectedPoints.forEach(p => {
            // For simplicity, just circle
            // Scale size by perspective scale? p.scale is like 1/(z+dist)
            const s = size * p.scale;
            g.circle(p.x, p.y, s / 2);
            if (layerConfig.dotType === 'filled') g.fill({ color: strokeColor });
            else g.stroke({ width: 1, color: strokeColor });
        });
    }
};

`;
const SHAPE_UTILS = `
import { Graphics, Color } from 'pixi.js';

export const drawRotatedRect = (g: Graphics, x: number, y: number, w: number, h: number, rotationDeg: number, fillColor: Color) => {
    const rad = rotationDeg * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const hw = w / 2;
    const hh = h / 2;
    const points = [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }];
    const rotatedPoints = points.map(p => ({
        x: x + (p.x * cos - p.y * sin),
        y: y + (p.x * sin + p.y * cos)
    }));
    g.poly(rotatedPoints.map(p => p.x).flatMap((_, i) => [rotatedPoints[i].x, rotatedPoints[i].y]));
    g.fill({ color: fillColor });
};

`;

const ICHING_UTILS = `
/**
 * Maps an input ID (1-64) to a 6-line I-Ching hexagram configuration.
 * Returns an array of booleans where:
 * true = Gap (Broken Line)
 * false = Solid (Continuous Line)
 * 
 * We use a standard binary mapping for simplicity, unless a specific sequence is required.
 * ID 1 -> 000000 -> All Solid (Heaven/Creative) - Wait, in binary 0 usually means off. 
 * Let's standarize: 
 * 0 = Solid (Yang)
 * 1 = Broken (Yin)
 * 
 * Note: I-Ching usually builds from Bottom (Line 1) to Top (Line 6).
 */
export const getHexagramConfig = (id: number): boolean[] => {
    // Clamp ID to 1-64
    const safeId = Math.max(1, Math.min(64, Math.floor(id)));

    // Convert to 0-63 index
    const index = safeId - 1;

    // binary string, padded to 6 bits. e.g. 0 -> "000000"
    const binary = index.toString(2).padStart(6, '0');

    // Convert string to boolean array.
    // We reverse it to map index 0 to the "Bottom" line if we treat string LSB/MSB a certain way.
    // "000001" -> 1 is at end.
    // Let's assume standard binary counting where LSB changes fastest.
    // ID 1: 000000
    // ID 2: 000001
    // ...
    // Map char '1' to true (Gap/Broken) and '0' to false (Solid).

    return binary.split('').map(char => char === '1').reverse();
    // Reversing ensures LSB (fastest changing) is at index 0 (Bottom Line) 
    // or we can keep it as is. 
    // Usually Hexagrams are read Bottom to Top.
    // Let's assume index 0 = Bottom Line.
};

`;

const MATH3D_UTILS = `

export const CAMERA_Z = 1200;

export const rotatePoint = (x: number, y: number, z: number, rotateX: number, rotateY: number, rotateZ: number = 0) => {
    const radX = rotateX * (Math.PI / 180);
    const radY = rotateY * (Math.PI / 180);
    const radZ = rotateZ * (Math.PI / 180);

    const cosX = Math.cos(radX);
    const sinX = Math.sin(radX);
    const cosY = Math.cos(radY);
    const sinY = Math.sin(radY);
    const cosZ = Math.cos(radZ);
    const sinZ = Math.sin(radZ);

    // 1. Rotate around X
    const y1 = y * cosX - z * sinX;
    const z1 = y * sinX + z * cosX;
    const x1 = x;

    // 2. Rotate around Y
    const x2 = x1 * cosY + z1 * sinY;
    const z2 = -x1 * sinY + z1 * cosY;
    const y2 = y1;

    // 3. Rotate around Z
    const x3 = x2 * cosZ - y2 * sinZ;
    const y3 = x2 * sinZ + y2 * cosZ;
    const z3 = z2;

    return { x: x3, y: y3, z: z3 };
};

export const project3D = (p: { x: number, y: number, z: number }, cameraZ: number = CAMERA_Z) => {
    // Safety check to avoid division by zero if point is at camera
    const dist = cameraZ - p.z;
    const perspective = dist > 1 ? cameraZ / dist : 100; // Fallback if too close/behind
    return {
        x: p.x * perspective,
        y: p.y * perspective,
        scale: perspective,
        z: p.z // Keep z for sorting
    };
};

`;

const MOLECULES_DATA = `
export interface Atom {
    element: string;
    x: number;
    y: number;
    z: number;
}

export interface MoleculeData {
    name: string;
    formula: string;
    atoms: Atom[];
    bonds: number[][]; // [index1, index2, bondType]
}

export const MOLECULES: Record<string, MoleculeData> = {
    threonine: {
        name: "Threonine",
        formula: "C₄H₉NO₃",
        atoms: [
            { element: 'C', x: 0, y: 0, z: 0 }, { element: 'C', x: 1.4, y: 0.5, z: 0.3 },
            { element: 'O', x: 1.8, y: 1.5, z: -0.2 }, { element: 'O', x: 2.0, y: -0.4, z: 0.8 },
            { element: 'H', x: 2.8, y: -0.6, z: 0.6 }, { element: 'N', x: -1.0, y: 1.0, z: -0.5 },
            { element: 'H', x: -1.5, y: 1.5, z: 0.1 }, { element: 'H', x: -1.5, y: 0.8, z: -1.3 },
            { element: 'H', x: -0.5, y: -0.8, z: -0.5 }, { element: 'C', x: -0.5, y: -0.5, z: 1.5 },
            { element: 'H', x: -1.0, y: -1.3, z: 1.8 }, { element: 'O', x: 0.6, y: -1.0, z: 2.2 },
            { element: 'H', x: 0.9, y: -0.4, z: 2.8 }, { element: 'C', x: -1.7, y: 0.5, z: 2.0 },
            { element: 'H', x: -1.4, y: 1.3, z: 2.5 }, { element: 'H', x: -2.5, y: 0.8, z: 1.4 },
            { element: 'H', x: -2.0, y: -0.0, z: 2.9 }
        ],
        bonds: [
            [0, 1, 1], [0, 5, 1], [0, 8, 1], [0, 9, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1],
            [5, 6, 1], [5, 7, 1], [9, 10, 1], [9, 11, 1], [9, 13, 1], [11, 12, 1],
            [13, 14, 1], [13, 15, 1], [13, 16, 1]
        ]
    },
    alanine: {
        name: "Alanine",
        formula: "C₃H₇NO₂",
        atoms: [
            { element: 'C', x: 0, y: 0, z: 0 }, { element: 'C', x: 1.4, y: 0.5, z: 0.3 },
            { element: 'O', x: 1.8, y: 1.5, z: -0.2 }, { element: 'O', x: 2.0, y: -0.4, z: 0.8 },
            { element: 'H', x: 2.8, y: -0.6, z: 0.6 }, { element: 'N', x: -1.0, y: 1.0, z: -0.5 },
            { element: 'H', x: -1.5, y: 1.5, z: 0.1 }, { element: 'H', x: -1.5, y: 0.8, z: -1.3 },
            { element: 'H', x: -0.5, y: -0.8, z: -0.5 }, { element: 'C', x: -0.5, y: -0.5, z: 1.5 },
            { element: 'H', x: -0.5, y: -1.6, z: 1.5 }, { element: 'H', x: -1.5, y: -0.2, z: 1.8 },
            { element: 'H', x: 0.2, y: -0.1, z: 2.2 }
        ],
        bonds: [
            [0, 1, 1], [0, 5, 1], [0, 8, 1], [0, 9, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1],
            [5, 6, 1], [5, 7, 1], [9, 10, 1], [9, 11, 1], [9, 12, 1]
        ]
    },
    serine: {
        name: "Serine",
        formula: "C₃H₇NO₃",
        atoms: [
            { element: 'C', x: 0, y: 0, z: 0 }, { element: 'C', x: 1.4, y: 0.5, z: 0.3 },
            { element: 'O', x: 1.8, y: 1.5, z: -0.2 }, { element: 'O', x: 2.0, y: -0.4, z: 0.8 },
            { element: 'H', x: 2.8, y: -0.6, z: 0.6 }, { element: 'N', x: -1.0, y: 1.0, z: -0.5 },
            { element: 'H', x: -1.5, y: 1.5, z: 0.1 }, { element: 'H', x: -1.5, y: 0.8, z: -1.3 },
            { element: 'H', x: -0.5, y: -0.8, z: -0.5 }, { element: 'C', x: -0.5, y: -0.5, z: 1.5 },
            { element: 'H', x: -1.5, y: -0.3, z: 1.8 }, { element: 'H', x: -0.3, y: -1.6, z: 1.5 },
            { element: 'O', x: 0.3, y: 0.2, z: 2.4 }, { element: 'H', x: 0.1, y: 0.0, z: 3.3 }
        ],
        bonds: [
            [0, 1, 1], [0, 5, 1], [0, 8, 1], [0, 9, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1],
            [5, 6, 1], [5, 7, 1], [9, 10, 1], [9, 11, 1], [9, 12, 1], [12, 13, 1]
        ]
    },
    cysteine: {
        name: "Cysteine",
        formula: "C₃H₇NO₂S",
        atoms: [
            { element: 'C', x: 0, y: 0, z: 0 }, { element: 'C', x: 1.4, y: 0.5, z: 0.3 },
            { element: 'O', x: 1.8, y: 1.5, z: -0.2 }, { element: 'O', x: 2.0, y: -0.4, z: 0.8 },
            { element: 'H', x: 2.8, y: -0.6, z: 0.6 }, { element: 'N', x: -1.0, y: 1.0, z: -0.5 },
            { element: 'H', x: -1.5, y: 1.5, z: 0.1 }, { element: 'H', x: -1.5, y: 0.8, z: -1.3 },
            { element: 'H', x: -0.5, y: -0.8, z: -0.5 }, { element: 'C', x: -0.5, y: -0.5, z: 1.5 },
            { element: 'H', x: -1.5, y: -0.3, z: 1.8 }, { element: 'H', x: -0.3, y: -1.6, z: 1.5 },
            { element: 'S', x: 0.4, y: 0.4, z: 2.7 }, { element: 'H', x: 0.1, y: -0.3, z: 3.7 }
        ],
        bonds: [
            [0, 1, 1], [0, 5, 1], [0, 8, 1], [0, 9, 1], [1, 2, 2], [1, 3, 1], [3, 4, 1],
            [5, 6, 1], [5, 7, 1], [9, 10, 1], [9, 11, 1], [9, 12, 1], [12, 13, 1]
        ]
    }
};

export const ATOM_PROPERTIES: Record<string, { size: number }> = {
    'C': { size: 0.24 },
    'H': { size: 0.14 },
    'O': { size: 0.21 },
    'N': { size: 0.23 },
    'S': { size: 0.28 }
};

`;

const ASTRO_TS = `
export const ASTRO_PATHS = [
    'M10 50 L22 31.5 C22.5 31 23 31 23.5 30.5 C24 30 24.5 30 25 30 C25.5 30 26 30 26.5 30.5 C27 30.5 27.5 31 28 31.5 L40 48.5 C40 49 40.5 49 41 49.5 C41.5 50 42 50 42.5 50 C43 50 43.5 50 44 49.5 C44.5 49 45 49 45 48.5 L57 31 C57.5 31 58 30.5 58.5 30 C59 30 59.5 30 60 30 C60.5 30 61 30 61.5 30 C62 30.5 62.5 31 63 31 L75 48.5 C75 49 75.5 49 76 49.5 C76.5 50 77 50 77.5 50 C78 50 78.5 50 79 49.5 C79.5 49 80 49 80 48.5 L92 31.5 C92.5 31 93 30.5 93.5 30.5 C94 30 94.5 30 95 30 C95.5 30 96 30 96.5 30.5 C97 31 97 31 98 31.5 L110 50 M10 90 L22 71.5 C22.5 71 23 71 23.5 70.5 C24 70 24.5 70 25 70 C25.5 70 26 70 26.5 70.5 C27 71 27.5 71 28 71.5 L40 88.5 C40 89 40.5 89 41 89.5 C41.5 90 42 90 42.5 90 C43 90 43.5 90 44 89.5 C44.5 89 45 89 45 88.5 L57 71 C57.5 71 58 70.5 58.5 70.5 C59 70 59.5 70 60 70 C60.5 70 61 70 61.5 70.5 C62 70.5 62.5 71 63 71 L75 88.5 C75 89 75.5 89 76 89.5 C76.5 90 77 90 77.5 90 C78 90 78.5 90 79 89.5 C79.5 89 80 89 80 88.5 L92 71.5 C92.5 71 93 71 93.5 70.5 C94 70 94.5 70 95 70 C95.5 70 96 70 96.5 70.5 C97 71 97 71 98 71.5 L110 90',
    'M60 35 C60 30 61.5 25 64 21 C67 17 70.5 14 75 12 C79 10 84 9.5 89 10 C94 11 98 13 102 16.5 C105 19.5 108 24 109 28.5 C110 33 110 38 109 42.5 C107 47 104.5 51 101 54.5 C97 57.5 92.5 59 88 60 M60 35 C60 30 58.5 25 56 21 C53 17 49.5 14 45 12 C40.5 10 36 9.5 31 10 C26 11 22 13 18 16.5 C14.5 19.5 12 24 11 28.5 C9.5 33 10 38 11 42.5 C12.5 47 15.5 51 19 54.5 C23 57.5 27.5 59 32 60 M60 35 V110',
    'M110 74 C110 81 107 88 101.5 94 C96 100 88 105 78.5 107 C69 110 59 111 49.5 109 C40 107.5 31 104 24 99 M110 74 C110 84.5 101 93 90.5 93 C80 93 71 84.5 71 74 C71 63 80 54.5 90.5 54.5 C101 54.5 110 63 110 74 Z M10 46 C10 39 13 32 18.5 26 C24 20 32 15 41 12.5 C50.5 10 61 9 70.5 11 C80 12 89 16 96 21 M10 46 C10 57 19 65.5 29.5 65.5 C40 65.5 49 57 49 46 C49 35 40 26.5 29.5 26.5 C19 26.5 10 35 10 46 Z',
    'M54.5 110 C59 110 63 108 66 105 C69 102 71 98 71 93 V29.5 C71 24 69 19 65.5 15.5 C62 12 57 10 51.5 10 C46.5 10 41.5 12 38 15.5 C34 19 32 24 32 29.5 M32 99 V26.5 C32 22 30.5 18 27 15 C24 12 20 10 15.5 10 M104.5 88 C104.5 97 97 104.5 88 104.5 C78.5 104.5 71 97 71 88 C71 78.5 78.5 71 88 71 C97 71 104.5 78.5 104.5 88 Z',
    'M82 18.5 V101.5 M104.5 10 C91 17 75.5 21 60 21 C44.5 21 29 17 15.5 10 M15.5 110 C29 103 44.5 99 60 99 C75.5 99 91 103 104.5 110 M38 18.5 V101.5',
    'M49 82 C49 60 32 57 32 38 C32 30.5 35 23 40 18 C45.5 13 52.5 10 60 10 C67 10 74.5 13 79.5 18 C85 23 88 30.5 88 38 C88 57 71 72 71 93 C71 98 73 102 76 105 C79 108 83 110 88 110 C92 110 96.5 108 99.5 105 C102.5 102 104.5 98 104.5 93 M49 82 C49 91.5 41.5 99 32 99 C23 99 15.5 91.5 15.5 82 C15.5 73 23 65.5 32 65.5 C41.5 65.5 49 73 49 82 Z',
    'M10 82 H48 C49 82 49 80.5 48 80 C41 77 35 72 31 65 C27 58.5 26 50.5 27 43 C28.5 35 32.5 28 38.5 23 C44.5 18 52 15.5 60 15.5 C68 15.5 75 18 81 23 C87 28 91.5 35 93 43 C94 50.5 93 58.5 89 65 C85 72 79 77 72 80 C71 80.5 71 82 72 82 H110 M10 104.5 H110',
    'M99 110 C88 95.5 82 78 82 60 C82 42 88 24.5 99 10 M104.5 60 H15.5 M21 10 C32 24.5 38 42 38 60 C38 78 32 95.5 21 110',
    'M76.5 10 H110 M110 10 V43 M110 10 L10 110 M43 43 L76.5 76.5',
    'M48.5 93 V24 M48.5 24 C48.5 21 50 17.5 52 15 C54.5 12.5 58 11 61 11 C64.5 11 68 12.5 70 15 C73 17.5 74 21 74 24 V83 C74 86 75 88.5 77 90 C79 92 81.5 93 84 93 H110 M48.5 24 C48.5 21 47 17.5 45 15 C42 12.5 39 11 35.5 11 C32 11 29 12.5 26.5 15 C24 17.5 23 21 23 24 M110 93 L94.5 78 M110 93 L94.5 109 M23 93 V24 M23 24 C23 21 21.5 17.5 19 15 C16.5 12.5 13.5 11 10 11',
    'M60 43 C41.5 43 26.5 58 26.5 76.5 C26.5 95 41.5 110 60 110 C78.5 110 93 95 93 76.5 C93 58 78.5 43 60 43 Z M60 43 C69 43 77 40 83.5 33.5 C90 27 93 19 93 10 M60 43 C51 43 42.5 40 36.5 33.5 C30 27 26.5 19 26.5 10',
    'M54.5 24 C54.5 20 56 16.5 58.5 14 C61 11.5 64.5 10 68 10 C72 10 75.5 11.5 78 14 C81 16.5 82 20 82 24 V82 C82 89.5 85 96.5 90 102 C95.5 107 102.5 110 110 110 M54.5 24 C54.5 20 53 16.5 50 14 C48 11.5 44 10 40.5 10 C37 10 33 11.5 31 14 C28 16.5 26.5 20 26.5 24 M54.5 24 V99 M82 57 C82 53.5 83.5 50 86 47.5 C89 45 92.5 43 96 43 C100 43 103 45 106 47.5 C108.5 50 110 53.5 110 57 V82 C110 89.5 107 96.5 102 102 C96.5 107 89.5 110 82 110 M26.5 99 V26.5 C26.5 22 25 18 22 15 C18.5 12 14.5 10 10 10'
];
`;

const AMINO_TS = `
// Extracted and transformed Amino SVG paths
// Circles use arc commands for perfect rendering, connectors are filled rectangles
export const AMINO_PATHS = [
    [
        'M69.04 61.17 L76.69 68.07 L78.03 66.59 L70.38 59.68 Z',
        'M57.32 62.86 L70.4 62.34 L70.32 60.34 L57.24 60.86 Z',
        'M65.44 61.99 A4 4 0 1 0 73.44 61.99 A4 4 0 1 0 65.44 61.99 Z',
        'M72.31 67.14 A3 3 0 1 0 78.31 67.14 A3 3 0 1 0 72.31 67.14 Z',
        'M31.96 62.75 L45.12 62.73 L45.11 60.73 L31.96 60.75 Z',
        'M42.84 50.29 L42.86 63.44 L44.86 63.44 L44.84 50.28 Z',
        'M44.17 62.88 L57.24 62.36 L57.16 60.36 L44.09 60.88 Z',
        'M44.27 72.64 L44.29 63.02 L42.29 63.02 L42.27 72.64 Z',
        'M40.12 71.65 A3 3 0 1 0 46.12 71.65 A3 3 0 1 0 40.12 71.65 Z',
        'M39.63 61.96 A4 4 0 1 0 47.63 61.96 A4 4 0 1 0 39.63 61.96 Z',
        'M55.1 60.56 A4 4 0 1 0 63.1 60.56 A4 4 0 1 0 55.1 60.56 Z',
        'M58.96 73.08 L60.7 64.72 L58.74 64.31 L57.01 72.68 Z',
        'M60.46 72.8 L61.69 64.51 L59.72 64.21 L58.48 72.5 Z',
        'M54.82 71.74 A4 4 0 1 0 62.82 71.74 A4 4 0 1 0 54.82 71.74 Z',
        'M29.7 64.35 L22.8 72.01 L24.29 73.35 L31.19 65.69 Z',
        'M21.45 72.03 A3 3 0 1 0 27.45 72.03 A3 3 0 1 0 21.45 72.03 Z',
        'M20.53 57.26 L29.36 61.95 L30.3 60.19 L21.47 55.49 Z',
        'M18.65 57.28 A3 3 0 1 0 24.65 57.28 A3 3 0 1 0 18.65 57.28 Z',
        'M25.64 63.05 A4.5 4.5 0 1 0 34.64 63.05 A4.5 4.5 0 1 0 25.64 63.05 Z',
        'M33.62 52.89 L41.03 51.74 L40.72 49.76 L33.31 50.91 Z',
        'M46.63 49.26 L51.68 45.94 L50.58 44.27 L45.53 47.58 Z',
        'M39.35 50.36 A4 4 0 1 0 47.35 50.36 A4 4 0 1 0 39.35 50.36 Z',
        'M48.47 44.04 A3 3 0 1 0 54.47 44.04 A3 3 0 1 0 48.47 44.04 Z',
        'M31.45 51.75 A3 3 0 1 0 37.45 51.75 A3 3 0 1 0 31.45 51.75 Z',
        'M40.98 41.69 L42.63 49.02 L44.58 48.59 L42.94 41.25 Z',
        'M39.53 41.89 A3 3 0 1 0 45.53 41.89 A3 3 0 1 0 39.53 41.89 Z'
    ],
    [
        'M65.78 64.9 L58.18 63.09 L57.72 65.04 L65.31 66.85 Z',
        'M69.39 60.64 L62.67 66.22 L63.94 67.76 L70.67 62.18 Z',
        'M78.71 62.92 L70.67 61.33 L70.28 63.29 L78.33 64.88 Z',
        'M68.04 58.06 A2 2 0 1 0 72.04 58.06 A2 2 0 1 0 68.04 58.06 Z',
        'M69.38 58.51 A2 2 0 1 0 73.38 58.51 A2 2 0 1 0 69.38 58.51 Z',
        'M67.92 62.09 A3 3 0 1 0 73.92 62.09 A3 3 0 1 0 67.92 62.09 Z',
        'M84.54 60.93 L77.6 62.7 L78.1 64.64 L85.03 62.87 Z',
        'M82.56 61.45 A2 2 0 1 0 86.56 61.45 A2 2 0 1 0 82.56 61.45 Z',
        'M76.41 64.85 L75.28 71.55 L77.25 71.88 L78.39 65.18 Z',
        'M74.27 70.6 A2 2 0 1 0 78.27 70.6 A2 2 0 1 0 74.27 70.6 Z',
        'M74.18 64.56 A3 3 0 1 0 80.18 64.56 A3 3 0 1 0 74.18 64.56 Z',
        'M63.15 50.75 L68.95 55.69 L70.25 54.17 L64.45 49.23 Z',
        'M63.14 51.56 A2 2 0 1 0 67.14 51.56 A2 2 0 1 0 63.14 51.56 Z',
        'M76.71 50.29 L70.66 53.85 L71.67 55.57 L77.72 52.01 Z',
        'M74.32 51.59 A2 2 0 1 0 78.32 51.59 A2 2 0 1 0 74.32 51.59 Z',
        'M67.72 54.93 A3 3 0 1 0 73.72 54.93 A3 3 0 1 0 67.72 54.93 Z',
        'M55.61 63 L48.44 67.67 L49.54 69.35 L56.71 64.67 Z',
        'M55.23 65.32 L57.45 70.92 L59.31 70.18 L57.09 64.58 Z',
        'M56.57 58.38 L54.76 63.74 L56.66 64.38 L58.46 59.01 Z',
        'M55.74 59.14 A2 2 0 1 0 59.74 59.14 A2 2 0 1 0 55.74 59.14 Z',
        'M52.72 62.94 A3 3 0 1 0 58.72 62.94 A3 3 0 1 0 52.72 62.94 Z',
        'M55.93 69.65 A2 2 0 1 0 59.93 69.65 A2 2 0 1 0 55.93 69.65 Z',
        'M41.82 67.14 L49.41 71.18 L50.35 69.42 L42.76 65.37 Z',
        'M35.23 69.2 L35.7 61.15 L33.7 61.03 L33.23 69.08 Z',
        'M35 69.86 L42.16 67.42 L41.52 65.53 L34.36 67.97 Z',
        'M33.9 69.34 L33.65 77.83 L35.65 77.89 L35.9 69.39 Z',
        'M27.56 70.12 L33.6 69.91 L33.53 67.91 L27.49 68.12 Z',
        'M25.97 68.9 A2 2 0 1 0 29.97 68.9 A2 2 0 1 0 25.97 68.9 Z',
        'M32.57 68.47 A3 3 0 1 0 38.57 68.47 A3 3 0 1 0 32.57 68.47 Z',
        'M34.83 86.75 L29.9 91.44 L31.28 92.89 L36.21 88.2 Z',
        'M35.63 87.9 L35.42 79.63 L33.43 79.67 L33.63 87.95 Z',
        'M31.85 87.25 A3 3 0 1 0 37.85 87.25 A3 3 0 1 0 31.85 87.25 Z',
        'M30.16 90.82 A2 2 0 1 0 34.16 90.82 A2 2 0 1 0 30.16 90.82 Z',
        'M31.65 78.98 A3 3 0 1 0 37.65 78.98 A3 3 0 1 0 31.65 78.98 Z',
        'M28.18 78.97 A2 2 0 1 0 32.18 78.97 A2 2 0 1 0 28.18 78.97 Z',
        'M28.18 80.08 A2 2 0 1 0 32.18 80.08 A2 2 0 1 0 28.18 80.08 Z',
        'M25.61 79.19 A3 3 0 1 0 31.61 79.19 A3 3 0 1 0 25.61 79.19 Z',
        'M33.37 59.68 L28.24 54.97 L26.88 56.44 L32.01 61.15 Z',
        'M26.01 55.48 A2 2 0 1 0 30.01 55.48 A2 2 0 1 0 26.01 55.48 Z',
        'M36.01 60.27 L39.38 54.69 L37.67 53.65 L34.3 59.23 Z',
        'M35.85 55.06 A2 2 0 1 0 39.85 55.06 A2 2 0 1 0 35.85 55.06 Z',
        'M30.81 60.42 A3 3 0 1 0 36.81 60.42 A3 3 0 1 0 30.81 60.42 Z',
        'M41.07 67.04 L41.72 72.85 L43.71 72.63 L43.06 66.81 Z',
        'M43.44 60.86 L40.52 66.22 L42.27 67.18 L45.19 61.82 Z',
        'M42.54 61.79 A2 2 0 1 0 46.54 61.79 A2 2 0 1 0 42.54 61.79 Z',
        'M38.84 66.48 A3 3 0 1 0 44.84 66.48 A3 3 0 1 0 38.84 66.48 Z',
        'M40.72 72.74 A2 2 0 1 0 44.72 72.74 A2 2 0 1 0 40.72 72.74 Z',
        'M52.58 75.75 L50.14 69.7 L48.28 70.45 L50.73 76.49 Z',
        'M49.51 70.11 L51.09 64.3 L49.16 63.78 L47.58 69.59 Z',
        'M48.34 64.49 A2 2 0 1 0 52.34 64.49 A2 2 0 1 0 48.34 64.49 Z',
        'M45.99 69.63 A3 3 0 1 0 51.99 69.63 A3 3 0 1 0 45.99 69.63 Z',
        'M49.21 75.22 A2 2 0 1 0 53.21 75.22 A2 2 0 1 0 49.21 75.22 Z',
        'M68.04 73.16 L65.6 66 L63.7 66.64 L66.14 73.8 Z',
        'M64.87 73.03 A2 2 0 1 0 68.87 73.03 A2 2 0 1 0 64.87 73.03 Z',
        'M62.77 66.32 A3 3 0 1 0 68.77 66.32 A3 3 0 1 0 62.77 66.32 Z'
    ],
    [
        'M58.36 55.28 L49.16 56.69 L49.47 58.67 L58.66 57.25 Z',
        'M41.15 68.93 L53.53 69.29 L53.59 67.29 L41.21 66.93 Z',
        'M54.47 69.29 L48.82 56.57 L46.99 57.38 L52.64 70.11 Z',
        'M53.64 69.28 L66.72 68.23 L66.56 66.23 L53.48 67.29 Z',
        'M53.84 78.82 L53.14 69.62 L51.15 69.78 L51.85 78.97 Z',
        'M49.49 77.83 A3 3 0 1 0 55.49 77.83 A3 3 0 1 0 49.49 77.83 Z',
        'M48.5 67.93 A4 4 0 1 0 56.5 67.93 A4 4 0 1 0 48.5 67.93 Z',
        'M79.33 67.19 L85.69 74.27 L87.18 72.93 L80.82 65.86 Z',
        'M67.73 69.29 L80.81 68.94 L80.75 66.94 L67.67 67.29 Z',
        'M75.37 67.94 A4 4 0 1 0 83.37 67.94 A4 4 0 1 0 75.37 67.94 Z',
        'M82.02 72.18 A3 3 0 1 0 88.02 72.18 A3 3 0 1 0 82.02 72.18 Z',
        'M63.7 68.29 A4 4 0 1 0 71.7 68.29 A4 4 0 1 0 63.7 68.29 Z',
        'M63.99 74.65 A3 3 0 1 0 69.99 74.65 A3 3 0 1 0 63.99 74.65 Z',
        'M65.4 74.65 A3 3 0 1 0 71.4 74.65 A3 3 0 1 0 65.4 74.65 Z',
        'M63.7 77.48 A4 4 0 1 0 71.7 77.48 A4 4 0 1 0 63.7 77.48 Z',
        'M39.03 70.79 L32.31 78.22 L33.79 79.56 L40.51 72.14 Z',
        'M32.11 77.83 A2 2 0 1 0 36.11 77.83 A2 2 0 1 0 32.11 77.83 Z',
        'M30.07 63.84 L38.56 68.79 L39.57 67.07 L31.08 62.11 Z',
        'M29.28 63.69 A2 2 0 1 0 33.28 63.69 A2 2 0 1 0 29.28 63.69 Z',
        'M34.21 68.99 A4.5 4.5 0 1 0 43.21 68.99 A4.5 4.5 0 1 0 34.21 68.99 Z',
        'M47.72 56.12 L40.3 51.52 L39.25 53.22 L46.67 57.82 Z',
        'M55.25 46.1 L47.12 56.35 L48.69 57.59 L56.82 47.34 Z',
        'M39.25 54.14 A3 3 0 1 0 45.25 54.14 A3 3 0 1 0 39.25 54.14 Z',
        'M44.26 58.03 A4 4 0 1 0 52.26 58.03 A4 4 0 1 0 44.26 58.03 Z',
        'M54.8 56.97 A3 3 0 1 0 60.8 56.97 A3 3 0 1 0 54.8 56.97 Z',
        'M55.95 47.51 L65.85 39.73 L64.61 38.16 L54.71 45.93 Z',
        'M50.98 47.07 A4 4 0 1 0 58.98 47.07 A4 4 0 1 0 50.98 47.07 Z',
        'M46.49 40 L51.44 44.95 L52.85 43.54 L47.91 38.59 Z',
        'M48.53 37.79 L53.48 44.15 L55.06 42.92 L50.11 36.56 Z',
        'M44.97 39.65 A4 4 0 1 0 52.97 39.65 A4 4 0 1 0 44.97 39.65 Z',
        'M64.7 39.41 L69.3 30.57 L67.53 29.64 L62.93 38.48 Z',
        'M66.06 31.17 A2 2 0 1 0 70.06 31.17 A2 2 0 1 0 66.06 31.17 Z',
        'M65.36 43.1 L74.55 45.22 L75 43.27 L65.81 41.15 Z',
        'M71.36 44.25 A2 2 0 1 0 75.36 44.25 A2 2 0 1 0 71.36 44.25 Z',
        'M60.02 40.36 A4.5 4.5 0 1 0 69.02 40.36 A4.5 4.5 0 1 0 60.02 40.36 Z'
    ],
    [
        'M47.21 50.91 L56.16 49.84 L55.92 47.86 L46.97 48.92 Z',
        'M51.72 59.68 L39.43 59.6 L39.41 61.6 L51.71 61.68 Z',
        'M45.27 50.97 L50.12 62.4 L51.96 61.62 L47.11 50.19 Z',
        'M63.54 59.53 L51.02 59.9 L51.07 61.89 L63.6 61.53 Z',
        'M49.59 61.83 L49.98 71 L51.98 70.91 L51.59 61.74 Z',
        'M46.87 69.83 A3 3 0 1 0 52.87 69.83 A3 3 0 1 0 46.87 69.83 Z',
        'M46.6 60.67 A4 4 0 1 0 54.6 60.67 A4 4 0 1 0 46.6 60.67 Z',
        'M77.12 59.46 L82.67 66.21 L84.21 64.94 L78.66 58.19 Z',
        'M65.84 61.54 L78.36 61.17 L78.3 59.17 L65.78 59.54 Z',
        'M74.21 60.17 A3 3 0 1 0 80.21 60.17 A3 3 0 1 0 74.21 60.17 Z',
        'M80.67 65.13 A3 3 0 1 0 86.67 65.13 A3 3 0 1 0 80.67 65.13 Z',
        'M61.81 60.54 A4 4 0 1 0 69.81 60.54 A4 4 0 1 0 61.81 60.54 Z',
        'M61.65 67.24 A3 3 0 1 0 67.65 67.24 A3 3 0 1 0 61.65 67.24 Z',
        'M63.66 67.7 A3 3 0 1 0 69.66 67.7 A3 3 0 1 0 63.66 67.7 Z',
        'M62.52 69.93 A3 3 0 1 0 68.52 69.93 A3 3 0 1 0 62.52 69.93 Z',
        'M32.04 71.73 L38.35 64.84 L36.87 63.49 L30.57 70.38 Z',
        'M29.2 70.39 A3 3 0 1 0 35.2 70.39 A3 3 0 1 0 29.2 70.39 Z',
        'M37.24 59.49 L28.99 54.74 L28 56.48 L36.24 61.22 Z',
        'M26.39 56.06 A3 3 0 1 0 32.39 56.06 A3 3 0 1 0 26.39 56.06 Z',
        'M33.58 61.04 A4.5 4.5 0 1 0 42.58 61.04 A4.5 4.5 0 1 0 33.58 61.04 Z',
        'M47.58 50.17 L39.79 45.64 L38.78 47.37 L46.58 51.9 Z',
        'M46.53 49.86 L54.2 40.29 L52.64 39.04 L44.97 48.61 Z',
        'M36.96 46.29 A3 3 0 1 0 42.96 46.29 A3 3 0 1 0 36.96 46.29 Z',
        'M42.19 50.58 A4 4 0 1 0 50.19 50.58 A4 4 0 1 0 42.19 50.58 Z',
        'M52.37 49.07 A3 3 0 1 0 58.37 49.07 A3 3 0 1 0 52.37 49.07 Z',
        'M62.7 30.44 L52.59 38.2 L53.81 39.79 L63.92 32.03 Z',
        'M48.97 39.44 A4 4 0 1 0 56.97 39.44 A4 4 0 1 0 48.97 39.44 Z',
        'M45.64 34.49 A2 2 0 1 0 49.64 34.49 A2 2 0 1 0 45.64 34.49 Z',
        'M47.43 33.16 A2 2 0 1 0 51.43 33.16 A2 2 0 1 0 47.43 33.16 Z',
        'M43.76 31.8 A3 3 0 1 0 49.76 31.8 A3 3 0 1 0 43.76 31.8 Z',
        'M59.18 32.34 A3 3 0 1 0 65.18 32.34 A3 3 0 1 0 59.18 32.34 Z'
    ],
    [
        'M48.14 43.72 L40.28 48.54 L41.33 50.25 L49.19 45.43 Z',
        'M39.6 47.66 A3 3 0 1 0 45.6 47.66 A3 3 0 1 0 39.6 47.66 Z',
        'M42.78 38.75 L48.09 46.69 L49.75 45.58 L44.44 37.64 Z',
        'M41.44 39.34 A3 3 0 1 0 47.44 39.34 A3 3 0 1 0 41.44 39.34 Z',
        'M50.58 44.77 L57.41 33.71 L55.71 32.65 L48.88 43.71 Z',
        'M42.83 56.79 L54.99 56.71 L54.98 54.71 L42.81 54.79 Z',
        'M55.94 35.58 L65.23 34.53 L65 32.54 L55.72 33.59 Z',
        'M47.71 45.54 L53.95 57.17 L55.71 56.23 L49.47 44.6 Z',
        'M67.18 54.14 L54.94 54.71 L55.03 56.71 L67.28 56.14 Z',
        'M51.83 34.58 A4 4 0 1 0 59.83 34.58 A4 4 0 1 0 51.83 34.58 Z',
        'M61.13 33.38 A3 3 0 1 0 67.13 33.38 A3 3 0 1 0 61.13 33.38 Z',
        'M52.77 57.11 L53.4 65.82 L55.39 65.67 L54.76 56.96 Z',
        'M50.98 65.17 A3 3 0 1 0 56.98 65.17 A3 3 0 1 0 50.98 65.17 Z',
        'M51 55.56 A3 3 0 1 0 57 55.56 A3 3 0 1 0 51 55.56 Z',
        'M80.37 54.49 L86.83 61.59 L88.31 60.25 L81.85 53.14 Z',
        'M69.24 56.45 L81.98 55.96 L81.9 53.96 L69.17 54.45 Z',
        'M76.88 55.29 A4 4 0 1 0 84.88 55.29 A4 4 0 1 0 76.88 55.29 Z',
        'M66.21 55.45 A3 3 0 1 0 72.21 55.45 A3 3 0 1 0 66.21 55.45 Z',
        'M68.46 66.47 L69.8 58.08 L67.82 57.76 L66.48 66.16 Z',
        'M69.51 66.19 L71.43 57.38 L69.47 56.96 L67.56 65.77 Z',
        'M64.69 64.99 A4 4 0 1 0 72.69 64.99 A4 4 0 1 0 64.69 64.99 Z',
        'M35.33 66.79 L42.1 59.27 L40.62 57.93 L33.84 65.46 Z',
        'M32.24 65.22 A3 3 0 1 0 38.24 65.22 A3 3 0 1 0 32.24 65.22 Z',
        'M41.34 54.61 L32.51 49.65 L31.53 51.4 L40.36 56.35 Z',
        'M29.93 51.18 A3 3 0 1 0 35.93 51.18 A3 3 0 1 0 29.93 51.18 Z',
        'M36.69 56.47 A4 4 0 1 0 44.69 56.47 A4 4 0 1 0 36.69 56.47 Z',
        'M46.65 44.73 A3 3 0 1 0 52.65 44.73 A3 3 0 1 0 46.65 44.73 Z',
        'M83.66 60.27 A3 3 0 1 0 89.66 60.27 A3 3 0 1 0 83.66 60.27 Z'
    ],
    [
        'M55.3 51.76 L66.9 58.06 L67.86 56.31 L56.26 50.01 Z',
        'M43.6 44 L43.38 55.67 L45.38 55.71 L45.6 44.03 Z',
        'M54.4 50.12 L43 54.92 L43.78 56.76 L55.18 51.96 Z',
        'M42.89 55.76 L42.9 68.92 L44.9 68.92 L44.89 55.76 Z',
        'M33.88 56.81 L43.34 55.85 L43.14 53.86 L33.67 54.82 Z',
        'M31.69 55.16 A3 3 0 1 0 37.69 55.16 A3 3 0 1 0 31.69 55.16 Z',
        'M41.8 55.12 A3 3 0 1 0 47.8 55.12 A3 3 0 1 0 41.8 55.12 Z',
        'M39.55 89.67 L46.69 83.51 L45.39 81.99 L38.25 88.16 Z',
        'M46.13 83.32 L45.2 70.82 L43.21 70.97 L44.13 83.47 Z',
        'M40.9 81.92 A4 4 0 1 0 48.9 81.92 A4 4 0 1 0 40.9 81.92 Z',
        'M36.81 88.27 A3 3 0 1 0 42.81 88.27 A3 3 0 1 0 36.81 88.27 Z',
        'M41.62 70.32 A3 3 0 1 0 47.62 70.32 A3 3 0 1 0 41.62 70.32 Z',
        'M33.64 69.95 L41.93 71.2 L42.22 69.22 L33.94 67.97 Z',
        'M33.85 71.43 L41.64 72.76 L41.98 70.78 L34.18 69.46 Z',
        'M31.01 70.29 A4 4 0 1 0 39.01 70.29 A4 4 0 1 0 31.01 70.29 Z',
        'M41.97 41.74 L34.4 35.32 L33.11 36.84 L40.68 43.26 Z',
        'M31.9 36.92 A3 3 0 1 0 37.9 36.92 A3 3 0 1 0 31.9 36.92 Z',
        'M45.65 42.46 L50.44 34.13 L48.7 33.14 L43.92 41.47 Z',
        'M46.15 34.2 A3 3 0 1 0 52.15 34.2 A3 3 0 1 0 46.15 34.2 Z',
        'M39.3 42.19 A4 4 0 1 0 47.3 42.19 A4 4 0 1 0 39.3 42.19 Z',
        'M57.32 60.82 L56.43 51.85 L54.44 52.05 L55.33 61.02 Z',
        'M55.85 49.48 L60.22 41.72 L58.47 40.74 L54.11 48.5 Z',
        'M55.09 42.94 A3 3 0 1 0 61.09 42.94 A3 3 0 1 0 55.09 42.94 Z',
        'M51.79 51.04 A3 3 0 1 0 57.79 51.04 A3 3 0 1 0 51.79 51.04 Z',
        'M52.68 60.01 A3 3 0 1 0 58.68 60.01 A3 3 0 1 0 52.68 60.01 Z',
        'M66.01 56.35 L77.82 50.98 L77 49.16 L65.18 54.53 Z',
        'M75.65 49.58 L85.77 56.11 L86.85 54.43 L76.73 47.9 Z',
        'M73.5 50.71 A3 3 0 1 0 79.5 50.71 A3 3 0 1 0 73.5 50.71 Z',
        'M76.04 44.25 A3 3 0 1 0 82.04 44.25 A3 3 0 1 0 76.04 44.25 Z',
        'M77.67 45.01 A3 3 0 1 0 83.67 45.01 A3 3 0 1 0 77.67 45.01 Z',
        'M77.2 41.89 A4 4 0 1 0 85.2 41.89 A4 4 0 1 0 77.2 41.89 Z',
        'M81.97 56.33 A4 4 0 1 0 89.97 56.33 A4 4 0 1 0 81.97 56.33 Z',
        'M64.88 57.24 L67.66 65.41 L69.55 64.77 L66.77 56.6 Z',
        'M66.03 47.88 L63.79 56.32 L65.72 56.84 L67.96 48.39 Z',
        'M64.15 49.13 A3 3 0 1 0 70.15 49.13 A3 3 0 1 0 64.15 49.13 Z',
        'M62.18 56.01 A3 3 0 1 0 68.18 56.01 A3 3 0 1 0 62.18 56.01 Z',
        'M66.02 64.52 A3 3 0 1 0 72.02 64.52 A3 3 0 1 0 66.02 64.52 Z'
    ],
    [
        'M71.29 58.89 L61.48 53.69 L60.54 55.45 L70.35 60.66 Z',
        'M51.69 59.69 L52.21 48.29 L50.22 48.2 L49.7 59.6 Z',
        'M50.21 59.89 L60.3 55.48 L59.5 53.65 L49.4 58.05 Z',
        'M49.7 58.52 L49.63 69.7 L51.63 69.71 L51.7 58.53 Z',
        'M48.74 56.19 L41.58 57.49 L41.94 59.46 L49.1 58.16 Z',
        'M39.21 58.25 A3 3 0 1 0 45.21 58.25 A3 3 0 1 0 39.21 58.25 Z',
        'M46.48 58.08 A4 4 0 1 0 54.48 58.08 A4 4 0 1 0 46.48 58.08 Z',
        'M45.79 88.77 L52.09 83.45 L50.8 81.92 L44.5 87.25 Z',
        'M49.62 71.94 L49.55 83.12 L51.55 83.13 L51.62 71.95 Z',
        'M47.05 82.01 A3.5 3.5 0 1 0 54.05 82.01 A3.5 3.5 0 1 0 47.05 82.01 Z',
        'M43.04 87.57 A3 3 0 1 0 49.04 87.57 A3 3 0 1 0 43.04 87.57 Z',
        'M46.4 71.5 A4 4 0 1 0 54.4 71.5 A4 4 0 1 0 46.4 71.5 Z',
        'M41.36 70.56 A3 3 0 1 0 47.36 70.56 A3 3 0 1 0 41.36 70.56 Z',
        'M41.58 72.13 A3 3 0 1 0 47.58 72.13 A3 3 0 1 0 41.58 72.13 Z',
        'M39.07 71.45 A3.5 3.5 0 1 0 46.07 71.45 A3.5 3.5 0 1 0 39.07 71.45 Z',
        'M40.78 41.57 L47.45 47.2 L48.74 45.67 L42.07 40.04 Z',
        'M39.31 41.48 A3 3 0 1 0 45.31 41.48 A3 3 0 1 0 39.31 41.48 Z',
        'M52.11 46.48 L56.18 38.91 L54.42 37.96 L50.35 45.54 Z',
        'M51.85 39.77 A3 3 0 1 0 57.85 39.77 A3 3 0 1 0 51.85 39.77 Z',
        'M45.88 46.67 A4 4 0 1 0 53.88 46.67 A4 4 0 1 0 45.88 46.67 Z',
        'M59.12 55.11 L59.96 63.61 L61.95 63.42 L61.11 54.91 Z',
        'M64.01 46.03 L59.72 53.16 L61.43 54.19 L65.72 47.06 Z',
        'M60.73 48.77 A3 3 0 1 0 66.73 48.77 A3 3 0 1 0 60.73 48.77 Z',
        'M55.67 54.11 A4 4 0 1 0 63.67 54.11 A4 4 0 1 0 55.67 54.11 Z',
        'M57.52 62.62 A3 3 0 1 0 63.52 62.62 A3 3 0 1 0 57.52 62.62 Z',
        'M79.18 52.88 L69.09 57.28 L69.89 59.12 L79.98 54.71 Z',
        'M89.24 59.04 L80.33 53.4 L79.26 55.09 L88.17 60.73 Z',
        'M75.13 54.01 A4 4 0 1 0 83.13 54.01 A4 4 0 1 0 75.13 54.01 Z',
        'M78.4 48.44 A3 3 0 1 0 84.4 48.44 A3 3 0 1 0 78.4 48.44 Z',
        'M79.96 49.34 A3 3 0 1 0 85.96 49.34 A3 3 0 1 0 79.96 49.34 Z',
        'M79.92 46.89 A3.5 3.5 0 1 0 86.92 46.89 A3.5 3.5 0 1 0 79.92 46.89 Z',
        'M88.02 58.84 L96.95 61.14 L97.45 59.2 L88.52 56.91 Z',
        'M93.31 59.49 A3 3 0 1 0 99.31 59.49 A3 3 0 1 0 93.31 59.49 Z',
        'M85.47 61.09 L86.31 69.59 L88.3 69.4 L87.46 60.89 Z',
        'M83.86 68.6 A3 3 0 1 0 89.86 68.6 A3 3 0 1 0 83.86 68.6 Z',
        'M83.14 60.1 A4 4 0 1 0 91.14 60.1 A4 4 0 1 0 83.14 60.1 Z',
        'M68.36 60.43 L71.89 67.61 L73.68 66.73 L70.15 59.55 Z',
        'M69.54 60.04 L71.83 52.23 L69.91 51.67 L67.62 59.48 Z',
        'M68.09 52.4 A3 3 0 1 0 74.09 52.4 A3 3 0 1 0 68.09 52.4 Z',
        'M64.81 59.09 A4 4 0 1 0 72.81 59.09 A4 4 0 1 0 64.81 59.09 Z',
        'M69.56 66.72 A3 3 0 1 0 75.56 66.72 A3 3 0 1 0 69.56 66.72 Z'
    ],
    [
        'M70.97 46.11 L78.69 53.94 L80.12 52.54 L72.39 44.71 Z',
        'M73.06 45.83 L60.69 46.1 L60.73 48.1 L73.11 47.83 Z',
        'M68.37 47.53 A4 4 0 1 0 76.37 47.53 A4 4 0 1 0 68.37 47.53 Z',
        'M74.64 52.87 A3 3 0 1 0 80.64 52.87 A3 3 0 1 0 74.64 52.87 Z',
        'M46.51 46.02 L47.28 36.83 L45.29 36.66 L44.52 45.85 Z',
        'M42.92 38.51 A3 3 0 1 0 48.92 38.51 A3 3 0 1 0 42.92 38.51 Z',
        'M34.53 48.63 L47.26 48.71 L47.27 46.71 L34.55 46.63 Z',
        'M59.62 46.45 L46.54 46.71 L46.58 48.71 L59.66 48.45 Z',
        'M44.84 49.11 L44.78 58.3 L46.78 58.32 L46.84 49.13 Z',
        'M42.43 57.25 A3 3 0 1 0 48.43 57.25 A3 3 0 1 0 42.43 57.25 Z',
        'M41.85 47.7 A4 4 0 1 0 49.85 47.7 A4 4 0 1 0 41.85 47.7 Z',
        'M57.06 47.46 A4 4 0 1 0 65.06 47.46 A4 4 0 1 0 57.06 47.46 Z',
        'M57.3 54.52 A3 3 0 1 0 63.3 54.52 A3 3 0 1 0 57.3 54.52 Z',
        'M59.42 54.54 A3 3 0 1 0 65.42 54.54 A3 3 0 1 0 59.42 54.54 Z',
        'M56.99 57.36 A4 4 0 1 0 64.99 57.36 A4 4 0 1 0 56.99 57.36 Z',
        'M32.01 50.12 L25.24 57.5 L26.72 58.85 L33.49 51.47 Z',
        'M24.05 57.12 A3 3 0 1 0 30.05 57.12 A3 3 0 1 0 24.05 57.12 Z',
        'M32.92 46.03 L23.41 40.66 L22.42 42.41 L31.93 47.78 Z',
        'M21.32 42.96 A3 3 0 1 0 27.32 42.96 A3 3 0 1 0 21.32 42.96 Z',
        'M28.26 48.67 A4.5 4.5 0 1 0 37.26 48.67 A4.5 4.5 0 1 0 28.26 48.67 Z'
    ],
    [
        'M45.75 90.78 L51.43 85.28 L50.04 83.84 L44.36 89.34 Z',
        'M51.27 85.42 L51 74.01 L49 74.06 L49.27 85.47 Z',
        'M46.35 84.1 A3.5 3.5 0 1 0 53.35 84.1 A3.5 3.5 0 1 0 46.35 84.1 Z',
        'M43.46 89.4 A2.5 2.5 0 1 0 48.46 89.4 A2.5 2.5 0 1 0 43.46 89.4 Z',
        'M60.8 58.8 L68.58 62.27 L69.39 60.45 L61.62 56.97 Z',
        'M75.45 75.19 L89.81 72.51 L89.44 70.54 L75.09 73.22 Z',
        'M89.06 58.65 L87.53 70.26 L89.52 70.52 L91.04 58.91 Z',
        'M91.75 70.55 L93.28 58.95 L91.29 58.69 L89.77 70.29 Z',
        'M69.84 66.14 L75.51 75.85 L77.24 74.84 L71.57 65.13 Z',
        'M79.43 73.67 L72.87 64.62 L71.25 65.8 L77.82 74.85 Z',
        'M58.35 48.36 L57.56 56.4 L59.55 56.6 L60.34 48.56 Z',
        'M57.06 49.14 A2.5 2.5 0 1 0 62.06 49.14 A2.5 2.5 0 1 0 57.06 49.14 Z',
        'M59.06 60.09 L58.97 65.68 L60.97 65.71 L61.06 60.12 Z',
        'M57.95 63.69 A2.5 2.5 0 1 0 62.95 63.69 A2.5 2.5 0 1 0 57.95 63.69 Z',
        'M51.19 61.73 L51.14 51 L49.14 51.01 L49.19 61.74 Z',
        'M58.84 56.48 L48.94 60.35 L49.67 62.21 L59.57 58.34 Z',
        'M48.75 61.47 L48.36 71.98 L50.36 72.05 L50.75 61.54 Z',
        'M40.88 62.37 L48.49 61.81 L48.35 59.82 L40.74 60.37 Z',
        'M39.21 60.71 A2.5 2.5 0 1 0 44.21 60.71 A2.5 2.5 0 1 0 39.21 60.71 Z',
        'M46.21 60.62 A4 4 0 1 0 54.21 60.62 A4 4 0 1 0 46.21 60.62 Z',
        'M46 74.04 A4 4 0 1 0 54 74.04 A4 4 0 1 0 46 74.04 Z',
        'M40.74 74.16 A3 3 0 1 0 46.74 74.16 A3 3 0 1 0 40.74 74.16 Z',
        'M41.18 74.39 A3 3 0 1 0 47.18 74.39 A3 3 0 1 0 41.18 74.39 Z',
        'M38 74.13 A3.5 3.5 0 1 0 45 74.13 A3.5 3.5 0 1 0 38 74.13 Z',
        'M40.2 44.68 L46.82 50.38 L48.13 48.86 L41.51 43.17 Z',
        'M38.51 44.83 A3 3 0 1 0 44.51 44.83 A3 3 0 1 0 38.51 44.83 Z',
        'M51.5 49.46 L55.42 41.92 L53.65 40.99 L49.73 48.54 Z',
        'M51.08 42.34 A3 3 0 1 0 57.08 42.34 A3 3 0 1 0 51.08 42.34 Z',
        'M44.82 49.19 A4 4 0 1 0 52.82 49.19 A4 4 0 1 0 44.82 49.19 Z',
        'M55.44 56.96 A4 4 0 1 0 63.44 56.96 A4 4 0 1 0 55.44 56.96 Z',
        'M71 63.88 L81.45 53.53 L80.04 52.11 L69.6 62.46 Z',
        'M78.68 55.1 L90.03 58.19 L90.56 56.26 L79.2 53.17 Z',
        'M74.97 47.23 L77.52 55.32 L79.43 54.72 L76.87 46.63 Z',
        'M72.9 48.05 A3 3 0 1 0 78.9 48.05 A3 3 0 1 0 72.9 48.05 Z',
        'M88.46 71.48 L95.77 75.84 L96.79 74.12 L89.48 69.76 Z',
        'M92.62 74.08 A3 3 0 1 0 98.62 74.08 A3 3 0 1 0 92.62 74.08 Z',
        'M74.48 55.02 A4 4 0 1 0 82.48 55.02 A4 4 0 1 0 74.48 55.02 Z',
        'M76.31 72.5 L69.53 76.86 L70.61 78.54 L77.39 74.18 Z',
        'M66.42 76.8 A3 3 0 1 0 72.42 76.8 A3 3 0 1 0 66.42 76.8 Z',
        'M72.62 73.78 A4 4 0 1 0 80.62 73.78 A4 4 0 1 0 72.62 73.78 Z',
        'M90.38 58.09 L96.07 51.47 L94.56 50.16 L88.86 56.78 Z',
        'M92.08 51.26 A3 3 0 1 0 98.08 51.26 A3 3 0 1 0 92.08 51.26 Z',
        'M86.97 57.01 A4 4 0 1 0 94.97 57.01 A4 4 0 1 0 86.97 57.01 Z',
        'M85.41 70.85 A4 4 0 1 0 93.41 70.85 A4 4 0 1 0 85.41 70.85 Z',
        'M65.86 62.94 A4 4 0 1 0 73.86 62.94 A4 4 0 1 0 65.86 62.94 Z'
    ],
    [
        'M76.01 70.79 L81.15 76.67 L82.66 75.35 L77.51 69.47 Z',
        'M65.47 72.37 L77.72 71.78 L77.62 69.78 L65.38 70.38 Z',
        'M73.1 71.12 A3.5 3.5 0 1 0 80.1 71.12 A3.5 3.5 0 1 0 73.1 71.12 Z',
        'M78.9 76.01 A3 3 0 1 0 84.9 76.01 A3 3 0 1 0 78.9 76.01 Z',
        'M53.7 54.19 L47.26 59.75 L48.56 61.26 L55.01 55.7 Z',
        'M55.72 57.3 L58.47 62.29 L60.22 61.32 L57.47 56.33 Z',
        'M51.42 54.61 A4 4 0 1 0 59.42 54.61 A4 4 0 1 0 51.42 54.61 Z',
        'M57.26 62.46 A3 3 0 1 0 63.26 62.46 A3 3 0 1 0 57.26 62.46 Z',
        'M53.6 43.95 L54.4 51.67 L56.39 51.46 L55.59 43.74 Z',
        'M52.35 45.48 A3 3 0 1 0 58.35 45.48 A3 3 0 1 0 52.35 45.48 Z',
        'M63.5 52.89 L56.76 53.85 L57.05 55.83 L63.78 54.87 Z',
        'M60.06 54.3 A3 3 0 1 0 66.06 54.3 A3 3 0 1 0 60.06 54.3 Z',
        'M46.9 61.37 L51.27 72.19 L53.12 71.44 L48.76 60.62 Z',
        'M40.6 65.27 L49.29 61.58 L48.51 59.74 L39.82 63.43 Z',
        'M43.36 51.68 L47.65 62.99 L49.52 62.28 L45.23 50.97 Z',
        'M38.36 63.52 A3 3 0 1 0 44.36 63.52 A3 3 0 1 0 38.36 63.52 Z',
        'M43.83 61 A4 4 0 1 0 51.83 61 A4 4 0 1 0 43.83 61 Z',
        'M45.93 44.64 L41.07 52.98 L42.8 53.99 L47.66 45.65 Z',
        'M43.64 46.13 A3 3 0 1 0 49.64 46.13 A3 3 0 1 0 43.64 46.13 Z',
        'M37.47 56.64 L45.16 52.8 L44.27 51.01 L36.57 54.85 Z',
        'M34.67 54.84 A3 3 0 1 0 40.67 54.84 A3 3 0 1 0 34.67 54.84 Z',
        'M53.26 70.48 L40.11 70.42 L40.1 72.42 L53.26 72.48 Z',
        'M64.43 70.22 L52.26 70.32 L52.28 72.32 L64.45 72.22 Z',
        'M50.55 72.8 L51.2 81.51 L53.19 81.36 L52.54 72.65 Z',
        'M48.85 80.37 A3 3 0 1 0 54.85 80.37 A3 3 0 1 0 48.85 80.37 Z',
        'M47.62 72.23 A4 4 0 1 0 55.62 72.23 A4 4 0 1 0 47.62 72.23 Z',
        'M62.41 71.53 A4 4 0 1 0 70.41 71.53 A4 4 0 1 0 62.41 71.53 Z',
        'M65.84 81.56 L67.09 73.66 L65.11 73.35 L63.86 81.25 Z',
        'M67.83 81.74 L67.93 74.67 L65.93 74.64 L65.83 81.71 Z',
        'M62.57 80.08 A3.5 3.5 0 1 0 69.57 80.08 A3.5 3.5 0 1 0 62.57 80.08 Z',
        'M38.88 73.73 L32.7 80.85 L34.21 82.16 L40.39 75.04 Z',
        'M31.59 80.67 A3 3 0 1 0 37.59 80.67 A3 3 0 1 0 31.59 80.67 Z',
        'M30.27 67.27 L38.62 72.13 L39.62 70.4 L31.28 65.54 Z',
        'M28.69 67.05 A3 3 0 1 0 34.69 67.05 A3 3 0 1 0 28.69 67.05 Z',
        'M35.46 72.33 A4 4 0 1 0 43.46 72.33 A4 4 0 1 0 35.46 72.33 Z',
        'M44.6 51.97 L37.25 47.26 L36.17 48.95 L43.52 53.65 Z',
        'M41.15 40.59 L36.99 44.49 L38.36 45.95 L42.52 42.05 Z',
        'M31.8 47.45 A4 4 0 1 0 39.8 47.45 A4 4 0 1 0 31.8 47.45 Z',
        'M38.99 40.33 A3 3 0 1 0 44.99 40.33 A3 3 0 1 0 38.99 40.33 Z',
        'M26.09 50.87 L33.55 48.51 L32.95 46.6 L25.49 48.97 Z',
        'M24.43 49.17 A3 3 0 1 0 30.43 49.17 A3 3 0 1 0 24.43 49.17 Z',
        'M32.11 42.2 A2.5 2.5 0 1 0 37.11 42.2 A2.5 2.5 0 1 0 32.11 42.2 Z',
        'M29.94 39.91 A3 3 0 1 0 35.94 39.91 A3 3 0 1 0 29.94 39.91 Z',
        'M39.23 51.67 A4 4 0 1 0 47.23 51.67 A4 4 0 1 0 39.23 51.67 Z'
    ],
    [
        'M81.05 71.43 L88.2 78.41 L89.6 76.98 L82.44 70 Z',
        'M70.72 72.41 L83.88 72.39 L83.87 70.39 L70.72 70.41 Z',
        'M77.4 71.78 A4 4 0 1 0 85.4 71.78 A4 4 0 1 0 77.4 71.78 Z',
        'M83.77 77.02 A3 3 0 1 0 89.77 77.02 A3 3 0 1 0 83.77 77.02 Z',
        'M61.71 58.64 L52.25 59.61 L52.45 61.6 L61.91 60.63 Z',
        'M50.93 61.06 L55.81 72.95 L57.66 72.19 L52.78 60.3 Z',
        'M43.53 57.15 L51.45 62.49 L52.57 60.84 L44.65 55.49 Z',
        'M51.98 60.4 L60.06 50.54 L58.52 49.28 L50.43 59.13 Z',
        'M41.66 56.73 A3 3 0 1 0 47.66 56.73 A3 3 0 1 0 41.66 56.73 Z',
        'M47.36 60.75 A4 4 0 1 0 55.36 60.75 A4 4 0 1 0 47.36 60.75 Z',
        'M57.82 59.79 A3 3 0 1 0 63.82 59.79 A3 3 0 1 0 57.82 59.79 Z',
        'M60.02 47.77 L50.56 48.74 L50.76 50.73 L60.23 49.76 Z',
        'M48.08 49.16 A3 3 0 1 0 54.08 49.16 A3 3 0 1 0 48.08 49.16 Z',
        'M57.72 71.42 L44.57 71.43 L44.57 73.43 L57.72 73.42 Z',
        'M69.65 70.57 L55.66 71.73 L55.83 73.72 L69.82 72.56 Z',
        'M57.28 82.61 L55.9 73.71 L53.92 74.02 L55.3 82.91 Z',
        'M53.22 82.26 A3 3 0 1 0 59.22 82.26 A3 3 0 1 0 53.22 82.26 Z',
        'M51.67 72.23 A4 4 0 1 0 59.67 72.23 A4 4 0 1 0 51.67 72.23 Z',
        'M67.86 72.25 A4 4 0 1 0 75.86 72.25 A4 4 0 1 0 67.86 72.25 Z',
        'M71.58 83.65 L72.26 74.95 L70.26 74.79 L69.59 83.5 Z',
        'M73.22 84.45 L74.31 75.17 L72.32 74.94 L71.23 84.22 Z',
        'M67.34 81.94 A4 4 0 1 0 75.34 81.94 A4 4 0 1 0 67.34 81.94 Z',
        'M41.72 74.64 L35.31 82.22 L36.83 83.51 L43.25 75.93 Z',
        'M33.98 82.21 A3 3 0 1 0 39.98 82.21 A3 3 0 1 0 33.98 82.21 Z',
        'M43.23 69.79 L33.91 65.17 L33.02 66.96 L42.34 71.58 Z',
        'M30.69 67.54 A3 3 0 1 0 36.69 67.54 A3 3 0 1 0 30.69 67.54 Z',
        'M38.17 73.23 A4.5 4.5 0 1 0 47.17 73.23 A4.5 4.5 0 1 0 38.17 73.23 Z',
        'M60.01 48.82 L54.26 41.11 L52.66 42.3 L58.41 50.01 Z',
        'M55.43 40.38 L61.7 38.39 L61.1 36.49 L54.83 38.47 Z',
        'M47.83 40.95 A4 4 0 1 0 55.83 40.95 A4 4 0 1 0 47.83 40.95 Z',
        'M59.24 36.3 A3 3 0 1 0 65.24 36.3 A3 3 0 1 0 59.24 36.3 Z',
        'M40.43 40.67 L49.63 41.27 L49.76 39.27 L40.56 38.67 Z',
        'M40.54 39.71 A3 3 0 1 0 46.54 39.71 A3 3 0 1 0 40.54 39.71 Z',
        'M52.92 31.33 L51.53 38.63 L53.49 39.01 L54.89 31.71 Z',
        'M50.56 32.58 A3 3 0 1 0 56.56 32.58 A3 3 0 1 0 50.56 32.58 Z',
        'M57.98 49.57 L66.98 45.65 L66.18 43.81 L57.18 47.74 Z',
        'M67.53 47.54 L68.03 54.04 L70.02 53.89 L69.52 47.39 Z',
        'M63.57 44.58 A4 4 0 1 0 71.57 44.58 A4 4 0 1 0 63.57 44.58 Z',
        'M66.6 54.38 A3 3 0 1 0 72.6 54.38 A3 3 0 1 0 66.6 54.38 Z',
        'M70.5 33.6 L68.27 42.04 L70.21 42.55 L72.44 34.11 Z',
        'M68.28 35.9 A3 3 0 1 0 74.28 35.9 A3 3 0 1 0 68.28 35.9 Z',
        'M69.97 46.77 A3 3 0 1 0 75.97 46.77 A3 3 0 1 0 69.97 46.77 Z',
        'M72.59 47.38 A3 3 0 1 0 78.59 47.38 A3 3 0 1 0 72.59 47.38 Z',
        'M54.57 48.5 A4 4 0 1 0 62.57 48.5 A4 4 0 1 0 54.57 48.5 Z'
    ],
    [
        'M65.71 58.52 L76 60.08 L76.3 58.1 L66.01 56.54 Z',
        'M74.91 59.93 L81.17 67.98 L82.75 66.75 L76.49 58.7 Z',
        'M82.78 56.35 L76.97 58.14 L77.56 60.05 L83.37 58.26 Z',
        'M74.06 52.65 L76.08 60.03 L78.01 59.5 L75.99 52.12 Z',
        'M72.98 53.28 A2.5 2.5 0 1 0 77.98 53.28 A2.5 2.5 0 1 0 72.98 53.28 Z',
        'M73.77 59.09 A3.5 3.5 0 1 0 80.77 59.09 A3.5 3.5 0 1 0 73.77 59.09 Z',
        'M81.47 57.97 A2.5 2.5 0 1 0 86.47 57.97 A2.5 2.5 0 1 0 81.47 57.97 Z',
        'M81.34 68.15 L87.83 73.29 L89.07 71.72 L82.58 66.58 Z',
        'M85.05 71.84 A2.5 2.5 0 1 0 90.05 71.84 A2.5 2.5 0 1 0 85.05 71.84 Z',
        'M88.67 61.77 L81.52 65.35 L82.41 67.14 L89.56 63.56 Z',
        'M85.72 63.12 A2.5 2.5 0 1 0 90.72 63.12 A2.5 2.5 0 1 0 85.72 63.12 Z',
        'M80.4 65.95 L73.47 72.22 L74.81 73.7 L81.74 67.44 Z',
        'M72.98 71.17 A2.5 2.5 0 1 0 77.98 71.17 A2.5 2.5 0 1 0 72.98 71.17 Z',
        'M77.29 66.02 A4 4 0 1 0 85.29 66.02 A4 4 0 1 0 77.29 66.02 Z',
        'M58.83 64.39 L67.11 58.57 L65.96 56.94 L57.68 62.75 Z',
        'M70.17 65.04 L67.93 58.33 L66.03 58.96 L68.27 65.67 Z',
        'M67.13 51.67 L65.34 58.16 L67.27 58.69 L69.06 52.21 Z',
        'M66.71 51.94 A2.5 2.5 0 1 0 71.71 51.94 A2.5 2.5 0 1 0 66.71 51.94 Z',
        'M63.48 58.65 A3.5 3.5 0 1 0 70.48 58.65 A3.5 3.5 0 1 0 63.48 58.65 Z',
        'M66.49 64.91 A2.5 2.5 0 1 0 71.49 64.91 A2.5 2.5 0 1 0 66.49 64.91 Z',
        'M50.6 61.3 L59.32 66.44 L60.33 64.72 L51.61 59.58 Z',
        'M42.49 64.69 L42.49 54.63 L40.49 54.63 L40.49 64.69 Z',
        'M49.58 59.52 L40.42 63.55 L41.22 65.38 L50.39 61.36 Z',
        'M40.49 64.74 L40.94 74.57 L42.94 74.48 L42.49 64.64 Z',
        'M39.7 63.47 L32.99 63.47 L32.99 65.47 L39.7 65.47 Z',
        'M31.39 64.02 A2.5 2.5 0 1 0 36.39 64.02 A2.5 2.5 0 1 0 31.39 64.02 Z',
        'M37.09 64.02 A3.5 3.5 0 1 0 44.09 64.02 A3.5 3.5 0 1 0 37.09 64.02 Z',
        'M41.94 85.2 L36.57 90.12 L37.92 91.59 L43.29 86.67 Z',
        'M40.27 76.5 L39.82 86.78 L41.82 86.87 L42.27 76.58 Z',
        'M38.49 85.93 A3 3 0 1 0 44.49 85.93 A3 3 0 1 0 38.49 85.93 Z',
        'M34.97 90.18 A2.5 2.5 0 1 0 39.97 90.18 A2.5 2.5 0 1 0 34.97 90.18 Z',
        'M37.99 75.87 A3.5 3.5 0 1 0 44.99 75.87 A3.5 3.5 0 1 0 37.99 75.87 Z',
        'M33.62 75.2 A2.5 2.5 0 1 0 38.62 75.2 A2.5 2.5 0 1 0 33.62 75.2 Z',
        'M33.18 76.54 A2.5 2.5 0 1 0 38.18 76.54 A2.5 2.5 0 1 0 33.18 76.54 Z',
        'M31.34 76.1 A3 3 0 1 0 37.34 76.1 A3 3 0 1 0 31.34 76.1 Z',
        'M32.79 49.36 L38.61 54.27 L39.9 52.75 L34.08 47.83 Z',
        'M31.16 49.04 A2.5 2.5 0 1 0 36.16 49.04 A2.5 2.5 0 1 0 31.16 49.04 Z',
        'M45.32 45.62 L41.07 52.78 L42.79 53.8 L47.04 46.64 Z',
        'M43.01 47.02 A2.5 2.5 0 1 0 48.01 47.02 A2.5 2.5 0 1 0 43.01 47.02 Z',
        'M36.82 53.29 A4 4 0 1 0 44.82 53.29 A4 4 0 1 0 36.82 53.29 Z',
        'M49.44 61.46 L50.34 68.83 L52.32 68.59 L51.43 61.21 Z',
        'M52.27 53.88 L48.24 60.36 L49.94 61.41 L53.96 54.93 Z',
        'M50.62 55.52 A2.5 2.5 0 1 0 55.62 55.52 A2.5 2.5 0 1 0 50.62 55.52 Z',
        'M46.49 60.44 A3.5 3.5 0 1 0 53.49 60.44 A3.5 3.5 0 1 0 46.49 60.44 Z',
        'M48.38 68.94 A2.5 2.5 0 1 0 53.38 68.94 A2.5 2.5 0 1 0 48.38 68.94 Z',
        'M62.73 71.39 L59.38 64.69 L57.59 65.58 L60.94 72.29 Z',
        'M58.85 57.53 L57.06 65.13 L59.01 65.59 L60.8 57.98 Z',
        'M57.32 58.87 A2.5 2.5 0 1 0 62.32 58.87 A2.5 2.5 0 1 0 57.32 58.87 Z',
        'M54.54 64.24 A3.5 3.5 0 1 0 61.54 64.24 A3.5 3.5 0 1 0 54.54 64.24 Z',
        'M58.67 71.62 A2.5 2.5 0 1 0 63.67 71.62 A2.5 2.5 0 1 0 58.67 71.62 Z'
    ],
    [
        'M63.82 63.01 L64.07 71.15 L66.07 71.09 L65.82 62.95 Z',
        'M53.33 54.32 L52.82 66.69 L54.81 66.77 L55.33 54.4 Z',
        'M81.76 60.45 L76.01 67.45 L77.55 68.72 L83.3 61.72 Z',
        'M63.38 60.29 L52.71 65.1 L53.53 66.92 L64.2 62.11 Z',
        'M55.37 78 L54.82 65.98 L52.82 66.07 L53.38 78.1 Z',
        'M52.39 64.3 L44.25 64.54 L44.31 66.54 L52.45 66.3 Z',
        'M41.99 65.55 A3 3 0 1 0 47.99 65.55 A3 3 0 1 0 41.99 65.55 Z',
        'M49.83 65.31 A4 4 0 1 0 57.83 65.31 A4 4 0 1 0 49.83 65.31 Z',
        'M54.61 90.39 L47.45 96.66 L48.77 98.17 L55.93 91.9 Z',
        'M53.69 81.28 L54.24 93.31 L56.24 93.22 L55.69 81.19 Z',
        'M49.85 91.13 A4 4 0 1 0 57.85 91.13 A4 4 0 1 0 49.85 91.13 Z',
        'M45.83 96.72 A3 3 0 1 0 51.83 96.72 A3 3 0 1 0 45.83 96.72 Z',
        'M50 79.81 A4 4 0 1 0 58 79.81 A4 4 0 1 0 50 79.81 Z',
        'M44.3 78.67 A3 3 0 1 0 50.3 78.67 A3 3 0 1 0 44.3 78.67 Z',
        'M44.63 80.44 A3 3 0 1 0 50.63 80.44 A3 3 0 1 0 44.63 80.44 Z',
        'M40.81 79.69 A4 4 0 1 0 48.81 79.69 A4 4 0 1 0 40.81 79.69 Z',
        'M51.84 52.52 L44.85 46.07 L43.49 47.54 L50.48 53.99 Z',
        'M41.87 47.52 A3 3 0 1 0 47.87 47.52 A3 3 0 1 0 41.87 47.52 Z',
        'M58.54 44.02 L53.84 52.09 L55.57 53.1 L60.27 45.03 Z',
        'M55.69 45.22 A3 3 0 1 0 61.69 45.22 A3 3 0 1 0 55.69 45.22 Z',
        'M48.93 52.93 A4 4 0 1 0 56.93 52.93 A4 4 0 1 0 48.93 52.93 Z',
        'M91.73 67.68 L90.24 73.32 L92.17 73.83 L93.66 68.19 Z',
        'M81.42 61.28 L92.67 66.38 L93.49 64.56 L82.24 59.46 Z',
        'M88.73 65.11 A4 4 0 1 0 96.73 65.11 A4 4 0 1 0 88.73 65.11 Z',
        'M88.19 74.99 A3 3 0 1 0 94.19 74.99 A3 3 0 1 0 88.19 74.99 Z',
        'M98.41 56.79 L93.38 63.09 L94.94 64.34 L99.98 58.04 Z',
        'M95.47 58.82 A3 3 0 1 0 101.47 58.82 A3 3 0 1 0 95.47 58.82 Z',
        'M100.25 70.01 L94.99 66.76 L93.94 68.46 L99.2 71.71 Z',
        'M96.37 71.21 A3 3 0 1 0 102.37 71.21 A3 3 0 1 0 96.37 71.21 Z',
        'M63.91 62.44 L68.61 55.07 L66.92 54 L62.23 61.36 Z',
        'M74.6 68 L65.85 60.46 L64.55 61.98 L73.29 69.51 Z',
        'M64.75 55.24 A3 3 0 1 0 70.75 55.24 A3 3 0 1 0 64.75 55.24 Z',
        'M59.79 61.2 A4 4 0 1 0 67.79 61.2 A4 4 0 1 0 59.79 61.2 Z',
        'M78.53 61.09 A4 4 0 1 0 86.53 61.09 A4 4 0 1 0 78.53 61.09 Z',
        'M61.73 70.05 A3 3 0 1 0 67.73 70.05 A3 3 0 1 0 61.73 70.05 Z',
        'M75.77 70.62 L82.77 76.37 L84.04 74.83 L77.04 69.08 Z',
        'M79.34 75.23 A3 3 0 1 0 85.34 75.23 A3 3 0 1 0 79.34 75.23 Z',
        'M70.51 74.76 A3 3 0 1 0 76.51 74.76 A3 3 0 1 0 70.51 74.76 Z',
        'M71.69 70.55 A4 4 0 1 0 79.69 70.55 A4 4 0 1 0 71.69 70.55 Z'
    ],
    [
        'M41.91 83.15 L47.12 78.53 L45.8 77.03 L40.59 81.65 Z',
        'M44.47 68.83 L44.56 78.44 L46.56 78.43 L46.47 68.81 Z',
        'M43.23 78.22 A3 3 0 1 0 49.23 78.22 A3 3 0 1 0 43.23 78.22 Z',
        'M39.92 82.19 A2 2 0 1 0 43.92 82.19 A2 2 0 1 0 39.92 82.19 Z',
        'M85.97 58.1 L93.58 57.54 L93.43 55.55 L85.82 56.11 Z',
        'M90.33 56.76 A2.5 2.5 0 1 0 95.33 56.76 A2.5 2.5 0 1 0 90.33 56.76 Z',
        'M52.4 46.86 L51.42 53.11 L53.39 53.42 L54.38 47.17 Z',
        'M51.39 47.02 A2 2 0 1 0 55.39 47.02 A2 2 0 1 0 51.39 47.02 Z',
        'M52.31 55.08 L53.57 60.24 L55.51 59.77 L54.25 54.6 Z',
        'M52.54 60 A2 2 0 1 0 56.54 60 A2 2 0 1 0 52.54 60 Z',
        'M68.28 65.03 L63.03 56.68 L61.34 57.74 L66.59 66.09 Z',
        'M67.36 66.8 L61.45 57.54 L59.77 58.62 L65.67 67.87 Z',
        'M85.9 58.18 L80.86 66.83 L82.58 67.84 L87.63 59.19 Z',
        'M84.13 57.26 L79.08 65.91 L80.81 66.91 L85.85 58.27 Z',
        'M65.97 46.67 L60.48 55.08 L62.15 56.18 L67.64 47.76 Z',
        'M79 67.19 L68.7 67.49 L68.76 69.48 L79.05 69.19 Z',
        'M86.77 55.48 L81.97 47.36 L80.25 48.38 L85.05 56.5 Z',
        'M68.8 48.69 L78.86 48.83 L78.89 46.83 L68.83 46.69 Z',
        'M68.83 46.45 L78.89 46.6 L78.92 44.6 L68.86 44.45 Z',
        'M67.74 67.19 L62.96 73.15 L64.52 74.4 L69.3 68.44 Z',
        'M61.25 72.66 A2.5 2.5 0 1 0 66.25 72.66 A2.5 2.5 0 1 0 61.25 72.66 Z',
        'M64.4 67.79 A3 3 0 1 0 70.4 67.79 A3 3 0 1 0 64.4 67.79 Z',
        'M53.95 54.63 L60.61 58.08 L61.53 56.3 L54.87 52.85 Z',
        'M58.74 56.98 A3 3 0 1 0 64.74 56.98 A3 3 0 1 0 58.74 56.98 Z',
        'M68.07 45.74 L64.13 40.31 L62.51 41.49 L66.46 46.91 Z',
        'M61.26 41.13 A2.5 2.5 0 1 0 66.26 41.13 A2.5 2.5 0 1 0 61.26 41.13 Z',
        'M64.27 46.32 A3 3 0 1 0 70.27 46.32 A3 3 0 1 0 64.27 46.32 Z',
        'M81.42 39.66 L78.64 46.11 L80.48 46.9 L83.26 40.45 Z',
        'M80.05 40.73 A2.5 2.5 0 1 0 85.05 40.73 A2.5 2.5 0 1 0 80.05 40.73 Z',
        'M76.79 46.06 A3 3 0 1 0 82.79 46.06 A3 3 0 1 0 76.79 46.06 Z',
        'M78.61 67.78 L82.1 74.09 L83.85 73.13 L80.36 66.82 Z',
        'M79.57 74.27 A2.5 2.5 0 1 0 84.57 74.27 A2.5 2.5 0 1 0 79.57 74.27 Z',
        'M76.7 67.97 A3 3 0 1 0 82.7 67.97 A3 3 0 1 0 76.7 67.97 Z',
        'M82.89 57.1 A3 3 0 1 0 88.89 57.1 A3 3 0 1 0 82.89 57.1 Z',
        'M44.09 48.92 L44.17 58.54 L46.17 58.52 L46.09 48.9 Z',
        'M52.4 53.71 L43.39 58.05 L44.26 59.86 L53.27 55.51 Z',
        'M46.04 67.46 L45.96 57.84 L43.96 57.86 L44.04 67.48 Z',
        'M43.91 56.41 L36.51 57.64 L36.84 59.61 L44.24 58.38 Z',
        'M35.81 57.53 A2 2 0 1 0 39.81 57.53 A2 2 0 1 0 35.81 57.53 Z',
        'M42.19 57.41 A3 3 0 1 0 48.19 57.41 A3 3 0 1 0 42.19 57.41 Z',
        'M42.47 68.82 A3 3 0 1 0 48.47 68.82 A3 3 0 1 0 42.47 68.82 Z',
        'M38.11 68.29 A2 2 0 1 0 42.11 68.29 A2 2 0 1 0 38.11 68.29 Z',
        'M38.1 69.41 A2 2 0 1 0 42.1 69.41 A2 2 0 1 0 38.1 69.41 Z',
        'M34.65 68.71 A3 3 0 1 0 40.65 68.71 A3 3 0 1 0 34.65 68.71 Z',
        'M36.27 43.76 L42.24 48.54 L43.49 46.98 L37.53 42.2 Z',
        'M34.83 44.33 A2.5 2.5 0 1 0 39.83 44.33 A2.5 2.5 0 1 0 34.83 44.33 Z',
        'M47.9 40.23 L44.45 46.89 L46.22 47.81 L49.67 41.15 Z',
        'M46.06 41.13 A2.5 2.5 0 1 0 51.06 41.13 A2.5 2.5 0 1 0 46.06 41.13 Z',
        'M40.49 47.78 A3.5 3.5 0 1 0 47.49 47.78 A3.5 3.5 0 1 0 40.49 47.78 Z',
        'M50.06 54.17 A3 3 0 1 0 56.06 54.17 A3 3 0 1 0 50.06 54.17 Z'
    ],
    [
        'M40.88 45.01 L37.62 39.94 L35.94 41.03 L39.2 46.09 Z',
        'M32.79 40.33 A3 3 0 1 0 38.79 40.33 A3 3 0 1 0 32.79 40.33 Z',
        'M36.46 55 L40.5 48.55 L38.81 47.49 L34.76 53.94 Z',
        'M33.83 53.14 A3 3 0 1 0 39.83 53.14 A3 3 0 1 0 33.83 53.14 Z',
        'M48.15 59.45 L61.3 59.48 L61.3 57.48 L48.15 57.45 Z',
        'M61.99 44.02 L54.7 38.83 L53.54 40.46 L60.83 45.65 Z',
        'M59.69 58.95 L63.93 47.97 L62.06 47.25 L57.82 58.23 Z',
        'M47.28 59.81 L42.48 48.43 L40.63 49.21 L45.44 60.59 Z',
        'M59.84 59.25 L71.51 59.04 L71.47 57.04 L59.8 57.25 Z',
        'M60.76 68.28 L60.09 59.58 L58.1 59.73 L58.76 68.44 Z',
        'M55.93 67.22 A3 3 0 1 0 61.93 67.22 A3 3 0 1 0 55.93 67.22 Z',
        'M55.33 58.17 A4 4 0 1 0 63.33 58.17 A4 4 0 1 0 55.33 58.17 Z',
        'M84.1 57.8 L90.24 63.82 L91.64 62.39 L85.5 56.37 Z',
        'M73.5 59.35 L86.73 58.88 L86.66 56.89 L73.43 57.35 Z',
        'M82.13 58.22 A3.5 3.5 0 1 0 89.13 58.22 A3.5 3.5 0 1 0 82.13 58.22 Z',
        'M87.45 63.02 A3 3 0 1 0 93.45 63.02 A3 3 0 1 0 87.45 63.02 Z',
        'M69.47 58.35 A4 4 0 1 0 77.47 58.35 A4 4 0 1 0 69.47 58.35 Z',
        'M72.91 68.39 L74.07 60.98 L72.09 60.67 L70.94 68.08 Z',
        'M74.9 68.63 L75.64 60.65 L73.64 60.47 L72.91 68.45 Z',
        'M69.64 66.9 A3.5 3.5 0 1 0 76.64 66.9 A3.5 3.5 0 1 0 69.64 66.9 Z',
        'M41.24 69.09 L47.26 62.95 L45.83 61.55 L39.81 67.7 Z',
        'M38.67 67.56 A3 3 0 1 0 44.67 67.56 A3 3 0 1 0 38.67 67.56 Z',
        'M43.01 59.29 A4 4 0 1 0 51.01 59.29 A4 4 0 1 0 43.01 59.29 Z',
        'M49.34 39.7 L39.07 47.21 L40.24 48.83 L50.52 41.32 Z',
        'M37.86 46.84 A4 4 0 1 0 45.86 46.84 A4 4 0 1 0 37.86 46.84 Z',
        'M62.33 45.89 L69.2 50.51 L70.32 48.85 L63.45 44.23 Z',
        'M64.68 45.93 L62.38 37.98 L60.46 38.53 L62.76 46.48 Z',
        'M58.42 38.25 A3 3 0 1 0 64.42 38.25 A3 3 0 1 0 58.42 38.25 Z',
        'M59.3 45.63 A4 4 0 1 0 67.3 45.63 A4 4 0 1 0 59.3 45.63 Z',
        'M66.26 49.6 A3 3 0 1 0 72.26 49.6 A3 3 0 1 0 66.26 49.6 Z',
        'M51.48 39.28 L57.01 33.05 L55.51 31.73 L49.99 37.95 Z',
        'M52.71 37.97 L45.27 33.78 L44.29 35.52 L51.73 39.72 Z',
        'M43.91 33.97 A3 3 0 1 0 49.91 33.97 A3 3 0 1 0 43.91 33.97 Z',
        'M47.38 37.7 A4 4 0 1 0 55.38 37.7 A4 4 0 1 0 47.38 37.7 Z',
        'M53.18 32.88 A3 3 0 1 0 59.18 32.88 A3 3 0 1 0 53.18 32.88 Z'
    ],
    [
        'M49.7 43.96 L58.59 42.54 L58.28 40.57 L49.39 41.98 Z',
        'M41.09 54.43 L54.25 54.36 L54.23 52.36 L41.08 52.43 Z',
        'M54.41 54.62 L49.48 42.74 L47.64 43.51 L52.57 55.38 Z',
        'M65.88 52.53 L54.29 52.86 L54.35 54.85 L65.94 54.53 Z',
        'M53.93 64.26 L54.49 55.06 L52.49 54.94 L51.93 64.14 Z',
        'M50.84 63.55 A3 3 0 1 0 56.84 63.55 A3 3 0 1 0 50.84 63.55 Z',
        'M49.92 54.58 A3 3 0 1 0 55.92 54.58 A3 3 0 1 0 49.92 54.58 Z',
        'M87.31 58.66 L80.62 51.62 L79.17 53 L85.86 60.03 Z',
        'M68.41 54.63 L80.66 55.21 L80.75 53.21 L68.51 52.63 Z',
        'M75.56 53.38 A4 4 0 1 0 83.56 53.38 A4 4 0 1 0 75.56 53.38 Z',
        'M82.44 58.51 A3 3 0 1 0 88.44 58.51 A3 3 0 1 0 82.44 58.51 Z',
        'M64.39 53.29 A3 3 0 1 0 70.39 53.29 A3 3 0 1 0 64.39 53.29 Z',
        'M67.15 64.77 L68.36 56.48 L66.38 56.19 L65.17 64.48 Z',
        'M70.12 64.12 L69.85 56.06 L67.85 56.13 L68.12 64.19 Z',
        'M63.9 62.83 A4 4 0 1 0 71.9 62.83 A4 4 0 1 0 63.9 62.83 Z',
        'M38.8 56.09 L32.91 63.61 L34.48 64.85 L40.37 57.33 Z',
        'M31.11 63.66 A3 3 0 1 0 37.11 63.66 A3 3 0 1 0 31.11 63.66 Z',
        'M41.4 51.56 L32.55 46.89 L31.62 48.66 L40.46 53.33 Z',
        'M28.26 48.92 A3 3 0 1 0 34.26 48.92 A3 3 0 1 0 28.26 48.92 Z',
        'M35.76 54.66 A4 4 0 1 0 43.76 54.66 A4 4 0 1 0 35.76 54.66 Z',
        'M40.27 40.1 L48.29 45.91 L49.46 44.29 L41.45 38.48 Z',
        'M48.68 42.85 L56.73 32.96 L55.18 31.7 L47.13 41.59 Z',
        'M38.85 39.13 A3 3 0 1 0 44.85 39.13 A3 3 0 1 0 38.85 39.13 Z',
        'M45.06 43.21 A3 3 0 1 0 51.06 43.21 A3 3 0 1 0 45.06 43.21 Z',
        'M54.53 42.2 A3 3 0 1 0 60.53 42.2 A3 3 0 1 0 54.53 42.2 Z',
        'M53.82 34.18 L63.05 31.7 L62.53 29.77 L53.3 32.25 Z',
        'M50.21 34.13 A4 4 0 1 0 58.21 34.13 A4 4 0 1 0 50.21 34.13 Z',
        'M58.8 30.89 A3 3 0 1 0 64.8 30.89 A3 3 0 1 0 58.8 30.89 Z'
    ],
    [
        'M79.73 58.1 L86.21 65.48 L87.71 64.16 L81.23 56.78 Z',
        'M68.18 59.56 L81.59 59.56 L81.59 57.56 L68.18 57.56 Z',
        'M76.03 58.78 A4 4 0 1 0 84.03 58.78 A4 4 0 1 0 76.03 58.78 Z',
        'M83.51 63.93 A3 3 0 1 0 89.51 63.93 A3 3 0 1 0 83.51 63.93 Z',
        'M50.29 47.38 L42.24 51.41 L43.13 53.19 L51.18 49.17 Z',
        'M40.36 51.41 A3 3 0 1 0 46.36 51.41 A3 3 0 1 0 40.36 51.41 Z',
        'M41.93 44.87 L49.3 49.57 L50.38 47.88 L43 43.18 Z',
        'M42.45 59.56 L55.42 59.78 L55.45 57.78 L42.48 57.56 Z',
        'M48.69 48.65 L53.39 60.28 L55.24 59.53 L50.55 47.9 Z',
        'M54.78 59.56 L67.52 59.34 L67.49 57.34 L54.74 57.56 Z',
        'M55.54 69.22 L54.86 60.05 L52.87 60.2 L53.54 69.37 Z',
        'M51.31 68.85 A3 3 0 1 0 57.31 68.85 A3 3 0 1 0 51.31 68.85 Z',
        'M49.87 59.01 A4 4 0 1 0 57.87 59.01 A4 4 0 1 0 49.87 59.01 Z',
        'M68.21 46.73 L59.72 42.03 L58.75 43.78 L67.25 48.48 Z',
        'M48.87 49.2 L60.5 44.51 L59.75 42.65 L48.13 47.35 Z',
        'M55.46 44.47 A4 4 0 1 0 63.46 44.47 A4 4 0 1 0 55.46 44.47 Z',
        'M63.84 46.93 A3 3 0 1 0 69.84 46.93 A3 3 0 1 0 63.84 46.93 Z',
        'M65.3 58.56 A4 4 0 1 0 73.3 58.56 A4 4 0 1 0 65.3 58.56 Z',
        'M65.4 65.72 A3 3 0 1 0 71.4 65.72 A3 3 0 1 0 65.4 65.72 Z',
        'M66.97 65.49 A3 3 0 1 0 72.97 65.49 A3 3 0 1 0 66.97 65.49 Z',
        'M65.07 68.18 A4 4 0 1 0 73.07 68.18 A4 4 0 1 0 65.07 68.18 Z',
        'M35.13 69.99 L42.51 62.39 L41.07 61 L33.7 68.6 Z',
        'M32.08 68.4 A3 3 0 1 0 38.08 68.4 A3 3 0 1 0 32.08 68.4 Z',
        'M40.49 57.24 L31.99 52.54 L31.02 54.29 L39.52 58.99 Z',
        'M30.29 53.64 A3 3 0 1 0 36.29 53.64 A3 3 0 1 0 30.29 53.64 Z',
        'M35.9 59.9 A5 5 0 1 0 45.9 59.9 A5 5 0 1 0 35.9 59.9 Z',
        'M46.8 35.82 L42.78 41.19 L44.38 42.39 L48.4 37.02 Z',
        'M37.34 42.91 A4 4 0 1 0 45.34 42.91 A4 4 0 1 0 37.34 42.91 Z',
        'M44.83 35.75 A3 3 0 1 0 50.83 35.75 A3 3 0 1 0 44.83 35.75 Z',
        'M38.16 42.84 L30.34 45.08 L30.89 47 L38.71 44.77 Z',
        'M29.18 45.82 A3 3 0 1 0 35.18 45.82 A3 3 0 1 0 29.18 45.82 Z',
        'M37.71 35.61 L39.72 41.87 L41.63 41.26 L39.61 35 Z',
        'M35.66 35.31 A3 3 0 1 0 41.66 35.31 A3 3 0 1 0 35.66 35.31 Z',
        'M45.39 47.83 A4 4 0 1 0 53.39 47.83 A4 4 0 1 0 45.39 47.83 Z'
    ],
    [
        'M41.55 71.49 L37.28 75.71 L38.68 77.13 L42.95 72.92 Z',
        'M40.59 65.93 L41.25 73 L43.24 72.82 L42.58 65.74 Z',
        'M39.04 72.2 A2.5 2.5 0 1 0 44.04 72.2 A2.5 2.5 0 1 0 39.04 72.2 Z',
        'M36.34 76.07 A2 2 0 1 0 40.34 76.07 A2 2 0 1 0 36.34 76.07 Z',
        'M48.68 52.93 L49.42 47.27 L47.44 47.01 L46.69 52.66 Z',
        'M46.43 47.14 A2 2 0 1 0 50.43 47.14 A2 2 0 1 0 46.43 47.14 Z',
        'M47.03 54.65 L47.36 58.54 L49.35 58.37 L49.02 54.48 Z',
        'M47.07 57.75 A2 2 0 1 0 51.07 57.75 A2 2 0 1 0 47.07 57.75 Z',
        'M42.65 56.61 L42.35 48.47 L40.35 48.55 L40.65 56.68 Z',
        'M41.2 56.9 L49 54.83 L48.48 52.9 L40.69 54.96 Z',
        'M42.6 63.67 L42.3 56.25 L40.3 56.33 L40.6 63.75 Z',
        'M35.35 56.89 L40.66 56.57 L40.54 54.58 L35.23 54.89 Z',
        'M33.29 55.89 A2 2 0 1 0 37.29 55.89 A2 2 0 1 0 33.29 55.89 Z',
        'M39.16 55.23 A2.5 2.5 0 1 0 44.16 55.23 A2.5 2.5 0 1 0 39.16 55.23 Z',
        'M39.79 65.84 A2.5 2.5 0 1 0 44.79 65.84 A2.5 2.5 0 1 0 39.79 65.84 Z',
        'M36.35 64.39 A1 1 0 1 0 38.35 64.39 A1 1 0 1 0 36.35 64.39 Z',
        'M36.7 65.46 A1 1 0 1 0 38.7 65.46 A1 1 0 1 0 36.7 65.46 Z',
        'M33.43 65.09 A2.5 2.5 0 1 0 38.43 65.09 A2.5 2.5 0 1 0 33.43 65.09 Z',
        'M40.24 46.68 L35.67 42.76 L34.37 44.27 L38.94 48.2 Z',
        'M33.72 44.23 A2 2 0 1 0 37.72 44.23 A2 2 0 1 0 33.72 44.23 Z',
        'M44.06 41.67 L41.2 46.6 L42.93 47.6 L45.79 42.67 Z',
        'M42.57 42.52 A2 2 0 1 0 46.57 42.52 A2 2 0 1 0 42.57 42.52 Z',
        'M38.71 48.16 A3 3 0 1 0 44.71 48.16 A3 3 0 1 0 38.71 48.16 Z',
        'M57.87 50.92 L59.34 43.15 L57.38 42.78 L55.91 50.55 Z',
        'M55.63 41.66 L53.44 50.84 L55.39 51.3 L57.57 42.13 Z',
        'M64.98 54.8 L56.16 51.56 L55.47 53.43 L64.29 56.68 Z',
        'M65.19 38.52 L56.34 40.93 L56.86 42.86 L65.72 40.44 Z',
        'M72.52 45.93 L66.91 39.53 L65.4 40.85 L71.02 47.25 Z',
        'M58.63 42.05 L57.26 35.67 L55.31 36.09 L56.68 42.47 Z',
        'M53.57 37.29 A2 2 0 1 0 57.57 37.29 A2 2 0 1 0 53.57 37.29 Z',
        'M54.81 41.9 A2.5 2.5 0 1 0 59.81 41.9 A2.5 2.5 0 1 0 54.81 41.9 Z',
        'M54.88 50.81 L49.22 52.19 L49.69 54.13 L55.35 52.76 Z',
        'M52.62 51.78 A2.5 2.5 0 1 0 57.62 51.78 A2.5 2.5 0 1 0 52.62 51.78 Z',
        'M65.55 34.76 L64.81 40.41 L66.79 40.67 L67.54 35.02 Z',
        'M64.55 34.89 A2 2 0 1 0 68.55 34.89 A2 2 0 1 0 64.55 34.89 Z',
        'M62.09 40.54 A3 3 0 1 0 68.09 40.54 A3 3 0 1 0 62.09 40.54 Z',
        'M67.95 57.35 L72.6 49.95 L70.9 48.89 L66.26 56.28 Z',
        'M69.5 46.77 L65.21 53.81 L66.91 54.85 L71.2 47.81 Z',
        'M71.98 67.04 L80.47 67.1 L80.48 65.1 L72 65.04 Z',
        'M80.58 63.69 L72.81 62.93 L72.62 64.92 L80.39 65.68 Z',
        'M80.65 46.72 L72.52 46.31 L72.42 48.3 L80.55 48.71 Z',
        'M71.1 63.75 L66.9 56.65 L65.18 57.67 L69.37 64.77 Z',
        'M85.68 58.2 L81.39 65.24 L83.1 66.28 L87.39 59.24 Z',
        'M86.03 56.13 L82.19 48.68 L80.41 49.59 L84.25 57.04 Z',
        'M82.52 48.14 L86 55.94 L87.83 55.13 L84.34 47.33 Z',
        'M66.63 54.52 L60.25 58.02 L61.21 59.77 L67.59 56.28 Z',
        'M59.44 58.19 A2 2 0 1 0 63.44 58.19 A2 2 0 1 0 59.44 58.19 Z',
        'M63.19 56.1 A2.5 2.5 0 1 0 68.19 56.1 A2.5 2.5 0 1 0 63.19 56.1 Z',
        'M68.91 46.95 A2.5 2.5 0 1 0 73.91 46.95 A2.5 2.5 0 1 0 68.91 46.95 Z',
        'M83.32 42.27 L80.1 47.55 L81.81 48.59 L85.02 43.31 Z',
        'M82.52 43.85 A2 2 0 1 0 86.52 43.85 A2 2 0 1 0 82.52 43.85 Z',
        'M79.16 47.37 A2.5 2.5 0 1 0 84.16 47.37 A2.5 2.5 0 1 0 79.16 47.37 Z',
        'M86.19 57.24 L91.85 57.28 L91.86 55.28 L86.21 55.24 Z',
        'M89.5 56.63 A2 2 0 1 0 93.5 56.63 A2 2 0 1 0 89.5 56.63 Z',
        'M83.7 56.24 A2.5 2.5 0 1 0 88.7 56.24 A2.5 2.5 0 1 0 83.7 56.24 Z',
        'M70.12 64.4 L66.91 68.97 L68.54 70.12 L71.76 65.55 Z',
        'M65.73 68.84 A2 2 0 1 0 69.73 68.84 A2 2 0 1 0 65.73 68.84 Z',
        'M68.44 64.97 A2.5 2.5 0 1 0 73.44 64.97 A2.5 2.5 0 1 0 68.44 64.97 Z',
        'M79.94 65.48 L82.73 71.16 L84.52 70.28 L81.73 64.6 Z',
        'M81.28 70.36 A2 2 0 1 0 85.28 70.36 A2 2 0 1 0 81.28 70.36 Z',
        'M78.69 65.4 A2.5 2.5 0 1 0 83.69 65.4 A2.5 2.5 0 1 0 78.69 65.4 Z',
        'M46.95 53.16 A2.5 2.5 0 1 0 51.95 53.16 A2.5 2.5 0 1 0 46.95 53.16 Z'
    ],
    [
        'M41.06 74.4 L36.29 79.25 L37.72 80.65 L42.49 75.8 Z',
        'M41.87 75.69 L41.32 66.96 L39.33 67.09 L39.87 75.82 Z',
        'M38.54 75.54 A3 3 0 1 0 44.54 75.54 A3 3 0 1 0 38.54 75.54 Z',
        'M35.93 78.17 A2 2 0 1 0 39.93 78.17 A2 2 0 1 0 35.93 78.17 Z',
        'M47.99 54.31 L48.97 48.06 L47 47.75 L46.01 54 Z',
        'M46.22 47.46 A2 2 0 1 0 50.22 47.46 A2 2 0 1 0 46.22 47.46 Z',
        'M49.27 59.28 L49.1 55.25 L47.1 55.33 L47.27 59.36 Z',
        'M46.48 59.99 A2 2 0 1 0 50.48 59.99 A2 2 0 1 0 46.48 59.99 Z',
        'M55.67 56.71 L59.57 65.49 L61.4 64.68 L57.5 55.9 Z',
        'M59.98 64.99 L55.4 57.54 L53.69 58.59 L58.28 66.04 Z',
        'M77.57 57.11 L73.87 65.33 L75.7 66.15 L79.39 57.93 Z',
        'M72.52 65.76 L77.11 58 L75.39 56.98 L70.8 64.74 Z',
        'M59.45 47.53 L54.42 55.06 L56.08 56.17 L61.11 48.64 Z',
        'M71.2 66.26 L62.26 66.12 L62.23 68.12 L71.17 68.26 Z',
        'M78.23 55.86 L73.65 48.42 L71.94 49.47 L76.53 56.91 Z',
        'M71.2 47.7 L62.02 48.01 L62.09 50.01 L71.27 49.69 Z',
        'M71.05 45.9 L62.11 45.77 L62.08 47.77 L71.02 47.9 Z',
        'M58.32 72.5 L61.76 66.96 L60.06 65.91 L56.62 71.45 Z',
        'M55.26 71.3 A2 2 0 1 0 59.26 71.3 A2 2 0 1 0 55.26 71.3 Z',
        'M57.68 66.88 A3 3 0 1 0 63.68 66.88 A3 3 0 1 0 57.68 66.88 Z',
        'M55.47 56.29 L49.7 53.3 L48.78 55.07 L54.55 58.07 Z',
        'M51.79 56.5 A3 3 0 1 0 57.79 56.5 A3 3 0 1 0 51.79 56.5 Z',
        'M61.34 47.08 L57.84 41.89 L56.18 43.01 L59.68 48.2 Z',
        'M56.34 43.14 A2 2 0 1 0 60.34 43.14 A2 2 0 1 0 56.34 43.14 Z',
        'M57.74 47.2 A3 3 0 1 0 63.74 47.2 A3 3 0 1 0 57.74 47.2 Z',
        'M72.88 41.19 L70.33 47.19 L72.17 47.97 L74.72 41.97 Z',
        'M72.01 42.25 A2 2 0 1 0 76.01 42.25 A2 2 0 1 0 72.01 42.25 Z',
        'M68.92 47.36 A3 3 0 1 0 74.92 47.36 A3 3 0 1 0 68.92 47.36 Z',
        'M71.17 65.83 L73.75 72.8 L75.62 72.1 L73.04 65.13 Z',
        'M71.8 71.99 A2 2 0 1 0 75.8 71.99 A2 2 0 1 0 71.8 71.99 Z',
        'M68.86 67.04 A3 3 0 1 0 74.86 67.04 A3 3 0 1 0 68.86 67.04 Z',
        'M84.83 58.44 L88.77 63.86 L90.39 62.69 L86.44 57.26 Z',
        'M77.11 57.83 L86.5 58.19 L86.58 56.19 L77.19 55.83 Z',
        'M74.15 56.83 A3 3 0 1 0 80.15 56.83 A3 3 0 1 0 74.15 56.83 Z',
        'M82.63 57.85 A3 3 0 1 0 88.63 57.85 A3 3 0 1 0 82.63 57.85 Z',
        'M87.37 62.6 A2 2 0 1 0 91.37 62.6 A2 2 0 1 0 87.37 62.6 Z',
        'M41.46 58.07 L41.36 49.57 L39.36 49.6 L39.46 58.1 Z',
        'M47.36 54.11 L39.27 56.67 L39.87 58.58 L47.96 56.01 Z',
        'M41.56 66.57 L41.46 58.07 L39.46 58.1 L39.56 66.59 Z',
        'M33.33 58.76 L39.59 58.62 L39.55 56.62 L33.28 56.76 Z',
        'M31.98 57.54 A2 2 0 1 0 35.98 57.54 A2 2 0 1 0 31.98 57.54 Z',
        'M37.69 57.64 A3 3 0 1 0 43.69 57.64 A3 3 0 1 0 37.69 57.64 Z',
        'M37.54 67.7 A3 3 0 1 0 43.54 67.7 A3 3 0 1 0 37.54 67.7 Z',
        'M33.85 66.96 A2 2 0 1 0 37.85 66.96 A2 2 0 1 0 33.85 66.96 Z',
        'M34.28 68.31 A2 2 0 1 0 38.28 68.31 A2 2 0 1 0 34.28 68.31 Z',
        'M31.28 67.83 A3 3 0 1 0 37.28 67.83 A3 3 0 1 0 31.28 67.83 Z',
        'M32.85 45.1 L37.93 49.43 L39.23 47.9 L34.15 43.58 Z',
        'M31.95 44.57 A2 2 0 1 0 35.95 44.57 A2 2 0 1 0 31.95 44.57 Z',
        'M41.94 48.71 L44.93 42.94 L43.15 42.02 L40.16 47.79 Z',
        'M42.7 43.39 A2 2 0 1 0 46.7 43.39 A2 2 0 1 0 42.7 43.39 Z',
        'M36.7 48.68 A3 3 0 1 0 42.7 48.68 A3 3 0 1 0 36.7 48.68 Z',
        'M44.89 54.61 A3 3 0 1 0 50.89 54.61 A3 3 0 1 0 44.89 54.61 Z'
    ],
    [
        'M81.94 72.54 L74.9 65.85 L73.52 67.3 L80.56 73.99 Z',
        'M62.38 69.23 L75.68 68.3 L75.55 66.31 L62.24 67.24 Z',
        'M69.98 68.06 A4 4 0 1 0 77.98 68.06 A4 4 0 1 0 69.98 68.06 Z',
        'M77.27 73.1 A3 3 0 1 0 83.27 73.1 A3 3 0 1 0 77.27 73.1 Z',
        'M37.51 62.12 L45.7 58.35 L44.87 56.54 L36.68 60.3 Z',
        'M34.67 60.79 A3 3 0 1 0 40.67 60.79 A3 3 0 1 0 34.67 60.79 Z',
        'M36.49 69.2 L49.64 69.26 L49.65 67.26 L36.5 67.2 Z',
        'M50.41 68.85 L45.21 56.89 L43.38 57.69 L48.57 69.64 Z',
        'M49.19 69.18 L61.93 68.66 L61.85 66.67 L49.11 67.18 Z',
        'M47.43 69.65 L48 78.85 L49.99 78.72 L49.42 69.52 Z',
        'M45.58 78.21 A3 3 0 1 0 51.58 78.21 A3 3 0 1 0 45.58 78.21 Z',
        'M44.66 68.1 A4 4 0 1 0 52.66 68.1 A4 4 0 1 0 44.66 68.1 Z',
        'M59.87 67.98 A4 4 0 1 0 67.87 67.98 A4 4 0 1 0 59.87 67.98 Z',
        'M63.56 79.52 L64.47 70.55 L62.48 70.35 L61.57 79.31 Z',
        'M65.11 79.31 L66.44 70.92 L64.46 70.6 L63.13 79 Z',
        'M60.02 76.61 A4 4 0 1 0 68.02 76.61 A4 4 0 1 0 60.02 76.61 Z',
        'M29.48 79.73 L35.82 71.62 L34.25 70.39 L27.9 78.5 Z',
        'M26.34 78.21 A3 3 0 1 0 32.34 78.21 A3 3 0 1 0 26.34 78.21 Z',
        'M25.23 63.3 L33.99 68.74 L35.05 67.04 L26.29 61.6 Z',
        'M23.59 63.6 A3 3 0 1 0 29.59 63.6 A3 3 0 1 0 23.59 63.6 Z',
        'M30.85 69.03 A4.5 4.5 0 1 0 39.85 69.03 A4.5 4.5 0 1 0 30.85 69.03 Z',
        'M35.43 53.28 L43.28 58.06 L44.32 56.36 L36.47 51.57 Z',
        'M39.09 50.91 L42.83 46.44 L41.3 45.16 L37.55 49.62 Z',
        'M31.46 52.35 A4 4 0 1 0 39.46 52.35 A4 4 0 1 0 31.46 52.35 Z',
        'M40.21 44.97 A3 3 0 1 0 46.21 44.97 A3 3 0 1 0 40.21 44.97 Z',
        'M32.51 52 L24.47 54.78 L25.13 56.67 L33.16 53.89 Z',
        'M23.44 54.97 A3 3 0 1 0 29.44 54.97 A3 3 0 1 0 23.44 54.97 Z',
        'M31.68 47.67 A3 3 0 1 0 37.68 47.67 A3 3 0 1 0 31.68 47.67 Z',
        'M30.18 44.39 A3 3 0 1 0 36.18 44.39 A3 3 0 1 0 30.18 44.39 Z',
        'M43.91 58.77 L50.1 51.65 L48.59 50.34 L42.4 57.46 Z',
        'M51.26 52.91 L54.35 58.97 L56.13 58.06 L53.04 52 Z',
        'M46.98 50.25 A4 4 0 1 0 54.98 50.25 A4 4 0 1 0 46.98 50.25 Z',
        'M53.15 59.16 A3 3 0 1 0 59.15 59.16 A3 3 0 1 0 53.15 59.16 Z',
        'M49.23 39.06 L49.88 47.77 L51.87 47.62 L51.23 38.92 Z',
        'M47.41 41.04 A3 3 0 1 0 53.41 41.04 A3 3 0 1 0 47.41 41.04 Z',
        'M59.57 48.61 L52.34 49.49 L52.58 51.47 L59.81 50.59 Z',
        'M56.04 50.51 A3 3 0 1 0 62.04 50.51 A3 3 0 1 0 56.04 50.51 Z',
        'M39.8 57.21 A4 4 0 1 0 47.8 57.21 A4 4 0 1 0 39.8 57.21 Z'
    ],
];
`;

export const EXPORT_TEMPLATES = {
    "package.json": PACKAGE_JSON,
    "README.md": README_MD,
    "vite.config.ts": VITE_CONFIG,
    "index.html": INDEX_HTML,
    "src/main.tsx": MAIN_TSX,
    "src/App.tsx": APP_TSX,
    "src/components/GeometryPlayer.tsx": GEOMETRY_PLAYER,
    "src/types.ts": TYPES_TS,
    "src/rendering/GeometryRenderer.ts": GEOMETRY_RENDERER,
    "src/rendering/PrimitiveRenderer.ts": PRIMITIVE_RENDERER,
    "src/utils/interpolation.ts": INTERPOLATION_TS,
    "src/utils/gradients.ts": GRADIENTS_TS,
    "src/utils/geometry.ts": GEOMETRY_TS,
    "src/rendering/shapes/IChingRenderer.ts": ICHING_RENDERER,
    "src/rendering/shapes/MoleculeRenderer.ts": MOLECULE_RENDERER,
    "src/rendering/shapes/PolyhedronRenderer.ts": POLYHEDRON_RENDERER,
    "src/rendering/shapes/ShapeUtils.ts": SHAPE_UTILS,
    "src/utils/iching.ts": ICHING_UTILS,
    "src/utils/math3d.ts": MATH3D_UTILS,
    "src/data/molecules.ts": MOLECULES_DATA,
    "src/data/amino.ts": AMINO_TS,
    "src/data/astro.ts": ASTRO_TS,    "src/types/index.ts": TYPES_TS
};


export const REACT_NATIVE_TEMPLATES = {
    "tsconfig.json": `{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "resolveJsonModule": true,
    "esModuleInterop": true
  }
}`,
    "package.json": `{
  "name": "geometry-mobile-export",
  "version": "1.0.0",
  "main": "node_modules/expo/AppEntry.js",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "expo": "~52.0.0",
    "expo-asset": "~11.0.1",
    "expo-constants": "~17.0.3",
    "expo-status-bar": "~2.0.0",
    "react": "18.3.1",
    "react-native": "0.76.0",
    "react-native-webview": "13.12.5"
  },
  "devDependencies": {
    "@babel/core": "^7.25.2",
    "@types/react": "~18.3.12",
    "typescript": "^5.3.3"
  },
  "private": true
}`,
    "app.json": `{
  "expo": {
    "name": "Geometry Mobile Export",
    "slug": "geometry-mobile-export",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "dark",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#000000"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#000000"
      }
    },
    "web": {
      "favicon": "./assets/favicon.png"
    }
  }
}`,
    "App.tsx": `import { StatusBar } from 'expo-status-bar';
import { StyleSheet, SafeAreaView } from 'react-native';
import SampleScreen from './src/screens/SampleScreen';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <SampleScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
`
};

