// ─── Export helpers shared by single-project + batch-folder exports ──────
//
// Extracted from ExportModal.tsx so the batch-export module can reuse the
// same asset-collection / blob-fetching / template-escaping logic without
// duplicating it. Single-project flow goes through these too.

import { useStore } from '../store/useStore';
import { supabase } from '../supabaseClient';
import type { Project, Asset, AssetMimeType } from '../types';

export type CollectedAsset = {
    id: string;
    mimeType: AssetMimeType;
    storagePath: string;
    blob: Blob;
    extension: string;
};

export type CollectedExport = {
    assets: CollectedAsset[];
    folders: Record<string, string[]>; // ordered asset ids per folder id
};

export const extensionForMime = (mime: AssetMimeType): string => {
    switch (mime) {
        case 'image/svg+xml': return 'svg';
        case 'image/png':     return 'png';
        case 'image/jpeg':    return 'jpg';
        case 'text/plain':    return 'txt';
        default:              return 'bin';
    }
};

export const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => {
            const result = reader.result as string;
            const comma = result.indexOf(',');
            resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.readAsDataURL(blob);
    });

// Walks the project, fetches every asset referenced by asset_set / asset_single
// layers (including all assets in any referenced folder, in order), and returns
// them as in-memory blobs ready to be written into a zip.
export async function collectExportAssets(
    project: Project,
    onStatus: (msg: string) => void,
): Promise<CollectedExport> {
    const folderIds = new Set<string>();
    const singleAssetIds = new Set<string>();

    for (const layer of project.layers) {
        if (layer.type === 'asset_set' && layer.config.assetFolderId) {
            folderIds.add(layer.config.assetFolderId);
        } else if (layer.type === 'asset_single' && layer.config.assetId) {
            singleAssetIds.add(layer.config.assetId);
        }
    }

    if (folderIds.size === 0 && singleAssetIds.size === 0) {
        return { assets: [], folders: {} };
    }

    const store = useStore.getState();
    const { user } = store;
    if (!user) throw new Error('You must be signed in to export assets.');

    onStatus('Loading asset folders...');
    const folders: Record<string, string[]> = {};
    const assetMeta = new Map<string, Asset>();

    for (const folderId of folderIds) {
        const list = await store.fetchAssets(folderId);
        folders[folderId] = list.map(a => a.id);
        for (const a of list) assetMeta.set(a.id, a);
    }

    const missingSingleIds = [...singleAssetIds].filter(id => !assetMeta.has(id));
    if (missingSingleIds.length) {
        const { data, error } = await supabase
            .from('assets')
            .select('id, folder_id, name, mime_type, storage_path, size_bytes, width, height, last_modified')
            .eq('user_id', user.id)
            .in('id', missingSingleIds);
        if (error) throw new Error(`Failed to load asset metadata: ${error.message}`);
        for (const row of (data ?? []) as Array<{
            id: string; folder_id: string | null; name: string;
            mime_type: AssetMimeType; storage_path: string;
            size_bytes: number | null; width: number | null;
            height: number | null; last_modified: number | null;
        }>) {
            assetMeta.set(row.id, {
                id: row.id,
                folderId: row.folder_id,
                name: row.name,
                mimeType: row.mime_type,
                storagePath: row.storage_path,
                sizeBytes: row.size_bytes,
                width: row.width,
                height: row.height,
                lastModified: row.last_modified,
                sortOrder: null,
            });
        }
    }

    const allIds = new Set<string>();
    for (const ids of Object.values(folders)) for (const id of ids) allIds.add(id);
    for (const id of singleAssetIds) allIds.add(id);

    const idList = [...allIds];
    onStatus(`Fetching ${idList.length} asset${idList.length === 1 ? '' : 's'}...`);

    let completed = 0;
    const collected: CollectedAsset[] = await Promise.all(
        idList.map(async (id) => {
            const meta = assetMeta.get(id);
            if (!meta) throw new Error(`Asset ${id} referenced by project but not found.`);
            const url = await store.signedUrlForAsset(id);
            if (!url) throw new Error(`Could not get download URL for asset ${meta.name}.`);
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`Failed to download ${meta.name}: HTTP ${resp.status}`);
            const blob = await resp.blob();
            completed += 1;
            onStatus(`Fetched ${completed}/${idList.length} assets...`);
            return {
                id: meta.id,
                mimeType: meta.mimeType,
                storagePath: meta.storagePath,
                blob,
                extension: extensionForMime(meta.mimeType),
            };
        })
    );

    return { assets: collected, folders };
}

