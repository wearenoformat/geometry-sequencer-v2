import type { User, Session } from '@supabase/supabase-js';

export type ShapeType = 'polygon' | 'star' | 'circle' | 'diamond' | 'vesica' | 'line' | 'custom' | 'molecule' | 'iching' | 'iching_lines' | 'polyhedron' | 'group' | 'astrology' | 'amino' | 'asset_set' | 'asset_single';
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

export type AssetMimeType = 'image/svg+xml' | 'image/png' | 'image/jpeg' | 'text/plain';

export interface AssetFolder {
    id: string;
    name: string;
    isOpen: boolean;
    sortOrder: number;
}

export interface Asset {
    id: string;
    folderId: string | null;
    name: string; // original filename
    mimeType: AssetMimeType;
    storagePath: string; // `{user_id}/{asset_id}.{ext}` in v2-user-assets
    sizeBytes: number | null;
    width: number | null;
    height: number | null;
    lastModified: number | null;
    sortOrder: number | null;
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

export interface SavedColor {
    id: string;
    color: string; // hex
}
export interface SavedGradient {
    id: string;
    stops: GradientStop[];
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

    // Gradient Specific. gradientEnabled is the legacy "applies to both" flag —
    // when the per-target flags below are undefined it acts as the default for both.
    // strokeGradientEnabled / fillGradientEnabled let stroke and fill independently
    // choose flat vs gradient paint. gradientStops is shared.
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
    ichingAnimationDuration?: number; // seconds — absolute playback length of the hexagram animation, independent of layer timeline

    // Asset Specific (Stage C)
    // For 'asset_set': folder whose assets form the instance series (count = folder size).
    // For 'asset_single': one asset used as the inner shape across instances.
    assetFolderId?: string | null;
    assetId?: string | null;

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
    assetFolders: AssetFolder[];
    assetsByFolder: Record<string, Asset[]>; // keyed by assetFolder.id ('' for unfiled)
    projectThumbnails: Record<string, string>; // projectId -> signed URL
    savedColors: SavedColor[];
    savedGradients: SavedGradient[];
    user: User | null;
    session: Session | null;
    setUser: (session: Session | null) => void;
    signOut: () => Promise<void>;

    // Asset Actions (Stage A)
    fetchAssetFolders: () => Promise<void>;
    createAssetFolder: (name: string) => Promise<string | undefined>;
    renameAssetFolder: (id: string, name: string) => Promise<void>;
    deleteAssetFolder: (id: string, deleteAssets?: boolean) => Promise<void>;
    fetchAssets: (folderId: string | null) => Promise<Asset[]>;
    uploadAsset: (folderId: string | null, file: File) => Promise<Asset | undefined>;
    deleteAsset: (id: string) => Promise<void>;
    reorderAssets: (folderId: string | null, startIndex: number, endIndex: number) => Promise<void>;
    signedUrlForAsset: (id: string) => Promise<string | null>;
    seedDefaultAssetFolders: () => Promise<void>;

    // Project thumbnail actions
    captureCurrentProjectThumbnail: (captureTimeOverride?: number | 'end') => Promise<Blob | null>;
    uploadProjectThumbnail: (projectId: string, blob: Blob) => Promise<void>;
    fetchProjectThumbnails: () => Promise<void>;
    regenerateProjectThumbnails: (options?: {
        projectIds?: string[];
        captureTime?: number | 'end';
        onProgress?: (done: number, total: number) => void;
    }) => Promise<void>;

    // Global saved palette (cross-project, browser-scoped via localStorage)
    addSavedColor: (color: string) => void;
    deleteSavedColor: (id: string) => void;
    addSavedGradient: (stops: GradientStop[]) => void;
    deleteSavedGradient: (id: string) => void;

    // Folder Actions
    createFolder: (name: string) => Promise<string | undefined>;
    deleteFolder: (id: string, deleteProjects?: boolean) => void;
    moveProject: (projectId: string, folderId: string | null, targetProjectId?: string, position?: 'before' | 'after') => void;
    toggleFolder: (folderId: string) => void;
    renameFolder: (id: string, name: string) => void;
    reorderFolders: (startIndex: number, endIndex: number) => void;
    sortFolderAlphabetically: (folderId: string) => Promise<void>;
    currentTime: number;
    isPlaying: boolean;
    isLooping: boolean; // New
    activeLayerId: string | null;
    selectedLayerIds: string[]; // New
    activeKeyframeId: string | null; // Changed from activeKeyState
    activeInspectorTab: InspectorTabType;
    isFreshProject: boolean;
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
    clearFreshProject: () => void;
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
    duplicateFolder: (id: string) => Promise<void>;
    setGlobalLineColor: (color: string) => void;
    deleteProject: (id: string) => Promise<void>;
    setSavedProjects: (projects: ProjectMetadata[]) => void;
    setExportSettings: (settings: ExportSettings) => void;
    restyleAllLayers: () => void;
}
