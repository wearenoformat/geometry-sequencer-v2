import React, { useEffect, useRef } from 'react';
import type { WaveformPeaks } from './audioEngine';

interface WaveformCanvasProps {
    peaks: WaveformPeaks;
    color?: string;
}

/**
 * Draws min/max audio peaks into a canvas that fills its parent. Memoized so
 * it never re-renders during playback (Timeline re-renders every frame while
 * playing) — it only redraws when the peaks object or its own size change.
 */
const WaveformCanvas: React.FC<WaveformCanvasProps> = React.memo(({ peaks, color = '#60A5FA' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !canvas.parentElement) return;

        const draw = () => {
            const parent = canvas.parentElement;
            if (!parent) return;
            const width = parent.clientWidth;
            const height = parent.clientHeight;
            if (width === 0 || height === 0) return;

            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, width, height);

            // DAW-style split view: left channel above the centerline, right
            // channel mirrored below, drawn as thin bars with hairline gaps so
            // transients/beats read as distinct spikes.
            const mid = height / 2;
            const half = mid - 1;
            const { left, right, buckets } = peaks;
            const BAR = 2;
            const GAP = 1;

            const envelopeAt = (env: Float32Array, x0: number, x1: number) => {
                const b0 = Math.floor((x0 / width) * buckets);
                const b1 = Math.max(b0 + 1, Math.ceil((x1 / width) * buckets));
                let peak = 0;
                for (let b = b0; b < b1 && b < buckets; b++) {
                    if (env[b] > peak) peak = env[b];
                }
                return peak;
            };

            ctx.fillStyle = color;
            for (let x = 0; x < width; x += BAR + GAP) {
                const up = envelopeAt(left, x, x + BAR) * half;
                const down = envelopeAt(right, x, x + BAR) * half;
                ctx.fillRect(x, mid - Math.max(1, up), BAR, Math.max(1, up));
                ctx.fillRect(x, mid, BAR, Math.max(1, down));
            }

            // Centerline separating left / right channels.
            ctx.fillStyle = 'rgba(147, 197, 253, 0.5)';
            ctx.fillRect(0, mid - 0.5, width, 1);
        };

        draw();
        const observer = new ResizeObserver(draw);
        observer.observe(canvas.parentElement);
        return () => observer.disconnect();
    }, [peaks, color]);

    return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />;
});

WaveformCanvas.displayName = 'WaveformCanvas';

export default WaveformCanvas;
