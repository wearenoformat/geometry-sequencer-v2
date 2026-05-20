import React, { useEffect, useState, useMemo } from 'react';
import { Plus, Folder as FolderIcon, Clock, Copy, Edit2, Trash2, ArrowRight, Play, ChevronRight, ChevronDown, FolderPlus, Share2, LogOut, User as UserIcon, GripVertical, LayoutGrid, List, RefreshCw, ArrowDownAZ } from 'lucide-react';
import { useStore } from '../store/useStore';
import { formatDistanceToNow } from 'date-fns';
import GeometryCanvas from './GeometryCanvas';
import ExportModal from './ExportModal';
import BatchExportModal from './BatchExportModal';
import AssetLibrary from './AssetLibrary';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    useDroppable,
    type DragEndEvent,
    type DragStartEvent
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- Draggable Project Item ---
// --- Drop Indicator ---
const DropIndicator = ({ active }: { active: boolean }) => {
    if (!active) return null;
    return (
        <div className="h-0.5 w-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.5)] z-50 my-0.5 relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
        </div>
    );
};

// --- Draggable Project Item ---
const ProjectItem = ({ project, isOverlay = false, isInFolder = false, dropIndicator = null }: {
    project: any,
    isOverlay?: boolean,
    isInFolder?: boolean,
    dropIndicator?: 'before' | 'after' | null
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: project.id, data: { type: 'project', project } });

    const style = {
        transform: isDragging ? CSS.Transform.toString(transform) : undefined, // Don't move other items
        transition,
        opacity: isDragging ? 0.3 : 1,
        zIndex: isDragging ? 100 : 1,
    };

    const currentProject = useStore(s => s.project);
    const loadProject = useStore(s => s.loadProject);
    const setIsPlaying = useStore(s => s.setIsPlaying);
    const setView = useStore(s => s.setView);
    const duplicateProject = useStore(s => s.duplicateProject);
    const deleteProject = useStore(s => s.deleteProject);
    const renameProject = useStore(s => s.renameProject);
    const thumbnailUrl = useStore(s => s.projectThumbnails[project.id]);

    const [isRenaming, setIsRenaming] = useState(false);
    const [newName, setNewName] = useState(project.name);
    const [isDeleting, setIsDeleting] = useState(false);

    const isSelected = currentProject?.id === project.id;

    const handleRenameSubmit = async () => {
        if (newName.trim() && newName !== project.name) {
            await renameProject(project.id, newName.trim());
        }
        setIsRenaming(false);
    };

    const handleEditClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (currentProject?.id === project.id) {
            setView('editor');
        } else {
            loadProject(project.id, 'editor');
        }
    };

    const handleProjectClick = async () => {
        await loadProject(project.id, 'dashboard');
        setIsPlaying(true);
    };

    return (
        <div ref={setNodeRef} style={style}>
            {dropIndicator === 'before' && <DropIndicator active={true} />}
            <div
                className={`group relative p-2 rounded-lg border transition-all mb-1 ${isInFolder ? 'ml-8' : ''} ${isSelected
                    ? 'bg-[#252525] border-[#D4AF37]/50 shadow-md'
                    : 'bg-transparent border-transparent hover:bg-[#252525] hover:border-white/5'
                    } ${isOverlay ? 'bg-[#252525] border-[#D4AF37] shadow-2xl scale-105 z-50' : ''}`}
                onClick={handleProjectClick}
            >
                <div className="flex justify-between items-center h-6">
                    <div className="flex-grow flex items-center min-w-0 pr-2">
                        {/* Drag Handle */}
                        <div
                            {...attributes}
                            {...listeners}
                            className={`cursor-grab active:cursor-grabbing text-white/20 hover:text-white/50 p-1 -ml-2 mr-1 transition-opacity ${isOverlay ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <GripVertical size={12} />
                        </div>
                        {isRenaming ? (
                            <input
                                autoFocus
                                className="bg-[#1a1a1a] border border-[#D4AF37]/50 rounded px-2 py-0.5 text-xs font-bold w-full focus:outline-none"
                                value={newName}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                                onChange={(e) => setNewName(e.target.value)}
                                onBlur={handleRenameSubmit}
                                onKeyDownCapture={(e) => {
                                    if (e.key === 'Enter') handleRenameSubmit();
                                    if (e.key === 'Escape') setIsRenaming(false);
                                }}
                            />
                        ) : (
                            <div className="flex items-center gap-2 min-w-0">
                                <ArrowRight size={10} className={`${isSelected ? 'text-[#D4AF37]' : 'text-white/20'} shrink-0`} />
                                {thumbnailUrl ? (
                                    <img
                                        src={thumbnailUrl}
                                        alt=""
                                        className="w-8 h-5 object-cover rounded-sm bg-black border border-white/5 shrink-0"
                                        loading="lazy"
                                    />
                                ) : null}
                                <h3 className={`font-bold text-xs truncate ${isSelected ? 'text-white' : 'text-white/70 group-hover:text-white'}`}>
                                    {project.name}
                                </h3>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {isDeleting ? (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => deleteProject(project.id)} className="text-[10px] text-red-500 font-bold hover:underline">CONFIRM</button>
                                <button onClick={() => setIsDeleting(false)} className="text-[10px] text-white/50 hover:text-white">CANCEL</button>
                            </div>
                        ) : (
                            <>
                                <div className={`flex items-center gap-1 transition-all ${isSelected || isOverlay ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                    <button className="p-1 hover:text-white text-white/30" onClick={(e) => { e.stopPropagation(); setIsRenaming(true); }}><Edit2 size={12} /></button>
                                    <button className="p-1 hover:text-white text-white/30" onClick={(e) => { e.stopPropagation(); duplicateProject(project.id); }}><Copy size={12} /></button>
                                    <button className="p-1 hover:text-red-400 text-white/30" onClick={(e) => { e.stopPropagation(); setIsDeleting(true); }}><Trash2 size={12} /></button>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleEditClick(e); }}
                                    className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold transition-all ${isSelected
                                        ? 'bg-[#D4AF37] text-black shadow-[0_0_10px_rgba(212,175,55,0.2)]'
                                        : 'bg-white/10 text-white opacity-0 group-hover:opacity-100 hover:bg-white/20'
                                        }`}
                                >
                                    OPEN
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
            {dropIndicator === 'after' && <DropIndicator active={true} />}
        </div>
    );
};


// --- Grid view: card with thumbnail ---
const ProjectCard = ({ project }: { project: any }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: project.id,
        data: { type: 'project', project },
    });
    const style = {
        transform: isDragging ? CSS.Transform.toString(transform) : undefined,
        transition,
        opacity: isDragging ? 0.3 : 1,
        zIndex: isDragging ? 100 : 1,
    };

    const currentProject = useStore(s => s.project);
    const loadProject = useStore(s => s.loadProject);
    const setIsPlaying = useStore(s => s.setIsPlaying);
    const setView = useStore(s => s.setView);
    const duplicateProject = useStore(s => s.duplicateProject);
    const deleteProject = useStore(s => s.deleteProject);
    const renameProject = useStore(s => s.renameProject);
    const thumbnailUrl = useStore(s => s.projectThumbnails[project.id]);

    const [isRenaming, setIsRenaming] = useState(false);
    const [newName, setNewName] = useState(project.name);
    const [isDeleting, setIsDeleting] = useState(false);

    const isSelected = currentProject?.id === project.id;

    const handleRenameSubmit = async () => {
        if (newName.trim() && newName !== project.name) {
            await renameProject(project.id, newName.trim());
        }
        setIsRenaming(false);
    };

    const handleCardClick = async () => {
        await loadProject(project.id, 'dashboard');
        setIsPlaying(true);
    };

    const handleOpenEditor = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (currentProject?.id === project.id) {
            setView('editor');
        } else {
            loadProject(project.id, 'editor');
        }
    };

    return (
        <div ref={setNodeRef} style={style}>
            <div
                onClick={handleCardClick}
                className={`group relative rounded-lg border overflow-hidden cursor-pointer transition-all ${
                    isSelected
                        ? 'border-[#D4AF37]/60 shadow-[0_0_15px_rgba(212,175,55,0.15)]'
                        : 'border-white/5 hover:border-white/20'
                }`}
            >
                {/* Thumbnail / placeholder */}
                <div className="aspect-video bg-black relative">
                    {thumbnailUrl ? (
                        <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-white/20">
                            <Play size={24} />
                        </div>
                    )}
                    {/* Drag handle (top-left, hover-visible) */}
                    <div
                        {...attributes}
                        {...listeners}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-1 left-1 p-1 rounded bg-black/60 text-white/60 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Drag to reorder"
                    >
                        <GripVertical size={12} />
                    </div>
                    {/* Hover actions (top-right) */}
                    {!isDeleting && (
                        <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsRenaming(true); }}
                                className="p-1 rounded bg-black/60 text-white/60 hover:text-white"
                                title="Rename"
                            >
                                <Edit2 size={12} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); duplicateProject(project.id); }}
                                className="p-1 rounded bg-black/60 text-white/60 hover:text-white"
                                title="Duplicate"
                            >
                                <Copy size={12} />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsDeleting(true); }}
                                className="p-1 rounded bg-black/60 text-white/60 hover:text-red-400"
                                title="Delete"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    )}
                    {isDeleting && (
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 text-center px-3"
                        >
                            <p className="text-[10px] uppercase tracking-wider text-white/80">Delete?</p>
                            <div className="flex gap-2">
                                <button onClick={() => deleteProject(project.id)} className="text-[10px] text-red-400 font-bold hover:underline">CONFIRM</button>
                                <button onClick={() => setIsDeleting(false)} className="text-[10px] text-white/50 hover:text-white">CANCEL</button>
                            </div>
                        </div>
                    )}
                    {/* Open-editor button (bottom-right, hover) */}
                    <button
                        onClick={handleOpenEditor}
                        className={`absolute bottom-1 right-1 px-2 py-1 rounded text-[9px] font-bold transition-all ${
                            isSelected
                                ? 'bg-[#D4AF37] text-black'
                                : 'bg-black/60 text-white/80 opacity-0 group-hover:opacity-100 hover:bg-[#D4AF37] hover:text-black'
                        }`}
                    >
                        OPEN
                    </button>
                </div>
                {/* Name + meta */}
                <div className="p-2 bg-[#1a1a1a]">
                    {isRenaming ? (
                        <input
                            autoFocus
                            value={newName}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            onChange={(e) => setNewName(e.target.value)}
                            onBlur={handleRenameSubmit}
                            onKeyDownCapture={(e) => {
                                if (e.key === 'Enter') handleRenameSubmit();
                                if (e.key === 'Escape') setIsRenaming(false);
                            }}
                            className="w-full bg-[#1a1a1a] border border-[#D4AF37]/50 rounded px-2 py-0.5 text-xs font-bold focus:outline-none"
                        />
                    ) : (
                        <h3 className={`font-bold text-xs truncate ${isSelected ? 'text-[#D4AF37]' : 'text-white/80'}`}>
                            {project.name}
                        </h3>
                    )}
                    <p className="text-[9px] text-white/30 mt-0.5 truncate">
                        {project.lastModified ? `${formatDistanceToNow(project.lastModified)} ago` : 'never saved'}
                    </p>
                </div>
            </div>
        </div>
    );
};

const FolderDropArea = ({ folder, projects, overInfo = null, isProjectDraggingOver = false, startRenaming = false, onRenameComplete, onDeleteClick, viewMode = 'list', onRegenerateThumbnails, regenDisabled = false, onExportClick }: {
    folder: any,
    projects: any[],
    overInfo?: { id: string, position: 'before' | 'after' } | null,
    isProjectDraggingOver?: boolean,
    startRenaming?: boolean,
    onRenameComplete?: () => void,
    onDeleteClick?: (folder: any, projectCount: number) => void,
    viewMode?: 'list' | 'grid',
    onRegenerateThumbnails?: (projectIds: string[], captureTime: number | 'end') => void,
    regenDisabled?: boolean,
    onExportClick?: (folder: any, projects: any[]) => void,
}) => {
    const { setNodeRef, isOver, attributes, listeners, transform, transition, isDragging } = useSortable({
        id: folder.id,
        data: { type: 'folder', folder }
    });

    const toggleFolder = useStore(s => s.toggleFolder);
    const deleteFolder = useStore(s => s.deleteFolder);
    const duplicateFolder = useStore(s => s.duplicateFolder);
    const sortFolderAlphabetically = useStore(s => s.sortFolderAlphabetically);
    const [isRenaming, setIsRenaming] = useState(startRenaming);
    const [newName, setNewName] = useState(folder.name);
    const [isRegenOpen, setIsRegenOpen] = useState(false);
    const [regenMode, setRegenMode] = useState<'first' | 'time' | 'last'>('time');
    const [regenSecond, setRegenSecond] = useState<string>('10');

    React.useEffect(() => {
        if (startRenaming) {
            setIsRenaming(true);
            setNewName(folder.name);
        }
    }, [startRenaming, folder.name]);

    const handleStartRenaming = (e: React.MouseEvent) => {
        e.stopPropagation();
        setNewName(folder.name);
        setIsRenaming(true);
    };

    const handleRenameSubmit = () => {
        if (newName.trim() && newName !== folder.name) {
            useStore.getState().renameFolder(folder.id, newName.trim());
        } else {
            setNewName(folder.name); // Revert if blank or same
        }
        setIsRenaming(false);
        if (onRenameComplete) onRenameComplete();
    };

    const style = {
        transform: isDragging ? CSS.Transform.toString(transform) : undefined,
        transition,
        opacity: isDragging ? 0.3 : 1,
        zIndex: isDragging ? 100 : 1,
    };

    // Only highlight if closed and a project is dragging over OR if specifically flagged as drop target
    const shouldHighlight = isOver && !folder.isOpen && isProjectDraggingOver;
    const dropIndicator = (overInfo && overInfo.id === folder.id) ? overInfo.position : null;

    return (
        <div ref={setNodeRef} style={style}>
            {dropIndicator === 'before' && <DropIndicator active={true} />}
            <div className={`mb-1 rounded-lg border transition-all duration-200 ${shouldHighlight ? 'border-[#D4AF37] bg-[#D4AF37]/10' : 'border-transparent'}`}>
                {/* Header */}
                <div
                    className="flex items-center p-1.5 hover:bg-white/5 rounded-lg group"
                    onClick={() => {
                        if (!isRenaming) {
                            toggleFolder(folder.id);
                        }
                    }}
                >
                    <div className="flex-grow flex items-center">
                        {/* Drag Handle */}
                        <div
                            {...attributes}
                            {...listeners}
                            className="cursor-grab active:cursor-grabbing text-white/20 hover:text-white/50 p-1 -ml-1 mr-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <GripVertical size={12} />
                        </div>

                        {folder.isOpen ? <ChevronDown size={14} className="text-white/50 mr-2" /> : <ChevronRight size={14} className="text-white/50 mr-2" />}

                        <FolderIcon size={14} className="text-[#D4AF37] mr-2" fill={folder.isOpen ? "#D4AF37" : "none"} fillOpacity={0.2} />

                        {isRenaming ? (
                            <input
                                autoFocus
                                className="bg-[#1a1a1a] text-xs font-bold text-white px-1 outline-none border-b border-[#D4AF37] w-full"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        handleRenameSubmit();
                                    }
                                    if (e.key === 'Escape') {
                                        setIsRenaming(false);
                                        setNewName(folder.name);
                                        if (onRenameComplete) onRenameComplete();
                                    }
                                }}
                                onPointerDown={e => e.stopPropagation()}
                                onClick={e => e.stopPropagation()}
                                onBlur={handleRenameSubmit}
                            />
                        ) : (
                            <span className="text-xs font-bold text-white/80 flex-grow">{folder.name}</span>
                        )}
                    </div>

                    <div className="opacity-0 group-hover:opacity-100 flex gap-1 items-center">
                        {onExportClick && projects.length > 0 && (
                            <button
                                className="p-1 hover:text-[#D4AF37] text-white/30"
                                title="Export every project in this folder"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onExportClick(folder, projects);
                                }}
                            >
                                <Share2 size={12} />
                            </button>
                        )}
                        {onRegenerateThumbnails && projects.length > 0 && (
                            <button
                                className="p-1 hover:text-[#D4AF37] text-white/30 disabled:opacity-30 disabled:cursor-wait"
                                disabled={regenDisabled}
                                title="Render thumbnails for projects in this folder"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsRegenOpen((v) => !v);
                                }}
                            >
                                <RefreshCw size={12} />
                            </button>
                        )}
                        {projects.length > 1 && (
                            <button
                                className="p-1 hover:text-[#D4AF37] text-white/30"
                                title="Sort projects A→Z (also reorders exports)"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    sortFolderAlphabetically(folder.id);
                                }}
                            >
                                <ArrowDownAZ size={12} />
                            </button>
                        )}
                        <button
                            className="p-1 hover:text-[#D4AF37] text-white/30"
                            title="Duplicate folder and all its projects"
                            onClick={(e) => {
                                e.stopPropagation();
                                duplicateFolder(folder.id);
                            }}
                        ><Copy size={12} /></button>
                        <button className="p-1 hover:text-white text-white/30" onClick={handleStartRenaming}><Edit2 size={12} /></button>
                        <button className="p-1 hover:text-red-500 text-white/30" onClick={(e) => {
                            e.stopPropagation();
                            if (projects.length > 0) {
                                if (onDeleteClick) onDeleteClick(folder, projects.length);
                            } else {
                                deleteFolder(folder.id);
                            }
                        }}><Trash2 size={12} /></button>

                    </div>
                </div>

                {isRegenOpen && onRegenerateThumbnails && (
                    <div
                        className="mx-2 mb-2 mt-1 p-2 rounded bg-[#1a1a1a] border border-white/10 flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <span className="text-[10px] uppercase tracking-widest text-white/50">Capture</span>
                        <select
                            value={regenMode}
                            onChange={(e) => setRegenMode(e.target.value as 'first' | 'time' | 'last')}
                            className="bg-[#0f0f0f] border border-white/10 rounded px-1.5 py-1 text-xs text-white outline-none focus:border-[#D4AF37]"
                        >
                            <option value="first">First frame</option>
                            <option value="time">At time…</option>
                            <option value="last">Last frame</option>
                        </select>
                        {regenMode === 'time' && (
                            <>
                                <input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={regenSecond}
                                    onChange={(e) => setRegenSecond(e.target.value)}
                                    className="w-16 bg-[#0f0f0f] border border-white/10 rounded px-1.5 py-1 text-xs text-white outline-none focus:border-[#D4AF37]"
                                />
                                <span className="text-[10px] text-white/50">sec</span>
                            </>
                        )}
                        <button
                            disabled={regenDisabled}
                            onClick={() => {
                                let captureTime: number | 'end';
                                if (regenMode === 'first') {
                                    captureTime = 0;
                                } else if (regenMode === 'last') {
                                    captureTime = 'end';
                                } else {
                                    const seconds = parseFloat(regenSecond);
                                    if (!Number.isFinite(seconds) || seconds < 0) return;
                                    captureTime = seconds;
                                }
                                onRegenerateThumbnails(projects.map(p => p.id), captureTime);
                                setIsRegenOpen(false);
                            }}
                            className="ml-auto px-2 py-1 text-[10px] font-bold uppercase tracking-widest rounded bg-[#D4AF37] text-black hover:bg-[#E5C158] disabled:opacity-30 disabled:cursor-wait"
                        >
                            Render
                        </button>
                        <button
                            onClick={() => setIsRegenOpen(false)}
                            className="px-2 py-1 text-[10px] uppercase tracking-widest text-white/50 hover:text-white"
                        >
                            Cancel
                        </button>
                    </div>
                )}

                {folder.isOpen && (
                    <div className="pt-0.5 pb-1 min-h-[4px]">
                        <SortableContext items={projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
                            {viewMode === 'grid' ? (
                                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 ml-6 mr-2 mt-2">
                                    {projects.map(p => (
                                        <ProjectCard key={p.id} project={p} />
                                    ))}
                                </div>
                            ) : (
                                projects.map(p => (
                                    <ProjectItem
                                        key={p.id}
                                        project={p}
                                        isInFolder={true}
                                        dropIndicator={(overInfo && overInfo.id === p.id) ? overInfo.position : null}
                                    />
                                ))
                            )}
                        </SortableContext>
                        {/* Empty state placeholder for dropping */}
                        {projects.length === 0 && (
                            <div className="h-8 border-2 border-dashed border-white/5 rounded ml-8 mr-2 text-[8px] text-white/20 flex items-center justify-center">
                                Drop rituals here
                            </div>
                        )}
                    </div>
                )}
            </div>
            {dropIndicator === 'after' && <DropIndicator active={true} />}
        </div>
    );
};

// --- Root Dropzone ---
const RootDropzone = ({ active }: { active: boolean }) => {
    const { setNodeRef, isOver } = useDroppable({ id: 'root-dropzone' });
    if (!active) return null;
    return (
        <div
            ref={setNodeRef}
            className={`h-10 mt-2 border-2 border-dashed rounded-lg transition-all flex items-center justify-center ${isOver ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37]' : 'border-white/5 text-white/10'}`}
        >
            <p className="text-[10px] uppercase tracking-widest font-bold">Move to Root</p>
        </div>
    );
};

