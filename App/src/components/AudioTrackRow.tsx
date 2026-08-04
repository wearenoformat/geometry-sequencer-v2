import React, { useEffect, useRef, useState } from 'react';
import { Music, Volume2, VolumeX, X, Loader2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useStore } from '../store/useStore';
import { audioEngine, type WaveformPeaks } from './audioEngine';
import WaveformCanvas from './WaveformCanvas';

interface AudioTrackRowProps {
    sidebarWidth: number;
}

/**
 * The project's music track — a single pinned row rendered between the
 * Timeline ruler and the layer list. Visually blue to stand apart from the
 * gold-accented geometry layers. Shows the decoded waveform so keyframes can
 * be aligned to beats; the block can be dragged horizontally to offset where
 * the audio starts on the project timeline.
 */
const AudioTrackRow: React.FC<AudioTrackRowProps> = ({ sidebarWidth }) => {
    const project = useStore(s => s.project);
    const currentTime = useStore(s => s.currentTime);
    const attachProjectAudio = useStore(s => s.attachProjectAudio);
    const removeProjectAudio = useStore(s => s.removeProjectAudio);
    const updateProject = useStore(s => s.updateProject);
    const signedUrlForAsset = useStore(s => s.signedUrlForAsset);

    const audio = project.audio;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const trackAreaRef = useRef<HTMLDivElement>(null);

    const [uploading, setUploading] = useState(false);
    const [peaks, setPeaks] = useState<WaveformPeaks | null>(null);
    const [peaksState, setPeaksState] = useState<'idle' | 'loading' | 'failed'>('idle');

    // Expanded (3× layer height) shows the waveform in detail; collapsed matches
    // a normal layer row. Persisted like the sidebar width.
    const [expanded, setExpanded] = useState(() => localStorage.getItem('audioRowExpanded') !== '0');
    const toggleExpanded = () => {
        setExpanded((prev) => {
            localStorage.setItem('audioRowExpanded', prev ? '0' : '1');
            return !prev;
        });
    };
    const tall = !!audio && expanded;

    // Decode waveform peaks (cached per asset in audioEngine)
    useEffect(() => {
        setPeaks(null);
        if (!audio?.assetId) {
            setPeaksState('idle');
            return;
        }
        let cancelled = false;
        setPeaksState('loading');
        audioEngine.getPeaks(audio.assetId, () => signedUrlForAsset(audio.assetId)).then((p) => {
            if (cancelled) return;
            setPeaks(p);
            setPeaksState(p ? 'idle' : 'failed');
        });
        return () => { cancelled = true; };
    }, [audio?.assetId, signedUrlForAsset]);

    // --- Offset drag (move the audio block along the timeline) ---
    const dragRef = useRef<{ startX: number; startOffset: number } | null>(null);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            const drag = dragRef.current;
            const area = trackAreaRef.current;
            const a = useStore.getState().project.audio;
            if (!drag || !area || !a) return;
            const secondsPerPx = project.duration / area.getBoundingClientRect().width;
            const rawOffset = drag.startOffset + (e.clientX - drag.startX) * secondsPerPx;
            // Keep at least half a second of audio inside the project window.
            const clamped = Math.max(-(a.audioDuration - 0.5), Math.min(project.duration - 0.5, rawOffset));
            const snapped = Math.abs(clamped) < 0.1 ? 0 : clamped; // snap to 0
            updateProject({ audio: { ...a, offset: snapped } }, true);
        };
        const onUp = () => {
            const drag = dragRef.current;
            const a = useStore.getState().project.audio;
            if (drag && a && a.offset !== drag.startOffset) {
                // Rewind to the pre-drag value silently, then apply the final value
                // through history so a single undo restores the original offset.
                const finalOffset = a.offset;
                updateProject({ audio: { ...a, offset: drag.startOffset } }, true);
                updateProject({ audio: { ...a, offset: finalOffset } });
            }
            dragRef.current = null;
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [project.duration, updateProject]);

    // --- Volume drag (single undo step per drag) ---
    const volumeDragStart = useRef<number | null>(null);

    const handleFilePicked = async (file: File | undefined | null) => {
        if (!file) return;
        setUploading(true);
        try {
            await attachProjectAudio(file);
        } finally {
            setUploading(false);
        }
    };

    const blockLeftPct = audio ? (audio.offset / project.duration) * 100 : 0;
    const blockWidthPct = audio && audio.audioDuration > 0
        ? (audio.audioDuration / project.duration) * 100
        : 100;

    return (
        <div className={`flex ${tall ? 'h-[120px]' : 'h-10'} border-b border-blue-400/20 bg-blue-500/[0.07] relative shrink-0 transition-[height] duration-150`}>
            {/* Sidebar cell */}
            <div
                style={{ width: sidebarWidth }}
                className="border-r border-white/10 flex items-center px-3 gap-2 shrink-0 overflow-hidden"
            >
                {audio && (
                    <button
                        onClick={toggleExpanded}
                        className="p-0.5 rounded text-blue-300/60 hover:text-blue-200 hover:bg-white/10 transition-colors shrink-0"
                        title={expanded ? 'Collapse music row' : 'Expand music row'}
                    >
                        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                )}
                <Music size={12} className="text-blue-400 shrink-0" />
                {audio ? (
                    <>
                        <span className="text-[10px] text-blue-200/80 truncate flex-1 min-w-0" title={audio.fileName}>
                            {audio.fileName}
                        </span>
                        <button
                            onClick={() => updateProject({ audio: { ...audio, muted: !audio.muted } })}
                            className={`p-1 rounded hover:bg-white/10 transition-colors shrink-0 ${audio.muted ? 'text-white/30' : 'text-blue-400'}`}
                            title={audio.muted ? 'Unmute' : 'Mute'}
                        >
                            {audio.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                        </button>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(audio.volume * 100)}
                            onPointerDown={() => { volumeDragStart.current = audio.volume; }}
                            onPointerUp={() => {
                                const start = volumeDragStart.current;
                                volumeDragStart.current = null;
                                const a = useStore.getState().project.audio;
                                if (start !== null && a && a.volume !== start) {
                                    const finalVolume = a.volume;
                                    updateProject({ audio: { ...a, volume: start } }, true);
                                    updateProject({ audio: { ...a, volume: finalVolume } });
                                }
                            }}
                            onChange={(e) => updateProject({ audio: { ...audio, volume: Number(e.target.value) / 100 } }, true)}
                            className="w-14 shrink-0 accent-blue-400"
                            title="Music volume"
                        />
                        <button
                            onClick={removeProjectAudio}
                            className="p-1 rounded text-white/30 hover:text-red-400 hover:bg-white/10 transition-colors shrink-0"
                            title="Remove music"
                        >
                            <X size={12} />
                        </button>
                    </>
                ) : (
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-blue-300/80 hover:text-blue-200 transition-colors disabled:opacity-50"
                    >
                        {uploading ? <Loader2 size={10} className="animate-spin" /> : null}
                        {uploading ? 'Uploading…' : 'Add Music'}
                    </button>
                )}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp3,audio/mpeg"
                    className="hidden"
                    onChange={(e) => {
                        handleFilePicked(e.target.files?.[0]);
                        e.target.value = '';
                    }}
                />
            </div>

            {/* Track area */}
            <div ref={trackAreaRef} className="flex-1 relative border-l border-white/5 overflow-hidden">
                {audio && (
                    <div
                        className="absolute top-1 bottom-1 rounded-sm bg-blue-500/15 border border-blue-400/40 cursor-grab active:cursor-grabbing overflow-hidden"
                        style={{ left: `${blockLeftPct}%`, width: `${blockWidthPct}%` }}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            dragRef.current = { startX: e.clientX, startOffset: audio.offset };
                        }}
                        title={`${audio.fileName} — drag to offset the music`}
                    >
                        {peaks && <WaveformCanvas peaks={peaks} color="rgba(96,165,250,0.75)" />}
                        {peaksState === 'loading' && (
                            <div className="absolute inset-0 flex items-center justify-center text-blue-300/50">
                                <Loader2 size={12} className="animate-spin" />
                            </div>
                        )}
                        {peaksState === 'failed' && (
                            <div className="absolute inset-0 flex items-center justify-center gap-1.5 text-red-400/80 text-[9px] uppercase tracking-widest">
                                <AlertCircle size={10} /> Audio unavailable
                            </div>
                        )}
                    </div>
                )}

                {/* Row-local playhead (the layer list has its own full-height one) */}
                <div
                    className="absolute top-0 bottom-0 w-[1px] bg-[#D4AF37] pointer-events-none"
                    style={{ left: `${(currentTime / project.duration) * 100}%` }}
                />
            </div>
        </div>
    );
};

export default AudioTrackRow;
