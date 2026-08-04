/**
 * Editor-side audio engine for the project music track.
 *
 * Lives in src/components (not src/utils) deliberately: this is editor-only
 * code and utils/ paths trigger the pre-commit player-bundle rebuild (see
 * .githooks/pre-commit). The exported player has its own, dependency-free
 * audio handling in src/player.ts.
 *
 * One HTMLAudioElement plays the track; while playback is running the element
 * is the clock master (GeometryCanvas re-seeds the ticker time from
 * getProjectTime()). Peaks for the timeline waveform are decoded once per
 * asset per session and cached.
 */

export interface WaveformPeaks {
    /** Peak envelope (0..1, normalized) per bucket — left / right channel.
     *  Mono sources duplicate the same envelope into both. */
    left: Float32Array;
    right: Float32Array;
    buckets: number;
}

const PEAK_BUCKETS = 2000;

type GetUrl = () => Promise<string | null>;

const peaksCache = new Map<string, Promise<WaveformPeaks | null>>();
const bufferCache = new Map<string, Promise<AudioBuffer | null>>();

const getAudioContextCtor = (): typeof AudioContext | null => {
    if (typeof window === 'undefined') return null;
    return window.AudioContext || (window as any).webkitAudioContext || null;
};

/**
 * Fetch + decode an asset's audio data. Shared by the waveform (peaks) and the
 * video exporter (buffer sources). Cached per assetId for the session.
 */
export const decodeAudioAsset = (assetId: string, getUrl: GetUrl): Promise<AudioBuffer | null> => {
    let cached = bufferCache.get(assetId);
    if (!cached) {
        cached = (async () => {
            const Ctor = getAudioContextCtor();
            if (!Ctor) return null;
            const url = await getUrl();
            if (!url) return null;
            const res = await fetch(url);
            if (!res.ok) return null;
            const raw = await res.arrayBuffer();
            // decodeAudioData detaches the buffer on Safari — hand it a copy.
            const ctx = new Ctor();
            try {
                return await ctx.decodeAudioData(raw.slice(0));
            } finally {
                ctx.close().catch(() => { /* ignore */ });
            }
        })().catch((e) => {
            console.error('Failed to decode audio asset', e);
            bufferCache.delete(assetId);
            return null;
        });
        bufferCache.set(assetId, cached);
    }
    return cached;
};

const channelEnvelope = (channel: Float32Array): Float32Array => {
    const out = new Float32Array(PEAK_BUCKETS);
    const samplesPerBucket = Math.max(1, Math.floor(channel.length / PEAK_BUCKETS));
    for (let b = 0; b < PEAK_BUCKETS; b++) {
        const start = b * samplesPerBucket;
        const end = Math.min(channel.length, start + samplesPerBucket);
        let peak = 0;
        for (let i = start; i < end; i++) {
            const v = Math.abs(channel[i]);
            if (v > peak) peak = v;
        }
        out[b] = peak;
    }
    return out;
};

const computePeaks = (buffer: AudioBuffer): WaveformPeaks => {
    const left = channelEnvelope(buffer.getChannelData(0));
    const right = buffer.numberOfChannels > 1
        ? channelEnvelope(buffer.getChannelData(1))
        : left.slice();

    // Normalize so the loudest peak fills the full height (quiet masters would
    // otherwise render as a sliver), then apply a mild power curve so quieter
    // passages stay visible between beats.
    let max = 0;
    for (let i = 0; i < PEAK_BUCKETS; i++) {
        if (left[i] > max) max = left[i];
        if (right[i] > max) max = right[i];
    }
    if (max > 0) {
        for (let i = 0; i < PEAK_BUCKETS; i++) {
            left[i] = Math.pow(left[i] / max, 0.7);
            right[i] = Math.pow(right[i] / max, 0.7);
        }
    }
    return { left, right, buckets: PEAK_BUCKETS };
};

class AudioEngine {
    private el: HTMLAudioElement | null = null;
    private loadedAssetId: string | null = null;
    private getUrl: GetUrl | null = null;
    private retriedUrl = false;

    /** Load (or switch to) an asset. Resolves when metadata is ready or on error. */
    async load(assetId: string, getUrl: GetUrl): Promise<void> {
        if (this.loadedAssetId === assetId && this.el) return;
        this.unload();

        this.loadedAssetId = assetId;
        this.getUrl = getUrl;
        this.retriedUrl = false;

        const url = await getUrl();
        // A newer load/unload may have raced us while awaiting.
        if (this.loadedAssetId !== assetId) return;
        if (!url) {
            this.loadedAssetId = null;
            return;
        }

        const el = new Audio(url);
        el.preload = 'auto';
        // Signed URLs expire after an hour — retry once with a fresh URL.
        el.onerror = async () => {
            if (this.retriedUrl || this.el !== el || !this.getUrl) return;
            this.retriedUrl = true;
            const fresh = await this.getUrl();
            if (fresh && this.el === el) {
                const t = el.currentTime;
                el.src = fresh;
                el.currentTime = t;
            }
        };
        this.el = el;
    }

    unload(): void {
        if (this.el) {
            this.el.pause();
            this.el.src = '';
        }
        this.el = null;
        this.loadedAssetId = null;
        this.getUrl = null;
    }

    get currentAssetId(): string | null {
        return this.loadedAssetId;
    }

    private audioTimeFor(projectTime: number, offset: number): number {
        return Math.max(0, projectTime - offset);
    }

    play(projectTime: number, offset: number): void {
        const el = this.el;
        if (!el) return;
        el.currentTime = this.audioTimeFor(projectTime, offset);
        // Autoplay policy can reject play() without a user gesture (e.g. player
        // view autostart) — visuals keep running silently in that case.
        el.play().catch(() => { /* ignore */ });
    }

    pause(): void {
        this.el?.pause();
    }

    seek(projectTime: number, offset: number): void {
        const el = this.el;
        if (!el) return;
        el.currentTime = this.audioTimeFor(projectTime, offset);
    }

    setVolume(volume: number): void {
        if (this.el) this.el.volume = Math.max(0, Math.min(1, volume));
    }

    setMuted(muted: boolean): void {
        if (this.el) this.el.muted = muted;
    }

    /**
     * The project time implied by the audio clock, or null when audio isn't
     * actively playing (paused / not loaded / past the end of the track).
     */
    getProjectTime(offset: number): number | null {
        const el = this.el;
        if (!el || el.paused || el.ended) return null;
        return el.currentTime + offset;
    }

    /** Decoded waveform peaks for the timeline row. Cached per asset. */
    getPeaks(assetId: string, getUrl: GetUrl): Promise<WaveformPeaks | null> {
        let cached = peaksCache.get(assetId);
        if (!cached) {
            cached = decodeAudioAsset(assetId, getUrl).then((buffer) =>
                buffer ? computePeaks(buffer) : null
            );
            peaksCache.set(assetId, cached);
        }
        return cached;
    }
}

export const audioEngine = new AudioEngine();
