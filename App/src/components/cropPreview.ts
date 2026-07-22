// Editor-only preview crops. Each is a centered region of the 1920×1080
// reference frame — they only mask what's shown in the editor, never resizing/
// moving the animation or touching export. Ratios must be <= the reference
// ratio (all are "full height, crop the width"). Kept in src/components (not
// src/constants) so the committed player bundles' pre-commit rebuild ignores it.

export interface CropOption {
    id: string;
    label: string;
    ratio: number; // width / height
}

export const REFERENCE_WIDTH = 1920;
export const REFERENCE_HEIGHT = 1080;
export const REFERENCE_RATIO = REFERENCE_WIDTH / REFERENCE_HEIGHT; // 16:9

export const CROP_OPTIONS: CropOption[] = [
    { id: 'full', label: '16:9', ratio: REFERENCE_RATIO },
    { id: '4-3', label: '4:3', ratio: 4 / 3 },
    { id: '1-1', label: '1:1', ratio: 1 },
    { id: '4-5', label: '4:5', ratio: 4 / 5 },
    { id: '9-16', label: '9:16', ratio: 9 / 16 },
];

export const CROP_STORAGE_KEY = 'v2-editor-crop';

export const getCropOption = (id: string): CropOption =>
    CROP_OPTIONS.find((c) => c.id === id) ?? CROP_OPTIONS[0];