const Dashboard: React.FC = () => {
    const savedProjects = useStore(s => s.savedProjects);
    const folders = useStore(s => s.folders) || [];
    const moveProject = useStore(s => s.moveProject);
    const createFolder = useStore(s => s.createFolder);
    const reorderFolders = useStore(s => s.reorderFolders);
    const createNewProject = useStore(s => s.createNewProject);
    const fetchProjects = useStore(s => s.fetchProjects);
    const currentProject = useStore(s => s.project);

    const user = useStore(s => s.user);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

    // Safety check
    if (!currentProject) return <div className="h-screen w-screen flex items-center justify-center bg-[#1a1a1a] text-white/50">Loading...</div>;

    const [searchTerm, setSearchTerm] = useState('');
    const [activeId, setActiveId] = useState<string | null>(null);
    const [overInfo, setOverInfo] = useState<{ id: string, position: 'before' | 'after' } | null>(null);
    const [showExportModal, setShowExportModal] = useState(false);
    const [batchExportTarget, setBatchExportTarget] = useState<{ folder: any, projects: any[] } | null>(null);
    const [newlyCreatedFolderId, setNewlyCreatedFolderId] = useState<string | null>(null);
    const [folderToDelete, setFolderToDelete] = useState<{ id: string, name: string, projectCount: number } | null>(null);
    const [sidebarTab, setSidebarTab] = useState<'projects' | 'assets'>('projects');
    const [dashboardView, setDashboardView] = useState<'list' | 'grid'>(() => {
        const stored = typeof window !== 'undefined' ? localStorage.getItem('v2-dashboard-view') : null;
        return stored === 'list' ? 'list' : 'grid';
    });
    const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
        const stored = typeof window !== 'undefined' ? localStorage.getItem('v2-dashboard-sidebar-width') : null;
        const parsed = stored ? parseInt(stored, 10) : NaN;
        if (Number.isFinite(parsed) && parsed >= 320) return parsed;
        // Default width depends on view mode preference at first run.
        const storedView = typeof window !== 'undefined' ? localStorage.getItem('v2-dashboard-view') : null;
        return storedView === 'list' ? 420 : 780;
    });
    const [isResizingSidebar, setIsResizingSidebar] = useState(false);
    const [thumbRegenProgress, setThumbRegenProgress] = useState<{ done: number; total: number } | null>(null);

    useEffect(() => {
        localStorage.setItem('v2-dashboard-view', dashboardView);
    }, [dashboardView]);

    useEffect(() => {
        localStorage.setItem('v2-dashboard-sidebar-width', String(sidebarWidth));
    }, [sidebarWidth]);

    useEffect(() => {
        if (!isResizingSidebar) return;
        const onMove = (e: MouseEvent) => {
            const next = Math.max(320, Math.min(window.innerWidth - 200, e.clientX));
            setSidebarWidth(next);
        };
        const onUp = () => setIsResizingSidebar(false);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizingSidebar]);
    const canvasWrapperRef = React.useRef<HTMLDivElement>(null);
    const sidebarScrollRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const handleRegenerateFolderThumbnails = React.useCallback(
        (projectIds: string[], captureTime: number | 'end') => {
            if (thumbRegenProgress !== null || projectIds.length === 0) return;
            setThumbRegenProgress({ done: 0, total: projectIds.length });
            (async () => {
                try {
                    await useStore.getState().regenerateProjectThumbnails({
                        projectIds,
                        captureTime,
                        onProgress: (done, total) => setThumbRegenProgress({ done, total }),
                    });
                } finally {
                    setThumbRegenProgress(null);
                }
            })();
        },
        [thumbRegenProgress],
    );

    // Derived State
    const rootProjects = useMemo(() => savedProjects.filter(p => !p.folderId && !p.name.toLowerCase().includes('demo')).sort((a, b) => (b.order || 0) - (a.order || 0)), [savedProjects]);
    const filteredProjects = useMemo(() => savedProjects.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())), [savedProjects, searchTerm]);

    // Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragOver = (event: any) => {
        const { over, active } = event;
        if (!over || active.id === over.id) {
            setOverInfo(null);
            return;
        }

        const overElement = over.rect;
        if (!overElement) return;

        // active.rect.current.translated gives us the current coordinates of the dragging item
        const activeRect = active.rect.current.translated;
        if (!activeRect) return;

        const mouseY = activeRect.top + activeRect.height / 2;
        const top = overElement.top;
        const height = overElement.height;
        const middle = top + height / 2;

        const position = mouseY < middle ? 'before' : 'after';
        setOverInfo({ id: over.id as string, position });
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        // Capture current overInfo before resetting
        const currentOverInfo = overInfo;

        setActiveId(null);
        setOverInfo(null);

        if (!over) return;

        const activeData = active.data.current;
        const overData = over.data.current;

        if (!activeData) return;

        // Folder reordering
        if (activeData.type === 'folder') {
            if (overData?.type === 'folder' && active.id !== over.id) {
                const oldIndex = folders.findIndex(f => f.id === active.id);
                const newIndex = folders.findIndex(f => f.id === over.id);
                reorderFolders(oldIndex, newIndex);
            }
            return;
        }

        // Project movement/reordering
        if (activeData.type === 'project') {
            const activeP = activeData.project;

            // 1. Dropped on a folder bar
            if (overData?.type === 'folder') {
                const folder = overData.folder;
                // If closed, move into folder
                if (!folder.isOpen) {
                    moveProject(activeP.id, folder.id, undefined, undefined);
                } else {
                    // If open, it likely drops at the top or bottom of the folder's internal list?
                    // But usually we'd be "over" a ProjectItem inside.
                    // If we are over the BAR of an open folder, maybe just place at top.
                    moveProject(activeP.id, folder.id, undefined, 'before');
                }
                return;
            }

            // 2. Dropped on another project
            if (overData?.type === 'project') {
                const overP = overData.project;
                const position = currentOverInfo?.position || 'after';
                moveProject(activeP.id, overP.folderId || null, overP.id, position);
                return;
            }

            // 3. Dropped back in root (if over root items)
            if (over.id === 'root-dropzone') {
                moveProject(activeP.id, null, undefined, 'after');
            }
        }
    };

    // Prepare render list
    const isSearching = searchTerm.length > 0;
    const isDraggingProject = useMemo(() => savedProjects.some(p => p.id === activeId), [activeId, savedProjects]);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="h-screen w-screen bg-[#1a1a1a] text-white flex overflow-hidden">
                {/* SIDEBAR */}
                <div
                    style={{ width: sidebarWidth }}
                    className="relative flex-shrink-0 flex flex-col border-r border-white/10 bg-[#1a1a1a] z-20"
                >
                    <div className="p-6 border-b border-white/10">
                        <header className="mb-6 flex items-center justify-between">
                            <div>
                                <h1 className="text-xl font-bold tracking-tighter text-[#D4AF37]">SACRED GEOMETRY</h1>
                                <p className="text-white/40 text-[10px] tracking-widest uppercase">Project Manager</p>
                            </div>
                            {/* User Profile / Login */}
                            <div className="relative">
                                {user ? (
                                    <button
                                        onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                                        className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white/70 hover:text-white"
                                    >
                                        <UserIcon size={16} />
                                    </button>
                                ) : null}

                                {isUserMenuOpen && user && (
                                    <div className="absolute top-full right-0 mt-2 w-48 bg-[#2a2a2a] border border-white/10 rounded shadow-2xl py-1 z-50 animate-in fade-in slide-in-from-top-1">
                                        <div className="px-4 py-2 text-[10px] text-white/40 border-b border-white/5 break-words">
                                            {user.email}
                                        </div>
                                        {useStore.getState().isAdmin && (
                                            <button
                                                onClick={() => {
                                                    useStore.getState().setView('admin');
                                                    setIsUserMenuOpen(false);
                                                }}
                                                className="w-full flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                                            >
                                                <UserIcon size={12} className="text-[#D4AF37]" />
                                                Admin Dashboard
                                            </button>
                                        )}
                                        <button
                                            onClick={async () => {
                                                await useStore.getState().signOut();
                                                useStore.getState().setView('landing');
                                                setIsUserMenuOpen(false);
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-widest text-red-400/70 hover:text-red-400 hover:bg-red-400/5 transition-colors"
                                        >
                                            <LogOut size={12} />
                                            Sign Out
                                        </button>
                                    </div>
                                )}
                            </div>
                        </header>

                        {/* Tab switcher */}
                        <div className="flex gap-1 mb-4 p-1 bg-[#252525] rounded">
                            <button
                                onClick={() => setSidebarTab('projects')}
                                className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest transition-colors ${sidebarTab === 'projects'
                                    ? 'bg-[#1a1a1a] text-[#D4AF37]'
                                    : 'text-white/50 hover:text-white/80'
                                    }`}
                            >
                                Projects
                            </button>
                            <button
                                onClick={() => setSidebarTab('assets')}
                                className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest transition-colors ${sidebarTab === 'assets'
                                    ? 'bg-[#1a1a1a] text-[#D4AF37]'
                                    : 'text-white/50 hover:text-white/80'
                                    }`}
                            >
                                Assets
                            </button>
                        </div>

                        {sidebarTab === 'projects' && (
                        <>
                        <div className="flex gap-2 mb-4">
                            <button onClick={createNewProject} className="flex-1 bg-[#D4AF37] hover:bg-[#F5E091] text-black font-bold py-2 rounded flex items-center justify-center gap-2 text-xs">
                                <Plus size={14} /> New Project
                            </button>
                            <button
                                onClick={async () => {
                                    const id = await createFolder('New Folder');
                                    if (id) {
                                        setNewlyCreatedFolderId(id);
                                        // Slight delay to allow DOM to render the new folder element
                                        setTimeout(() => {
                                            if (sidebarScrollRef.current) {
                                                const scrollContainer = sidebarScrollRef.current;
                                                // Quickest hack to scroll down. Ideally map refs to scroll accurately.
                                                scrollContainer.scrollTop = scrollContainer.scrollHeight;
                                            }
                                        }, 100);
                                    }
                                }}
                                className="px-3 bg-white/5 hover:bg-white/10 text-white rounded flex items-center justify-center"
                                title="New Folder"
                            >
                                <FolderPlus size={16} />
                            </button>
                        </div>

                        <div className="relative">
                            <input
                                className="w-full bg-[#252525] rounded px-3 py-2 pl-9 pr-24 text-sm focus:outline-none focus:border-[#D4AF37]/50 border border-transparent"
                                placeholder="Search rituals..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                            <FolderIcon className="absolute left-3 top-2.5 text-white/20" size={14} />
                            <div className="absolute right-1 top-1 flex gap-0.5 p-0.5 bg-[#1a1a1a] rounded">
                                <button
                                    onClick={() => setDashboardView('list')}
                                    title="List view (folders + projects)"
                                    className={`p-1.5 rounded transition-colors ${dashboardView === 'list' ? 'bg-[#252525] text-[#D4AF37]' : 'text-white/40 hover:text-white/70'}`}
                                >
                                    <List size={14} />
                                </button>
                                <button
                                    onClick={() => setDashboardView('grid')}
                                    title="Thumbnail grid (all projects)"
                                    className={`p-1.5 rounded transition-colors ${dashboardView === 'grid' ? 'bg-[#252525] text-[#D4AF37]' : 'text-white/40 hover:text-white/70'}`}
                                >
                                    <LayoutGrid size={14} />
                                </button>
                            </div>
                        </div>
                        </>
                        )}
                    </div>

                    {sidebarTab === 'projects' ? (
                    <div className="flex-1 overflow-y-auto p-4" ref={sidebarScrollRef}>
                        {dashboardView === 'grid' ? (
                            // Thumbnail grid: same folder structure + ordering as list view,
                            // just with cards instead of rows inside each section.
                            isSearching ? (
                                filteredProjects.length === 0 ? (
                                    <div className="h-32 border-2 border-dashed border-white/5 rounded-xl flex flex-col items-center justify-center text-white/20">
                                        <p className="text-[10px] uppercase tracking-widest">No matches</p>
                                    </div>
                                ) : (
                                    <SortableContext items={filteredProjects.map(p => p.id)} strategy={verticalListSortingStrategy}>
                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
                                            {filteredProjects.map(p => <ProjectCard key={p.id} project={p} />)}
                                        </div>
                                    </SortableContext>
                                )
                            ) : (
                                <div className="space-y-3">
                                    <SortableContext items={[...folders.map(f => f.id), ...rootProjects.map(p => p.id)]} strategy={verticalListSortingStrategy}>
                                        {folders.map(folder => (
                                            <FolderDropArea
                                                key={folder.id}
                                                folder={folder}
                                                projects={savedProjects.filter(p => p.folderId === folder.id).sort((a, b) => (b.order || 0) - (a.order || 0))}
                                                overInfo={overInfo}
                                                isProjectDraggingOver={isDraggingProject}
                                                viewMode="grid"
                                                startRenaming={folder.id === newlyCreatedFolderId}
                                                onRenameComplete={() => {
                                                    if (folder.id === newlyCreatedFolderId) {
                                                        setNewlyCreatedFolderId(null);
                                                    }
                                                }}
                                                onDeleteClick={(folderData, count) => setFolderToDelete({ id: folderData.id, name: folderData.name, projectCount: count })}
                                                onRegenerateThumbnails={handleRegenerateFolderThumbnails}
                                                regenDisabled={thumbRegenProgress !== null}
                                                onExportClick={(f, ps) => setBatchExportTarget({ folder: f, projects: ps })}
                                            />
                                        ))}
                                        {rootProjects.length > 0 && (
                                            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 mt-2">
                                                {rootProjects.map(p => <ProjectCard key={p.id} project={p} />)}
                                            </div>
                                        )}
                                    </SortableContext>
                                    <RootDropzone active={isDraggingProject && !searchTerm} />
                                    {rootProjects.length === 0 && folders.length === 0 && (
                                        <div className="h-32 border-2 border-dashed border-white/5 rounded-xl flex flex-col items-center justify-center text-white/20">
                                            <Plus className="mb-2 opacity-50" size={24} />
                                            <p className="text-[10px] uppercase tracking-widest">No Projects Yet</p>
                                        </div>
                                    )}
                                </div>
                            )
                        ) : isSearching ? (
                            // Flat List
                            filteredProjects.map(p => <ProjectItem key={p.id} project={p} />)
                        ) : (
                            // Folder Structure
                            <div className="space-y-1">
                                <SortableContext items={[...folders.map(f => f.id), ...rootProjects.map(p => p.id)]} strategy={verticalListSortingStrategy}>
                                    {/* Folders first */}
                                    {folders.map(folder => (
                                        <FolderDropArea
                                            key={folder.id}
                                            folder={folder}
                                            projects={savedProjects.filter(p => p.folderId === folder.id).sort((a, b) => (b.order || 0) - (a.order || 0))}
                                            overInfo={overInfo}
                                            isProjectDraggingOver={isDraggingProject}
                                            startRenaming={folder.id === newlyCreatedFolderId}
                                            onRenameComplete={() => {
                                                if (folder.id === newlyCreatedFolderId) {
                                                    setNewlyCreatedFolderId(null);
                                                }
                                            }}
                                            onDeleteClick={(folderData, count) => setFolderToDelete({ id: folderData.id, name: folderData.name, projectCount: count })}
                                            onRegenerateThumbnails={handleRegenerateFolderThumbnails}
                                            regenDisabled={thumbRegenProgress !== null}
                                            onExportClick={(f, ps) => setBatchExportTarget({ folder: f, projects: ps })}
                                        />
                                    ))}
                                    {/* Root Projects */}
                                    {rootProjects.map(p => (
                                        <ProjectItem
                                            key={p.id}
                                            project={p}
                                            dropIndicator={(overInfo && overInfo.id === p.id) ? overInfo.position : null}
                                        />
                                    ))}
                                </SortableContext>

                                <RootDropzone active={isDraggingProject && !searchTerm} />

                                {/* Root Empty State */}
                                {rootProjects.length === 0 && folders.length === 0 && (
                                    <div className="h-32 border-2 border-dashed border-white/5 rounded-xl flex flex-col items-center justify-center text-white/20">
                                        <Plus className="mb-2 opacity-50" size={24} />
                                        <p className="text-[10px] uppercase tracking-widest">No Projects Yet</p>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="h-20"></div> {/* Spacer */}
                    </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto py-4 flex flex-col">
                            <AssetLibrary />
                        </div>
                    )}
                </div>

                {/* Resize handle between sidebar and preview */}
                <div
                    onMouseDown={(e) => { e.preventDefault(); setIsResizingSidebar(true); }}
                    className={`w-1 cursor-col-resize z-30 transition-colors ${isResizingSidebar ? 'bg-[#D4AF37]' : 'bg-transparent hover:bg-[#D4AF37]/50'}`}
                    title="Drag to resize"
                />

                {/* Regen-thumbnails progress (fixed top-center while running) */}
                {thumbRegenProgress !== null && (
                    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-[#1a1a1a]/95 border border-[#D4AF37]/40 rounded-full px-4 py-2 shadow-2xl backdrop-blur-sm">
                        <RefreshCw size={14} className="text-[#D4AF37] animate-spin" />
                        <span className="text-[10px] uppercase tracking-widest text-white/80 font-bold">
                            Regenerating thumbnails — {thumbRegenProgress.done} / {thumbRegenProgress.total}
                        </span>
                    </div>
                )}

                {/* PREVIEW AREA */}
                <div className="flex-1 bg-black relative flex flex-col items-center justify-center overflow-hidden" ref={canvasWrapperRef}>
                    <div className="absolute top-8 left-8 z-10 pointer-events-none">
                        <h2 className="text-4xl font-bold bg-gradient-to-br from-white to-white/20 bg-clip-text text-transparent opacity-50">
                            {currentProject.name}
                        </h2>
                        <div className="flex items-center text-white/20 text-[10px] uppercase tracking-widest mt-2">
                            <Clock size={10} className="mr-1.5" />
                            Last edited {formatDistanceToNow(currentProject.lastModified || Date.now())} ago
                        </div>
                    </div>

                    {/* Export Button */}
                    <div className="absolute top-8 right-8 z-20">
                        <button
                            onClick={() => setShowExportModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-white/60 hover:text-white transition-all backdrop-blur-sm group"
                        >
                            <Share2 size={16} className="text-[#D4AF37]" />
                            <span className="text-xs font-bold uppercase tracking-wider">Export</span>
                        </button>
                    </div>

                    <div className="w-full h-full relative">
                        <GeometryCanvas />
                        <div className="absolute inset-0 z-20 flex items-end justify-end p-8 opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                            <button onClick={() => useStore.getState().setIsPlaying(!useStore.getState().isPlaying)} className="w-14 h-14 rounded-full bg-[#D4AF37] flex items-center justify-center text-black shadow-lg hover:scale-110 transition-transform pointer-events-auto">
                                <Play size={24} className="ml-1" fill="black" />
                            </button>
                        </div>
                    </div>

                    {showExportModal && (
                        <ExportModal
                            onClose={() => setShowExportModal(false)}
                        />
                    )}

                    {batchExportTarget && (
                        <BatchExportModal
                            folder={batchExportTarget.folder}
                            projects={batchExportTarget.projects}
                            onClose={() => setBatchExportTarget(null)}
                        />
                    )}

                    {folderToDelete && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
                            <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-6 w-[400px] shadow-2xl relative">
                                <h3 className="text-xl font-bold text-white mb-2">Delete Folder</h3>
                                <p className="text-white/70 mb-6 text-sm">
                                    Are you sure you want to delete <span className="font-bold text-[#D4AF37]">{folderToDelete.name}</span>?
                                    This folder contains {folderToDelete.projectCount} project{folderToDelete.projectCount === 1 ? '' : 's'}.
                                    Deleting this folder will also <span className="text-red-500 font-bold">permanently delete all projects inside it</span>.
                                </p>
                                <div className="flex gap-3 justify-end">
                                    <button
                                        onClick={() => setFolderToDelete(null)}
                                        className="px-4 py-2 rounded text-white/70 hover:text-white hover:bg-white/5 transition-colors text-sm font-bold"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            useStore.getState().deleteFolder(folderToDelete.id, true);
                                            setFolderToDelete(null);
                                        }}
                                        className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded transition-colors text-sm font-bold border border-red-500/20 hover:border-red-500"
                                    >
                                        Yes, Delete Everything
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DragOverlay dropAnimation={null}>
                    {activeId ? (
                        <div className="bg-[#1a1a1a]/80 backdrop-blur-sm border border-[#D4AF37]/50 px-3 py-1.5 rounded-md shadow-[0_0_15px_rgba(212,175,55,0.2)] opacity-80 max-w-[200px] flex items-center justify-center pointer-events-none">
                            <span className="font-bold text-white text-[10px] uppercase tracking-wider truncate">
                                {savedProjects.find(p => p.id === activeId)?.name || folders.find(f => f.id === activeId)?.name || 'Moving...'}
                            </span>
                        </div>
                    ) : null}
                </DragOverlay>
            </div>
        </DndContext>
    );
};

export default Dashboard;
