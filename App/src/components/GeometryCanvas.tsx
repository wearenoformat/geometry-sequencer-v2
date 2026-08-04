import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import GeometryPlayer from './GeometryPlayer';
import { getCropOption, REFERENCE_WIDTH, REFERENCE_HEIGHT } from './cropPreview';
import { audioEngine } from './audioEngine';
import { useAudioSync } from './useAudioSync';

interface GeometryCanvasProps {
    /** Editor mode: render at a fixed reference frame (scaled to fit) with a
     *  checkerboard surround and the top-bar crop preview applied. Off elsewhere
     *  (Player, dashboard preview), which fill their container as before. */
    framed?: boolean;
}

// Fixed reference resolution for the framed editor preview. Content is
// positioned in absolute pixels from center, so rendering at a fixed frame
// (rather than the panel's own pixel size) keeps the full composition visible
// and consistently framed — objectFit:contain scales it to fit the panel.
// Matches what a fullscreen 1920×1080 browser export shows.
const EDITOR_REFERENCE = { width: REFERENCE_WIDTH, height: REFERENCE_HEIGHT };

const GeometryCanvas: React.FC<GeometryCanvasProps> = ({ framed = false }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const {
        project,
        currentTime,
        isPlaying,
        isLooping,
        exportSettings,
        editorPreviewCrop,
        setCurrentTime,
        setIsPlaying
    } = useStore();

    // Keep the music track's audio element in lockstep with playback state.
    useAudioSync();

    const [dimensions, setDimensions] = useState(
        framed ? EDITOR_REFERENCE : { width: 800, height: 600 }
    );
    // Panel pixel size — needed to clip the canvas to the centered crop band.
    const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });

    const crop = getCropOption(editorPreviewCrop);

    // Handle Resizing
    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                setPanelSize({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight
                });
            }

            if (exportSettings.isActive) {
                // Export preview overrides with the export target size.
                setDimensions({ width: exportSettings.width, height: exportSettings.height });
            } else if (framed) {
                // Fixed reference frame; objectFit:contain scales it to the panel.
                setDimensions(EDITOR_REFERENCE);
            } else if (containerRef.current) {
                // Fill the container (Player / dashboard preview).
                setDimensions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight
                });
            }
        };

        const observer = new ResizeObserver(() => updateDimensions());
        if (containerRef.current) observer.observe(containerRef.current);

        updateDimensions();

        return () => observer.disconnect();
    }, [framed, exportSettings.isActive, exportSettings.width, exportSettings.height]);

    // Handle Ticker from GeometryPlayer
    const handleTick = (dt: number) => {
        if (!isPlaying) return;

        let nextTime = currentTime + dt;
        let wrapped = false;
        if (nextTime >= project.duration) {
            if (isLooping) {
                nextTime = 0;
                wrapped = true;
            } else {
                nextTime = project.duration;
                setIsPlaying(false);
                audioEngine.pause();
            }
        }

        // With a music track loaded, the audio element is the clock master —
        // the accumulated ticker time drifts against it, so re-seed each frame.
        const audio = project.audio;
        if (audio) {
            if (wrapped) {
                // Loop boundary: restart the audio (seeking a playing element
                // keeps it playing).
                audioEngine.seek(0, audio.offset);
            } else {
                const audioTime = audioEngine.getProjectTime(audio.offset);
                if (audioTime !== null) {
                    const drift = audioTime - nextTime;
                    if (Math.abs(drift) > 0.3) {
                        // Big gap = the playhead was scrubbed while playing —
                        // follow the playhead, not the audio.
                        audioEngine.seek(nextTime, audio.offset);
                    } else if (Math.abs(drift) > 0.05) {
                        nextTime = Math.min(audioTime, project.duration);
                    }
                }
            }
        }

        setCurrentTime(nextTime);
    };

    // Compute the clip-path that trims the canvas to the centered crop band.
    // The animation itself is untouched — we only hide what's outside the band,
    // and the checkerboard behind shows through (single layer → no seams).
    const cropActive = framed && !exportSettings.isActive && panelSize.width > 0 && panelSize.height > 0;
    let clipPath: string | undefined;
    if (cropActive) {
        const scale = Math.min(panelSize.width / EDITOR_REFERENCE.width, panelSize.height / EDITOR_REFERENCE.height);
        const frameW = EDITOR_REFERENCE.width * scale;
        const frameH = EDITOR_REFERENCE.height * scale;
        const bandH = frameH;
        const bandW = Math.min(frameW, frameH * crop.ratio);
        const insetX = Math.max(0, (panelSize.width - bandW) / 2);
        const insetY = Math.max(0, (panelSize.height - bandH) / 2);
        clipPath = `inset(${insetY}px ${insetX}px)`;
    }

    // Subtle checkerboard so the area outside the canvas reads as "not the
    // canvas" (the clipped canvas is drawn opaque over this). Editor mode only.
    const checkerStyle: React.CSSProperties = framed ? {
        backgroundColor: '#1a1d24',
        backgroundImage:
            'linear-gradient(45deg, #23272f 25%, transparent 25%),' +
            'linear-gradient(-45deg, #23272f 25%, transparent 25%),' +
            'linear-gradient(45deg, transparent 75%, #23272f 75%),' +
            'linear-gradient(-45deg, transparent 75%, #23272f 75%)',
        backgroundSize: '24px 24px',
        backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
    } : {};

    return (
        <div
            ref={containerRef}
            className={`w-full h-full overflow-hidden relative ${framed ? '' : 'bg-[#1a1d24]'}`}
            style={checkerStyle}
        >
            <div className="w-full h-full" style={clipPath ? { clipPath } : undefined}>
                <GeometryPlayer
                    project={project}
                    width={dimensions.width}
                    height={dimensions.height}
                    currentTime={currentTime}
                    isPlaying={isPlaying}
                    backgroundColor={project.backgroundColor}
                    onTick={handleTick}
                    letterboxTransparent={framed}
                />
            </div>
        </div>
    );
};

export default GeometryCanvas;
