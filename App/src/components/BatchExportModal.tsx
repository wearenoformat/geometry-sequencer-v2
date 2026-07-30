import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    X, Film, Download, FileCode, Check, FileJson, Share2, Code2, Smartphone,
    Clock, Loader2, Check as CheckIcon, X as XIcon, AlertTriangle,
    Image as ImageIcon,
} from 'lucide-react';
import { useRecorder } from '../hooks/useRecorder';
import { supabase } from '../supabaseClient';
import { useStore } from '../store/useStore';
import type { Project, ProjectMetadata, Folder } from '../types';
import { ModernToggle } from './ModernToggle';
import {
    buildBatchHtmlZip,
    buildBatchJsonZip,
    buildBatchReactZip,
    buildBatchReactNativeZip,
    buildBatchSvgZip,
    runBatchVideoExport,
    type BatchProgressStatus,
} from '../utils/batchExport';
import { blobToBase64, safeFilename } from '../utils/exportHelpers';
import {
    VIDEO_RESOLUTIONS,
    VIDEO_ASPECT_RATIOS,
    RESOLUTION_LABELS,
    ASPECT_RATIO_LABELS,
    type VideoResolution,
    type VideoAspectRatio,
} from './videoFormats';

interface BatchExportModalProps {
    folder: Folder;
    projects: ProjectMetadata[];
    onClose: () => void;
}

type Tab = 'video' | 'svg' | 'html' | 'json' | 'react' | 'native';

type RowState = {
    status: BatchProgressStatus;
    message?: string;
    percent?: number;
};