// Total count of layers that will need bundled assets to render.
export const countAssetLayers = (project: Project): number =>
    project.layers.reduce(
        (n, l) => n + (
            (l.type === 'asset_set' && l.config.assetFolderId) ||
            (l.type === 'asset_single' && l.config.assetId)
                ? 1 : 0
        ),
        0
    );

// Fetches the runtime bundles from /public — shared script payload that's
// embedded into HTML / RN exports so they run offline.
export type LoadedPlayerBundles = {
    pixiScript: string;
    playerScript: string;
    astroScript: string;
    aminoScript: string;
};

export async function loadPlayerBundles(opts: {
    includeAstro: boolean;
    includeAmino: boolean;
    signal?: AbortSignal;
}): Promise<LoadedPlayerBundles> {
    const { includeAstro, includeAmino, signal } = opts;
    if (signal?.aborted) throw new Error('Aborted');

    const v = Date.now();
    const fetchOpts: RequestInit = signal ? { signal } : {};

    const [pixiRes, playerRes] = await Promise.all([
        fetch('./pixi-bundle.js?v=' + v, fetchOpts),
        fetch('./player.js?v=' + v, fetchOpts),
    ]);
    if (!pixiRes.ok) throw new Error('Failed to load PixiJS bundle');
    if (!playerRes.ok) throw new Error('Failed to load player bundle');

    const pixiScript = await pixiRes.text();
    const playerScript = await playerRes.text();

    let astroScript = '';
    let aminoScript = '';
    if (includeAstro) {
        const res = await fetch('./astro-data.js?v=' + v, fetchOpts);
        if (res.ok) astroScript = await res.text();
    }
    if (includeAmino) {
        const res = await fetch('./amino-data.js?v=' + v, fetchOpts);
        if (res.ok) aminoScript = await res.text();
    }

    if (signal?.aborted) throw new Error('Aborted');

    return { pixiScript, playerScript, astroScript, aminoScript };
}

// Merges multiple per-project CollectedExport results into one, deduping
// assets by id and preserving each folder's ordering. Folder lists are
// taken from the first project that referenced that folder.
export function mergeCollectedAssets(collected: CollectedExport[]): CollectedExport {
    const assetsById = new Map<string, CollectedAsset>();
    const folders: Record<string, string[]> = {};

    for (const c of collected) {
        for (const a of c.assets) {
            if (!assetsById.has(a.id)) assetsById.set(a.id, a);
        }
        for (const [folderId, ids] of Object.entries(c.folders)) {
            if (!folders[folderId]) folders[folderId] = ids.slice();
        }
    }

    return { assets: [...assetsById.values()], folders };
}

export const escapeForTemplate = (src: string) => src
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');

export const safeFilename = (name: string) =>
    name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

// Returns a shallow copy of the project with `thumbnailData` removed. Batch
// flows stamp `thumbnailData` onto loaded Project objects so the gallery
// page can use them, but we don't want that base64 payload bloating the
// exported `.json` files — the PNG is written as a sibling file instead.
export const stripThumbnail = <T extends { thumbnailData?: string }>(p: T): Omit<T, 'thumbnailData'> => {
    const { thumbnailData: _ignored, ...rest } = p;
    void _ignored;
    return rest;
};

// Splits a `data:<mime>;base64,<body>` URL into its parts. Returns null
// for anything that isn't a base64 data URL (we don't try to handle
// URL-encoded data URLs — the thumbnail generator always emits base64).
export const parseDataUrl = (dataUrl: string): { mime: string; base64: string } | null => {
    const match = /^data:([^;,]+);base64,(.*)$/i.exec(dataUrl);
    if (!match) return null;
    return { mime: match[1], base64: match[2] };
};

// `image/png` → `png`, `image/jpeg` → `jpg`, etc. Used when writing
// extracted thumbnails into the export zip.
export const extensionForImageMime = (mime: string): string => {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
    if (mime === 'image/webp') return 'webp';
    return 'png';
};
