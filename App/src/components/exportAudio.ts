import type { Project } from '../types';
import { decodeAudioAsset } from './audioEngine';

/**
 * Audio side of the video exporter. Decodes the project's music track once,
 * then schedules one AudioBufferSourceNode per visual loop into a
 * MediaStreamDestination whose track is merged with the canvas capture stream
 * BEFORE the MediaRecorder is created (tracks can't be added mid-recording).
 *
 * Lives in src/components (editor-only) so it doesn't trigger the pre-commit
 * player-bundle rebuild.
 */
export interface ExportAudioGraph {
    track: MediaStreamTrack;
    /** Schedule playback. Call immediately after MediaRecorder.start(). */
    start: (totalDuration: number, loopDuration: number) => void;
    /** Stop sources and close the AudioContext. Call after stopRecording(). */
    dispose: () => Promise<void>;
}

/**
 * Returns null when the project has no audible audio (none attached, muted,
 * or volume 0) — the export then behaves exactly as before, with no silent
 * audio track changing the output file.
 */
export async function createExportAudioGraph(
    project: Project,
    getUrl: (assetId: string) => Promise<string | null>
): Promise<ExportAudioGraph | null> {
    const audio = project.audio;
    if (!audio || audio.muted || audio.volume <= 0) return null;

    const buffer = await decodeAudioAsset(audio.assetId, () => getUrl(audio.assetId));
    if (!buffer) return null;

    const Ctor: typeof AudioContext | undefined =
        window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;

    const ctx = new Ctor();
    // The export button click is a gesture, but Safari sometimes still starts
    // contexts suspended.
    await ctx.resume().catch(() => { /* ignore */ });

    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, audio.volume));
    const dest = ctx.createMediaStreamDestination();
    gain.connect(dest);

    const sources: AudioBufferSourceNode[] = [];

    const start = (totalDuration: number, loopDuration: number) => {
        const base = ctx.currentTime;
        // Where the audio sits inside each loop: positive offset delays the
        // audio start, negative offset skips into the track.
        const startInLoop = Math.max(0, audio.offset);
        const bufferOffset = Math.max(0, -audio.offset);
        if (bufferOffset >= buffer.duration) return;

        const loops = Math.max(1, Math.ceil(totalDuration / loopDuration));
        for (let i = 0; i < loops; i++) {
            const loopStart = i * loopDuration;
            const when = loopStart + startInLoop;
            if (when >= totalDuration) break;
            // Trim to the loop boundary and to the overall export length.
            const playLength = Math.min(
                buffer.duration - bufferOffset,
                loopDuration - startInLoop,
                totalDuration - when
            );
            if (playLength <= 0) continue;

            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.connect(gain);
            src.start(base + when, bufferOffset, playLength);
            sources.push(src);
        }
    };

    const dispose = async () => {
        for (const src of sources) {
            try { src.stop(); } catch { /* already stopped */ }
        }
        await ctx.close().catch(() => { /* ignore */ });
    };

    return { track: dest.stream.getAudioTracks()[0], start, dispose };
}