const BatchExportModal: React.FC<BatchExportModalProps> = ({ folder, projects: projectMeta, onClose }) => {
    const { startRecording, stopRecording, getSupportedMimeTypes } = useRecorder();

    const [activeTab, setActiveTab] = useState<Tab>('video');
    const [loadedProjects, setLoadedProjects] = useState<Project[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [includeAstro, setIncludeAstro] = useState(false);
    const [includeAmino, setIncludeAmino] = useState(false);
    const [transparentBg, setTransparentBg] = useState(false);

    // Video options
    const [resolution, setResolution] = useState<VideoResolution>('1080p');
    const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('16:9');
    const [durationMode, setDurationMode] = useState<'loop' | 'time'>('loop');
    const [loopCount, setLoopCount] = useState(1);
    const [seconds, setSeconds] = useState(10);

    // SVG options
    const [svgFrameMode, setSvgFrameMode] = useState<'first' | 'last' | 'time'>('first');
    const [svgFrameTime, setSvgFrameTime] = useState<number>(0);
    const [supportedFormats, setSupportedFormats] = useState<string[]>([]);
    const [selectedFormat, setSelectedFormat] = useState<string>('');

    const [isExporting, setIsExporting] = useState(false);
    const [rowStates, setRowStates] = useState<RowState[]>([]);
    const [globalMessage, setGlobalMessage] = useState<string>('');
    const [resultBlob, setResultBlob] = useState<Blob | null>(null);
    const [resultName, setResultName] = useState<string>('');
    const [exportError, setExportError] = useState<string | null>(null);

    const abortRef = useRef<AbortController | null>(null);
    const projectThumbnails = useStore(s => s.projectThumbnails);

    // ── Load full project data on open ────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const ids = projectMeta.map(p => p.id);
                const { data, error } = await supabase
                    .from('projects')
                    .select('id, data')
                    .in('id', ids);
                if (error) throw new Error(error.message);
                const byId = new Map<string, any>();
                for (const row of (data ?? []) as Array<{ id: string; data: any }>) {
                    byId.set(row.id, row.data);
                }
                // Preserve metadata ordering.
                const ordered: Project[] = [];
                for (const meta of projectMeta) {
                    const proj = byId.get(meta.id);
                    if (proj) ordered.push({ ...proj, id: meta.id, name: meta.name, thumbnailData: meta.thumbnailData } as Project);
                }

                // Hydrate thumbnails from the store's signed-URL map into
                // inline data URLs so the HTML gallery index can render them
                // offline. Folder view stores them as signed URLs that expire.
                await Promise.all(ordered.map(async (p) => {
                    if ((p as Project & { thumbnailData?: string }).thumbnailData) return;
                    const signedUrl = projectThumbnails[p.id];
                    if (!signedUrl) return;
                    try {
                        const res = await fetch(signedUrl);
                        if (!res.ok) return;
                        const blob = await res.blob();
                        const b64 = await blobToBase64(blob);
                        (p as Project & { thumbnailData?: string }).thumbnailData =
                            `data:${blob.type || 'image/png'};base64,${b64}`;
                    } catch {
                        // Best-effort — leave thumbnailData unset so the
                        // gallery falls back to the colored placeholder.
                    }
                }));

                if (!cancelled) setLoadedProjects(ordered);
            } catch (e) {
                if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load projects');
            }
        })();
        return () => { cancelled = true; };
    }, [projectMeta, projectThumbnails]);

    // ── Auto-detect optional bundle usage across the union of projects ──
    const { usesAstro, usesAmino, usesCustomSvg, hasAssetLayers } = useMemo(() => {
        if (!loadedProjects) return { usesAstro: false, usesAmino: false, usesCustomSvg: false, hasAssetLayers: false };
        let a = false, m = false, c = false, ass = false;
        for (const p of loadedProjects) {
            for (const l of p.layers as any[]) {
                if (l.type === 'astrology') a = true;
                if (l.type === 'amino') m = true;
                if (l.type === 'custom') c = true;
                if ((l.type === 'asset_set' && l.config?.assetFolderId) || (l.type === 'asset_single' && l.config?.assetId)) ass = true;
            }
        }
        return { usesAstro: a, usesAmino: m, usesCustomSvg: c, hasAssetLayers: ass };
    }, [loadedProjects]);

    useEffect(() => {
        setIncludeAstro(usesAstro);
        setIncludeAmino(usesAmino);
    }, [usesAstro, usesAmino]);

    useEffect(() => {
        const formats = getSupportedMimeTypes();
        setSupportedFormats(formats);
        if (formats.length > 0) setSelectedFormat(formats[0]);
    }, [getSupportedMimeTypes]);

    // ── Run export ────────────────────────────────────────────────────
    const startExport = async () => {
        if (!loadedProjects || loadedProjects.length === 0) return;

        setIsExporting(true);
        setExportError(null);
        setResultBlob(null);
        setRowStates(loadedProjects.map(() => ({ status: 'pending' })));
        setGlobalMessage('Preparing...');

        const ac = new AbortController();
        abortRef.current = ac;

        const onProgress = (idx: number, status: BatchProgressStatus, message?: string, percent?: number) => {
            if (idx < 0) {
                setGlobalMessage(message || '');
                return;
            }
            setRowStates(prev => {
                const next = prev.slice();
                next[idx] = { status, message, percent };
                return next;
            });
        };

        const folderSlug = safeFilename(folder.name) || 'folder';
        try {
            let blob: Blob;
            let filename: string;

            const opts = {
                projects: loadedProjects,
                folderName: folder.name,
                includeAstro,
                includeAmino,
                transparentBg,
                signal: ac.signal,
                onProgress,
            };

            switch (activeTab) {
                case 'json':
                    blob = await buildBatchJsonZip(opts);
                    filename = `${folderSlug}_json_export.zip`;
                    break;
                case 'svg':
                    blob = await buildBatchSvgZip({
                        ...opts,
                        frameMode: svgFrameMode,
                        frameTime: svgFrameTime,
                    });
                    filename = `${folderSlug}_svg_export.zip`;
                    break;
                case 'html':
                    blob = await buildBatchHtmlZip(opts);
                    filename = `${folderSlug}_html_export.zip`;
                    break;
                case 'react':
                    blob = await buildBatchReactZip(opts);
                    filename = `${folderSlug}_react_export.zip`;
                    break;
                case 'native':
                    blob = await buildBatchReactNativeZip(opts);
                    filename = `${folderSlug}_react_native_export.zip`;
                    break;
                case 'video':
                    blob = await runBatchVideoExport({
                        ...opts,
                        resolution,
                        aspectRatio,
                        durationMode,
                        loopCount,
                        seconds,
                        selectedFormat,
                        startRecording,
                        stopRecording,
                    });
                    filename = `${folderSlug}_video_export.zip`;
                    break;
            }

            if (ac.signal.aborted) {
                setGlobalMessage('Canceled');
                setIsExporting(false);
                return;
            }
            setResultBlob(blob);
            setResultName(filename);
            setGlobalMessage('Done!');
            // Auto-download.
            triggerDownload(blob, filename);
            setIsExporting(false);
        } catch (err) {
            if (ac.signal.aborted) {
                setGlobalMessage('Canceled');
                setRowStates(prev => prev.map(r => r.status === 'running' ? { status: 'error', message: 'Canceled' } : r));
            } else {
                console.error(err);
                const msg = err instanceof Error ? err.message : String(err);
                setExportError(msg);
                setGlobalMessage(`Error: ${msg}`);
            }
            setIsExporting(false);
        }
    };

    const cancelExport = () => {
        abortRef.current?.abort();
    };

    const triggerDownload = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const totalCount = loadedProjects?.length || 0;
    const doneCount = rowStates.filter(r => r.status === 'done').length;
    const currentRunning = rowStates.findIndex(r => r.status === 'running');
    const aggregatePercent = totalCount === 0
        ? 0
        : ((doneCount + (currentRunning >= 0 ? (rowStates[currentRunning].percent || 0) / 100 : 0)) / totalCount) * 100;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-xl w-[520px] shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
                <button
                    onClick={onClose}
                    disabled={isExporting}
                    className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors disabled:opacity-50"
                >
                    <X size={20} />
                </button>

                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37]">
                        <Share2 size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">Export Folder</h2>
                        <p className="text-xs text-white/40">{folder.name} — {projectMeta.length} project{projectMeta.length === 1 ? '' : 's'}</p>
                    </div>
                </div>

                {!loadedProjects && !loadError && (
                    <div className="py-12 flex flex-col items-center justify-center gap-3 text-white/60">
                        <Loader2 size={28} className="animate-spin text-[#D4AF37]" />
                        <span className="text-xs uppercase tracking-widest">Loading projects...</span>
                    </div>
                )}

                {loadError && (
                    <div className="py-8 px-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
                        Failed to load projects: {loadError}
                    </div>
                )}

                {loadedProjects && !isExporting && !resultBlob && (
                    <>
                        <div className="flex bg-black/20 p-1 rounded-lg mb-6">
                            {([
                                ['video', Film, 'Video'],
                                ['svg', ImageIcon, 'SVG'],
                                ['html', FileCode, 'HTML'],
                                ['react', Code2, 'React'],
                                ['json', FileJson, 'JSON'],
                                ['native', Smartphone, 'Mobile'],
                            ] as const).map(([tab, Icon, label]) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`flex-1 py-1.5 text-[10px] font-bold rounded flex items-center justify-center gap-1.5 transition-all ${activeTab === tab ? 'bg-[#D4AF37] text-black shadow' : 'text-white/40 hover:text-white'}`}
                                >
                                    <Icon size={12} /> {label}
                                </button>
                            ))}
                        </div>

                        {activeTab !== 'json' && (
                            <div className="mb-4 flex items-center justify-between p-3 bg-black/20 border border-[#D4AF37]/20 rounded-lg">
                                <div>
                                    <span className="text-xs font-bold text-white uppercase tracking-wider block">Transparent Background</span>
                                    <span className="text-[10px] text-white/50 block mt-0.5">Applies to every project</span>
                                </div>
                                <ModernToggle checked={transparentBg} onChange={setTransparentBg} label="" />
                            </div>
                        )}

                        {activeTab === 'svg' && (
                            <div className="space-y-3 mb-4">
                                <div className="bg-white/5 border border-white/10 p-3 rounded-lg text-xs text-white/60 leading-relaxed">
                                    Vector snapshot per project. Filters, gradients, and raster sprites are skipped — vectors only. ViewBox auto-fits all geometry.
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Frame</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['first', 'time', 'last'] as const).map(m => (
                                            <button
                                                key={m}
                                                onClick={() => setSvgFrameMode(m)}
                                                className={`px-3 py-2 text-xs rounded-md transition-all ${svgFrameMode === m ? 'bg-[#D4AF37] text-black font-bold' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'}`}
                                            >
                                                {m === 'first' ? 'First' : m === 'last' ? 'Last' : 'At time'}
                                            </button>
                                        ))}
                                    </div>
                                    {svgFrameMode === 'time' && (
                                        <div className="flex items-center gap-2 pt-1">
                                            <input
                                                type="number"
                                                min={0}
                                                step={0.01}
                                                value={svgFrameTime}
                                                onChange={(e) => setSvgFrameTime(parseFloat(e.target.value) || 0)}
                                                className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                                            />
                                            <span className="text-[10px] text-white/40">seconds (clamped per project duration)</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'video' && (
                            <div className="space-y-4 mb-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Resolution</label>
                                        <div className="flex flex-col gap-1">
                                            {VIDEO_RESOLUTIONS.map(res => (
                                                <button
                                                    key={res}
                                                    onClick={() => setResolution(res)}
                                                    className={`px-3 py-2 text-xs rounded-md transition-all text-left ${resolution === res ? 'bg-[#D4AF37] text-black font-bold' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'}`}
                                                >
                                                    {res} <span className="opacity-50 ml-1">{RESOLUTION_LABELS[res]}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Ratio</label>
                                        <div className="flex flex-col gap-1">
                                            {VIDEO_ASPECT_RATIOS.map(ratio => (
                                                <button
                                                    key={ratio}
                                                    onClick={() => setAspectRatio(ratio)}
                                                    className={`px-3 py-2 text-xs rounded-md transition-all text-left ${aspectRatio === ratio ? 'bg-[#D4AF37] text-black font-bold' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'}`}
                                                >
                                                    {ratio} <span className="opacity-50 ml-1">{ASPECT_RATIO_LABELS[ratio]}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Duration</label>
                                    <div className="grid grid-cols-2 gap-2 p-1 bg-black/20 rounded-lg">
                                        <button
                                            onClick={() => setDurationMode('loop')}
                                            className={`px-3 py-2 text-xs rounded-md transition-all ${durationMode === 'loop' ? 'bg-[#D4AF37] text-black font-bold' : 'text-white/40 hover:text-white'}`}
                                        >
                                            By Loops
                                        </button>
                                        <button
                                            onClick={() => setDurationMode('time')}
                                            className={`px-3 py-2 text-xs rounded-md transition-all ${durationMode === 'time' ? 'bg-[#D4AF37] text-black font-bold' : 'text-white/40 hover:text-white'}`}
                                        >
                                            By Time
                                        </button>
                                    </div>
                                    {durationMode === 'loop' ? (
                                        <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/5">
                                            <span className="text-sm text-white/80">Loops per project</span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={10}
                                                value={loopCount}
                                                onChange={(e) => setLoopCount(Math.max(1, parseInt(e.target.value) || 1))}
                                                className="w-16 bg-black/40 border border-white/10 rounded px-2 py-1 text-right text-sm text-[#D4AF37] focus:outline-none focus:border-[#D4AF37]"
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/5">
                                            <span className="text-sm text-white/80">Seconds per project</span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={300}
                                                value={seconds}
                                                onChange={(e) => setSeconds(Math.max(1, parseInt(e.target.value) || 1))}
                                                className="w-16 bg-black/40 border border-white/10 rounded px-2 py-1 text-right text-sm text-[#D4AF37] focus:outline-none focus:border-[#D4AF37]"
                                            />
                                        </div>
                                    )}
                                </div>

                                {supportedFormats.length > 0 && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Format</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {supportedFormats.map(fmt => (
                                                <button
                                                    key={fmt}
                                                    onClick={() => setSelectedFormat(fmt)}
                                                    className={`p-2 rounded-lg border text-left text-xs transition-all ${selectedFormat === fmt ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-white' : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'}`}
                                                >
                                                    <div className="font-bold">{fmt.includes('mp4') ? 'MP4' : 'WebM'}</div>
                                                    <div className="text-[10px] opacity-60 truncate">{fmt.split(';')[0]}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {(activeTab === 'html' || activeTab === 'native') && (
                            <div className="space-y-2 mb-4">
                                {(usesAstro || usesAmino || usesCustomSvg || hasAssetLayers) && (
                                    <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Included Bundles</label>
                                )}
                                {usesAstro && (
                                    <div className="flex items-center justify-between p-2.5 bg-black/20 border border-white/5 rounded-lg">
                                        <span className="text-xs text-white/70">Astro Symbols (legacy)</span>
                                        <ModernToggle checked={includeAstro} onChange={setIncludeAstro} label="" />
                                    </div>
                                )}
                                {usesAmino && (
                                    <div className="flex items-center justify-between p-2.5 bg-black/20 border border-white/5 rounded-lg">
                                        <span className="text-xs text-white/70">Amino Molecules (legacy)</span>
                                        <ModernToggle checked={includeAmino} onChange={setIncludeAmino} label="" />
                                    </div>
                                )}
                                {usesCustomSvg && (
                                    <div className="flex items-center gap-2 p-2.5 bg-black/20 border border-white/5 rounded-lg">
                                        <Check size={10} className="text-green-500" />
                                        <span className="text-xs text-white/50">Custom SVGs included in animation data</span>
                                    </div>
                                )}
                                {hasAssetLayers && (
                                    <div className="flex items-center gap-2 p-2.5 bg-black/20 border border-white/5 rounded-lg">
                                        <Check size={10} className="text-green-500" />
                                        <span className="text-xs text-white/50">Bundling shared asset registry across all projects</span>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="bg-white/5 border border-white/10 p-3 rounded-lg mb-4 max-h-40 overflow-y-auto">
                            <div className="text-[10px] uppercase tracking-widest text-white/40 mb-2">
                                Will export {loadedProjects.length} project{loadedProjects.length === 1 ? '' : 's'}
                            </div>
                            {loadedProjects.map((p, i) => (
                                <div key={p.id} className="text-xs text-white/70 py-0.5 flex items-center gap-2">
                                    <span className="text-white/30 w-5 tabular-nums">{i + 1}.</span>
                                    <span className="truncate">{p.name}</span>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={startExport}
                            className="w-full h-12 bg-[#D4AF37] hover:bg-[#F4CF57] text-black font-bold rounded-lg flex items-center justify-center gap-2 transition-all"
                        >
                            <Download size={18} />
                            Export {loadedProjects.length} Project{loadedProjects.length === 1 ? '' : 's'}
                        </button>
                    </>
                )}

                {loadedProjects && (isExporting || resultBlob || exportError) && (
                    <div className="space-y-4">
                        {/* Aggregate progress */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-white/70 uppercase tracking-widest">
                                    {doneCount} / {totalCount} complete
                                </span>
                                <span className="text-xs text-white/40">{globalMessage}</span>
                            </div>
                            <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-[#D4AF37] transition-all duration-200"
                                    style={{ width: `${aggregatePercent}%` }}
                                />
                            </div>
                        </div>

                        {/* Per-project list */}
                        <div className="bg-black/20 rounded-lg p-2 max-h-72 overflow-y-auto">
                            {loadedProjects.map((p, i) => {
                                const r = rowStates[i] || { status: 'pending' as BatchProgressStatus };
                                let icon: React.ReactNode;
                                if (r.status === 'pending') icon = <Clock size={14} className="text-white/30" />;
                                else if (r.status === 'running') icon = <Loader2 size={14} className="text-[#D4AF37] animate-spin" />;
                                else if (r.status === 'done') icon = <CheckIcon size={14} className="text-green-500" />;
                                else icon = <XIcon size={14} className="text-red-500" />;

                                return (
                                    <div key={p.id} className="flex items-center gap-2 py-1.5 px-2 text-xs">
                                        {icon}
                                        <span className="flex-1 truncate text-white/70">{p.name}</span>
                                        {r.status === 'running' && r.percent !== undefined && (
                                            <span className="text-[10px] text-[#D4AF37] tabular-nums">{Math.round(r.percent)}%</span>
                                        )}
                                        {r.status === 'error' && r.message && (
                                            <span className="text-[10px] text-red-400 truncate max-w-[120px]">{r.message}</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {exportError && (
                            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
                                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                                <span>{exportError}</span>
                            </div>
                        )}

                        <div className="flex gap-2">
                            {isExporting ? (
                                <button
                                    onClick={cancelExport}
                                    className="flex-1 h-11 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 font-bold rounded-lg flex items-center justify-center gap-2 transition-all"
                                >
                                    <X size={16} />
                                    Cancel Export
                                </button>
                            ) : resultBlob ? (
                                <>
                                    <button
                                        onClick={() => triggerDownload(resultBlob, resultName)}
                                        className="flex-1 h-11 bg-[#D4AF37] hover:bg-[#F4CF57] text-black font-bold rounded-lg flex items-center justify-center gap-2 transition-all"
                                    >
                                        <Download size={16} />
                                        Download Again
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="px-6 h-11 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white font-bold rounded-lg transition-all text-xs uppercase tracking-widest"
                                    >
                                        Close
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={onClose}
                                    className="flex-1 h-11 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white font-bold rounded-lg transition-all text-xs uppercase tracking-widest"
                                >
                                    Close
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BatchExportModal;
