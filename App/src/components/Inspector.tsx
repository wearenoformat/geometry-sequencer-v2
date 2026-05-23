import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { ChevronUp, Star, RotateCw, Maximize, Layers, Trash2, Anchor, Pentagon, Asterisk, Plus, Timer, Grid, Move, TrendingUp, Shuffle, Hash, Palette, Lock, Unlock, FolderOpen, Image as ImageIcon, X } from 'lucide-react';
import GradientEditor from './GradientEditor';
import { MOLECULES } from '../data/molecules';
import type { ShapeType, AnimatableProperties, AssetFolder, Asset } from '../types';
import BezierEditor from './BezierEditor';
import { ModernToggle } from './ModernToggle';
import { useInspectorTooltip } from './InspectorTooltip';
import { CustomColorPicker } from './CustomColorPicker';

const ScrubbableInput: React.FC<{
    value: number;
    onChange: (val: number, skipHistory?: boolean) => void;
    min?: number;
    max?: number;
    step?: number;
    icon?: React.ReactNode;
    label?: string;
    onIconDoubleClick?: () => void;
    disabled?: boolean;
}> = ({ value, onChange, min = -Number.POSITIVE_INFINITY, max = Number.POSITIVE_INFINITY, step = 0.1, icon, label, onIconDoubleClick, disabled }) => {
    const [isDragging, setIsDragging] = useState(false);
    const startValueRef = useRef(0);
    const accumulatedDeltaRef = useRef(0);
    const hasPushedHistoryRef = useRef(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const delta = e.movementX;
            accumulatedDeltaRef.current += delta;
            const totalChange = accumulatedDeltaRef.current * step;
            let newVal = startValueRef.current + totalChange;
            newVal = Math.max(min, Math.min(max, newVal));
            newVal = Math.round(newVal * 100) / 100;

            if (!hasPushedHistoryRef.current) {
                onChange(newVal, false);
                hasPushedHistoryRef.current = true;
            } else {
                onChange(newVal, true);
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            document.exitPointerLock();
            document.body.style.cursor = 'default';
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ew-resize';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
        };
    }, [isDragging, step, min, max, onChange]);

    return (
        <div className={`flex items-center gap-1 group/scrub ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div
                className={`cursor-ew-resize text-white/20 group-hover/scrub:text-white/60 transition-colors p-1 flex items-center justify-center w-5 select-none ${onIconDoubleClick ? 'hover:text-white/90' : ''}`}
                onMouseDown={(e) => {
                    if (disabled) return;
                    startValueRef.current = value;
                    accumulatedDeltaRef.current = 0;
                    hasPushedHistoryRef.current = false;
                    setIsDragging(true);
                    e.currentTarget.requestPointerLock();
                }}
                onDoubleClick={(e) => {
                    if (onIconDoubleClick && !disabled) {
                        e.stopPropagation();
                        onIconDoubleClick();
                    }
                }}
                title={onIconDoubleClick ? "Double-click to reset" : undefined}
            >
                {icon || <Timer size={12} />}
            </div>
            <input
                type="number"
                value={value ?? 0}
                onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (isNaN(val)) return;
                    if (!hasPushedHistoryRef.current) {
                        onChange(val, false);
                        hasPushedHistoryRef.current = true;
                    } else {
                        onChange(val, true);
                    }
                }}
                // Reset history flag on focus so new typing session is a new undo step
                onFocus={() => { hasPushedHistoryRef.current = false; }}
                step={step}
                min={min}
                disabled={disabled}
                className="w-7 bg-transparent text-right text-[10px] text-white/80 font-bold focus:outline-none border-b border-white/10 focus:border-white/50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {label && <span className="text-[8px] text-white/40 min-w-[14px]">{label}</span>}
        </div>
    );
};



// --- Asset Pickers (Stage D) ---------------------------------------------

type AssetFolderPickerProps = {
    selectedFolderId: string | null;
    folders: AssetFolder[];
    assetsByFolder: Record<string, Asset[]>;
    fetchAssets: (folderId: string | null) => Promise<Asset[]>;
    applyFolder: (folderId: string) => Promise<void>;
};

const AssetFolderPicker: React.FC<AssetFolderPickerProps> = ({
    selectedFolderId, folders, assetsByFolder, fetchAssets, applyFolder
}) => {
    // Auto-fetch assets for the selected folder if we haven't loaded them yet
    // (e.g. on project reload).
    useEffect(() => {
        if (selectedFolderId && !assetsByFolder[selectedFolderId]) {
            fetchAssets(selectedFolderId);
        }
    }, [selectedFolderId, assetsByFolder, fetchAssets]);

    const selected = folders.find(f => f.id === selectedFolderId);
    const count = selectedFolderId ? (assetsByFolder[selectedFolderId]?.length ?? 0) : 0;

    return (
        <div className="space-y-2 pt-2 mt-2">
            <div className="flex items-center justify-between mb-1">
                <label className="text-[9px] uppercase font-bold text-white/40 flex items-center gap-1.5">
                    <FolderOpen size={11} /> Asset Folder
                </label>
                {selected && (
                    <span className="text-[9px] font-mono text-white/40">{count} assets</span>
                )}
            </div>
            <div className="relative w-full">
                <select
                    value={selectedFolderId ?? ''}
                    onChange={(e) => {
                        const id = e.target.value;
                        if (!id) return;
                        applyFolder(id);
                    }}
                    className="w-full h-8 appearance-none bg-[#1A1A1A] border border-white/10 hover:border-white/30 rounded px-2 pl-3 text-[10px] text-white focus:outline-none"
                >
                    <option value="">— Select a folder —</option>
                    {folders.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                </select>
                <div className="absolute right-2 top-2 pointer-events-none text-white/30">▼</div>
            </div>
            {folders.length === 0 && (
                <div className="text-[9px] text-white/30 italic mt-1">
                    No folders yet — create one in the Dashboard's Assets tab.
                </div>
            )}
        </div>
    );
};

type AssetPickerProps = {
    selectedFolderId: string | null;
    selectedAssetId: string | null;
    folders: AssetFolder[];
    assetsByFolder: Record<string, Asset[]>;
    fetchAssets: (folderId: string | null) => Promise<Asset[]>;
    onPick: (folderId: string, assetId: string) => void;
};

const AssetPicker: React.FC<AssetPickerProps> = ({
    selectedFolderId, selectedAssetId, folders, assetsByFolder, fetchAssets, onPick
}) => {
    useEffect(() => {
        if (selectedFolderId && !assetsByFolder[selectedFolderId]) {
            fetchAssets(selectedFolderId);
        }
    }, [selectedFolderId, assetsByFolder, fetchAssets]);

    const assets = selectedFolderId ? (assetsByFolder[selectedFolderId] ?? []) : [];

    return (
        <div className="space-y-2 pt-2 mt-2">
            <div className="flex items-center justify-between mb-1">
                <label className="text-[9px] uppercase font-bold text-white/40 flex items-center gap-1.5">
                    <FolderOpen size={11} /> Folder
                </label>
            </div>
            <div className="relative w-full">
                <select
                    value={selectedFolderId ?? ''}
                    onChange={(e) => {
                        const id = e.target.value;
                        if (!id) return;
                        if (!assetsByFolder[id]) fetchAssets(id);
                        // switching folder clears the assetId until the user picks one
                        onPick(id, '');
                    }}
                    className="w-full h-8 appearance-none bg-[#1A1A1A] border border-white/10 hover:border-white/30 rounded px-2 pl-3 text-[10px] text-white focus:outline-none"
                >
                    <option value="">— Select a folder —</option>
                    {folders.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                </select>
                <div className="absolute right-2 top-2 pointer-events-none text-white/30">▼</div>
            </div>

            <div className="flex items-center justify-between mb-1 mt-2">
                <label className="text-[9px] uppercase font-bold text-white/40 flex items-center gap-1.5">
                    <ImageIcon size={11} /> Asset
                </label>
            </div>
            <div className="relative w-full">
                <select
                    value={selectedAssetId ?? ''}
                    disabled={!selectedFolderId}
                    onChange={(e) => {
                        const aid = e.target.value;
                        if (!aid || !selectedFolderId) return;
                        onPick(selectedFolderId, aid);
                    }}
                    className="w-full h-8 appearance-none bg-[#1A1A1A] border border-white/10 hover:border-white/30 rounded px-2 pl-3 text-[10px] text-white focus:outline-none disabled:opacity-50"
                >
                    <option value="">{selectedFolderId ? '— Select an asset —' : '— Pick a folder first —'}</option>
                    {assets.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
                <div className="absolute right-2 top-2 pointer-events-none text-white/30">▼</div>
            </div>
        </div>
    );
};

// -------------------------------------------------------------------------

// Helper for labels
const ControlSlider: React.FC<any> = ({ label, value, onChange, min, max, step, icon, defaultValue, disabled, tooltip }) => {
    const { setTooltip } = useInspectorTooltip();
    return (
        <div
            className={`flex items-center justify-between mb-1 ${disabled ? 'opacity-50' : ''}`}
            onMouseEnter={() => { if (tooltip) setTooltip(tooltip); }}
            onMouseLeave={() => { if (tooltip) setTooltip(null); }}
        >
            <label className="text-[9px] uppercase font-bold text-white/40 flex items-center gap-1.5 min-w-[60px]">
                {label}
            </label>
            <ScrubbableInput
                value={value}
                onChange={onChange}
                min={min}
                max={max}
                step={step || 1}
                icon={icon}
                onIconDoubleClick={defaultValue !== undefined ? () => onChange(defaultValue) : undefined}
                disabled={disabled}
            />
        </div>
    );
};

const Inspector: React.FC = () => {
    const {
        project, activeLayerId, activeKeyframeId,
        updateLayer, updateProject, updateKeyframe, addKeyframe,
        deleteKeyframe, setGlobalLineColor,
        assetFolders, assetsByFolder, fetchAssets,
        isFreshProject, clearFreshProject,
    } = useStore(s => s);

    // Track the project reference at the moment isFreshProject became true.
    // First time the user mutates the project (any edit), the reference changes
    // from the snapshot — clear the fresh flag so the banner + keyframe pulse stop.
    const freshSnapshotRef = useRef<typeof project | null>(null);
    useEffect(() => {
        if (!isFreshProject) {
            freshSnapshotRef.current = null;
            return;
        }
        if (freshSnapshotRef.current === null) {
            freshSnapshotRef.current = project;
            return;
        }
        if (project !== freshSnapshotRef.current) {
            clearFreshProject();
        }
    }, [project, isFreshProject, clearFreshProject]);

    const activeLayer = project.layers.find((l) => l.id === activeLayerId);

    // Find active keyframe object
    const activeKeyframe = activeLayer?.keyframes.find(k => k.id === activeKeyframeId);

    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        shape: true,
        style: true,
        effects: false,
        transform: false,
        layout: true,
        layout2: false,
        grid: false,
        symmetry: false,
        globalRotation: false,
        easing: false,
        layerProps: true,
    });

    // const [deleteConfirm, setDeleteConfirm] = useState(false);

    const [showGradientPopup, setShowGradientPopup] = useState<false | 'stroke' | 'fill'>(false);
    const [showGlobalGradientPopup, setShowGlobalGradientPopup] = useState(false);

    // Initial setup when layer changes
    // useEffect(() => {
    //     setDeleteConfirm(false);
    // }, [activeLayerId]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;

            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'image/svg+xml');
            const paths = Array.from(doc.querySelectorAll('path'));
            const customPaths = paths.map(p => p.getAttribute('d')).filter(Boolean) as string[];

            if (customPaths.length > 0 && activeLayer) {
                const d = customPaths[0]; // backward compatibility
                updateLayer(activeLayer.id, { config: { ...activeLayer.config, customPath: d, customPaths } });
            } else {
                alert('Could not find any valid <path> tags with "d" attributes in the SVG.');
            }
        };
        reader.readAsText(file);
    };

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // --- Handling Values ---

    // For Animatable Properties (stored in keyframe.value)
    const getAnimValue = (key: keyof AnimatableProperties): number => {
        if (activeKeyframe) {
            return activeKeyframe.value[key] ?? 0;
        }
        return 0; // Default or disabled state
    };

    const setAnimValue = (key: keyof AnimatableProperties, val: number, skipHistory = false) => {
        if (!activeLayer || !activeKeyframe) return;

        // Update Keyframe
        const newValue = { ...activeKeyframe.value, [key]: val };
        updateKeyframe(activeLayer.id, activeKeyframe.id, { value: newValue }, skipHistory);
    };

    // For Config Properties (stored in layer.config)
    const setConfigValue = (key: string, val: any, skipHistory = false) => {
        if (!activeLayer) return;
        updateLayer(activeLayer.id, { config: { ...activeLayer.config, [key]: val } }, skipHistory);
    };

    // Attach a folder to an asset_set layer. Defaults: 360° radial orbit at
    // spread 300 with alignToPath on, no linear spacing.
    const applyAssetSetFolder = async (folderId: string) => {
        if (!activeLayer) return;
        if (!assetsByFolder[folderId]) {
            await fetchAssets(folderId);
        }

        const updatedKeyframes = activeLayer.keyframes.map(kf => ({
            ...kf,
            value: {
                ...kf.value,
                orbitRadius: 300,
                spacingX: 0,
                spacingY: 0,
            }
        }));
        updateLayer(activeLayer.id, {
            config: {
                ...activeLayer.config,
                assetFolderId: folderId,
                alignToPath: true,
                radialArc: 360,
            },
            keyframes: updatedKeyframes
        });
    };

    const isPropertyOverridden = () => {
        let currentId = activeLayer?.parentId;
        while (currentId) {
            const parent = project.layers.find(l => l.id === currentId);
            if (parent?.config.styleOverrideEnabled) return true;
            currentId = parent?.parentId;
        }
        return false;
    };

    const overridden = isPropertyOverridden();

    // --- Section Header ---
    const SectionHeader: React.FC<{ title: string; expanded: boolean; onToggle: () => void }> = ({ title, expanded, onToggle }) => (
        <button
            onClick={onToggle}
            className="w-full flex items-center justify-between py-5 px-5 hover:bg-white/[0.04] transition-all group border-b border-white/[0.03]"
        >
            <span className="text-[10px] uppercase font-bold tracking-[0.25em] text-white/90 group-hover:text-white transition-colors">{title}</span>
            <ChevronUp size={12} className={`text-white/30 transition-transform duration-300 ${expanded ? '' : 'rotate-180'}`} />
        </button>
    );

    if (!activeLayer) {
        return (
            <div className="flex flex-col h-full bg-[#121212]" id="project-inspector">
                <div className="p-5 border-b border-white/10 h-[68px] flex items-center gap-3">
                    <Layers size={16} className="text-[#D4AF37]" />
                    <h2 className="text-[11px] font-bold text-white/90 uppercase tracking-[0.2em]">Project Settings</h2>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-none p-5 space-y-6">
                    <div className="space-y-4 bg-white/5 p-4 rounded-lg border border-white/5">
                        <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/50">Global Zoom</label>
                        <ScrubbableInput
                            value={project.zoom || 1}
                            onChange={(val, skip?: boolean) => updateProject({ zoom: val }, skip)}
                            min={0.1} max={10} step={0.01} icon={<Maximize size={12} />}
                            onIconDoubleClick={() => updateProject({ zoom: 1 })}
                        />
                    </div>
                    <div className="space-y-4 bg-white/5 p-4 rounded-lg border border-white/5">
                        <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/50">Duration</label>
                        <ScrubbableInput value={project.duration} onChange={(v, skip?: boolean) => updateProject({ duration: v }, skip)} min={0.1} max={3600} step={0.1} />
                    </div>

                    <div className="space-y-4 bg-white/5 p-4 rounded-lg border border-white/5">
                        <label className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/50">Project Colors</label>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-2 bg-black/20 rounded border border-white/5">
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded bg-white/10 flex items-center justify-center">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: project.backgroundColor || '#000000' }} />
                                    </div>
                                    <span className="text-[9px] uppercase font-bold text-white/40 tracking-widest">Background</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-mono text-white/30">{project.backgroundColor || '#000000'}</span>
                                    <CustomColorPicker
                                        color={project.backgroundColor || '#000000'}
                                        onChange={(color) => updateProject({ backgroundColor: color })}
                                        className="w-5 h-5 border border-white/20 p-0 cursor-pointer rounded overflow-hidden"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-2 bg-black/20 rounded border border-white/5">
                                <div className="flex items-center gap-2">
                                    <Palette size={12} className="text-[#D4AF37]" />
                                    <span className="text-[9px] uppercase font-bold text-white/40 tracking-widest">Global Line Color</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-mono text-white/30">{project.globalLineColor || '#7a7a7a'}</span>
                                    <CustomColorPicker
                                        color={project.globalLineColor || '#7a7a7a'}
                                        onChange={(color) => setGlobalLineColor(color)}
                                        className="w-5 h-5 border border-white/20 p-0 cursor-pointer rounded overflow-hidden"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-2 bg-black/20 rounded border border-white/5">
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] uppercase font-bold text-white/40 tracking-widest">Global Line Thickness</span>
                                </div>
                                <ScrubbableInput
                                    value={project.globalStrokeWeight ?? 1}
                                    onChange={(val, skip?: boolean) => updateProject({ globalStrokeWeight: val }, skip)}
                                    min={0} max={100} step={0.1}
                                />
                            </div>

                            <div className="flex flex-col gap-2 p-2 bg-black/20 rounded border border-white/5">
                                <div className="flex items-center justify-between">
                                    <ModernToggle
                                        checked={project.globalGradientEnabled ?? false}
                                        onChange={(val) => {
                                            const updates: any = { globalGradientEnabled: val };
                                            if (val && (!project.globalGradientStops || project.globalGradientStops.length === 0)) {
                                                updates.globalGradientStops = [
                                                    { id: '1', offset: 36, color: '#793720' },
                                                    { id: '2', offset: 63, color: '#FCC698' }
                                                ];
                                            }
                                            updateProject(updates);
                                        }}
                                        label="Global Gradient"
                                    />
                                </div>
                                {project.globalGradientEnabled && (
                                    <div className="relative mt-1 self-end">
                                        <div
                                            className="w-16 h-4 border border-white/20 cursor-pointer rounded-sm overflow-hidden p-0 hover:border-white/50 transition-colors"
                                            style={{ background: `linear-gradient(90deg, ${(project.globalGradientStops || []).map(s => `${s.color} ${s.offset}%`).join(', ')})` }}
                                            onClick={() => setShowGlobalGradientPopup(!showGlobalGradientPopup)}
                                            title="Edit Global Gradient"
                                        />
                                        {showGlobalGradientPopup && (
                                            <div className="absolute right-0 top-6 z-50">
                                                <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowGlobalGradientPopup(false)} />
                                                <div className="relative z-50 shadow-2xl">
                                                    <GradientEditor
                                                        stops={project.globalGradientStops || [
                                                            { id: '1', offset: 36, color: '#793720' },
                                                            { id: '2', offset: 63, color: '#FCC698' }
                                                        ]}
                                                        onChange={(stops) => updateProject({ globalGradientStops: stops })}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-between p-2 bg-black/20 rounded border border-white/5">
                                <ModernToggle
                                    checked={project.globalStyleEnabled ?? false}
                                    onChange={(val, skip?: boolean) => updateProject({ globalStyleEnabled: val }, skip)}
                                    label="Enable Global Style"
                                />
                                <p className="text-[8px] text-white/30 mt-1 uppercase w-32 ml-2">Applies immediately to new layers</p>
                            </div>

                            <button
                                onClick={useStore.getState().restyleAllLayers}
                                className="w-full mt-2 py-2 px-3 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/20 rounded text-[10px] text-[#D4AF37] font-bold uppercase transition-colors"
                            >
                                Restyle All Shapes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden bg-[#121212]" id="inspector-panel">
            {/* Header / Layer Name */}
            <div className="sticky top-0 z-20 bg-[#121212] border-b border-white/10 shadow-2xl shadow-black/40">
                <div className="p-5 flex items-center justify-between relative h-[68px]">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                        <input
                            type="text"
                            value={activeLayer.name}
                            onChange={(e) => updateLayer(activeLayer.id, { name: e.target.value })}
                            className="bg-transparent border-none text-[11px] font-bold text-white/90 focus:outline-none w-full"
                        />
                    </div>
                </div>

                {/* Keyframe Context Header */}
                <div className="px-5 pb-4 bg-[#121212] flex items-center justify-between border-b border-white/5">
                    {activeKeyframe ? (
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rotate-45 bg-[#D4AF37] shadow-[0_0_8px_rgba(212,175,55,0.6)]" />
                            <span className="text-[9px] font-bold text-[#D4AF37] uppercase tracking-wider">
                                Keyframe @ {activeKeyframe.time.toFixed(2)}s
                            </span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 opacity-50">
                            <div className="w-2 h-2 rounded-full border border-white/20" />
                            <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">No Keyframe Selected</span>
                        </div>
                    )}

                    {!activeKeyframe && (
                        <button
                            onClick={() => addKeyframe(activeLayer.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/20 rounded text-[9px] text-[#D4AF37] font-bold uppercase transition-colors"
                        >
                            <Plus size={10} />
                            Add Key
                        </button>
                    )}

                    {activeKeyframe && (
                        <button
                            onClick={() => deleteKeyframe(activeLayer.id, activeKeyframe.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded text-[9px] text-red-400 font-bold uppercase transition-colors"
                        >
                            <Trash2 size={10} />
                        </button>
                    )}
                </div>
            </div>

            {/* Onboarding banner for brand-new projects. Auto-dismisses on first edit. */}
            {isFreshProject && activeKeyframe && (
                <div className="px-4 py-3 bg-[#D4AF37]/10 border-b border-[#D4AF37]/20 flex items-start gap-3 text-[10px] leading-relaxed text-white/80">
                    <div className="flex-1">
                        <div className="font-bold text-[#D4AF37] uppercase tracking-wider mb-1">You're editing Keyframe 1 @ {activeKeyframe.time.toFixed(2)}s</div>
                        <div className="text-white/60">Adjust values below to set this moment. Click the timeline to add more keyframes and start animating.</div>
                    </div>
                    <button
                        onClick={clearFreshProject}
                        className="p-1 -m-1 text-white/40 hover:text-white/80 transition-colors"
                        title="Dismiss"
                    >
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Content Display Logic */}
            <div className={`flex-1 overflow-y-auto scrollbar-none pb-12 ${!activeKeyframe ? 'opacity-80' : ''}`}>

                {/* 1. SHAPE CONFIG (Mixed Static & Animated) - Hide for Groups */}
                {/* For groups we want to show Scale (RadiusX/Y) but simplify the rest */}
                <div className="flex flex-col">
                    {(activeLayer?.type !== 'group' || true) && (
                        /* Actually for Groups we want "SHAPE" or maybe "TRANSFORM" section? 
                           Use existing SHAPE section for now as it contains Radius which we map to Scale.
                        */
                        <SectionHeader title={activeLayer?.type === 'group' ? "TRANSFORM (SCALE)" : "SHAPE"} expanded={expandedSections.shape} onToggle={() => toggleSection('shape')} />
                    )}

                    {expandedSections.shape && (
                        <div className="p-3 space-y-2">
                            {/* Type Selector (Static) - Keep hidden for Groups? Or allow changing type? 
                                Changing group type might break children logic if not handled. 
                                Let's disable type changing for groups for safety or just keep it hidden.
                            */}
                            {activeLayer?.type !== 'group' && (
                                <div className="relative w-full group mb-4">
                                    <select
                                        value={activeLayer?.type || 'polygon'}
                                        onChange={(e) => {
                                            if (!activeLayer) return;
                                            const newType = e.target.value as ShapeType;
                                            if (newType === 'amino' || newType === 'astrology' || newType === 'iching_lines') {
                                                const updatedKeyframes = activeLayer.keyframes.map(kf => ({
                                                    ...kf,
                                                    value: {
                                                        ...kf.value,
                                                        radiusX: newType === 'iching_lines' ? 6 : 20,
                                                        radiusY: newType === 'iching_lines' ? 6 : 20,
                                                        orbitRadius: 200,
                                                        ...(newType === 'iching_lines' ? { rotateShape: 90 } : {})
                                                    }
                                                }));
                                                const updatedConfig = {
                                                    ...activeLayer.config,
                                                    alignToPath: true
                                                };
                                                if (newType === 'amino') {
                                                    updatedConfig.strokeEnabled = false;
                                                    updatedConfig.fillEnabled = true;
                                                } else if (newType === 'iching_lines') {
                                                    updatedConfig.strokeEnabled = true;
                                                    updatedConfig.fillEnabled = false;
                                                }
                                                updateLayer(activeLayer.id, {
                                                    type: newType,
                                                    config: updatedConfig,
                                                    keyframes: updatedKeyframes
                                                });
                                            } else {
                                                // Clear any uploaded SVG paths so picking "polygon" (or any
                                                // non-custom type) doesn't keep rendering the SVG via the
                                                // polygon renderer's customPath branch.
                                                const { customPath, customPaths, ...restConfig } = activeLayer.config;
                                                updateLayer(activeLayer.id, { type: newType, config: restConfig });
                                            }
                                        }}
                                        className="w-full h-9 appearance-none bg-[#1A1A1A] border border-white/10 hover:border-white/30 rounded px-2 pl-3 text-[10px] uppercase font-bold text-[#D4AF37] focus:outline-none"
                                    >
                                        <option value="polygon">Polygon</option>
                                        <option value="star">Star</option>
                                        <option value="circle">Ellipse / Arc</option>
                                        <option value="vesica">Vesica</option>
                                        <option value="polyhedron">Polyhedron</option>
                                        <option value="line">Line</option>
                                        <option value="molecule">Molecule</option>
                                        <option value="iching">I-Ching</option>
                                        <option value="asset_set">Asset Folder</option>
                                        <option value="asset_single">Asset (Single)</option>
                                        {/* Legacy types: only shown when already in use so projects keep rendering; new layers should use Asset Folder. */}
                                        {activeLayer?.type === 'iching_lines' && <option value="iching_lines">I-Ching (Strokes)</option>}
                                        {activeLayer?.type === 'astrology' && <option value="astrology">Astrology</option>}
                                        {activeLayer?.type === 'amino' && <option value="amino">Amino Acids</option>}
                                        {activeLayer?.type === 'custom' && <option value="custom">Custom (SVG)</option>}
                                    </select>
                                    <div className="absolute right-2 top-2 pointer-events-none text-white/30">▼</div>
                                </div>
                            )}

                            {
                                activeLayer?.type === 'polygon' && (
                                    <>
                                        <ControlSlider label="Sides" value={activeLayer?.config?.sides || 3} min={3} max={32} onChange={(v: number, skip?: boolean) => setConfigValue('sides', v, skip)} isFixed />
                                        <div className="flex items-center gap-2 mt-2 px-1">
                                            <label className="flex items-center justify-center w-8 h-8 rounded hover:bg-white/5 cursor-pointer transition-colors" title="Toggle Outline">
                                                <input type="checkbox" checked={activeLayer.config.drawOutline ?? true} onChange={(e) => setConfigValue('drawOutline', e.target.checked)} className="hidden" />
                                                <Pentagon size={16} className={activeLayer.config.drawOutline !== false ? "text-white fill-white/10" : "text-white/20"} />
                                            </label>
                                            <label className="flex items-center justify-center w-8 h-8 rounded hover:bg-white/5 cursor-pointer transition-colors" title="Toggle Spokes">
                                                <input type="checkbox" checked={activeLayer.config.drawSpokes ?? false} onChange={(e) => setConfigValue('drawSpokes', e.target.checked)} className="hidden" />
                                                <Asterisk size={16} className={activeLayer.config.drawSpokes ? "text-white" : "text-white/20"} />
                                            </label>
                                            <label className="flex items-center justify-center w-8 h-8 rounded hover:bg-white/5 cursor-pointer transition-colors" title="Toggle Web">
                                                <input type="checkbox" checked={activeLayer.config.drawWeb ?? false} onChange={(e) => setConfigValue('drawWeb', e.target.checked)} className="hidden" />
                                                <Grid size={16} className={activeLayer.config.drawWeb ? "text-white" : "text-white/20"} />
                                            </label>
                                            <label className="flex items-center justify-center w-8 h-8 rounded hover:bg-white/5 cursor-pointer transition-colors" title="Toggle Star">
                                                <input type="checkbox" checked={activeLayer.config.drawStar ?? false} onChange={(e) => setConfigValue('drawStar', e.target.checked)} className="hidden" />
                                                <Star size={16} className={activeLayer.config.drawStar ? "text-white fill-white/10" : "text-white/20"} />
                                            </label>
                                        </div>
                                    </>
                                )
                            }

                            {
                                activeLayer?.type === 'star' && (
                                    <>
                                        <ControlSlider label="Points" value={activeLayer?.config?.sides || 5} min={3} max={32} onChange={(v: number, skip?: boolean) => setConfigValue('sides', v, skip)} isFixed />
                                        <ControlSlider label="Inner R" value={getAnimValue('starInnerRadius')} min={0} max={1} step={0.01} onChange={(v: number, skip?: boolean) => setAnimValue('starInnerRadius', v, skip)} disabled={!activeKeyframe} />
                                        <div className="flex items-center gap-2 mt-2 px-1">
                                            <label className="flex items-center justify-center w-8 h-8 rounded hover:bg-white/5 cursor-pointer transition-colors" title="Toggle Outline">
                                                <input type="checkbox" checked={activeLayer.config.drawOutline ?? true} onChange={(e) => setConfigValue('drawOutline', e.target.checked)} className="hidden" />
                                                <Pentagon size={16} className={activeLayer.config.drawOutline !== false ? "text-white fill-white/10" : "text-white/20"} />
                                            </label>
                                            <label className="flex items-center justify-center w-8 h-8 rounded hover:bg-white/5 cursor-pointer transition-colors" title="Toggle Spokes">
                                                <input type="checkbox" checked={activeLayer.config.drawSpokes ?? false} onChange={(e) => setConfigValue('drawSpokes', e.target.checked)} className="hidden" />
                                                <Asterisk size={16} className={activeLayer.config.drawSpokes ? "text-white" : "text-white/20"} />
                                            </label>
                                            <label className="flex items-center justify-center w-8 h-8 rounded hover:bg-white/5 cursor-pointer transition-colors" title="Toggle Web">
                                                <input type="checkbox" checked={activeLayer.config.drawWeb ?? false} onChange={(e) => setConfigValue('drawWeb', e.target.checked)} className="hidden" />
                                                <Grid size={16} className={activeLayer.config.drawWeb ? "text-white" : "text-white/20"} />
                                            </label>
                                            <label className="flex items-center justify-center w-8 h-8 rounded hover:bg-white/5 cursor-pointer transition-colors" title="Toggle Star">
                                                <input type="checkbox" checked={activeLayer.config.drawStar ?? false} onChange={(e) => setConfigValue('drawStar', e.target.checked)} className="hidden" />
                                                <Star size={16} className={activeLayer.config.drawStar ? "text-white fill-white/10" : "text-white/20"} />
                                            </label>
                                        </div>
                                        {activeLayer?.config?.drawStar && (
                                            <ControlSlider label={`Skip ${activeLayer?.config?.starSkip ?? 2}`} value={activeLayer?.config?.starSkip ?? 2} min={2} max={activeLayer?.config?.sides || 5} step={1} onChange={(v: number, skip?: boolean) => setConfigValue('starSkip', v, skip)} isFixed />
                                        )}    </>
                                )
                            }

                            {
                                activeLayer?.type === 'line' && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-[9px] uppercase font-bold text-white/40">Anchor</label>
                                            <select
                                                value={activeLayer?.config?.lineAnchor || 'center'}
                                                onChange={(e) => setConfigValue('lineAnchor', e.target.value)}
                                                className="bg-[#1A1A1A] text-[10px] text-white p-1 rounded border border-white/10 w-24"
                                            >
                                                <option value="center">Center</option>
                                                <option value="start">Start</option>
                                                <option value="end">End</option>
                                            </select>
                                        </div>
                                    </div>
                                )
                            }

                            {
                                activeLayer?.type === 'circle' && (
                                    <ControlSlider label="Arc" value={getAnimValue('shapeArc')} min={0} max={360} onChange={(v: number, skip?: boolean) => setAnimValue('shapeArc', v, skip)} disabled={!activeKeyframe} />
                                )
                            }

                            {
                                activeLayer?.type === 'molecule' && (
                                    <>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-[9px] uppercase font-bold text-white/40">Type</label>
                                            <select
                                                value={activeLayer?.config?.molecule || 'water'}
                                                onChange={(e) => setConfigValue('molecule', e.target.value)}
                                                className="bg-[#1A1A1A] text-[10px] text-white p-1 rounded border border-white/10 w-24"
                                            >
                                                {Object.keys(MOLECULES).map(k => (
                                                    <option key={k} value={k}>{k}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <ControlSlider label="Size" value={activeLayer?.config?.moleculeSize ?? 1} min={0.1} max={5} step={0.1} onChange={(v: number, skip?: boolean) => setConfigValue('moleculeSize', v, skip)} isFixed />
                                        <div className="flex items-center gap-2 mb-2">
                                            <ModernToggle
                                                checked={activeLayer?.config?.moleculeFill ?? false}
                                                onChange={(val, skip?: boolean) => setConfigValue('moleculeFill', val, skip)}
                                                label="FILL"
                                            />
                                        </div>
                                        <ControlSlider label="Rot X" value={getAnimValue('rotateX')} min={-360} max={360} onChange={(v: number, skip?: boolean) => setAnimValue('rotateX', v, skip)} disabled={!activeKeyframe} />
                                        <ControlSlider label="Rot Y" value={getAnimValue('rotateY')} min={-360} max={360} onChange={(v: number, skip?: boolean) => setAnimValue('rotateY', v, skip)} disabled={!activeKeyframe} />
                                    </>
                                )
                            }

                            {
                                activeLayer?.type === 'polyhedron' && (
                                    <>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-[9px] uppercase font-bold text-white/40">Solid</label>
                                            <select
                                                value={activeLayer?.config?.polyhedronName || 'tetrahedron'}
                                                onChange={(e) => setConfigValue('polyhedronName', e.target.value)}
                                                className="bg-[#1A1A1A] text-[10px] text-white p-1 rounded border border-white/10 w-24"
                                            >
                                                <option value="tetrahedron">Tetrahedron</option>
                                                <option value="cube">Cube</option>
                                                <option value="octahedron">Octahedron</option>
                                                <option value="dodecahedron">Dodecahedron</option>
                                                <option value="icosahedron">Icosahedron</option>
                                                <option value="cuboctahedron">Cuboctahedron</option>
                                                <option value="rhombic dodecahedron">Rhombic Doec.</option>
                                                <option value="truncated octahedron">Trunc. Octahedron</option>
                                                <option value="stella octangula">Stella Octangula</option>
                                                <option value="rhombic triacontahedron">Rho. Triaconta.</option>
                                                <option value="truncated cube">Trunc. Cube</option>
                                                <option value="truncated tetrahedron">Trunc. Tetra.</option>
                                                <option value="triakis octahedron">Triakis Octa.</option>
                                                <option value="small stellated dodecahedron">Small Stellated Dod.</option>
                                            </select>
                                        </div>
                                        <ControlSlider label="Rot X" value={getAnimValue('rotateX')} min={-360} max={360} onChange={(v: number, skip?: boolean) => setAnimValue('rotateX', v, skip)} disabled={!activeKeyframe} />
                                        <ControlSlider label="Rot Y" value={getAnimValue('rotateY')} min={-360} max={360} onChange={(v: number, skip?: boolean) => setAnimValue('rotateY', v, skip)} disabled={!activeKeyframe} />
                                        <ControlSlider label="Perspective" value={getAnimValue('perspective') || 1200} min={100} max={3000} step={10} onChange={(v: number, skip?: boolean) => setAnimValue('perspective', v, skip)} disabled={!activeKeyframe} />
                                    </>
                                )
                            }

                            {(activeLayer?.type === 'iching' || activeLayer?.type === 'iching_lines') && (
                                <div className="space-y-4">
                                    <div className="bg-black/20 p-3 rounded space-y-3">
                                        <div className="text-[9px] uppercase tracking-wider text-white/50 mb-2 font-bold">I-Ching Inputs</div>
                                        {activeLayer?.type === 'iching' && (
                                            <ControlSlider label="Hexagram" value={activeLayer?.config?.ichingInputId ?? 1} min={1} max={64} step={1} onChange={(v: number, skip?: boolean) => setConfigValue('ichingInputId', v, skip)} isFixed />
                                        )}
                                        <ControlSlider label="Highlight" value={activeLayer?.config?.ichingHighlightIndex ?? 0} min={0} max={6} step={1} onChange={(v: number, skip?: boolean) => setConfigValue('ichingHighlightIndex', v, skip)} isFixed />
                                        <ControlSlider label="Anim Duration (s)" value={activeLayer?.config?.ichingAnimationDuration ?? 5} min={0.5} max={30} step={0.1} onChange={(v: number, skip?: boolean) => setConfigValue('ichingAnimationDuration', v, skip)} isFixed />
                                    </div>
                                </div>
                            )}

                            {
                                activeLayer?.type === 'custom' && (
                                    <div className="space-y-2 pt-2 mt-2">
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-[9px] uppercase font-bold text-white/40">SVG Path</label>
                                            <label className="cursor-pointer bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/20 rounded px-2 py-1 text-[9px] text-[#D4AF37] font-bold uppercase transition-colors">
                                                Upload
                                                <input type="file" accept=".svg" onChange={handleFileUpload} className="hidden" />
                                            </label>
                                        </div>
                                        {(activeLayer?.config?.customPaths || activeLayer?.config?.customPath) && (
                                            <div className="text-[8px] text-white/30 truncate px-1 font-mono">
                                                {activeLayer?.config?.customPaths?.length ? `${activeLayer.config.customPaths.length} paths loaded` : `${activeLayer?.config?.customPath?.substring(0, 30)}...`}
                                            </div>
                                        )}    </div>
                                )
                            }

                            {activeLayer?.type === 'asset_set' && (
                                <AssetFolderPicker
                                    selectedFolderId={activeLayer.config?.assetFolderId ?? null}
                                    folders={assetFolders}
                                    assetsByFolder={assetsByFolder}
                                    fetchAssets={fetchAssets}
                                    applyFolder={applyAssetSetFolder}
                                />
                            )}

                            {activeLayer?.type === 'asset_single' && (
                                <AssetPicker
                                    selectedFolderId={activeLayer.config?.assetFolderId ?? null}
                                    selectedAssetId={activeLayer.config?.assetId ?? null}
                                    folders={assetFolders}
                                    assetsByFolder={assetsByFolder}
                                    fetchAssets={fetchAssets}
                                    onPick={(folderId, assetId) => {
                                        if (!activeLayer) return;
                                        updateLayer(activeLayer.id, {
                                            config: { ...activeLayer.config, assetFolderId: folderId, assetId }
                                        });
                                    }}
                                />
                            )}

                            <div className="w-full h-px bg-white/5 my-3" />

                            {/* Standard Animatable Props */}
                            {/* Radius Controls with Lock */}
                            <div className="flex items-end gap-2 mb-2">
                                <div className="flex-1">
                                    <ControlSlider
                                        label={activeLayer?.type === 'group' ? "Scale X %" : "Radius X"}
                                        value={getAnimValue('radiusX')}
                                        onChange={(v: number) => {
                                            if (activeLayer.config.scaleLocked && activeKeyframe) {
                                                const newValue = { ...activeKeyframe.value, radiusX: v, radiusY: v };
                                                updateKeyframe(activeLayer.id, activeKeyframe.id, { value: newValue });
                                            } else {
                                                setAnimValue('radiusX', v);
                                            }
                                        }}
                                        disabled={!activeKeyframe}
                                        className="mb-0"
                                    />
                                </div>
                                <button
                                    onClick={() => setConfigValue('scaleLocked', !activeLayer.config.scaleLocked)}
                                    className={`p-1.5 rounded transition-all mb-[5px] ${activeLayer.config.scaleLocked ? 'bg-white/10 text-white' : 'text-white/20 hover:text-white/40'}`}
                                    title="Lock Aspect Ratio"
                                >
                                    {activeLayer.config.scaleLocked ? <Lock size={12} /> : <Unlock size={12} />}
                                </button>
                                <div className="flex-1">
                                    <ControlSlider
                                        label={activeLayer?.type === 'group' ? "Scale Y %" : "Radius Y"}
                                        value={getAnimValue('radiusY')}
                                        onChange={(v: number) => {
                                            if (activeLayer.config.scaleLocked && activeKeyframe) {
                                                const newValue = { ...activeKeyframe.value, radiusX: v, radiusY: v };
                                                updateKeyframe(activeLayer.id, activeKeyframe.id, { value: newValue });
                                            } else {
                                                setAnimValue('radiusY', v);
                                            }
                                        }}
                                        disabled={!activeKeyframe}
                                        className="mb-0"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2 mb-1">
                                <div className="flex-1">
                                    <ControlSlider label="Pos X" value={getAnimValue('posX')} onChange={(v: number, skip?: boolean) => setAnimValue('posX', v, skip)} disabled={!activeKeyframe} icon={<Move size={12} />} />
                                </div>
                                <div className="flex-1">
                                    <ControlSlider label="Pos Y" value={getAnimValue('posY')} onChange={(v: number, skip?: boolean) => setAnimValue('posY', v, skip)} disabled={!activeKeyframe} icon={<Move size={12} className="rotate-90" />} />
                                </div>
                            </div>

                            <ControlSlider label="Rotation" value={getAnimValue('rotateShape')} min={-360} max={360} onChange={(v: number, skip?: boolean) => setAnimValue('rotateShape', v, skip)} disabled={!activeKeyframe} />

                            <ControlSlider label="Global Rot" value={getAnimValue('rotateGlobal')} onChange={(v: number, skip?: boolean) => setAnimValue('rotateGlobal', v, skip)} disabled={!activeKeyframe} icon={<RotateCw size={12} />} />
                        </div >
                    )}
                </div>

                {/* 2. STYLE (Opacity for all, others for non-Groups) */}
                <div className="flex flex-col">
                    <SectionHeader title="STYLE" expanded={expandedSections.style} onToggle={() => toggleSection('style')} />
                    {expandedSections.style && (
                        <div className="p-3 space-y-2 animate-in slide-in-from-top-1 duration-300">

                            {/* OPACITY (Visible for ALL) */}
                            <ControlSlider
                                label="Opacity"
                                value={getAnimValue('opacity')}
                                min={0} max={255} step={1}
                                onChange={(v: number, skip?: boolean) => setAnimValue('opacity', v, skip)}
                                disabled={!activeKeyframe}
                            />

                            {/* STYLE OVERRIDE (For Groups) */}
                            {activeLayer?.type === 'group' && (
                                <div className="px-1 pb-2 mb-2 border-b border-white/5">
                                    <ModernToggle
                                        checked={activeLayer?.config?.styleOverrideEnabled ?? false}
                                        onChange={(val, skip?: boolean) => setConfigValue('styleOverrideEnabled', val, skip)}
                                        label="Enable Style Override"
                                    />
                                    <p className="text-[8px] text-white/30 mt-1 uppercase">Overrides all child layer styles</p>
                                </div>
                            )}

                            {/* Hide specific Style props for Groups UNLESS override is enabled */}
                            {(activeLayer?.type !== 'group' || activeLayer?.config?.styleOverrideEnabled) && (
                                <>
                                    {/* COLOR — independent Stroke and Fill paint controls.
                                        Each row has its own Flat/Gradient mini-toggle so the
                                        stroke can be a gradient while the fill is flat (or
                                        vice versa). Gradient stops are shared across both —
                                        clicking either gradient strip opens the same editor. */}
                                    {(() => {
                                        if (!activeLayer) return null;
                                        const cfg = activeLayer.config;
                                        const legacyGrad = cfg.gradientEnabled ?? false;
                                        const strokeGrad = cfg.strokeGradientEnabled ?? legacyGrad;
                                        const fillGrad = cfg.fillGradientEnabled ?? legacyGrad;
                                        const DEFAULT_STOPS = [
                                            { id: '1', offset: 36, color: '#793720' },
                                            { id: '2', offset: 63, color: '#FCC698' }
                                        ];
                                        const ensureStops = (patch: Record<string, unknown>) => {
                                            if (!cfg.gradientStops?.length) patch.gradientStops = DEFAULT_STOPS;
                                            return patch;
                                        };
                                        // Keep the legacy gradientEnabled flag in sync with the new per-target
                                        // flags so any code still reading it sees "on if either is on".
                                        const writeMode = (target: 'stroke' | 'fill', useGradient: boolean) => {
                                            const nextStroke = target === 'stroke' ? useGradient : strokeGrad;
                                            const nextFill = target === 'fill' ? useGradient : fillGrad;
                                            const patch: Record<string, unknown> = {
                                                ...cfg,
                                                strokeGradientEnabled: nextStroke,
                                                fillGradientEnabled: nextFill,
                                                gradientEnabled: nextStroke || nextFill,
                                                strokeEnabled: true,
                                            };
                                            if (useGradient) ensureStops(patch);
                                            updateLayer(activeLayer.id, { config: patch });
                                        };

                                        const renderModeToggle = (target: 'stroke' | 'fill', isGradient: boolean) => (
                                            <div className="inline-flex bg-[#1A1A1A] rounded border border-white/10 p-0.5 gap-0.5">
                                                <button
                                                    type="button"
                                                    className={`text-[8px] uppercase px-1.5 py-[1px] rounded transition-colors ${!isGradient ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}
                                                    onClick={() => writeMode(target, false)}
                                                >Flat</button>
                                                <button
                                                    type="button"
                                                    className={`text-[8px] uppercase px-1.5 py-[1px] rounded transition-colors ${isGradient ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}
                                                    onClick={() => writeMode(target, true)}
                                                >Grad</button>
                                            </div>
                                        );

                                        const renderGradientStrip = (openKey: 'stroke' | 'fill') => (
                                            <div className="relative">
                                                <div
                                                    className="w-8 h-4 border border-white/20 cursor-pointer rounded-sm overflow-hidden p-0 hover:border-white/50 transition-colors"
                                                    style={{ background: `linear-gradient(90deg, ${(cfg.gradientStops || DEFAULT_STOPS).map(s => `${s.color} ${s.offset}%`).join(', ')})` }}
                                                    onClick={() => setShowGradientPopup(showGradientPopup === openKey ? false : openKey)}
                                                    title="Edit Gradient"
                                                />
                                                {showGradientPopup === openKey && (
                                                    <div className="absolute right-0 top-6 z-50">
                                                        <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowGradientPopup(false)} />
                                                        <div className="relative z-50 shadow-2xl">
                                                            <GradientEditor
                                                                stops={cfg.gradientStops || DEFAULT_STOPS}
                                                                onChange={(stops) => setConfigValue('gradientStops', stops)}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );

                                        return (
                                            <>
                                                {/* STROKE row */}
                                                <div className="flex items-center justify-between px-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-white/90 text-[10px] uppercase">Stroke</span>
                                                        {renderModeToggle('stroke', strokeGrad)}
                                                        {overridden && <div className="text-[8px] text-blue-400 font-bold ml-1">OVERRIDDEN</div>}
                                                    </div>
                                                    {strokeGrad ? renderGradientStrip('stroke') : (
                                                        <CustomColorPicker
                                                            color={cfg.strokeColor || '#ffffff'}
                                                            onChange={(color) => {
                                                                // Keep fillColor in sync only while FILLED is off, so
                                                                // turning FILLED on later defaults to matching colors.
                                                                const patch: Record<string, unknown> = { ...cfg, strokeColor: color, strokeEnabled: true };
                                                                if (!cfg.fillEnabled) patch.fillColor = color;
                                                                updateLayer(activeLayer.id, { config: patch });
                                                            }}
                                                            className="w-4 h-4 border border-white/20 cursor-pointer rounded p-0"
                                                        />
                                                    )}
                                                </div>

                                                {/* WEIGHT + dash, grouped with Stroke. */}
                                                <div className="flex flex-col px-1 mt-1 pl-3 border-l border-white/5 ml-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-white/60 text-[10px] uppercase">Weight</span>
                                                        <select
                                                            value={cfg.strokeStyleType === 'dotted' ? 'dashed' : (cfg.strokeStyleType || 'solid')}
                                                            onChange={(e) => setConfigValue('strokeStyleType', e.target.value)}
                                                            className="bg-[#1A1A1A] text-[9px] text-white p-0.5 rounded border border-white/10 w-16 h-5"
                                                        >
                                                            <option value="solid">Solid</option>
                                                            <option value="dashed">Dashed</option>
                                                        </select>
                                                    </div>
                                                    <ControlSlider
                                                        label="Weight"
                                                        value={getAnimValue('strokeWeight') || 1}
                                                        min={0} max={100} step={0.5}
                                                        onChange={(v: number, skip?: boolean) => setAnimValue('strokeWeight', v, skip)}
                                                        disabled={!activeKeyframe}
                                                        className="mb-0 mt-1"
                                                    />
                                                    {cfg.strokeStyleType !== 'solid' && (
                                                        <div className="space-y-1 pb-1 mt-1">
                                                            <ControlSlider label="Dash" value={cfg.dashLength || 10} min={0.1} max={100} onChange={(v: number, skip?: boolean) => setConfigValue('dashLength', v, skip)} isFixed />
                                                            <ControlSlider label="Gap" value={cfg.gapLength || 10} min={1} max={100} onChange={(v: number, skip?: boolean) => setConfigValue('gapLength', v, skip)} isFixed />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* FILL row — toggle on the left enables the fill paint;
                                                    mode + swatch on the right appear only when enabled.
                                                    Force strokeEnabled=true on toggle so the layer never
                                                    becomes invisible if the user disables fill on an
                                                    originally-fill-only shape (e.g. amino). */}
                                                <div className="flex items-center justify-between px-1 mt-3">
                                                    <div className="flex items-center gap-2">
                                                        <ModernToggle
                                                            checked={cfg.fillEnabled ?? false}
                                                            onChange={(val, skip?: boolean) => {
                                                                updateLayer(activeLayer.id, { config: { ...cfg, fillEnabled: val, strokeEnabled: true } }, skip);
                                                            }}
                                                            label="Fill"
                                                            className={overridden ? "text-blue-400" : ""}
                                                        />
                                                        {cfg.fillEnabled && renderModeToggle('fill', fillGrad)}
                                                    </div>
                                                    {cfg.fillEnabled && (fillGrad ? renderGradientStrip('fill') : (
                                                        <CustomColorPicker
                                                            color={cfg.fillColor || cfg.strokeColor || '#ffffff'}
                                                            onChange={(color) => {
                                                                updateLayer(activeLayer.id, { config: { ...cfg, fillColor: color } });
                                                            }}
                                                            className="w-4 h-4 border border-white/20 cursor-pointer rounded p-0"
                                                        />
                                                    ))}
                                                </div>
                                            </>
                                        );
                                    })()}

                                    {/* DOTS */}
                                    <div className="flex items-center justify-between px-1 mt-2">
                                        <div className="flex items-center gap-2">
                                            <ModernToggle
                                                checked={activeLayer?.config?.dotsEnabled ?? false}
                                                onChange={(val) => {
                                                    if (val) {
                                                        updateLayer(activeLayer.id, {
                                                            config: {
                                                                ...activeLayer.config,
                                                                dotsEnabled: true,
                                                                dotOffset: true,
                                                                dotType: 'outlined',
                                                                dotSize: 10
                                                            }
                                                        });
                                                    } else {
                                                        setConfigValue('dotsEnabled', false);
                                                    }
                                                }}
                                                label="DOTS"
                                            />
                                        </div>
                                        {activeLayer?.config?.dotsEnabled && (
                                            <select
                                                value={activeLayer?.config?.dotType}
                                                onChange={(e) => setConfigValue('dotType', e.target.value)}
                                                className="bg-[#1A1A1A] text-[9px] text-white p-0.5 rounded border border-white/10 w-16 h-5"
                                            >
                                                <option value="filled">Filled</option>
                                                <option value="outlined">Outline</option>
                                            </select>
                                        )}
                                    </div>
                                    {activeLayer?.config?.dotsEnabled && (
                                        <div className="space-y-1 px-1 pb-1 border-l-2 border-white/5 ml-1 pl-2">
                                            <ControlSlider label="Dot Size" value={activeLayer?.config?.dotSize || 10} min={1} max={20} step={0.5} onChange={(v: number, skip?: boolean) => setConfigValue('dotSize', v, skip)} isFixed />
                                            <ModernToggle
                                                checked={activeLayer?.config?.dotOffset ?? false}
                                                onChange={(val, skip?: boolean) => setConfigValue('dotOffset', val, skip)}
                                                label="APPLY OFFSET"
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* 3. EFFECTS */}
                <div className="flex flex-col border-t border-white/5">
                    <SectionHeader title="EFFECTS" expanded={expandedSections.effects ?? false} onToggle={() => toggleSection('effects')} />
                    {(expandedSections.effects ?? false) && (
                        <div className="p-3 space-y-2 animate-in slide-in-from-top-1 duration-300">
                            <ControlSlider
                                label="Blur"
                                value={getAnimValue('blur')}
                                min={0} max={20} step={0.1}
                                onChange={(v: number, skip?: boolean) => setAnimValue('blur', v, skip)}
                                disabled={!activeKeyframe}
                            />
                            <ControlSlider
                                label="Glow"
                                value={getAnimValue('glowStrength')}
                                min={0} max={10} step={0.1}
                                onChange={(v: number, skip?: boolean) => setAnimValue('glowStrength', v, skip)}
                                disabled={!activeKeyframe}
                            />
                            <ControlSlider
                                label="Noise"
                                value={getAnimValue('noise')}
                                min={0} max={1} step={0.01}
                                onChange={(v: number, skip?: boolean) => setAnimValue('noise', v, skip)}
                                disabled={!activeKeyframe}
                            />
                            <ControlSlider
                                label="Wavy"
                                value={getAnimValue('displacementScale')}
                                min={0} max={200} step={1}
                                onChange={(v: number, skip?: boolean) => setAnimValue('displacementScale', v, skip)}
                                disabled={!activeKeyframe}
                            />
                            <ControlSlider
                                label="Shockwave"
                                value={getAnimValue('shockwaveTime')}
                                min={0} max={1} step={0.01}
                                onChange={(v: number, skip?: boolean) => setAnimValue('shockwaveTime', v, skip)}
                                disabled={!activeKeyframe}
                            />
                            <ControlSlider
                                label="Twist"
                                value={getAnimValue('twistAngle')}
                                min={-10} max={10} step={0.1}
                                onChange={(v: number, skip?: boolean) => setAnimValue('twistAngle', v, skip)}
                                disabled={!activeKeyframe}
                            />
                            {getAnimValue('twistAngle') !== 0 && (
                                <div className="pl-2 border-l border-white/10 ml-1 space-y-1">
                                    <ControlSlider label="Radius" value={getAnimValue('twistRadius')} min={10} max={1000} step={10} onChange={(v: number, skip?: boolean) => setAnimValue('twistRadius', v, skip)} disabled={!activeKeyframe} />
                                    <div className="flex gap-1">
                                        <ControlSlider label="X" value={getAnimValue('twistOffsetX')} min={-500} max={500} step={10} onChange={(v: number, skip?: boolean) => setAnimValue('twistOffsetX', v, skip)} disabled={!activeKeyframe} />
                                        <ControlSlider label="Y" value={getAnimValue('twistOffsetY')} min={-500} max={500} step={10} onChange={(v: number, skip?: boolean) => setAnimValue('twistOffsetY', v, skip)} disabled={!activeKeyframe} />
                                    </div>
                                </div>
                            )}

                            <ControlSlider
                                label="Bulge"
                                value={getAnimValue('bulgeStrength')}
                                min={-10} max={10} step={0.01}
                                onChange={(v: number, skip?: boolean) => setAnimValue('bulgeStrength', v, skip)}
                                disabled={!activeKeyframe}
                            />
                            {getAnimValue('bulgeStrength') !== 0 && (
                                <div className="pl-2 border-l border-white/10 ml-1 space-y-1">
                                    <ControlSlider label="Radius" value={getAnimValue('bulgeRadius')} min={0} max={600} step={1} onChange={(v: number, skip?: boolean) => setAnimValue('bulgeRadius', v, skip)} disabled={!activeKeyframe} />
                                    <div className="flex gap-1">
                                        <ControlSlider label="X" value={getAnimValue('bulgeCenterX')} min={-500} max={500} step={1} onChange={(v: number, skip?: boolean) => setAnimValue('bulgeCenterX', v, skip)} disabled={!activeKeyframe} />
                                        <ControlSlider label="Y" value={getAnimValue('bulgeCenterY')} min={-500} max={500} step={1} onChange={(v: number, skip?: boolean) => setAnimValue('bulgeCenterY', v, skip)} disabled={!activeKeyframe} />
                                    </div>
                                </div>
                            )}

                            <ControlSlider
                                label="Motion Blur"
                                value={getAnimValue('motionBlurStrength')}
                                min={0} max={10} step={0.1}
                                onChange={(v: number, skip?: boolean) => setAnimValue('motionBlurStrength', v, skip)}
                                disabled={!activeKeyframe}
                            />

                            {/* Advanced Bloom */}
                            <div className="flex flex-col mt-2 pt-2 border-t border-white/5">
                                <ControlSlider
                                    label="Bloom"
                                    value={getAnimValue('bloomStrength')}
                                    min={0} max={5} step={0.1}
                                    onChange={(v: number, skip?: boolean) => setAnimValue('bloomStrength', v, skip)}
                                    disabled={!activeKeyframe}
                                />
                                {getAnimValue('bloomStrength') > 0 && (
                                    <div className="pl-2 border-l border-white/10 ml-1 space-y-1">
                                        <ControlSlider label="Threshold" value={getAnimValue('bloomThreshold')} min={0} max={1} step={0.01} onChange={(v: number, skip?: boolean) => setAnimValue('bloomThreshold', v, skip)} disabled={!activeKeyframe} />
                                        <ControlSlider label="Radius" value={getAnimValue('bloomRadius')} min={0} max={20} step={0.5} onChange={(v: number, skip?: boolean) => setAnimValue('bloomRadius', v, skip)} disabled={!activeKeyframe} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>


                {/* 4. INSTANCES (Consolidated Layout) - Hide for Groups */}
                {activeLayer?.type !== 'group' && (
                    <div className="flex flex-col border-t border-white/5">
                        <SectionHeader title="INSTANCES" expanded={expandedSections.layout ?? true} onToggle={() => toggleSection('layout')} />
                        {(expandedSections.layout ?? true) && (
                            <div className="p-3 space-y-2">
                                {/* COUNT */}
                                <ControlSlider
                                    label="Count"
                                    tooltip="Number of instances"
                                    value={
                                        activeLayer?.type === 'astrology' ? 12
                                            : activeLayer?.type === 'amino' ? 20
                                                : activeLayer?.type === 'iching_lines' ? 64
                                                    : activeLayer?.type === 'asset_set'
                                                        ? Math.max(1, (activeLayer?.config?.assetFolderId ? (assetsByFolder[activeLayer.config.assetFolderId]?.length ?? 0) : 0))
                                                        : activeLayer?.config?.instances
                                    }
                                    min={1} max={100} step={1} icon={<Hash size={12} />}
                                    onChange={(v: number, skip?: boolean) => setConfigValue('instances', v, skip)}
                                    isFixed
                                    disabled={activeLayer?.type === 'astrology' || activeLayer?.type === 'amino' || activeLayer?.type === 'iching_lines' || activeLayer?.type === 'asset_set'}
                                />

                                {/* RADIAL LAYOUT */}
                                <div className="mt-3 pt-2 border-t border-white/5">
                                    <div className="text-[9px] uppercase font-bold text-white/30 tracking-wider mb-1.5">Radial Layout</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <ControlSlider label="Radius" tooltip="Distance of each instance from the layer's center" value={getAnimValue('orbitRadius')} icon={<Timer size={12} />} onChange={(v: number, skip?: boolean) => setAnimValue('orbitRadius', v, skip)} disabled={!activeKeyframe} />
                                        <ControlSlider label="Arc" tooltip="Total angle swept across all instances (degrees; negative reverses direction)" value={activeLayer.config.radialArc ?? 360} min={-360} max={360} onChange={(v: number, skip?: boolean) => setConfigValue('radialArc', v, skip)} isFixed />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-1 items-center">
                                        <ControlSlider label="Start" tooltip="Starting angle of the first instance (degrees)" value={getAnimValue('rotateOrbit')} icon={<Shuffle size={12} />} onChange={(v: number, skip?: boolean) => setAnimValue('rotateOrbit', v, skip)} disabled={!activeKeyframe} />
                                        <ModernToggle
                                            checked={activeLayer?.config?.alignToPath}
                                            onChange={(val, skip?: boolean) => setConfigValue('alignToPath', val, skip)}
                                            label="ALIGN PATH"
                                            tooltip="Rotate each instance to face along the orbit ring"
                                        />
                                    </div>
                                </div>

                                {/* LINEAR OFFSET */}
                                <div className="mt-3 pt-2 border-t border-white/5">
                                    <div className="text-[9px] uppercase font-bold text-white/30 tracking-wider mb-1.5">Linear Offset</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <ControlSlider label="Spacing X" tooltip="Adds N pixels in X per instance (accumulates)" value={getAnimValue('spacingX')} icon={<Move size={12} />} onChange={(v: number, skip?: boolean) => setAnimValue('spacingX', v, skip)} disabled={!activeKeyframe} />
                                        <ControlSlider label="Spacing Y" tooltip="Adds N pixels in Y per instance (accumulates)" value={getAnimValue('spacingY')} icon={<Move size={12} className="rotate-90" />} onChange={(v: number, skip?: boolean) => setAnimValue('spacingY', v, skip)} disabled={!activeKeyframe} />
                                    </div>
                                </div>

                                {/* PER-INSTANCE */}
                                <div className="mt-3 pt-2 border-t border-white/5">
                                    <div className="text-[9px] uppercase font-bold text-white/30 tracking-wider mb-1.5">Per-Instance</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <ControlSlider label="Rotation" tooltip="Rotate each instance N° more than the last" value={getAnimValue('instanceRotation')} icon={<RotateCw size={12} />} onChange={(v: number, skip?: boolean) => setAnimValue('instanceRotation', v, skip)} disabled={!activeKeyframe} />
                                        <ControlSlider label="Rot Grow" tooltip="Compounds Rotation across instances (0 = linear, >0 accelerates)" value={getAnimValue('instanceRotationMult')} step={0.01} icon={<TrendingUp size={12} />} onChange={(v: number, skip?: boolean) => setAnimValue('instanceRotationMult', v, skip)} disabled={!activeKeyframe} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-1">
                                        <ControlSlider label="Size Step" tooltip="Each instance's shape is N pixels larger than the last" value={getAnimValue('radiusOffset')} icon={<Move size={12} />} onChange={(v: number, skip?: boolean) => setAnimValue('radiusOffset', v, skip)} disabled={!activeKeyframe} />
                                        <ControlSlider label="Size Grow" tooltip="Compounds Size Step across instances (0 = linear, >0 accelerates)" value={getAnimValue('offsetMult')} step={0.01} icon={<TrendingUp size={12} />} onChange={(v: number, skip?: boolean) => setAnimValue('offsetMult', v, skip)} disabled={!activeKeyframe} />
                                    </div>
                                </div>

                                {/* RECURSIVE INSTANCES */}
                                <div className="mt-4 pt-2 border-t border-white/5">
                                    {!activeLayer.config.instances2 ? (
                                        <button
                                            onClick={() => setConfigValue('instances2', 2)}
                                            className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-[10px] text-white/50 hover:text-white py-1.5 rounded transition-colors uppercase font-bold"
                                        >
                                            <Plus size={12} />
                                            Add Recursive Instances
                                        </button>
                                    ) : (
                                        <div className="space-y-2 animate-in slide-in-from-top-1">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="text-[10px] font-bold text-white/90">RECURSIVE GROUP</div>
                                                <button
                                                    onClick={() => setConfigValue('instances2', undefined)}
                                                    className="p-1 hover:bg-white/10 rounded text-white/30 hover:text-red-400 transition-colors"
                                                    title="Remove Recursive Instances"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>

                                            {/* Count 2 */}
                                            <ControlSlider label="Count" tooltip="Number of recursive instances" value={activeLayer?.config?.instances2 || 1} min={1} max={100} step={1} icon={<Hash size={12} />} onChange={(v: number, skip?: boolean) => setConfigValue('instances2', v, skip)} isFixed />

                                            {/* RADIAL LAYOUT 2 */}
                                            <div className="mt-3 pt-2 border-t border-white/5">
                                                <div className="text-[9px] uppercase font-bold text-white/30 tracking-wider mb-1.5">Radial Layout</div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <ControlSlider label="Radius" tooltip="Distance of each instance from the layer's center" value={getAnimValue('orbitRadius2')} icon={<Timer size={12} />} onChange={(v: number, skip?: boolean) => setAnimValue('orbitRadius2', v, skip)} disabled={!activeKeyframe} />
                                                    <ControlSlider label="Arc" tooltip="Total angle swept across all instances (degrees; negative reverses direction)" value={activeLayer.config.radialArc2 ?? 360} min={-360} max={360} onChange={(v: number, skip?: boolean) => setConfigValue('radialArc2', v, skip)} isFixed />
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 mt-1 items-center">
                                                    <ControlSlider label="Start" tooltip="Starting angle of the first instance (degrees)" value={getAnimValue('rotateOrbit2')} icon={<Shuffle size={12} />} onChange={(v: number, skip?: boolean) => setAnimValue('rotateOrbit2', v, skip)} disabled={!activeKeyframe} />
                                                    <ModernToggle
                                                        checked={activeLayer?.config?.alignToPath2 ?? false}
                                                        onChange={(val, skip?: boolean) => setConfigValue('alignToPath2', val, skip)}
                                                        label="ALIGN PATH"
                                                        tooltip="Rotate each instance to face along the orbit ring"
                                                    />
                                                </div>
                                            </div>

                                            {/* LINEAR OFFSET 2 */}
                                            <div className="mt-3 pt-2 border-t border-white/5">
                                                <div className="text-[9px] uppercase font-bold text-white/30 tracking-wider mb-1.5">Linear Offset</div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <ControlSlider label="Spacing X" tooltip="Adds N pixels in X per instance (accumulates)" value={getAnimValue('spacingX2')} icon={<Move size={12} />} onChange={(v: number, skip?: boolean) => setAnimValue('spacingX2', v, skip)} disabled={!activeKeyframe} />
                                                    <ControlSlider label="Spacing Y" tooltip="Adds N pixels in Y per instance (accumulates)" value={getAnimValue('spacingY2')} icon={<Move size={12} className="rotate-90" />} onChange={(v: number, skip?: boolean) => setAnimValue('spacingY2', v, skip)} disabled={!activeKeyframe} />
                                                </div>
                                            </div>

                                            {/* PER-INSTANCE 2 */}
                                            <div className="mt-3 pt-2 border-t border-white/5">
                                                <div className="text-[9px] uppercase font-bold text-white/30 tracking-wider mb-1.5">Per-Instance</div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <ControlSlider label="Rotation" tooltip="Rotate each instance N° more than the last" value={getAnimValue('instanceRotation2')} icon={<RotateCw size={12} />} onChange={(v: number, skip?: boolean) => setAnimValue('instanceRotation2', v, skip)} disabled={!activeKeyframe} />
                                                    <ControlSlider label="Rot Grow" tooltip="Compounds Rotation across instances (0 = linear, >0 accelerates)" value={getAnimValue('instanceRotationMult2')} step={0.01} icon={<TrendingUp size={12} />} onChange={(v: number, skip?: boolean) => setAnimValue('instanceRotationMult2', v, skip)} disabled={!activeKeyframe} />
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 mt-1">
                                                    <ControlSlider label="Size Step" tooltip="Each instance's shape is N pixels larger than the last" value={getAnimValue('radiusOffset2')} icon={<Move size={12} />} onChange={(v: number, skip?: boolean) => setAnimValue('radiusOffset2', v, skip)} disabled={!activeKeyframe} />
                                                    <ControlSlider label="Size Grow" tooltip="Compounds Size Step across instances (0 = linear, >0 accelerates)" value={getAnimValue('offsetMult2')} step={0.01} icon={<TrendingUp size={12} />} onChange={(v: number, skip?: boolean) => setAnimValue('offsetMult2', v, skip)} disabled={!activeKeyframe} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 5. SYMMETRY - Hide for Groups */}
                {activeLayer?.type !== 'group' && (
                    <div className="flex flex-col border-t border-white/5">
                        <SectionHeader title="SYMMETRY" expanded={expandedSections.symmetry} onToggle={() => toggleSection('symmetry')} />
                        {expandedSections.symmetry && (
                            <div className="p-3 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={activeLayer.symmetry?.enabled ?? false}
                                            onChange={(e) => updateLayer(activeLayer.id, { symmetry: { ...activeLayer.symmetry, enabled: e.target.checked } })}
                                            className="rounded border-white/20 bg-black/50 text-[#D4AF37]"
                                        />
                                        <label className={`text-[9px] uppercase font-bold transition-colors ${activeLayer.symmetry?.enabled ? 'text-white/90' : 'text-white/30'}`}>Enable Symmetry</label>
                                    </div>
                                </div>

                                {activeLayer.symmetry?.enabled && (
                                    <div className="space-y-3 animate-in slide-in-from-top-1 duration-300">
                                        <div>
                                            <label className="text-[9px] uppercase font-bold text-white/40 block mb-1.5">Mode</label>
                                            <select
                                                value={activeLayer.symmetry?.mode || '3-way'}
                                                onChange={(e) => updateLayer(activeLayer.id, { symmetry: { ...activeLayer.symmetry, mode: e.target.value as any } })}
                                                className="w-full bg-[#1A1A1A] text-[10px] text-white p-1.5 rounded border border-white/10 focus:border-[#D4AF37] focus:outline-none"
                                            >
                                                <option value="3-way">3-Way (Kaleidoscope)</option>
                                                <option value="6-way">6-Way (Hexagonal)</option>
                                                <option value="horizontal">Horizontal Mirror</option>
                                                <option value="vertical">Vertical Mirror</option>
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="flex items-center gap-2 p-2 bg-white/5 rounded border border-white/5 hover:border-white/10 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={activeLayer.symmetry?.masked ?? false}
                                                    onChange={(e) => updateLayer(activeLayer.id, { symmetry: { ...activeLayer.symmetry, masked: e.target.checked } })}
                                                    className="rounded border-white/20 bg-black/50 text-[#D4AF37]"
                                                />
                                                <label className="text-[9px] uppercase font-bold text-white/80">Masked</label>
                                            </div>

                                            <div className="flex items-center gap-2 p-2 bg-white/5 rounded border border-white/5 hover:border-white/10 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={activeLayer.symmetry?.mirrorSegments ?? false}
                                                    onChange={(e) => updateLayer(activeLayer.id, { symmetry: { ...activeLayer.symmetry, mirrorSegments: e.target.checked } })}
                                                    className="rounded border-white/20 bg-black/50 text-[#D4AF37]"
                                                />
                                                <label className="text-[9px] uppercase font-bold text-white/80">Mirror Segs</label>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* 6. GLOBAL ROTATION - Hide for Groups (Redundant with Transform) */}
                {activeLayer?.type !== 'group' && (
                    <div className="flex flex-col border-t border-white/5">
                        <SectionHeader title="GLOBAL ROTATION" expanded={expandedSections.globalRotation} onToggle={() => toggleSection('globalRotation')} />
                        {expandedSections.globalRotation && (
                            <div className="p-3">
                                <ControlSlider label="Global Rotate" value={getAnimValue('rotateLayer')} min={0} max={720} onChange={(v: number, skip?: boolean) => setAnimValue('rotateLayer', v, skip)} disabled={!activeKeyframe} />
                            </div>
                        )}
                    </div>
                )}



                {/* 7. EASING */}
                {activeLayer && activeKeyframe && (
                    <div className="flex flex-col border-t border-white/5">
                        <SectionHeader title="EASING" expanded={expandedSections.easing} onToggle={() => toggleSection('easing')} />
                        {expandedSections.easing && (
                            <div className="p-3 space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                    {/* Left Editor: Previous Keyframe -> Current Keyframe */}
                                    {(() => {
                                        const index = activeLayer.keyframes.findIndex(k => k.id === activeKeyframeId);
                                        const prevKeyframe = index > 0 ? activeLayer.keyframes[index - 1] : null;

                                        // Helper to get bezier values
                                        const getConfig = (kf: any) => {
                                            if (kf?.easing === 'custom' && kf.bezier) return kf.bezier;
                                            if (kf?.easing === 'linear') return [0, 0, 1, 1];
                                            if (kf?.easing === 'easeInQuad') return [0.55, 0.085, 0.68, 0.53];
                                            if (kf?.easing === 'easeOutQuad') return [0.25, 0.46, 0.45, 0.94];
                                            if (kf?.easing === 'easeInOutQuad') return [0.455, 0.03, 0.515, 0.955];
                                            return [0.42, 0, 0.58, 1]; // Default Ease
                                        };

                                        // Handler for Preset Selection
                                        const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
                                            const val = e.target.value;
                                            if (!prevKeyframe) return;
                                            let newBezier = [0.42, 0, 0.58, 1];
                                            if (val === 'linear') newBezier = [0, 0, 1, 1];
                                            if (val === 'easeIn') newBezier = [0.42, 0, 1, 1];
                                            if (val === 'easeOut') newBezier = [0, 0, 0.58, 1];
                                            if (val === 'easeInOut') newBezier = [0.42, 0, 0.58, 1];
                                            if (val === 'easeInQuad') newBezier = [0.55, 0.085, 0.68, 0.53];
                                            if (val === 'easeOutQuad') newBezier = [0.25, 0.46, 0.45, 0.94];
                                            if (val === 'easeInOutQuad') newBezier = [0.455, 0.03, 0.515, 0.955];
                                            if (val === 'easeInCubic') newBezier = [0.55, 0.055, 0.675, 0.19];
                                            if (val === 'easeOutCubic') newBezier = [0.215, 0.61, 0.355, 1];
                                            if (val === 'easeInOutCubic') newBezier = [0.645, 0.045, 0.355, 1];

                                            updateKeyframe(activeLayer.id, prevKeyframe.id, { easing: 'custom', bezier: newBezier as any });
                                        };

                                        const isDisabled = !prevKeyframe;
                                        const currentVal = getConfig(prevKeyframe);

                                        return (
                                            <div className={`flex flex-col items-center ${isDisabled ? 'opacity-30 pointer-events-none' : ''}`}>
                                                <div className="flex items-center justify-between w-full mb-1">
                                                    <span className="text-[8px] uppercase font-bold text-white/30">In (Prev)</span>
                                                    <select
                                                        onChange={handlePresetChange}
                                                        className="bg-[#1A1A1A] text-[8px] text-white/60 p-0.5 rounded border border-white/10 w-14 focus:outline-none"
                                                        defaultValue="custom"
                                                    >
                                                        <option value="custom">Preset...</option>
                                                        <option value="linear">Linear</option>
                                                        <option value="easeIn">Ease In</option>
                                                        <option value="easeOut">Ease Out</option>
                                                        <option value="easeInOut">Ease InOut</option>
                                                        <option value="easeInQuad">In Quad</option>
                                                        <option value="easeOutQuad">Out Quad</option>
                                                        <option value="easeInOutQuad">InOut Quad</option>
                                                        <option value="easeInCubic">In Cubic</option>
                                                        <option value="easeOutCubic">Out Cubic</option>
                                                        <option value="easeInOutCubic">InOut Cubic</option>
                                                    </select>
                                                </div>
                                                <BezierEditor
                                                    value={currentVal as any}
                                                    onChange={(val) => {
                                                        if (prevKeyframe) {
                                                            updateKeyframe(activeLayer.id, prevKeyframe.id, { easing: 'custom', bezier: val });
                                                        }
                                                    }}
                                                    disabled={index === 0}
                                                />
                                            </div>
                                        );
                                    })()}

                                    {/* Right Editor: Current Keyframe -> Next Keyframe */}
                                    {(() => {
                                        const index = activeLayer.keyframes.findIndex(k => k.id === activeKeyframeId);
                                        const isLast = index === activeLayer.keyframes.length - 1;

                                        // Helper to get bezier values
                                        const getConfig = (kf: any) => {
                                            if (kf?.easing === 'custom' && kf.bezier) return kf.bezier;
                                            if (kf?.easing === 'linear') return [0, 0, 1, 1];
                                            if (kf?.easing === 'easeInQuad') return [0.55, 0.085, 0.68, 0.53];
                                            if (kf?.easing === 'easeOutQuad') return [0.25, 0.46, 0.45, 0.94];
                                            if (kf?.easing === 'easeInOutQuad') return [0.455, 0.03, 0.515, 0.955];
                                            return [0.42, 0, 0.58, 1]; // Default Ease
                                        };

                                        // Handler for Preset Selection
                                        const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
                                            const val = e.target.value;
                                            let newBezier = [0.42, 0, 0.58, 1];
                                            if (val === 'linear') newBezier = [0, 0, 1, 1];
                                            if (val === 'easeIn') newBezier = [0.42, 0, 1, 1];
                                            if (val === 'easeOut') newBezier = [0, 0, 0.58, 1];
                                            if (val === 'easeInOut') newBezier = [0.42, 0, 0.58, 1];
                                            if (val === 'easeInQuad') newBezier = [0.55, 0.085, 0.68, 0.53];
                                            if (val === 'easeOutQuad') newBezier = [0.25, 0.46, 0.45, 0.94];
                                            if (val === 'easeInOutQuad') newBezier = [0.455, 0.03, 0.515, 0.955];
                                            if (val === 'easeInCubic') newBezier = [0.55, 0.055, 0.675, 0.19];
                                            if (val === 'easeOutCubic') newBezier = [0.215, 0.61, 0.355, 1];
                                            if (val === 'easeInOutCubic') newBezier = [0.645, 0.045, 0.355, 1];

                                            updateKeyframe(activeLayer.id, activeKeyframe.id, { easing: 'custom', bezier: newBezier as any });
                                        };

                                        const currentVal = getConfig(activeKeyframe);

                                        return (
                                            <div className={`flex flex-col items-center ${isLast ? 'opacity-30 pointer-events-none' : ''}`}>
                                                <div className="flex items-center justify-between w-full mb-1">
                                                    <span className="text-[8px] uppercase font-bold text-white/30">Out (Next)</span>
                                                    <select
                                                        onChange={handlePresetChange}
                                                        className="bg-[#1A1A1A] text-[8px] text-white/60 p-0.5 rounded border border-white/10 w-14 focus:outline-none"
                                                        defaultValue="custom"
                                                    >
                                                        <option value="custom">Preset...</option>
                                                        <option value="linear">Linear</option>
                                                        <option value="easeIn">Ease In</option>
                                                        <option value="easeOut">Ease Out</option>
                                                        <option value="easeInOut">Ease InOut</option>
                                                        <option value="easeInQuad">In Quad</option>
                                                        <option value="easeOutQuad">Out Quad</option>
                                                        <option value="easeInOutQuad">InOut Quad</option>
                                                        <option value="easeInCubic">In Cubic</option>
                                                        <option value="easeOutCubic">Out Cubic</option>
                                                        <option value="easeInOutCubic">InOut Cubic</option>
                                                    </select>
                                                </div>
                                                <BezierEditor
                                                    value={currentVal as any}
                                                    onChange={(val) => {
                                                        updateKeyframe(activeLayer.id, activeKeyframe.id, { easing: 'custom', bezier: val });
                                                    }}
                                                    disabled={isLast}
                                                />
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 8. LAYER PROPERTIES */}
                {activeLayer && (
                    <div className="flex flex-col border-t border-white/5">
                        <SectionHeader title="LAYER PROPERTIES" expanded={expandedSections.layerProps} onToggle={() => toggleSection('layerProps')} />
                        {expandedSections.layerProps && (
                            <div className="p-3 space-y-3">
                                {/* Loop / Hold */}
                                <div className="flex items-center justify-between mb-2 border-b border-white/5 pb-2">
                                    <div className="flex items-center gap-4">
                                        <ModernToggle
                                            checked={activeLayer.config.loopIndependently ?? false}
                                            onChange={(val, skip?: boolean) => setConfigValue('loopIndependently', val, skip)}
                                            label="LOOP"
                                            icon={<RotateCw size={10} />}
                                        />
                                        <ModernToggle
                                            checked={activeLayer.config.persistVisible ?? false}
                                            onChange={(val, skip?: boolean) => setConfigValue('persistVisible', val, skip)}
                                            label="HOLD"
                                            icon={<Anchor size={10} />}
                                        />
                                    </div>
                                </div>

                                {/* Fade In */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <ModernToggle
                                            checked={activeLayer.fadeIn?.enabled ?? false}
                                            onChange={(val) => updateLayer(activeLayer.id, { fadeIn: { ...activeLayer.fadeIn, enabled: val } })}
                                            label="FADE IN"
                                        />
                                    </div>
                                    <div className="flex items-center gap-1 w-16">
                                        <input
                                            type="number"
                                            value={activeLayer.fadeIn?.duration ?? 0}
                                            onChange={(e) => updateLayer(activeLayer.id, { fadeIn: { ...activeLayer.fadeIn, duration: parseFloat(e.target.value) } })}
                                            className="w-full bg-[#1A1A1A] text-[9px] text-white p-1 rounded border border-white/10 text-right"
                                            step={0.1}
                                            min={0}
                                            disabled={!activeLayer.fadeIn?.enabled}
                                        />
                                        <span className="text-[8px] text-white/30">s</span>
                                    </div>
                                </div>

                                {/* Fade Out */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <ModernToggle
                                            checked={activeLayer.fadeOut?.enabled ?? false}
                                            onChange={(val) => updateLayer(activeLayer.id, { fadeOut: { ...activeLayer.fadeOut, enabled: val } })}
                                            label="FADE OUT"
                                        />
                                    </div>
                                    <div className="flex items-center gap-1 w-16">
                                        <input
                                            type="number"
                                            value={activeLayer.fadeOut?.duration ?? 0}
                                            onChange={(e) => updateLayer(activeLayer.id, { fadeOut: { ...activeLayer.fadeOut, duration: parseFloat(e.target.value) } })}
                                            className="w-full bg-[#1A1A1A] text-[9px] text-white p-1 rounded border border-white/10 text-right"
                                            step={0.1}
                                            min={0}
                                            disabled={!activeLayer.fadeOut?.enabled}
                                        />
                                        <span className="text-[8px] text-white/30">s</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}



            </div >
        </div >
    );
};

export default Inspector;
