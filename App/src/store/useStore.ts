import { create } from 'zustand';
import { supabase } from '../supabaseClient';
import type { AppState, Project, Layer, LayerKeyframe, ProjectMetadata, Folder, ExportSettings, Keyframe, AssetFolder, Asset, AssetMimeType } from '../types';
import { DEFAULT_ANIMATABLES } from '../constants/defaults';
import { sanitizeSvgFile } from '../utils/sanitizeSvg';
import { optimizeAsset } from '../utils/assetOptimizer';
import { captureThumbnail } from '../utils/thumbnailGenerator';
import type { SavedColor, SavedGradient, GradientStop } from '../types';

const PROJECT_THUMBNAIL_PREFIX = '_project-thumbnails';
const PROJECT_THUMBNAIL_BUCKET = 'v2-user-assets';
const PROJECT_THUMBNAIL_TTL = 60 * 60 * 24; // 24h signed URL
// Frame 0 is usually pre-animation / blank. Snapshot 10s in (clamped to duration) so
// thumbnails reflect a meaningful state of the animation.
const PROJECT_THUMBNAIL_CAPTURE_TIME = 10;

const SAVED_COLORS_KEY = 'v2-saved-colors';
const SAVED_GRADIENTS_KEY = 'v2-saved-gradients';

function loadJsonArray<T>(key: string): T[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
        return [];
    }
}

function saveJsonArray<T>(key: string, value: T[]): void {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Quota exceeded or storage disabled — silently drop.
    }
}

function makeId(): string {
    return Math.random().toString(36).slice(2, 11);
}
import {
    SEED_FOLDER_NAMES,
    LEGACY_TYPE_TO_SEED_FOLDER,
    generateAstrologySvgs,
    generateAminoSvgs,
    generateIChingStrokeSvgs,
} from '../data/seedAssets';

const seededFlagKey = (userId: string) => `v2-seeded-asset-folders:${userId}`;

const extensionForMime = (mime: AssetMimeType): string | null => {
    switch (mime) {
        case 'image/svg+xml': return 'svg';
        case 'image/png': return 'png';
        case 'image/jpeg': return 'jpg';
        case 'text/plain': return 'txt';
        default: return null;
    }
};

const guessExtensionFromName = (name: string): string | null => {
    const idx = name.lastIndexOf('.');
    if (idx < 0 || idx === name.length - 1) return null;
    return name.slice(idx + 1).toLowerCase();
};

const measureRasterDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(e);
        };
        img.src = url;
    });
};

export { DEFAULT_ANIMATABLES } from '../constants/defaults';

const createDefaultLayer = (index: number, projectContext?: Pick<Project, 'globalLineColor' | 'globalStyleEnabled' | 'globalStrokeWeight' | 'globalGradientEnabled' | 'globalGradientStops'>): Layer => {
    const layerId = `layer-${Math.random().toString(36).substr(2, 9)}`;
    const strokeColor = (projectContext?.globalStyleEnabled && projectContext?.globalLineColor)
        ? projectContext.globalLineColor
        : '#ffffff';
    const strokeWeight = (projectContext?.globalStyleEnabled && projectContext?.globalStrokeWeight !== undefined)
        ? projectContext.globalStrokeWeight
        : 1;
    const gradientEnabled = (projectContext?.globalStyleEnabled && projectContext?.globalGradientEnabled !== undefined)
        ? projectContext.globalGradientEnabled
        : false;
    const gradientStops = (projectContext?.globalStyleEnabled && projectContext?.globalGradientStops)
        ? [...projectContext.globalGradientStops]
        : [];

    return {
        id: layerId,
        name: `Layer ${index + 1}`,
        type: 'polygon',
        visible: true,
        timeline: {
            start: 0,
            end: 0 // Default to "point" mode (infinite static) until 2nd keyframe
        },
        fadeIn: {
            enabled: false,
            duration: 2
        },
        fadeOut: {
            enabled: false,
            duration: 2
        },
        config: {
            sides: 6,
            instances: 1,
            density: 0,
            densitySelective: false,
            drawOutline: true,
            drawSpokes: true,
            drawStar: false,
            drawWeb: false,
            starSkip: 2,
            starInnerRadius: 0.5,
            internalLines: 'none',
            gridLayout: '',
            gridSpacing: 0,
            instances2: 0,
            gridLayout2: '',
            strokeColor: strokeColor,
            strokeEnabled: true,
            // Color is unified in the Inspector — fillColor stays in lockstep with
            // strokeColor so both render the same paint when filledStyle is on.
            fillColor: strokeColor,
            fillEnabled: false,
            scaleLocked: true,
            dotsEnabled: false,
            dotSize: 3,
            dotType: 'filled',
            dotOffset: false,
            gradientEnabled: gradientEnabled,
            gradientStops: gradientStops,
            strokeStyleType: 'solid',
            dashLength: 10,
            gapLength: 10,
            lineAnchor: 'center',
            shapeArc: 360,
            radialArc: 360,
            alignToPath: false,
            molecule: 'threonine',
            persistVisible: false,
            styleOverrideEnabled: false,
        },
        // Initialize with Start and End keyframes
        keyframes: [
            {
                id: `kf-${Math.random().toString(36).substr(2, 9)}`,
                time: 0,
                value: { ...DEFAULT_ANIMATABLES, radiusX: 100, radiusY: 100, strokeWeight },
                easing: 'easeInOutSine'
            },
            // Second keyframe removed for default "single keyframe" behavior
        ],
        symmetry: {
            enabled: false,
            mode: '3-way',
            masked: true,
            mirrorSegments: false
        }
    };
};

const recalculateLayerBounds = (keyframes: LayerKeyframe[], currentTimeline: { start: number, end: number }) => {
    if (!keyframes || keyframes.length === 0) return { timeline: currentTimeline, keyframes };

    const times = keyframes.map(k => k.time);
    const minRelative = Math.min(...times);
    const maxRelative = Math.max(...times);

    const newStart = Math.max(0, currentTimeline.start + minRelative);
    const newEnd = Math.max(newStart, currentTimeline.start + maxRelative);

    const shiftedKeyframes = keyframes.map(k => ({
        ...k,
        time: k.time - minRelative
    }));

    return {
        timeline: { start: newStart, end: newEnd },
        keyframes: shiftedKeyframes
    };
};

const INITIAL_PROJECT: Project = {
    id: 'pro-default',
    name: 'New Project',
    duration: 10,
    backgroundColor: '#000000',
    layers: [createDefaultLayer(0)],
    gradientColor: '#d4af37',
    globalLineColor: '#7a7a7a',
    globalStrokeWeight: 1,
    globalStyleEnabled: false,
    globalGradientEnabled: false,
    globalGradientStops: [
        { id: '1', offset: 36, color: '#793720' },
        { id: '2', offset: 63, color: '#FCC698' }
    ]
};

