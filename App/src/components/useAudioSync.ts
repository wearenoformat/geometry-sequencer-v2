import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { audioEngine } from './audioEngine';

/**
 * Keeps the audioEngine's HTMLAudioElement in lockstep with the store's
 * playback state. Mounted once inside GeometryCanvas (only one canvas exists
 * at a time — editor / player / dashboard views are exclusive).
 *
 * While playing, the audio element is the clock master — see
 * GeometryCanvas.handleTick, which re-seeds the ticker time from
 * audioEngine.getProjectTime().
 */
export const useAudioSync = () => {
    const audio = useStore(s => s.project.audio);
    const signedUrlForAsset = useStore(s => s.signedUrlForAsset);
    const isPlaying = useStore(s => s.isPlaying);
    const currentTime = useStore(s => s.currentTime);

    const assetId = audio?.assetId ?? null;
    const offset = audio?.offset ?? 0;

    // Load / switch / unload the track
    useEffect(() => {
        if (!assetId) {
            audioEngine.unload();
            return;
        }
        let cancelled = false;
        audioEngine.load(assetId, () => signedUrlForAsset(assetId)).then(() => {
            if (cancelled) return;
            const state = useStore.getState();
            const a = state.project.audio;
            if (!a || a.assetId !== assetId) return;
            audioEngine.setVolume(a.volume);
            audioEngine.setMuted(a.muted);
            if (state.isPlaying) {
                audioEngine.play(state.currentTime, a.offset);
            }
        });
        return () => {
            cancelled = true;
            audioEngine.unload();
        };
    }, [assetId, signedUrlForAsset]);

    // Play / pause
    useEffect(() => {
        if (!assetId) return;
        if (isPlaying) {
            audioEngine.play(useStore.getState().currentTime, offset);
        } else {
            audioEngine.pause();
        }
    }, [isPlaying, assetId, offset]);

    // Volume / mute
    useEffect(() => {
        if (!audio) return;
        audioEngine.setVolume(audio.volume);
        audioEngine.setMuted(audio.muted);
    }, [audio?.volume, audio?.muted, assetId]);

    // Scrubbing while paused keeps the audio element at the playhead so the
    // next play() starts from the right spot.
    useEffect(() => {
        if (!assetId || isPlaying) return;
        audioEngine.seek(currentTime, offset);
    }, [currentTime, offset, isPlaying, assetId]);
};
