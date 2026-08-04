// Shared video export format definitions used by ExportModal and the
// batch exporter. Kept in src/components (not src/utils) so the committed
// player bundles' pre-commit rebuild ignores it — the player never reads
// export formats.

import { REFERENCE_HEIGHT } from './cropPreview';

export const VIDEO_RESOLUTIONS = ['720p', '1080p', '4K'] as const;
export type VideoResolution = typeof VIDEO_RESOLUTIONS[number];

export const VIDEO_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:5'] as const;
export type VideoAspectRatio = typeof VIDEO_ASPECT_RATIOS[number];

export const RESOLUTION_LABELS: Record<VideoResolution, string> = {
    '720p': 'HD',
    '1080p': 'FHD',
    '4K': 'UHD',
};

export const ASPECT_RATIO_LABELS: Record<VideoAspectRatio, string> = {
    '16:9': 'Wide',
    '9:16': 'Vertical',
    '1:1': 'Square',
    '4:5': 'Portrait',
};

// Short side of the frame per tier. For 16:9 this matches the "p" name
// (720/1080/2160 tall); vertical and portrait rotate the same pixel
// budget (e.g. 1080p 9:16 → 1080×1920 for Stories/Reels/TikTok).
const BASE_SIZE: Record<VideoResolution, number> = {
    '720p': 720,
    '1080p': 1080,
    '4K': 2160,
};

export interface VideoDimensions {
    width: number;
    height: number;
    // Stage scale that makes the export show the same content region as
    // the editor's crop-preview guides: full reference height (1080 px of
    // content), width cropped to the ratio. Content positions are absolute
    // px from canvas center, so without this the canvas size would set the
    // framing and each resolution/ratio would show a different region.
    viewScale: number;
}

export function getVideoDimensions(
    resolution: VideoResolution,
    aspectRatio: VideoAspectRatio,
): VideoDimensions {
    const base = BASE_SIZE[resolution];
    let width: number;
    let height: number;
    switch (aspectRatio) {
        case '16:9': width = (base * 16) / 9; height = base; break;
        case '9:16': width = base; height = (base * 16) / 9; break;
        case '1:1': width = base; height = base; break;
        case '4:5': width = base; height = (base * 5) / 4; break;
    }
    return { width, height, viewScale: height / REFERENCE_HEIGHT };
}

// Centers the reference-framed view on a Pixi stage: root layers place
// themselves at screen center, so scaling must keep that point fixed.
export function applyExportViewScale(
    stage: { scale: { set(s: number): void }; position: { set(x: number, y: number): void } },
    dims: VideoDimensions,
): void {
    stage.scale.set(dims.viewScale);
    stage.position.set(
        (dims.width * (1 - dims.viewScale)) / 2,
        (dims.height * (1 - dims.viewScale)) / 2,
    );
}

export function aspectRatioSlug(aspectRatio: VideoAspectRatio): string {
    return aspectRatio.replace(':', 'x');
}
