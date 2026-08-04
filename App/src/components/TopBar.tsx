import React, { useState, useRef, useEffect } from 'react';
import { Save, Menu, ChevronDown, Copy, Trash2, Edit2, Settings, User as UserIcon, LogOut, Share2, Link2, Camera, FileCode, Crop } from 'lucide-react';
import { useStore } from '../store/useStore';
import AuthModal from './AuthModal';
import ExportModal from './ExportModal';
import { exportStageToSVG, downloadSVG } from '../utils/svgExport';
import { CROP_OPTIONS, getCropOption } from './cropPreview';
const TopBar: React.FC = () => {
    const project = useStore(s => s.project);
    const duplicateProject = useStore(s => s.duplicateProject);
    const deleteProject = useStore(s => s.deleteProject);
    const setView = useStore(s => s.setView);
    const saveProject = useStore(s => s.saveProject);
    const renameProject = useStore(s => s.renameProject);
    const setActiveLayerId = useStore(s => s.setActiveLayerId);
    const user = useStore(s => s.user);
    const signOut = useStore(s => s.signOut);
    const editorPreviewCrop = useStore(s => s.editorPreviewCrop);
    const setEditorPreviewCrop = useStore(s => s.setEditorPreviewCrop);
    const upgradedFromVersion = useStore(s => s.upgradedFromVersion);
    const activeCrop = getCropOption(editorPreviewCrop);

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [tempName, setTempName] = useState(project.name);
    const [linkCopied, setLinkCopied] = useState(false);
    const [thumbState, setThumbState] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [svgState, setSvgState] = useState<'idle' | 'exporting' | 'done'>('idle');
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleRenameSubmit = async () => {
        if (tempName.trim() && tempName !== project.name) {
            await renameProject(project.id, tempName.trim());
        }
        setIsRenaming(false);
    };

    const handleRenameClick = () => {
        setTempName(project.name);
        setIsRenaming(true);
        setIsMenuOpen(false);
    };

    const handleSetThumbnail = async () => {
        if (thumbState !== 'idle') return;
        setThumbState('saving');
        try {
            const blob = await useStore.getState().captureCurrentProjectThumbnail();
            if (!blob) {
                setThumbState('idle');
                return;
            }
            await useStore.getState().uploadProjectThumbnail(project.id, blob);
            setThumbState('saved');
            setTimeout(() => setThumbState('idle'), 1500);
        } catch (e) {
            console.warn('Set thumbnail failed', e);
            setThumbState('idle');
        }
    };

    const handleExportSVG = async () => {
        if (svgState !== 'idle') return;
        setSvgState('exporting');
        try {
            const { getPixiApp } = await import('../utils/thumbnailGenerator');
            const app = getPixiApp();
            if (!app) {
                console.warn('SVG export: no Pixi app');
                setSvgState('idle');
                return;
            }
            const { svg, warnings } = exportStageToSVG(app, project);
            if (warnings.length) console.warn('SVG export warnings:', warnings);
            const safeName = (project.name || 'snapshot').replace(/[^a-z0-9-_]+/gi, '_');
            downloadSVG(svg, `${safeName}.svg`);
            setSvgState('done');
            setTimeout(() => setSvgState('idle'), 1500);
        } catch (e) {
            console.error('SVG export failed', e);
            setSvgState('idle');
        }
    };

    const handleCopyLink = async () => {
        const url = new URL(window.location.href);
        url.searchParams.set('p', project.id);
        const shareUrl = url.origin + url.pathname + url.search;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 1500);
        } catch {
            window.prompt('Copy this link:', shareUrl);
        }
    };


    return (
        <header className="h-14 bg-[#252525] border-b border-white/10 flex items-center justify-between px-6 z-30 shrink-0">
            <div className="flex items-center gap-6">
                <button
                    onClick={async () => {
                        await saveProject();
                        setView('dashboard');
                    }}
                    className="text-[#D4AF37] hover:text-[#D4AF37]/80 transition-colors"
                >
                    <Menu size={20} />
                </button>

                <div className="relative flex items-center gap-2" ref={menuRef}>
                    {isRenaming ? (
                        <input
                            autoFocus
                            className="bg-black/50 border border-[#D4AF37]/50 rounded px-2 py-0.5 text-[10px] font-bold tracking-[0.2em] uppercase text-[#D4AF37] focus:outline-none w-48"
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameSubmit();
                                if (e.key === 'Escape') setIsRenaming(false);
                            }}
                            onBlur={handleRenameSubmit}
                        />
                    ) : (
                        <>
                            <h1
                                onClick={handleRenameClick}
                                className="text-xs font-bold tracking-[0.2em] uppercase text-[#D4AF37] cursor-pointer hover:underline"
                            >
                                {project.name}
                            </h1>
                            <button
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                className="text-white/40 hover:text-[#D4AF37] transition-colors p-1"
                            >
                                <ChevronDown size={14} />
                            </button>
                            {upgradedFromVersion !== null && (
                                <span
                                    className="px-1.5 py-0.5 rounded border border-[#D4AF37]/40 text-[8px] uppercase tracking-widest text-[#D4AF37]/80 select-none"
                                    title="Opened from an older project format and upgraded automatically. Saving stores the new format."
                                >
                                    Upgraded
                                </span>
                            )}
                        </>
                    )}

                    {isMenuOpen && (
                        <div className="absolute top-full left-0 mt-2 w-48 bg-[#2a2a2a] border border-white/10 rounded shadow-2xl py-1 z-50 animate-in fade-in slide-in-from-top-1">
                            <button
                                onClick={handleRenameClick}
                                className="w-full flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                <Edit2 size={12} className="text-[#D4AF37]" />
                                Rename Project
                            </button>
                            <button
                                onClick={() => { duplicateProject(project.id); setIsMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                <Copy size={12} className="text-[#D4AF37]" />
                                Duplicate Project
                            </button>
                            <button
                                onClick={handleCopyLink}
                                className="w-full flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                <Link2 size={12} className="text-[#D4AF37]" />
                                {linkCopied ? 'Link Copied' : 'Copy Link'}
                            </button>
                            <div className="h-px bg-white/5 my-1" />
                            <button
                                onClick={() => { deleteProject(project.id); setIsMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-widest text-red-400/70 hover:text-red-400 hover:bg-red-400/5 transition-colors"
                            >
                                <Trash2 size={12} />
                                Reset Project
                            </button>
                        </div>
                    )}
                </div>
            </div>


            <div className="flex items-center gap-4">
                {/* User Profile / Login */}
                <div className="relative">
                    {user ? (
                        <button
                            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-white/10 transition-colors text-white/70 hover:text-white"
                        >
                            <UserIcon size={14} />
                            <span className="text-[10px] uppercase tracking-widest font-bold truncate max-w-[100px]">{user.email?.split('@')[0]}</span>
                        </button>
                    ) : (
                        <button
                            onClick={() => setIsAuthModalOpen(true)}
                            className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-[10px] uppercase tracking-widest font-bold transition-colors"
                        >
                            Login
                        </button>

                    )}



                    {isUserMenuOpen && user && (
                        <div className="absolute top-full right-0 mt-2 w-48 bg-[#2a2a2a] border border-white/10 rounded shadow-2xl py-1 z-50 animate-in fade-in slide-in-from-top-1">
                            <div className="px-4 py-2 text-[10px] text-white/40 border-b border-white/5 break-words">
                                {user.email}
                            </div>
                            <button
                                onClick={() => { signOut(); setView('landing'); setIsUserMenuOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-widest text-red-400/70 hover:text-red-400 hover:bg-red-400/5 transition-colors"
                            >
                                <LogOut size={12} />
                                Sign Out
                            </button>
                        </div>
                    )}
                </div>

                <div className="h-6 w-px bg-white/10" />

                {/* Preview Crop (editor-only; hover to reveal proportions) */}
                <div className="relative group">
                    <button
                        className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-white/10 transition-colors text-white/60 hover:text-white"
                        title="Preview crop — reframes the editor only, never the export"
                    >
                        <Crop size={14} className="text-[#D4AF37]" />
                        <span className="text-[10px] uppercase font-bold tracking-widest">{activeCrop.label}</span>
                        <ChevronDown size={12} className="text-white/30" />
                    </button>

                    {/* pt-2 is a transparent hover bridge so the menu doesn't close between button and popover */}
                    <div className="absolute top-full right-0 pt-2 opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-150 z-50">
                        <div className="bg-[#2a2a2a] border border-white/10 rounded shadow-2xl p-1 flex flex-col gap-0.5 min-w-[130px]">
                            <div className="px-2 py-1 text-[9px] uppercase tracking-widest text-white/30">Preview Crop</div>
                            {CROP_OPTIONS.map((c) => {
                                const isActive = c.id === editorPreviewCrop;
                                // Small proportion glyph (max 14px on the long edge).
                                const gw = c.ratio >= 1 ? 14 : 14 * c.ratio;
                                const gh = c.ratio >= 1 ? 14 / c.ratio : 14;
                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => setEditorPreviewCrop(c.id)}
                                        className={`flex items-center gap-3 px-2 py-1.5 rounded text-[10px] uppercase tracking-widest font-bold transition-colors ${
                                            isActive ? 'bg-[#D4AF37] text-black' : 'text-white/60 hover:text-white hover:bg-white/5'
                                        }`}
                                    >
                                        <span className="w-4 h-4 flex items-center justify-center shrink-0">
                                            <span
                                                className={`rounded-[1px] ${isActive ? 'bg-black/70' : 'bg-white/40'}`}
                                                style={{ width: gw, height: gh }}
                                            />
                                        </span>
                                        {c.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="h-6 w-px bg-white/10" />

                {/* Project Settings (Gear Icon) */}
                <button
                    onClick={() => setActiveLayerId(null)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded hover:bg-white/10 transition-colors ${!useStore.getState().activeLayerId ? 'text-[#D4AF37]' : 'text-white/30'}`}
                    title="Project Settings"
                >
                    <Settings size={14} />
                    <span className="text-[10px] uppercase font-bold tracking-widest mt-px">Global Settings</span>
                </button>

                <div className="h-6 w-px bg-white/10 mx-2" />

                <button
                    onClick={handleSetThumbnail}
                    disabled={thumbState !== 'idle'}
                    title="Capture the current canvas (at the timeline marker's current position) as this project's thumbnail."
                    className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors active:scale-95 disabled:cursor-default ${
                        thumbState === 'saved'
                            ? 'border-[#D4AF37]/60 bg-[#D4AF37]/10 text-[#D4AF37]'
                            : 'border-white/20 hover:bg-white/5 text-white/60 hover:text-white'
                    }`}
                >
                    <Camera size={14} className="text-[#D4AF37]" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                        {thumbState === 'saving' ? 'Saving…' : thumbState === 'saved' ? 'Saved' : 'Set Thumbnail'}
                    </span>
                </button>

                <button
                    onClick={handleExportSVG}
                    disabled={svgState !== 'idle'}
                    title="Prototype: snapshot the current frame as an SVG. Filters are not preserved; gradients/textures fall back to base color."
                    className={`flex items-center gap-2 px-3 py-1.5 rounded border transition-colors active:scale-95 disabled:cursor-default ${
                        svgState === 'done'
                            ? 'border-[#D4AF37]/60 bg-[#D4AF37]/10 text-[#D4AF37]'
                            : 'border-white/20 hover:bg-white/5 text-white/60 hover:text-white'
                    }`}
                >
                    <FileCode size={14} className="text-[#D4AF37]" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                        {svgState === 'exporting' ? 'Exporting…' : svgState === 'done' ? 'Saved' : 'Export SVG'}
                    </span>
                </button>

                <button
                    onClick={() => setShowExportModal(true)}
                    className="flex items-center gap-2 px-4 py-1.5 rounded border border-white/20 hover:bg-white/5 hover:text-white transition-colors text-white/60 group active:scale-95"
                >
                    <Share2 size={14} className="text-[#D4AF37]" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Export</span>
                </button>

                <button
                    onClick={saveProject}
                    className="flex items-center gap-2 px-4 py-1.5 ml-2 rounded bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-black transition-colors font-bold text-[10px] uppercase tracking-widest shadow-[0_0_15px_rgba(212,175,55,0.2)] active:scale-95"
                >
                    <Save size={14} />
                    Save
                </button>
            </div>

            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
                onSuccess={() => {
                    // Refresh projects? handled by session state change usually
                }}
            />
            {showExportModal && (
                <ExportModal onClose={() => setShowExportModal(false)} />
            )}
        </header >
    );
};

export default TopBar;