export const useStore = create<AppState>((set, get) => {
    // Check URL params for initial view
    const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const initialView = urlParams.get('mode') === 'player' ? 'player' : 'landing';

    return {
        currentView: initialView,
        project: INITIAL_PROJECT,
        savedProjects: [],
        folders: [],
        assetFolders: [],
        assetsByFolder: {},
        projectThumbnails: {},
        savedColors: loadJsonArray<SavedColor>(SAVED_COLORS_KEY),
        savedGradients: loadJsonArray<SavedGradient>(SAVED_GRADIENTS_KEY),
        user: null,
        session: null,
        adminProfiles: [],
        isAdmin: false,
        setUser: async (session) => {
            let isAdmin = false;
            if (session?.user) {
                // Check if admin
                const { data } = await supabase.from('profiles').select('is_admin').eq('id', session.user.id).single();
                isAdmin = data?.is_admin || false;
            }
            set({ session, user: session?.user || null, isAdmin });

            // Auto-fetch projects if user is logged in
            if (session?.user) {
                get().fetchProjects();
                get().fetchAssetFolders();
            }
        },
        signOut: async () => {
            await supabase.auth.signOut();
            set({ session: null, user: null, savedProjects: [], folders: [], assetFolders: [], assetsByFolder: {}, projectThumbnails: {} });
        },
        exportSettings: { width: 1080, height: 1080, isActive: false, pixelRatio: 1 },
        currentTime: 0,
        isPlaying: false,
        isLooping: true, // Default to true
        activeLayerId: INITIAL_PROJECT.layers[0].id,
        selectedLayerIds: [],
        activeKeyframeId: INITIAL_PROJECT.layers[0].keyframes[0].id,
        activeInspectorTab: 'controls',
        isFreshProject: false,
        clipboardLayers: (() => {
            try {
                const stored = localStorage.getItem('clipboardLayers');
                return stored ? JSON.parse(stored) : [];
            } catch (e) {
                return [];
            }
        })(),
        clipboardKeyframe: (() => {
            try {
                const stored = localStorage.getItem('clipboardKeyframe');
                return stored ? JSON.parse(stored) : null;
            } catch (e) {
                return null;
            }
        })(),

        // History
        history: [],
        future: [],

        undo: () => set((state) => {
            if (state.history.length === 0) return state;
            const previous = state.history[state.history.length - 1];
            const newHistory = state.history.slice(0, -1);
            return {
                history: newHistory,
                project: previous,
                future: [state.project, ...state.future]
            };
        }),

        redo: () => set((state) => {
            if (state.future.length === 0) return state;
            const next = state.future[0];
            const newFuture = state.future.slice(1);
            return {
                history: [...state.history, state.project],
                project: next,
                future: newFuture
            };
        }),

        setActiveLayerId: (id) => {
            // const { project } = get(); // Unused
            // const layer = project.layers.find(l => l.id === id); // Unused logic regarding keeping keyframe selection

            // Just set new ID.
            set({ activeLayerId: id, selectedLayerIds: id ? [id] : [] });
        },

        setSelectedLayerIds: (ids: string[]) => set({ selectedLayerIds: ids }),

        setActiveKeyframeId: (id, layerId) => {
            const { activeLayerId, project } = get();
            const targetLayerId = layerId || activeLayerId;
            const targetLayer = project.layers.find(l => l.id === targetLayerId);

            if (targetLayer && id) {
                const kf = targetLayer.keyframes.find(k => k.id === id);
                if (kf) {
                    const absTime = targetLayer.timeline.start + kf.time;
                    set({
                        activeLayerId: targetLayerId,
                        activeKeyframeId: id,
                        isPlaying: false,
                        currentTime: absTime
                    });
                    return;
                }
            }

            set({ activeKeyframeId: id });
        },

        setExportSettings: (settings: ExportSettings) => set({ exportSettings: settings }),



        setIsPlaying: (isPlaying: boolean) => set({ isPlaying }),

        setCurrentTime: (time: number) => set({ currentTime: time }),

        setProject: (project: Project) => set({ project, activeLayerId: project.layers[0]?.id, isFreshProject: false }),

        setIsLooping: (isLooping: boolean) => set({ isLooping }),

        setActiveInspectorTab: (tab) => set({ activeInspectorTab: tab }),

        clearFreshProject: () => set((state) => state.isFreshProject ? { isFreshProject: false } : state),

        renameProject: async (id: string, name: string) => {
            const { project, fetchProjects, saveProject } = get();

            if (project.id === id) {
                set({ project: { ...project, name } });
                await saveProject();
            } else {
                try {
                    // Update metadata for other projects
                    const { data: currentData, error: fetchError } = await supabase
                        .from('projects')
                        .select('data, folder_id')
                        .eq('id', id)
                        .single();

                    if (!fetchError && currentData) {
                        const updatedData = { ...currentData.data, name, lastModified: Date.now() };
                        await supabase
                            .from('projects')
                            .update({
                                name,
                                data: updatedData,
                                last_modified: updatedData.lastModified,
                                folder_id: currentData.folder_id // Explicitly preserve folder_id
                            })
                            .eq('id', id);
                    }
                } catch (e) {
                    console.error('Failed to rename project', e);
                }
            }
            await fetchProjects();
        },

        addLayer: () => set((state) => {
            const historyUpdate = {
                history: [...state.history, JSON.parse(JSON.stringify(state.project))].slice(-50),
                future: []
            };

            const newLayer = createDefaultLayer(state.project.layers.length, state.project);

            return {
                ...historyUpdate,
                project: {
                    ...state.project,
                    layers: [...state.project.layers, newLayer],
                },
                activeLayerId: newLayer.id,
                selectedLayerIds: [newLayer.id],
                activeKeyframeId: newLayer.keyframes[0].id,
                currentTime: 0,
                isPlaying: false
            };
        }),

        updateLayer: (id, updates, skipHistory = false) => set((state) => {
            const layerIndex = state.project.layers.findIndex((l) => l.id === id);
            if (layerIndex === -1) return state;

            const oldLayer = state.project.layers[layerIndex];
            const newLayer = { ...oldLayer, ...updates };

            const historyUpdate = skipHistory ? {} : {
                history: [...state.history, JSON.parse(JSON.stringify(state.project))].slice(-50),
                future: []
            };

            let layers = [...state.project.layers];
            layers[layerIndex] = newLayer;

            // --- FEATURE: GROUP DRAGGING ---
            // If a group's start time changes (dragging/moving), move all children by the delta.
            if (oldLayer.type === 'group' && updates.timeline && updates.timeline.start !== undefined) {
                const delta = updates.timeline.start - oldLayer.timeline.start;
                // Only propagate if delta is non-zero
                if (Math.abs(delta) > 0.0001) {
                    // Find all descendants
                    const getDescendants = (rootId: string): number[] => {
                        const indices: number[] = [];
                        layers.forEach((l, idx) => {
                            if (l.parentId === rootId) {
                                indices.push(idx);
                                // Recursively add children of this child
                                indices.push(...getDescendants(l.id));
                            }
                        });
                        return indices;
                    };

                    const descendantIndices = getDescendants(id);
                    descendantIndices.forEach(idx => {
                        const child = layers[idx];
                        // Shift child timeline
                        // const childDuration = child.timeline.end - child.timeline.start;
                        const newStart = child.timeline.start + delta;
                        const newEnd = child.timeline.end + delta;

                        // We update the layer directly in the array
                        layers[idx] = {
                            ...child,
                            timeline: { start: newStart, end: newEnd }
                        };
                    });
                }
            }

            // --- FEATURE: GROUP HUGGING (Auto-Size) ---
            // If any layer's timeline changed, update its parent(s) to encompass children.
            // This needs to bubble up to the root.

            if (updates.timeline) {
                let currentChild = newLayer;

                let safety = 0;
                while (currentChild.parentId && safety < 100) {
                    safety++;
                    const parentId = currentChild.parentId;
                    const parentIndex = layers.findIndex(l => l.id === parentId);
                    if (parentIndex === -1) break;

                    const parent = layers[parentIndex];
                    if (parent.type !== 'group') break;

                    // Scan all children
                    const siblings = layers.filter(l => l.parentId === parentId);
                    if (siblings.length === 0) break;

                    let minStart = Infinity;
                    let maxEnd = -Infinity;

                    siblings.forEach(sib => {
                        if (sib.timeline.start < minStart) minStart = sib.timeline.start;
                        if (sib.timeline.end > maxEnd) maxEnd = sib.timeline.end;
                    });

                    if (minStart === Infinity || maxEnd === -Infinity) break;

                    // Update parent if changed
                    if (Math.abs(parent.timeline.start - minStart) > 0.0001 || Math.abs(parent.timeline.end - maxEnd) > 0.0001) {
                        const newDuration = maxEnd - minStart;

                        // CLAMP/SCALE KEYFRAMES logic for Group
                        // If group duration changes, we should probably scale or clamp its keyframes.
                        // Currently: Clamping end keyframes to new duration.
                        const updatedKeyframes = parent.keyframes.map(kf => {
                            if (kf.time > newDuration) return { ...kf, time: newDuration };
                            return kf;
                        });

                        const updatedParent = {
                            ...parent,
                            timeline: { start: minStart, end: maxEnd },
                            keyframes: updatedKeyframes
                        };
                        layers[parentIndex] = updatedParent;
                        currentChild = updatedParent; // Bubble up
                    } else {
                        break;
                    }
                }
            }

            return {
                ...historyUpdate,
                project: {
                    ...state.project,
                    layers,
                },
            };
        }),

        toggleLayerVisibility: (id) => set((state) => {
            const historyUpdate = {
                history: [...state.history, JSON.parse(JSON.stringify(state.project))].slice(-50),
                future: []
            };
            return {
                ...historyUpdate,
                project: {
                    ...state.project,
                    layers: state.project.layers.map((l) =>
                        l.id === id ? { ...l, visible: !l.visible } : l
                    ),
                },
            };
        }),



        moveLayer: (layerId, targetId, position) => set((state) => {
            const historyUpdate = {
                history: [...state.history, JSON.parse(JSON.stringify(state.project))].slice(-50),
                future: []
            };

            const layers = [...state.project.layers];
            const sourceIndex = layers.findIndex(l => l.id === layerId);
            if (sourceIndex === -1) return state;

            const sourceLayer = { ...layers[sourceIndex] };
            layers.splice(sourceIndex, 1); // Remove source

            // Cycle Prevention: Check if target is descendant of source
            if (targetId) {
                let current = layers.find(l => l.id === targetId);
                while (current && current.parentId) {
                    if (current.parentId === layerId) {
                        // Attempting to move parent into child -> Cancel
                        return state;
                    }
                    if (current.parentId) {
                        current = layers.find(l => l.id === current?.parentId);
                    } else {
                        break;
                    }
                }
                // Direct check if target IS the source (already handled by splice/index finding, but good for safety)
                if (targetId === layerId) return state;
            }

            // Determine new parent and index
            let newParentId: string | undefined = sourceLayer.parentId;
            let insertIndex = -1;

            if (targetId === null) {
                // Moving to root, at end or specific handling? 
                // Currently only used for 'outside' drops if mapped strictly.
                // If dropped on empty space, maybe push to end? 
                newParentId = undefined;
                insertIndex = layers.length;
            } else {
                const targetIndex = layers.findIndex(l => l.id === targetId);
                if (targetIndex === -1) {
                    // Fallback
                    layers.push(sourceLayer);
                    return { ...historyUpdate, project: { ...state.project, layers } };
                }
                const targetLayer = layers[targetIndex];

                if (position === 'inside') {
                    // Parent to target, add at end of target's children
                    newParentId = targetId;
                    // Find last child of target to insert after, or insert after target itself if no children yet?
                    // Pixi render order: Children must come AFTER parent in the list if using flat list?
                    // Actually, my render loop recurses.
                    // But Timeline flat list relies on array order for siblings.

                    // Find index of last descendant of target to insert after
                    // Or just insert right after target?
                    // If target is expanded, it shows children.
                    // If I insert at end of children.

                    // Simple approach: Insert after the LAST child of this group.
                    let lastChildIndex = targetIndex;
                    for (let i = targetIndex + 1; i < layers.length; i++) {
                        if (layers[i].parentId === targetId) {
                            lastChildIndex = i;
                        }
                    }
                    insertIndex = lastChildIndex + 1;
                } else {
                    // Above/Below target. Parent is same as target's parent.
                    newParentId = targetLayer.parentId;

                    // If 'below', we insert after target (and its descendants?)
                    // If visual list is flattened, "below target" means "immediately after target visually".
                    // If target is a group and expanded, "below target" might mean "inside at top"? 
                    // No, "below" usually means sibling below.
                    // If I drop below a Group, I skip the Group AND its children.

                    // Position relative to target index in the MAIN array?
                    // NOTE: The main array order affects Z-index.
                    // If I want 'source' to be rendered AFTER 'target', it must be later in array.
                    // 'below' in Timeline = rendered ON TOP? or BEHIND?
                    // Timeline: Top (Index 0) -> Bottom (Index N).
                    // Renderer: Index 0 (Bottom) -> Index N (Top).
                    // So Timeline Top = Renderer Bottom.
                    // "Above" in Timeline (lower index) = "Behind" in Renderer (lower index).

                    if (position === 'above') {
                        insertIndex = targetIndex;
                    } else {
                        insertIndex = targetIndex + 1;
                    }
                }
            }

            // Update parent
            sourceLayer.parentId = newParentId;

            // Handle Edge Case: dragging later in array to earlier
            // splice of source already happened, so indices shifted.
            // If targetIndex was > sourceIndex, it shifted down by 1.
            // My default usage of `targetIndex` from `layers` (which has source removed) handles this?
            // Yes, `layers` already excludes source. `targetIndex` is valid in the reduced array.

            // Insert
            layers.splice(insertIndex, 0, sourceLayer);

            return {
                ...historyUpdate,
                project: {
                    ...state.project,
                    layers
                }
            };
        }),

        duplicateLayer: (id: string) => set((state) => {
            const sourceLayer = state.project.layers.find(l => l.id === id);
            if (!sourceLayer) return state;

            const historyUpdate = {
                history: [...state.history, JSON.parse(JSON.stringify(state.project))].slice(-50),
                future: []
            };

            const newLayers: Layer[] = [];
            const idMap = new Map<string, string>();

            // Helper to duplicate a layer and its descendants
            const duplicateRecursive = (layerId: string, parentId?: string) => {
                const layer = state.project.layers.find(l => l.id === layerId);
                if (!layer) return;

                const newId = `layer-${Math.random().toString(36).substr(2, 9)}`;
                idMap.set(layer.id, newId);

                const newLayer: Layer = {
                    ...JSON.parse(JSON.stringify(layer)),
                    id: newId,
                    parentId: parentId,
                    name: parentId ? layer.name : `${layer.name} (Copy)`
                };

                // Regenerate Keyframe IDs
                newLayer.keyframes = newLayer.keyframes.map(kf => ({
                    ...kf,
                    id: `kf-${Math.random().toString(36).substr(2, 9)}`
                }));

                newLayers.push(newLayer);

                // Find and duplicate children
                const children = state.project.layers.filter(l => l.parentId === layer.id);
                children.forEach(child => duplicateRecursive(child.id, newId));
            };

            // Start recursion from the explicitly duplicated layer
            duplicateRecursive(id, sourceLayer.parentId);

            // Find the index of the source layer to insert the new layers right after it
            const sourceIndex = state.project.layers.findIndex(l => l.id === id);
            const insertIndex = sourceIndex !== -1 ? sourceIndex + 1 : state.project.layers.length;

            const updatedLayers = [...state.project.layers];
            updatedLayers.splice(insertIndex, 0, ...newLayers);

            return {
                ...historyUpdate,
                project: {
                    ...state.project,
                    layers: updatedLayers
                },
                activeLayerId: idMap.get(id), // Select the top-level duplicated layer
                selectedLayerIds: idMap.get(id) ? [idMap.get(id)!] : state.selectedLayerIds
            };
        }),

        copySelection: () => set((state) => {
            const { selectedLayerIds, project } = state;
            if (!selectedLayerIds || selectedLayerIds.length === 0) return state;

            const layersToCopy = new Set<string>();
            const traverse = (id: string) => {
                layersToCopy.add(id);
                const children = project.layers.filter(l => l.parentId === id);
                children.forEach(c => traverse(c.id));
            };
            selectedLayerIds.forEach(id => traverse(id));

            const layers = project.layers.filter(l => layersToCopy.has(l.id)).map(l => JSON.parse(JSON.stringify(l)));

            try {
                localStorage.setItem('clipboardLayers', JSON.stringify(layers));
                clipboardChannel.postMessage({ type: 'SYNC_LAYERS', payload: layers });
            } catch (e) {
                console.error('Failed to save clipboard', e);
            }

            return { clipboardLayers: layers };
        }),

        pasteClipboard: () => set((state) => {
            if (!state.clipboardLayers || state.clipboardLayers.length === 0) return state;

            const idMap = new Map<string, string>();
            const newLayers: Layer[] = [];

            state.clipboardLayers.forEach(layer => {
                const newId = `layer-${Math.random().toString(36).substr(2, 9)}`;
                idMap.set(layer.id, newId);
            });

            state.clipboardLayers.forEach(original => {
                const newLayer = JSON.parse(JSON.stringify(original));
                newLayer.id = idMap.get(original.id)!;
                newLayer.name = `${newLayer.name} (Copy)`;

                if (newLayer.parentId && idMap.has(newLayer.parentId)) {
                    newLayer.parentId = idMap.get(newLayer.parentId);
                } else {
                    newLayer.parentId = undefined;
                }

                newLayer.keyframes = newLayer.keyframes.map((kf: any) => ({
                    ...kf,
                    id: `kf-${Math.random().toString(36).substr(2, 9)}`
                }));

                newLayers.push(newLayer);
            });

            const historyUpdate = {
                history: [...state.history, JSON.parse(JSON.stringify(state.project))].slice(-50),
                future: []
            };

            return {
                ...historyUpdate,
                project: {
                    ...state.project,
                    layers: [...state.project.layers, ...newLayers]
                },
                selectedLayerIds: newLayers.map(l => l.id),
                activeLayerId: newLayers.length > 0 ? newLayers[0].id : state.activeLayerId
            };
        }),

        addFolder: () => set((state) => {
            const historyUpdate = {
                history: [...state.history, JSON.parse(JSON.stringify(state.project))].slice(-50),
                future: []
            };

            const folderId = `layer-${Math.random().toString(36).substr(2, 9)}`;

            const folderLayer = createDefaultLayer(state.project.layers.length, state.project);
            folderLayer.id = folderId;
            folderLayer.type = 'group'; // We use 'group' type to represent a folder
            folderLayer.name = 'New Folder';
            folderLayer.collapsed = false;
            folderLayer.timeline = { start: 0, end: state.project.duration };

            // Folders need keyframes to span the duration, otherwise they might not render correctly
            const defaultValues = { ...DEFAULT_ANIMATABLES };
            folderLayer.keyframes = [
                { id: `kf-${Math.random().toString(36).substr(2, 9)}`, time: 0, value: { ...defaultValues }, easing: 'linear' },
                { id: `kf-${Math.random().toString(36).substr(2, 9)}`, time: state.project.duration, value: { ...defaultValues }, easing: 'linear' }
            ];

            return {
                ...historyUpdate,
                project: {
                    ...state.project,
                    layers: [folderLayer, ...state.project.layers] // Insert at top
                },
                activeLayerId: folderId,
                selectedLayerIds: [folderId]
            };
        }),

        toggleLayerCollapse: (layerId) => set((state) => ({
            project: {
                ...state.project,
                layers: state.project.layers.map(l => l.id === layerId ? { ...l, collapsed: !l.collapsed } : l)
            }
        })),

        deleteLayer: (id) => set((state) => {
            const historyUpdate = {
                history: [...state.history, JSON.parse(JSON.stringify(state.project))].slice(-50),
                future: []
            };

            // Recursive find all descendants
            const getDescendants = (rootId: string, allLayers: Layer[]): string[] => {
                const children = allLayers.filter(l => l.parentId === rootId);
                let descendants = children.map(c => c.id);
                children.forEach(c => {
                    descendants = [...descendants, ...getDescendants(c.id, allLayers)];
                });
                return descendants;
            };

            const idsToDelete = [id, ...getDescendants(id, state.project.layers)];

            return {
                ...historyUpdate,
                project: {
                    ...state.project,
                    layers: state.project.layers.filter((l) => !idsToDelete.includes(l.id)),
                },
                activeLayerId: state.activeLayerId && idsToDelete.includes(state.activeLayerId) ? null : state.activeLayerId,
                selectedLayerIds: state.selectedLayerIds?.filter(id => !idsToDelete.includes(id)) || [],
            };
        }),
        addKeyframe: (layerId, overrideTime) => set((state) => {
            const layer = state.project.layers.find(l => l.id === layerId);
            if (!layer) return state;

            const historyUpdate = {
                history: [...state.history, JSON.parse(JSON.stringify(state.project))].slice(-50),
                future: []
            };

            // Determine time for new keyframe
            // Should be current time relative to layer
            const absoluteTime = overrideTime !== undefined ? overrideTime : state.currentTime;

            // Check if absolute time is outside current timeline
            let updatedTimeline = { ...layer.timeline };
            if (absoluteTime < layer.timeline.start) {
                updatedTimeline.start = Math.max(0, absoluteTime);
            }
            if (absoluteTime > layer.timeline.end) {
                updatedTimeline.end = Math.min(state.project.duration, absoluteTime);
            }

            const relativeTime = absoluteTime - updatedTimeline.start;

            // Find frames time-wise. If the layer has no keyframes (user deleted them all),
            // seed from DEFAULT_ANIMATABLES so the layer can recover.
            const sorted = [...layer.keyframes].sort((a, b) => a.time - b.time);
            let prevKf: LayerKeyframe | undefined = sorted[0];
            for (const kf of sorted) {
                if (kf.time <= relativeTime) prevKf = kf;
            }
            const baseValue = prevKf ? prevKf.value : DEFAULT_ANIMATABLES;

            const newKf: LayerKeyframe = {
                id: `kf-${Math.random().toString(36).substr(2, 9)}`,
                time: relativeTime,
                value: JSON.parse(JSON.stringify(baseValue)), // Clone values
                easing: 'easeInOutSine'
            };

            // If we shifted the start time, we need to adjust all existing keyframes relative times
            let finalKeyframes = [...layer.keyframes, newKf];
            if (absoluteTime < layer.timeline.start) {
                const shift = layer.timeline.start - updatedTimeline.start;
                finalKeyframes = layer.keyframes.map(kf => ({
                    ...kf,
                    time: kf.time + shift
                }));
                // The new keyframe is already at the correct relativeTime (absoluteTime - updatedTimeline.start)
                finalKeyframes.push(newKf);
            }

            // Enforce Strict Keyframe Bounds
            const bounds = recalculateLayerBounds(finalKeyframes, updatedTimeline);

            return {
                ...historyUpdate,
                project: {
                    ...state.project,
                    layers: state.project.layers.map(l =>
                        l.id === layerId
                            ? {
                                ...l,
                                timeline: bounds.timeline,
                                keyframes: bounds.keyframes.sort((a, b) => a.time - b.time)
                            }
                            : l
                    )
                },
                activeKeyframeId: newKf.id
            };
        }),


        updateKeyframe: (layerId, keyframeId, updates, skipHistory = false) => set((state) => {
            const historyUpdate = skipHistory ? {} : {
                history: [...state.history, JSON.parse(JSON.stringify(state.project))].slice(-50),
                future: []
            };

            return {
                ...historyUpdate,
                project: {
                    ...state.project,
                    layers: state.project.layers.map(l => {
                        if (l.id !== layerId) return l;
                        const newKeyframes = l.keyframes.map(k => k.id === keyframeId ? { ...k, ...updates } : k).sort((a, b) => a.time - b.time);
                        const bounds = recalculateLayerBounds(newKeyframes, l.timeline);
                        return {
                            ...l,
                            timeline: bounds.timeline,
                            keyframes: bounds.keyframes
                        };
                    })
                }
            };
        }),

        deleteKeyframe: (layerId, keyframeId) => set((state) => {
            // const layer = state.project.layers.find(l => l.id === layerId);
            // Prevent deleting the last keyframe? Or allow it? 
            // Usually need at least 1, but maybe 0 is fine (no render).
            // Let's allow simple toggle.

            const historyUpdate = {
                history: [...state.history, JSON.parse(JSON.stringify(state.project))].slice(-50),
                future: []
            };

            return {
                ...historyUpdate,
                project: {
                    ...state.project,
                    layers: state.project.layers.map(l => {
                        if (l.id !== layerId) return l;
                        const newKeyframes = l.keyframes.filter(k => k.id !== keyframeId);
                        const bounds = recalculateLayerBounds(newKeyframes, l.timeline);
                        return {
                            ...l,
                            timeline: bounds.timeline,
                            keyframes: bounds.keyframes
                        };
                    })
                },
                activeKeyframeId: state.activeKeyframeId === keyframeId ? null : state.activeKeyframeId
            };
        }),

        copyKeyframe: (keyframeId) => set((state) => {
            let foundKf: Keyframe<any> | null = null;
            state.project.layers.forEach(l => {
                const k = l.keyframes.find(kf => kf.id === keyframeId);
                if (k) foundKf = k;
            });

            if (!foundKf) return state;

            try {
                localStorage.setItem('clipboardKeyframe', JSON.stringify(foundKf));
                clipboardChannel.postMessage({ type: 'SYNC_KEYFRAME', payload: foundKf });
            } catch (e) { }

            return { clipboardKeyframe: foundKf };
        }),

        pasteKeyframe: () => set((state) => {
            if (!state.clipboardKeyframe || !state.activeLayerId) return state;

            // Add pasted keyframe at current time
            const layer = state.project.layers.find(l => l.id === state.activeLayerId);
            if (!layer) return state;

            const relativeTime = Math.max(0, state.currentTime - layer.timeline.start);

            const newKf: LayerKeyframe = {
                ...state.clipboardKeyframe,
                id: `kf-${Math.random().toString(36).substr(2, 9)}`,
                time: relativeTime
            };

            const historyUpdate = {
                history: [...state.history, JSON.parse(JSON.stringify(state.project))].slice(-50),
                future: []
            };

            return {
                ...historyUpdate,
                project: {
                    ...state.project,
                    layers: state.project.layers.map(l =>
                        l.id === state.activeLayerId
                            ? { ...l, keyframes: [...l.keyframes, newKf].sort((a, b) => a.time - b.time) }
                            : l
                    )
                },
                activeKeyframeId: newKf.id
            };
        }),

        updateProject: (updates: Partial<Project>, skipHistory = false) => set((state) => {
            const historyUpdate = skipHistory ? {} : {
                history: [...state.history, JSON.parse(JSON.stringify(state.project))].slice(-50),
                future: []
            };
            return {
                ...historyUpdate,
                project: { ...state.project, ...updates }
            };
        }),

        setView: (view) => set({ currentView: view }),

        setSavedProjects: (projects: ProjectMetadata[]) => set({ savedProjects: projects }),

        saveProject: async () => {
            const { project, user } = get();

            // Allow local save if guest? Or restrict? 
            // Current design implies user must be logged in for cloud save.
            if (!user) {
                // Fallback to local save or warn?
                // Let's warn for now as we are migrating fully.
                // alert("Please login to save to cloud.");
                console.warn("User not logged in, cannot save to cloud.");
                return;
            }

            const updatedProject = { ...project, lastModified: Date.now() };

            try {
                // Upsert to Supabase
                const baseData = {
                    id: updatedProject.id,
                    user_id: user.id,
                    name: updatedProject.name,
                    data: updatedProject, // Full JSON
                    last_modified: updatedProject.lastModified,
                };

                // Try with folder_id first
                const { error } = await supabase
                    .from('projects')
                    .upsert({
                        ...baseData,
                        folder_id: updatedProject.folderId || null
                    });

                if (error) {
                    // Check if error is related to missing column "folder_id"
                    // Postgres error 42703 is "undefined_column"
                    if (error.code === '42703' || error.message?.includes('folder_id')) {
                        console.warn("Folder ID column missing, saving without folder association.");
                        // Retry without folder_id
                        const { error: retryError } = await supabase
                            .from('projects')
                            .upsert(baseData);

                        if (retryError) throw retryError;
                    } else {
                        throw error;
                    }
                }

                set({ project: updatedProject });
                await get().fetchProjects();

                // Snapshot the live canvas to a thumbnail and upload (fire-and-forget;
                // we don't want save UI to block on this).
                get().captureCurrentProjectThumbnail().then((blob) => {
                    if (blob) get().uploadProjectThumbnail(updatedProject.id, blob);
                });
            } catch (e) {
                console.error('Failed to save project', e);
            }
        },

        loadProject: async (id: string, view: 'editor' | 'dashboard' | 'player' | 'admin' = 'editor') => {
            try {
                // Try Supabase first
                const { data, error } = await supabase
                    .from('projects')
                    .select('data, folder_id')
                    .eq('id', id)
                    .single();

                let projectData;

                if (!error && data) {
                    projectData = data.data;
                    if (projectData) {
                        projectData.folderId = data.folder_id;
                    }
                }

                if (projectData) {
                    // MIGRATION LOGIC: Convert old projects to new keyframe format on load
                    // (Simple check: does it have layers[0].animation?)
                    if (projectData.layers && projectData.layers.length > 0 && projectData.layers[0].animation) {
                        projectData.layers = projectData.layers.map((l: any) => {
                            if (l.keyframes) return l; // Already migrated

                            // Convert animation object to keyframes
                            // Old: animation.radiusX.start/middle/end
                            // New: keyframes: [{time:0, value:...}, {time:mid, value:...}, {time:end, value:...}]

                            const startVal: any = {};
                            const midVal: any = {};
                            const endVal: any = {};

                            Object.keys(l.animation).forEach(key => {
                                const prop = l.animation[key];
                                if (prop && typeof prop === 'object') {
                                    startVal[key] = prop.start;
                                    midVal[key] = prop.middle;
                                    endVal[key] = prop.end;
                                }
                            });

                            // Fill missing with defaults
                            const fill = (obj: any) => ({ ...DEFAULT_ANIMATABLES, ...obj });

                            const duration = l.timeline.end - l.timeline.start;

                            return {
                                ...l,
                                keyframes: [
                                    { id: 'kf-start', time: 0, value: fill(startVal), easing: l.animation.easingSM || 'easeInOutSine' },
                                    { id: 'kf-mid', time: duration / 2, value: fill(midVal), easing: l.animation.easingME || 'easeInOutSine' },
                                    { id: 'kf-end', time: duration, value: fill(endVal), easing: 'linear' }
                                ]
                            };
                        });
                    }

                    // Legacy-type migration (Stage F): rewrite astrology / amino /
                    // iching_lines layers into asset_set pointing at the matching seed
                    // folder. The rewrite is in-memory here; the next save persists it.
                    // Layers whose seed folder isn't available yet keep their legacy
                    // type — the renderer's legacy branches still handle them.
                    const foldersByName = new Map(get().assetFolders.map(f => [f.name, f.id]));
                    projectData.layers = projectData.layers.map((layer: any) => {
                        const seedName = LEGACY_TYPE_TO_SEED_FOLDER[layer.type];
                        if (!seedName) return layer;
                        const folderId = foldersByName.get(seedName);
                        if (!folderId) return layer;
                        return {
                            ...layer,
                            type: 'asset_set',
                            config: {
                                ...layer.config,
                                assetFolderId: folderId,
                            },
                        };
                    });

                    set({
                        project: projectData,
                        currentView: view,
                        activeLayerId: projectData.layers[0]?.id || null,
                        activeKeyframeId: projectData.layers[0]?.keyframes[0]?.id || null,
                        currentTime: 0,
                        isPlaying: view === 'player',
                        isLooping: view === 'dashboard' ? true : get().isLooping,
                        isFreshProject: false,
                    });

                    // Preload asset folders referenced by asset_set layers so the renderer
                    // can see their asset lists (asset_single uses the DB fallback in
                    // signedUrlForAsset, so no preload needed).
                    const folderIds = new Set<string>();
                    for (const layer of projectData.layers) {
                        if (layer.type === 'asset_set' && layer.config?.assetFolderId) {
                            folderIds.add(layer.config.assetFolderId);
                        }
                    }
                    folderIds.forEach((fid) => { get().fetchAssets(fid); });
                }
            } catch (e) {
                console.error('Failed to load project', e);
            }
        },

        createNewProject: () => {
            const newProject: Project = {
                ...INITIAL_PROJECT,
                layers: [createDefaultLayer(0)],
                id: `pro-${Math.random().toString(36).substr(2, 9)}`,
                name: 'New Ritual',
                gradientColor: '#d4af37',
            };
            set({
                project: newProject,
                currentView: 'editor',
                activeLayerId: newProject.layers[0]?.id || null,
                activeKeyframeId: newProject.layers[0]?.keyframes[0]?.id || null, // Select first keyframe
                currentTime: 0,
                isPlaying: false,
                isFreshProject: true,
            });
        },

        duplicateProject: async (id: string) => {
            const { user } = get();
            if (!user) return;

            try {
                // Fetch original from Supabase
                const { data: original } = await supabase
                    .from('projects')
                    .select('data, folder_id')
                    .eq('id', id)
                    .single();

                // Fallback to static if not found?
                let sourceProject = original ? original.data : null;
                const folderId = original ? original.folder_id : null;

                if (!sourceProject) {
                    try {
                        const staticRes = await fetch(`projects/${id}.json`);
                        if (staticRes.ok) {
                            sourceProject = await staticRes.json();
                            // Static projects have folderId in JSON usually? 
                            // Or we check if it is in index.json?
                            // For now let's just use what we have, if static, folderId might be in the project object itself if we saved it there.
                        }
                    } catch (e) { }
                }

                if (sourceProject) {
                    const newProject: Project = {
                        ...sourceProject,
                        id: `pro-${Math.random().toString(36).substr(2, 9)}`,
                        name: `${sourceProject.name} (Copy)`,
                        lastModified: Date.now(),
                        folderId: folderId || sourceProject.folderId || null
                    };

                    await supabase.from('projects').insert({
                        id: newProject.id,
                        user_id: user.id,
                        name: newProject.name,
                        data: newProject,
                        last_modified: newProject.lastModified,
                        folder_id: newProject.folderId
                    });

                    await get().fetchProjects();
                }
            } catch (e) {
                console.error('Failed to duplicate project', e);
            }
        },

        saveIndex: async () => {
            // No-op for Supabase
        },

        duplicateFolder: async (id: string) => {
            const { user } = get();
            if (!user) return;

            const source = get().folders.find(f => f.id === id);
            if (!source) return;

            try {
                const { data: sourceProjects, error: fetchErr } = await supabase
                    .from('projects')
                    .select('data')
                    .eq('user_id', user.id)
                    .eq('folder_id', id);
                if (fetchErr) throw fetchErr;

                const newFolderId = crypto.randomUUID();
                const newFolderName = `${source.name} (Copy)`;
                const newOrder = get().folders.length;

                const { error: folderErr } = await supabase.from('folders').insert({
                    id: newFolderId,
                    user_id: user.id,
                    name: newFolderName,
                    is_open: true,
                    sort_order: newOrder,
                });
                if (folderErr) throw folderErr;

                if (sourceProjects && sourceProjects.length > 0) {
                    const now = Date.now();
                    const rows = sourceProjects.map((row: { data: Project }) => {
                        const src = row.data;
                        const newProject: Project = {
                            ...src,
                            id: `pro-${Math.random().toString(36).substr(2, 9)}`,
                            name: src.name,
                            lastModified: now,
                            folderId: newFolderId,
                        };
                        return {
                            id: newProject.id,
                            user_id: user.id,
                            name: newProject.name,
                            data: newProject,
                            last_modified: newProject.lastModified,
                            folder_id: newFolderId,
                        };
                    });
                    const { error: insertErr } = await supabase.from('projects').insert(rows);
                    if (insertErr) throw insertErr;
                }

                set(state => ({
                    folders: [...state.folders, { id: newFolderId, name: newFolderName, isOpen: true }],
                }));
                await get().fetchProjects();
            } catch (e) {
                console.error('Failed to duplicate folder', e);
            }
        },

        createFolder: async (name: string) => {
            const { user } = get();
            if (!user) return; // Or handle local legacy?

            const tempId = crypto.randomUUID();
            const newFolder: Folder = {
                id: tempId,
                name,
                isOpen: true
            };

            // Calculate new sort order at the bottom
            const newOrder = get().folders.length;

            // Optimistic update
            set(state => ({ folders: [...state.folders, newFolder] }));

            try {
                const { error } = await supabase.from('folders').insert({
                    id: tempId,
                    user_id: user.id,
                    name,
                    is_open: true,
                    sort_order: newOrder
                });

                if (error) throw error;
                return tempId;
            } catch (e) {
                console.error('Failed to create folder', e);
                // Revert? fetchProjects();
            }
        },

        deleteFolder: async (id: string, deleteProjects?: boolean) => {
            const { user, fetchProjects } = get();
            if (!user) return;

            // Optimistic
            set(state => {
                let updatedProjects = state.savedProjects;
                if (deleteProjects) {
                    updatedProjects = updatedProjects.filter(p => p.folderId !== id);
                } else {
                    updatedProjects = updatedProjects.map(p =>
                        p.folderId === id ? { ...p, folderId: null } : p
                    );
                }

                return {
                    folders: state.folders.filter(f => f.id !== id),
                    savedProjects: updatedProjects
                };
            });

            try {
                // Delete from DB
                if (deleteProjects) {
                    await supabase.from('projects').delete().eq('folder_id', id).eq('user_id', user.id);
                } else {
                    await supabase.from('projects').update({ folder_id: null }).eq('folder_id', id).eq('user_id', user.id);
                }
                await supabase.from('folders').delete().eq('id', id).eq('user_id', user.id);
            } catch (e) {
                console.error('Failed to delete folder', e);
                fetchProjects();
            }
        },

        renameFolder: async (id: string, name: string) => {
            const { user } = get();
            if (!user) return;

            set(state => ({
                folders: state.folders.map(f => f.id === id ? { ...f, name } : f)
            }));

            try {
                await supabase.from('folders').update({ name }).eq('id', id).eq('user_id', user.id);
            } catch (e) { console.error(e); }
        },

        reorderFolders: async (startIndex: number, endIndex: number) => {
            const { user } = get();
            if (!user) return;

            set(state => {
                const newFolders = [...state.folders];
                const [removed] = newFolders.splice(startIndex, 1);
                newFolders.splice(endIndex, 0, removed);
                return { folders: newFolders };
            });

            // Update order in DB
            // Simple approach: Update all folders with new index
            const newFoldersForUpdate = get().folders;
            try {
                // Batch update? RLS might complain.
                // Promise.all
                await Promise.all(newFoldersForUpdate.map((f, index) =>
                    supabase.from('folders').update({ sort_order: index }).eq('id', f.id)
                ));
            } catch (e) { console.error("Failed reorder", e); }
        },

        sortFolderAlphabetically: async (folderId: string) => {
            const { user } = get();
            if (!user) return;

            const folderProjects = get().savedProjects
                .filter(p => p.folderId === folderId)
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

            if (folderProjects.length === 0) return;

            // UI sorts descending by `order`, so first alphabetically gets the highest order.
            const newOrders = new Map<string, number>();
            folderProjects.forEach((p, i) => newOrders.set(p.id, folderProjects.length - i));

            set(state => ({
                savedProjects: state.savedProjects.map(p =>
                    newOrders.has(p.id) ? { ...p, order: newOrders.get(p.id)! } : p
                ),
            }));

            try {
                const updates = await Promise.all(folderProjects.map(p =>
                    supabase.from('projects').select('data').eq('id', p.id).single()
                ));
                await Promise.all(updates.map((res, i) => {
                    const p = folderProjects[i];
                    const order = newOrders.get(p.id)!;
                    const data = res.data ? { ...res.data.data, order } : { order };
                    return supabase.from('projects').update({
                        data,
                        last_modified: Date.now(),
                    }).eq('id', p.id);
                }));
            } catch (e) { console.error('Failed alphabetical sort', e); }
        },

        moveProject: async (projectId: string, folderId: string | null, targetProjectId?: string, position?: 'before' | 'after') => {
            const { user } = get();
            if (!user) return;

            set(state => {
                const updated = [...state.savedProjects];
                const activeIdx = updated.findIndex(p => p.id === projectId);
                if (activeIdx === -1) return state;

                const activeP = { ...updated[activeIdx], folderId: folderId };
                updated.splice(activeIdx, 1);

                if (targetProjectId) {
                    const targetIdx = updated.findIndex(p => p.id === targetProjectId);
                    if (targetIdx !== -1) {
                        const insertIdx = position === 'after' ? targetIdx + 1 : targetIdx;
                        updated.splice(insertIdx, 0, activeP);
                    } else {
                        updated.push(activeP);
                    }
                } else {
                    updated.push(activeP);
                }

                // Recalculate orders to be sequential and consistent
                // We use a high base and decrement so higher items have higher 'order' values (due to b-a sort)
                const final = updated.map((p, i) => ({ ...p, order: updated.length - i }));
                const stateUpdate: any = { savedProjects: final };
                if (state.project.id === projectId) {
                    stateUpdate.project = { ...state.project, folderId: folderId };
                }
                return stateUpdate;
            });

            try {
                // Determine new order value
                const state = get();
                const p = state.savedProjects.find(p => p.id === projectId);
                if (!p) return;

                // Update the project in DB
                // Since we need to update multiple 'order' values potentially, 
                // but we only want to make ONE API call for the moved project's folder_id.
                // The 'order' is in the 'data' blob.

                // Fetch full data for the moved project
                const { data: fullProj } = await supabase.from('projects').select('data').eq('id', projectId).single();
                if (fullProj) {
                    const updatedData = { ...fullProj.data, folderId, order: p.order };
                    await supabase.from('projects').update({
                        folder_id: folderId,
                        data: updatedData,
                        last_modified: Date.now()
                    }).eq('id', projectId);
                }

                // Note: Other projects' orders aren't persisted unless we batch update.
                // For now, let's just ensure the moved one is updated.
                // Ideally, fetchProjects would return the correct order from metadata.
            } catch (e) { console.error("Failed move project", e); }
        },

        toggleFolder: async (folderId) => {
            const { user } = get();
            if (!user) return;

            set(state => ({
                folders: state.folders.map(f => f.id === folderId ? { ...f, isOpen: !f.isOpen } : f)
            }));

            const folder = get().folders.find(f => f.id === folderId);
            if (folder) {
                try {
                    await supabase.from('folders').update({ is_open: folder.isOpen }).eq('id', folderId).eq('user_id', user.id);
                } catch (e) { }
            }
        },

        fetchProjects: async () => {
            const { user } = get();
            if (!user) {
                set({ savedProjects: [], folders: [] });
                return;
            }

            try {
                // Fetch user projects
                // Try selecting with folder_id first
                let projectsData: any[] = [];
                let projError: any = null;

                try {
                    const res = await supabase
                        .from('projects')
                        .select('id, name, last_modified, folder_id')
                        .eq('user_id', user.id)
                        .order('last_modified', { ascending: false });
                    projectsData = res.data || [];
                    projError = res.error;
                } catch (e) { projError = e; }

                // Fallback if folder_id missing
                if (projError && (projError.code === '42703' || (typeof projError.message === 'string' && projError.message.includes('folder_id')))) {
                    const res = await supabase
                        .from('projects')
                        .select('id, name, last_modified') // exclude folder_id
                        .eq('user_id', user.id)
                        .order('last_modified', { ascending: false });
                    projectsData = res.data || [];
                    projError = res.error;
                }

                if (projError) throw projError;

                // Fetch folders
                const { data: foldersData, error: folderError } = await supabase
                    .from('folders')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('sort_order', { ascending: true });

                // Ignore folder error if table missing
                if (folderError && folderError.code !== '42P01') {
                    console.error("Folder fetch error", folderError);
                }

                const projects: ProjectMetadata[] = projectsData.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    lastModified: p.last_modified,
                    folderId: p.folder_id || null // safely handle missing
                }));

                const folders: Folder[] = (foldersData || []).map((f: any) => ({
                    id: f.id,
                    name: f.name,
                    isOpen: f.is_open
                }));

                set({ savedProjects: projects, folders });
                get().fetchProjectThumbnails();
            } catch (e) {
                console.error("Failed to fetch data", e);
            }
        },

        // ────────────────────────────────────────────────────────────────
        // Asset Folder + Asset CRUD (Stage A)
        // Tables: public.asset_folders, public.assets
        // Bucket: v2-user-assets, path = {user_id}/{asset_id}.{ext}
        // ────────────────────────────────────────────────────────────────

        fetchAssetFolders: async () => {
            const { user } = get();
            if (!user) {
                set({ assetFolders: [], assetsByFolder: {} });
                return;
            }
            try {
                const { data, error } = await supabase
                    .from('asset_folders')
                    .select('id, name, is_open, sort_order')
                    .eq('user_id', user.id)
                    .order('sort_order', { ascending: true });

                // Table missing → treat as empty (should not happen once migration is live)
                if (error && error.code !== '42P01') {
                    console.error('Failed to fetch asset folders', error);
                    return;
                }

                type AssetFolderRow = { id: string; name: string; is_open: boolean | null; sort_order: number | null };
                const assetFolders: AssetFolder[] = (data || []).map((f: AssetFolderRow) => ({
                    id: f.id,
                    name: f.name,
                    isOpen: f.is_open ?? false,
                    sortOrder: f.sort_order ?? 0,
                }));

                set({ assetFolders });

                // First-login seeding: if the user has no folders yet and we haven't
                // attempted to seed before, drop in the three legacy icon sets as real
                // asset folders. The localStorage flag prevents us from re-seeding if
                // the user intentionally deleted everything later.
                const flagKey = seededFlagKey(user.id);
                if (assetFolders.length === 0 && !localStorage.getItem(flagKey)) {
                    await get().seedDefaultAssetFolders();
                    localStorage.setItem(flagKey, String(Date.now()));
                }
            } catch (e) {
                console.error('Failed to fetch asset folders', e);
            }
        },

        createAssetFolder: async (name: string) => {
            const { user } = get();
            if (!user) return;

            const id = crypto.randomUUID();
            const sortOrder = get().assetFolders.length;
            const optimistic: AssetFolder = { id, name, isOpen: true, sortOrder };

            set((state) => ({ assetFolders: [...state.assetFolders, optimistic] }));

            try {
                const { error } = await supabase.from('asset_folders').insert({
                    id,
                    user_id: user.id,
                    name,
                    is_open: true,
                    sort_order: sortOrder,
                });
                if (error) throw error;
                return id;
            } catch (e) {
                console.error('Failed to create asset folder', e);
                set((state) => ({ assetFolders: state.assetFolders.filter((f) => f.id !== id) }));
                return undefined;
            }
        },

        renameAssetFolder: async (id: string, name: string) => {
            const { user } = get();
            if (!user) return;

            const prev = get().assetFolders.find((f) => f.id === id);
            set((state) => ({
                assetFolders: state.assetFolders.map((f) => (f.id === id ? { ...f, name } : f)),
            }));

            try {
                const { error } = await supabase
                    .from('asset_folders')
                    .update({ name })
                    .eq('id', id)
                    .eq('user_id', user.id);
                if (error) throw error;
            } catch (e) {
                console.error('Failed to rename asset folder', e);
                if (prev) {
                    set((state) => ({
                        assetFolders: state.assetFolders.map((f) => (f.id === id ? prev : f)),
                    }));
                }
            }
        },

        deleteAssetFolder: async (id: string, deleteAssets?: boolean) => {
            const { user } = get();
            if (!user) return;

            // Optimistic folder removal
            const prevFolders = get().assetFolders;
            const prevAssetsByFolder = get().assetsByFolder;
            set((state) => ({
                assetFolders: state.assetFolders.filter((f) => f.id !== id),
            }));

            try {
                if (deleteAssets) {
                    // Fetch asset rows so we can remove storage blobs too.
                    const { data: assetRows } = await supabase
                        .from('assets')
                        .select('id, storage_path')
                        .eq('user_id', user.id)
                        .eq('folder_id', id);

                    if (assetRows && assetRows.length > 0) {
                        const paths = assetRows
                            .map((r: { storage_path: string | null }) => r.storage_path)
                            .filter((p): p is string => !!p);
                        if (paths.length > 0) {
                            await supabase.storage.from('v2-user-assets').remove(paths);
                        }
                        await supabase
                            .from('assets')
                            .delete()
                            .eq('user_id', user.id)
                            .eq('folder_id', id);
                    }
                }
                // If deleteAssets is false, schema's ON DELETE SET NULL orphans asset rows.
                const { error } = await supabase
                    .from('asset_folders')
                    .delete()
                    .eq('id', id)
                    .eq('user_id', user.id);
                if (error) throw error;

                // Clear the cached entry for this folder
                set((state) => {
                    const next = { ...state.assetsByFolder };
                    delete next[id];
                    return { assetsByFolder: next };
                });
            } catch (e) {
                console.error('Failed to delete asset folder', e);
                // Revert
                set({ assetFolders: prevFolders, assetsByFolder: prevAssetsByFolder });
            }
        },

        fetchAssets: async (folderId: string | null) => {
            const { user } = get();
            if (!user) return [];

            type AssetRow = {
                id: string;
                folder_id: string | null;
                name: string;
                mime_type: AssetMimeType;
                storage_path: string;
                size_bytes: number | null;
                width: number | null;
                height: number | null;
                last_modified: number | null;
                sort_order?: number | null;
            };

            const runQuery = async (withSortOrder: boolean) => {
                const cols = withSortOrder
                    ? 'id, folder_id, name, mime_type, storage_path, size_bytes, width, height, last_modified, sort_order'
                    : 'id, folder_id, name, mime_type, storage_path, size_bytes, width, height, last_modified';
                let q = supabase.from('assets').select(cols).eq('user_id', user.id);
                q = withSortOrder ? q.order('sort_order', { ascending: true, nullsFirst: false }) : q;
                q = q.order('name', { ascending: true });
                q = folderId === null ? q.is('folder_id', null) : q.eq('folder_id', folderId);
                return q;
            };

            try {
                let { data, error } = await runQuery(true);
                // Fallback when the migration hasn't been applied yet: retry without sort_order.
                if (error && error.code === '42703') {
                    ({ data, error } = await runQuery(false));
                }
                if (error && error.code !== '42P01') {
                    console.error('Failed to fetch assets', error);
                    return [];
                }

                const assets: Asset[] = ((data as AssetRow[] | null) || []).map((a) => ({
                    id: a.id,
                    folderId: a.folder_id,
                    name: a.name,
                    mimeType: a.mime_type,
                    storagePath: a.storage_path,
                    sizeBytes: a.size_bytes ?? null,
                    width: a.width ?? null,
                    height: a.height ?? null,
                    lastModified: a.last_modified ?? null,
                    sortOrder: a.sort_order ?? null,
                }));

                const key = folderId ?? '';
                set((state) => ({
                    assetsByFolder: { ...state.assetsByFolder, [key]: assets },
                }));
                return assets;
            } catch (e) {
                console.error('Failed to fetch assets', e);
                return [];
            }
        },

        uploadAsset: async (folderId: string | null, file: File) => {
            const { user } = get();
            if (!user) return undefined;

            const allowed: AssetMimeType[] = ['image/svg+xml', 'image/png', 'image/jpeg', 'text/plain'];
            if (!allowed.includes(file.type as AssetMimeType)) {
                console.error(`Rejected upload: ${file.type} not in allowlist`);
                return undefined;
            }

            const MAX_SIZE = 10 * 1024 * 1024; // matches bucket cap
            if (file.size > MAX_SIZE) {
                console.error(`Rejected upload: ${file.name} exceeds 10MB`);
                return undefined;
            }

            // Sanitize SVGs before upload (stored XSS vector otherwise)
            let uploadFile: File = file;
            if (file.type === 'image/svg+xml') {
                try {
                    uploadFile = await sanitizeSvgFile(file);
                } catch (e) {
                    console.error('SVG sanitization failed', e);
                    return undefined;
                }
            }

            // Compress before upload — SVGO for SVG, canvas re-encode for raster.
            // Target ~200KB steady-state; 10MB bucket cap is the ceiling, not a goal.
            uploadFile = await optimizeAsset(uploadFile);

            const assetId = crypto.randomUUID();
            const ext = extensionForMime(uploadFile.type as AssetMimeType) || guessExtensionFromName(file.name) || 'bin';
            const storagePath = `${user.id}/${assetId}.${ext}`;

            // Measure image dimensions when possible (best-effort; non-fatal)
            let width: number | null = null;
            let height: number | null = null;
            if (uploadFile.type === 'image/png' || uploadFile.type === 'image/jpeg') {
                try {
                    const dims = await measureRasterDimensions(uploadFile);
                    width = dims.width;
                    height = dims.height;
                } catch { /* ignore */ }
            }

            try {
                const { error: uploadError } = await supabase.storage
                    .from('v2-user-assets')
                    .upload(storagePath, uploadFile, {
                        contentType: uploadFile.type,
                        upsert: false,
                    });
                if (uploadError) throw uploadError;

                // Land new uploads at the end of the folder. Base on the current cache (which
                // already reflects any uploads still in flight from the same batch).
                const cacheKey = folderId ?? '';
                const existing = get().assetsByFolder[cacheKey] || [];
                const nextSortOrder = existing.reduce(
                    (max, a) => (a.sortOrder != null && a.sortOrder > max ? a.sortOrder : max),
                    -1,
                ) + 1;

                const now = Date.now();
                const { data: row, error: rowError } = await supabase
                    .from('assets')
                    .insert({
                        id: assetId,
                        user_id: user.id,
                        folder_id: folderId,
                        name: file.name,
                        mime_type: uploadFile.type,
                        storage_path: storagePath,
                        size_bytes: uploadFile.size,
                        width,
                        height,
                        last_modified: now,
                        sort_order: nextSortOrder,
                    })
                    .select('id, folder_id, name, mime_type, storage_path, size_bytes, width, height, last_modified, sort_order')
                    .single();

                if (rowError) {
                    // DB write failed — clean up the orphan blob
                    await supabase.storage.from('v2-user-assets').remove([storagePath]);
                    throw rowError;
                }

                const asset: Asset = {
                    id: row.id,
                    folderId: row.folder_id,
                    name: row.name,
                    mimeType: row.mime_type,
                    storagePath: row.storage_path,
                    sizeBytes: row.size_bytes ?? null,
                    width: row.width ?? null,
                    height: row.height ?? null,
                    lastModified: row.last_modified ?? null,
                    sortOrder: row.sort_order ?? null,
                };

                set((state) => ({
                    assetsByFolder: {
                        ...state.assetsByFolder,
                        [cacheKey]: [...(state.assetsByFolder[cacheKey] || []), asset],
                    },
                }));

                return asset;
            } catch (e) {
                console.error('Failed to upload asset', e);
                return undefined;
            }
        },

        deleteAsset: async (id: string) => {
            const { user } = get();
            if (!user) return;

            // Find the asset locally to know its storage path + folder for cache update
            let found: Asset | undefined;
            let foundKey: string | undefined;
            for (const [key, list] of Object.entries(get().assetsByFolder)) {
                const hit = list.find((a) => a.id === id);
                if (hit) {
                    found = hit;
                    foundKey = key;
                    break;
                }
            }

            // Optimistic removal
            if (foundKey !== undefined) {
                set((state) => ({
                    assetsByFolder: {
                        ...state.assetsByFolder,
                        [foundKey!]: state.assetsByFolder[foundKey!].filter((a) => a.id !== id),
                    },
                }));
            }

            try {
                // Look up storage_path if we don't have it cached
                let storagePath = found?.storagePath;
                if (!storagePath) {
                    const { data } = await supabase
                        .from('assets')
                        .select('storage_path')
                        .eq('id', id)
                        .eq('user_id', user.id)
                        .maybeSingle();
                    storagePath = data?.storage_path;
                }

                if (storagePath) {
                    await supabase.storage.from('v2-user-assets').remove([storagePath]);
                }

                const { error } = await supabase.from('assets').delete().eq('id', id).eq('user_id', user.id);
                if (error) throw error;
            } catch (e) {
                console.error('Failed to delete asset', e);
                // Restore on failure, preserving manual sort order.
                if (found && foundKey !== undefined) {
                    set((state) => ({
                        assetsByFolder: {
                            ...state.assetsByFolder,
                            [foundKey!]: [...(state.assetsByFolder[foundKey!] || []), found!].sort((a, b) => {
                                const ao = a.sortOrder;
                                const bo = b.sortOrder;
                                if (ao == null && bo == null) return a.name.localeCompare(b.name);
                                if (ao == null) return 1;
                                if (bo == null) return -1;
                                return ao - bo;
                            }),
                        },
                    }));
                }
            }
        },

        reorderAssets: async (folderId: string | null, startIndex: number, endIndex: number) => {
            const { user } = get();
            if (!user) return;
            if (startIndex === endIndex) return;

            const key = folderId ?? '';
            const prev = get().assetsByFolder[key] || [];
            if (startIndex < 0 || startIndex >= prev.length || endIndex < 0 || endIndex >= prev.length) return;

            const reordered = [...prev];
            const [moved] = reordered.splice(startIndex, 1);
            reordered.splice(endIndex, 0, moved);

            // Optimistic: reassign sort_order to the full list sequentially so
            // every row has a stable index (no NULL gaps left behind).
            const withOrder: Asset[] = reordered.map((a, i) => ({ ...a, sortOrder: i }));

            set((state) => ({
                assetsByFolder: { ...state.assetsByFolder, [key]: withOrder },
            }));

            try {
                await Promise.all(withOrder.map((a, i) =>
                    supabase.from('assets').update({ sort_order: i }).eq('id', a.id).eq('user_id', user.id)
                ));
            } catch (e) {
                console.error('Failed to reorder assets', e);
                // Rollback to previous order
                set((state) => ({
                    assetsByFolder: { ...state.assetsByFolder, [key]: prev },
                }));
            }
        },

        // Seeds the three legacy icon sets (Astrology / Amino Acids / I-Ching
        // Strokes) as real asset folders for a brand-new user. Safe to call
        // repeatedly: skips any seed folder that already exists by name.
        seedDefaultAssetFolders: async () => {
            const { user } = get();
            if (!user) return;

            type SeedBatch = { folder: string; assets: { name: string; svg: string }[] };
            const batches: SeedBatch[] = [
                { folder: SEED_FOLDER_NAMES.astrology, assets: generateAstrologySvgs() },
                { folder: SEED_FOLDER_NAMES.amino, assets: generateAminoSvgs() },
                { folder: SEED_FOLDER_NAMES.ichingLines, assets: generateIChingStrokeSvgs() },
            ];

            for (const { folder: folderName, assets } of batches) {
                // Skip if this seed folder already exists (idempotency).
                const existing = get().assetFolders.find((f) => f.name === folderName);
                if (existing) continue;

                const folderId = await get().createAssetFolder(folderName);
                if (!folderId) {
                    console.warn(`Seed: failed to create folder "${folderName}"`);
                    continue;
                }

                for (const asset of assets) {
                    const blob = new Blob([asset.svg], { type: 'image/svg+xml' });
                    const file = new File([blob], asset.name, { type: 'image/svg+xml' });
                    await get().uploadAsset(folderId, file);
                }
            }
        },

        captureCurrentProjectThumbnail: async (captureTimeOverride?: number | 'end') => {
            const state = get();
            const proj = state.project;
            if (!proj) return null;
            const duration = Number.isFinite(proj.duration) && proj.duration > 0 ? proj.duration : 0;
            let requested: number;
            if (captureTimeOverride === 'end') {
                requested = duration;
            } else if (typeof captureTimeOverride === 'number' && Number.isFinite(captureTimeOverride) && captureTimeOverride >= 0) {
                requested = captureTimeOverride;
            } else {
                requested = PROJECT_THUMBNAIL_CAPTURE_TIME;
            }
            const targetTime = Math.min(requested, duration);
            const originalTime = state.currentTime;
            const originalPlaying = state.isPlaying;
            const needsSeek = originalPlaying || Math.abs(originalTime - targetTime) > 1e-3;

            if (needsSeek) {
                if (originalPlaying) set({ isPlaying: false });
                set({ currentTime: targetTime });
                // Two RAFs: first lets React commit; second lets GeometryPlayer's effect render Pixi.
                await new Promise<void>((res) =>
                    requestAnimationFrame(() => requestAnimationFrame(() => res())),
                );
            }

            const blob = await captureThumbnail(320, 180, proj.backgroundColor || '#000000');

            if (needsSeek) {
                set({ currentTime: originalTime, isPlaying: originalPlaying });
            }

            return blob;
        },

        uploadProjectThumbnail: async (projectId, blob) => {
            const { user } = get();
            if (!user) return;
            const path = `${user.id}/${PROJECT_THUMBNAIL_PREFIX}/${projectId}.png`;
            const { error } = await supabase.storage
                .from(PROJECT_THUMBNAIL_BUCKET)
                .upload(path, blob, { contentType: 'image/png', upsert: true });
            if (error) {
                console.warn('Project thumbnail upload failed', error);
                return;
            }
            const { data: signed } = await supabase.storage
                .from(PROJECT_THUMBNAIL_BUCKET)
                .createSignedUrl(path, PROJECT_THUMBNAIL_TTL);
            if (signed?.signedUrl) {
                set((state) => ({
                    projectThumbnails: {
                        ...state.projectThumbnails,
                        // Cache-bust so the new image replaces the old in <img> tags.
                        [projectId]: `${signed.signedUrl}#t=${Date.now()}`,
                    },
                }));
            }
        },

        addSavedColor: (color: string) => {
            const trimmed = color.trim().toLowerCase();
            if (!trimmed) return;
            // Skip exact duplicates so the palette doesn't pile up.
            if (get().savedColors.some((c) => c.color.toLowerCase() === trimmed)) return;
            const next = [{ id: makeId(), color: trimmed }, ...get().savedColors];
            set({ savedColors: next });
            saveJsonArray(SAVED_COLORS_KEY, next);
        },
        deleteSavedColor: (id: string) => {
            const next = get().savedColors.filter((c) => c.id !== id);
            set({ savedColors: next });
            saveJsonArray(SAVED_COLORS_KEY, next);
        },
        addSavedGradient: (stops: GradientStop[]) => {
            if (!stops || stops.length < 2) return;
            // Strip stop ids when persisting so the saved entry compares cleanly
            // against future "is this gradient already saved" checks if we add them.
            const cleanStops = stops.map((s) => ({
                id: makeId(),
                offset: s.offset,
                color: s.color,
            }));
            const next = [{ id: makeId(), stops: cleanStops }, ...get().savedGradients];
            set({ savedGradients: next });
            saveJsonArray(SAVED_GRADIENTS_KEY, next);
        },
        deleteSavedGradient: (id: string) => {
            const next = get().savedGradients.filter((g) => g.id !== id);
            set({ savedGradients: next });
            saveJsonArray(SAVED_GRADIENTS_KEY, next);
        },

        regenerateProjectThumbnails: async (options) => {
            const { savedProjects, project: original } = get();
            const originalId = original?.id;
            const { projectIds, captureTime, onProgress } = options || {};
            const targets = projectIds && projectIds.length
                ? savedProjects.filter((p) => projectIds.includes(p.id))
                : savedProjects;

            for (let i = 0; i < targets.length; i++) {
                const meta = targets[i];
                onProgress?.(i, targets.length);
                try {
                    await get().loadProject(meta.id, 'dashboard');
                    // Give Pixi time to mount the new project + render a frame.
                    await new Promise((r) => setTimeout(r, 800));
                    const blob = await get().captureCurrentProjectThumbnail(captureTime);
                    if (blob) {
                        await get().uploadProjectThumbnail(meta.id, blob);
                    }
                } catch (e) {
                    console.warn(`Thumbnail regen failed for ${meta.id}`, e);
                }
            }

            // Restore the project the user was on before we started.
            if (originalId && originalId !== get().project?.id) {
                try {
                    await get().loadProject(originalId, 'dashboard');
                } catch {
                    // Best effort; if it fails the user can just click a project.
                }
            }
            onProgress?.(targets.length, targets.length);
        },

        fetchProjectThumbnails: async () => {
            const { user } = get();
            if (!user) {
                set({ projectThumbnails: {} });
                return;
            }
            const prefix = `${user.id}/${PROJECT_THUMBNAIL_PREFIX}`;
            const { data: list, error } = await supabase.storage
                .from(PROJECT_THUMBNAIL_BUCKET)
                .list(prefix, { limit: 1000 });
            if (error || !list?.length) return;

            const paths = list
                .filter((item) => item.name.endsWith('.png'))
                .map((item) => `${prefix}/${item.name}`);
            if (!paths.length) return;

            const { data: signed, error: sErr } = await supabase.storage
                .from(PROJECT_THUMBNAIL_BUCKET)
                .createSignedUrls(paths, PROJECT_THUMBNAIL_TTL);
            if (sErr || !signed) return;

            const map: Record<string, string> = {};
            signed.forEach((s, i) => {
                if (!s.signedUrl) return;
                const projectId = paths[i].split('/').pop()!.replace(/\.png$/, '');
                map[projectId] = s.signedUrl;
            });
            set({ projectThumbnails: map });
        },

        signedUrlForAsset: async (id: string) => {
            const { user } = get();
            if (!user) return null;

            // Find storage_path locally if cached; otherwise round-trip to DB
            let storagePath: string | undefined;
            for (const list of Object.values(get().assetsByFolder)) {
                const hit = list.find((a) => a.id === id);
                if (hit) {
                    storagePath = hit.storagePath;
                    break;
                }
            }

            if (!storagePath) {
                const { data } = await supabase
                    .from('assets')
                    .select('storage_path')
                    .eq('id', id)
                    .eq('user_id', user.id)
                    .maybeSingle();
                storagePath = data?.storage_path;
            }

            if (!storagePath) return null;

            const { data, error } = await supabase.storage
                .from('v2-user-assets')
                .createSignedUrl(storagePath, 60 * 60); // 1 hour

            if (error) {
                console.error('Failed to sign url', error);
                return null;
            }
            return data?.signedUrl ?? null;
        },

        setGlobalLineColor: (color) => set((state) => ({
            project: {
                ...state.project,
                globalLineColor: color
            }
        })),

        restyleAllLayers: () => set((state) => {
            const color = state.project.globalLineColor || '#7a7a7a';
            const weight = state.project.globalStrokeWeight !== undefined ? state.project.globalStrokeWeight : 1;
            const gradEnabled = state.project.globalGradientEnabled ?? false;
            const gradStops = state.project.globalGradientStops || [];

            const historyUpdate = {
                history: [...state.history, JSON.parse(JSON.stringify(state.project))].slice(-50),
                future: []
            };
            return {
                ...historyUpdate,
                project: {
                    ...state.project,
                    layers: state.project.layers.map(layer => ({
                        ...layer,
                        config: {
                            ...layer.config,
                            strokeColor: color,
                            gradientEnabled: gradEnabled,
                            gradientStops: [...gradStops]
                        },
                        keyframes: layer.keyframes.map(kf => ({
                            ...kf,
                            value: {
                                ...kf.value,
                                strokeWeight: weight
                            }
                        }))
                    }))
                }
            };
        }),

        deleteProject: async (id) => {
            const { user } = get();
            if (!user) {
                console.warn("User not logged in, cannot delete.");
                return;
            }
            try {
                await supabase.from('projects').delete().eq('id', id).eq('user_id', user.id);
                // Best-effort: remove the project's thumbnail. Stays a no-op if absent.
                supabase.storage
                    .from(PROJECT_THUMBNAIL_BUCKET)
                    .remove([`${user.id}/${PROJECT_THUMBNAIL_PREFIX}/${id}.png`]);
                await get().fetchProjects();
            } catch (e) {
                console.error('Failed to delete project', e);
            }
        },

        // Admin Implementation
        fetchProfiles: async () => {
            const { isAdmin } = get();
            if (!isAdmin) return;

            const { data, error } = await supabase.from('profiles').select('*').order('email');
            if (!error && data) {
                set({ adminProfiles: data });
            }
        },

        adminFetchProjects: async (userId: string) => {
            const { isAdmin } = get();
            if (!isAdmin) return [];

            const { data, error } = await supabase
                .from('projects')
                .select('id, name, last_modified, folder_id')
                .eq('user_id', userId)
                .order('last_modified', { ascending: false });

            if (error) {
                console.error("Admin fetch projects failed", error);
                return [];
            }

            return data.map((p: any) => ({
                id: p.id,
                name: p.name,
                lastModified: p.last_modified,
                folderId: p.folder_id || null
            }));
        },

        adminFetchFolders: async (userId: string) => {
            const { isAdmin } = get();
            if (!isAdmin) return [];

            const { data, error } = await supabase
                .from('folders')
                .select('*')
                .eq('user_id', userId)
                .order('sort_order', { ascending: true });

            if (error && error.code !== '42P01') {
                console.error("Admin fetch folders failed", error);
                return [];
            }

            return (data || []).map((f: any) => ({
                id: f.id,
                name: f.name,
                isOpen: f.is_open
            }));
        },

        adminCopyProject: async (projectId: string, targetUserId: string, targetFolderId: string | null = null) => {
            const { isAdmin } = get();
            if (!isAdmin) return;

            try {
                // Get original project data
                const { data: original } = await supabase
                    .from('projects')
                    .select('data')
                    .eq('id', projectId)
                    .single();

                if (!original) throw new Error("Original project not found");

                const sourceProject = original.data;
                const newProject: Project = {
                    ...sourceProject,
                    id: `pro-${Math.random().toString(36).substr(2, 9)}`,
                    name: sourceProject.name,
                    lastModified: Date.now()
                };

                const { error } = await supabase.from('projects').insert({
                    id: newProject.id,
                    user_id: targetUserId,
                    name: newProject.name,
                    data: newProject,
                    last_modified: newProject.lastModified,
                    folder_id: targetFolderId
                });

                if (error) throw error;

                // alert("Project copied successfully!"); // Remove alert for bulk ops
            } catch (e) {
                console.error("Admin copy failed", e);
                throw e; // Re-throw to handle in UI
            }
        },

        adminCopyFolder: async (folderId: string, targetUserId: string) => {
            const { isAdmin } = get();
            if (!isAdmin) return;

            try {
                // 1. Get source folder details
                const { data: sourceFolder } = await supabase
                    .from('folders')
                    .select('*')
                    .eq('id', folderId)
                    .single();

                if (!sourceFolder) throw new Error("Source folder not found");

                // 2. Create new folder for target user
                const newFolderId = crypto.randomUUID();
                const { error: folderError } = await supabase.from('folders').insert({
                    id: newFolderId,
                    user_id: targetUserId,
                    name: sourceFolder.name,
                    sort_order: sourceFolder.sort_order || 0,
                    is_open: true
                });

                if (folderError) throw folderError;

                // 3. Fetch all projects in this folder
                // We can't use adminFetchProjects simply because it returns metadata, not raw DB rows needed for robust checking?
                // Actually adminFetchProjects returns what we need to ID them.
                // But let's just query directly to be safe and fast.
                const { data: projectsInFolder } = await supabase
                    .from('projects')
                    .select('id')
                    .eq('folder_id', folderId);

                if (!projectsInFolder || projectsInFolder.length === 0) {
                    return; // Empty folder, done.
                }

                // 4. Copy each project
                const copyPromises = projectsInFolder.map(p =>
                    get().adminCopyProject(p.id, targetUserId, newFolderId)
                );

                await Promise.all(copyPromises);

            } catch (e) {
                console.error("Admin copy folder failed", e);
                throw e;
            }
        },

        adminGetProjectData: async (projectId: string) => {
            const { isAdmin } = get();
            if (!isAdmin) return null;

            try {
                const { data, error } = await supabase
                    .from('projects')
                    .select('data')
                    .eq('id', projectId)
                    .single();

                if (error || !data) {
                    console.error("Failed to fetch project data", error);
                    return null;
                }

                let projectData = data.data as Project;

                // Migration check: identical to loadProject logic
                if (projectData.layers && projectData.layers.length > 0 && !projectData.layers[0].keyframes) {
                    projectData = {
                        ...projectData,
                        layers: projectData.layers.map((l: any) => {
                            // Convert old start/middle/end to keyframes
                            const startVal: any = {};
                            const midVal: any = {};
                            const endVal: any = {};

                            if (l.animation) {
                                Object.keys(l.animation).forEach(key => {
                                    const prop = l.animation[key];
                                    if (prop && typeof prop === 'object') {
                                        startVal[key] = prop.start;
                                        midVal[key] = prop.middle;
                                        endVal[key] = prop.end;
                                    }
                                });
                            }

                            const fill = (obj: any) => ({ ...DEFAULT_ANIMATABLES, ...obj });
                            const duration = (l.timeline?.end || 10) - (l.timeline?.start || 0);

                            return {
                                ...l,
                                keyframes: [
                                    { id: 'kf-start', time: 0, value: fill(startVal), easing: l.animation?.easingSM || 'easeInOutSine' },
                                    { id: 'kf-mid', time: duration / 2, value: fill(midVal), easing: l.animation?.easingME || 'easeInOutSine' },
                                    { id: 'kf-end', time: duration, value: fill(endVal), easing: 'linear' }
                                ]
                            };
                        })
                    };
                }

                return projectData;
            } catch (e) {
                console.error("Error in adminGetProjectData", e);
                return null;
            }
        }
    };
});

// BroadcastChannel for cross-tab communication
export const clipboardChannel = new BroadcastChannel('geometry_clipboard_sync');

clipboardChannel.onmessage = (event) => {
    if (event.data?.type === 'SYNC_LAYERS') {
        useStore.setState({ clipboardLayers: event.data.payload });
    } else if (event.data?.type === 'SYNC_KEYFRAME') {
        useStore.setState({ clipboardKeyframe: event.data.payload });
    }
};

// Also listen for storage events as a fallback
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key === 'clipboardLayers' && e.newValue) {
            try {
                const newLayers = JSON.parse(e.newValue);
                useStore.setState({ clipboardLayers: newLayers });
            } catch (err) { }
        }
        if (e.key === 'clipboardKeyframe' && e.newValue) {
            try {
                const newKeyframe = JSON.parse(e.newValue);
                useStore.setState({ clipboardKeyframe: newKeyframe });
            } catch (err) { }
        }
    });
}
