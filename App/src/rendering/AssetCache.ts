import { Assets, GraphicsContext, Texture } from 'pixi.js';
import { recolorSvg, type SvgRecolorOptions } from '../utils/svgRecolor';

type LoadInfo = { url: string; mimeType: string };
type UrlProvider = (assetId: string) => Promise<LoadInfo | null>;
export type AssetEntry = { id: string; mimeType: string };
type FolderAssetsProvider = (folderId: string | null) => AssetEntry[];

class AssetCacheImpl {
    // Raster (PNG/JPEG) sprites only. SVGs render through `contexts` instead so
    // fill-rule knockouts and compound paths survive — rasterizing via Pixi's
    // SVG-to-canvas path drops those semantics on complex artwork.
    private textures = new Map<string, Texture>();
    // Pixi v8 GraphicsContext per (assetId[, colorKey]) — shared across every
    // Graphics instance the renderer creates for that asset/variant, so 100
    // copies of the same icon batch as one draw call.
    private contexts = new Map<string, GraphicsContext>();
    private svgSources = new Map<string, string>();
    private mimeTypes = new Map<string, string>();
    private inflightMeta = new Map<string, Promise<void>>();
    private urlProvider: UrlProvider | null = null;
    private folderAssetsProvider: FolderAssetsProvider | null = null;

    setUrlProvider(p: UrlProvider | null) {
        this.urlProvider = p;
    }

    setFolderAssetsProvider(p: FolderAssetsProvider | null) {
        this.folderAssetsProvider = p;
    }

    getAssetsInFolder(folderId: string | null): AssetEntry[] {
        return this.folderAssetsProvider ? this.folderAssetsProvider(folderId) : [];
    }

    // Kick off metadata + source/texture loads for every asset in a folder up
    // front, in parallel. Without this the renderer only triggers a load for the
    // instance indices it happens to draw on a given frame, so a freshly-added
    // folder reveals its assets one-by-one as each lazy fetch lands (they render
    // as empty placeholders until then). Idempotent — ensureMeta dedups via the
    // mimeTypes / inflightMeta maps, so calling it every frame is cheap.
    prefetchFolder(folderId: string | null) {
        for (const entry of this.getAssetsInFolder(folderId)) {
            this.ensureMeta(entry.id);
        }
    }

    // Mime type once the asset's metadata has been fetched. Returns null while
    // loading — caller should retry next frame (renderer runs every tick).
    getMimeType(assetId: string): string | null {
        this.ensureMeta(assetId);
        return this.mimeTypes.get(assetId) ?? null;
    }

    isSvg(assetId: string): boolean {
        return this.mimeTypes.get(assetId) === 'image/svg+xml';
    }

    // Raster path: cached Texture for PNG/JPEG assets. Returns null while
    // loading. SVGs do NOT populate this map — use getGraphicsContextSync.
    getTextureSync(assetId: string): Texture | null {
        this.ensureMeta(assetId);
        return this.textures.get(assetId) ?? null;
    }

    // Vector path for SVGs. Returns the cached GraphicsContext or builds one
    // synchronously from the cached SVG source. `colorKey`+`recolorOpts` selects
    // a recolored variant (rewrites paint attrs via svgRecolor before parsing).
    // Returns null while the underlying SVG source is still being fetched.
    getGraphicsContextSync(assetId: string, colorKey?: string, recolorOpts?: SvgRecolorOptions): GraphicsContext | null {
        this.ensureMeta(assetId);
        const key = colorKey ? `${assetId}|${colorKey}` : assetId;
        const cached = this.contexts.get(key);
        if (cached) return cached;
        const source = this.svgSources.get(assetId);
        if (!source) return null;
        const svgText = (colorKey && recolorOpts) ? recolorSvg(source, recolorOpts) : source;
        try {
            const ctx = new GraphicsContext();
            ctx.svg(svgText);
            this.contexts.set(key, ctx);
            return ctx;
        } catch (e) {
            console.error('AssetCache SVG parse failed', assetId, e);
            return null;
        }
    }

    private ensureMeta(assetId: string) {
        if (this.mimeTypes.has(assetId) || this.inflightMeta.has(assetId)) return;
        if (!this.urlProvider) return;
        this.inflightMeta.set(assetId, this.loadMeta(assetId));
    }

    private async loadMeta(assetId: string): Promise<void> {
        try {
            const info = await this.urlProvider!(assetId);
            if (!info) return;
            this.mimeTypes.set(assetId, info.mimeType);
            if (info.mimeType === 'image/svg+xml') {
                const resp = await fetch(info.url);
                this.svgSources.set(assetId, await resp.text());
            } else {
                const tex = await Assets.load<Texture>(info.url);
                // Raster sources (e.g. 500×500 PNGs) get heavily minified for small
                // sprites. Mipmaps kill the aliasing; anisotropy keeps them sharp
                // (plain trilinear blurs too much at typical icon sizes).
                tex.source.autoGenerateMipmaps = true;
                tex.source.style.scaleMode = 'linear';
                tex.source.style.maxAnisotropy = 16;
                tex.source.updateMipmaps();
                this.textures.set(assetId, tex);
            }
        } catch (e) {
            console.error('AssetCache loadMeta failed', assetId, e);
        } finally {
            this.inflightMeta.delete(assetId);
        }
    }

    invalidate(assetId: string) {
        for (const [key, tex] of this.textures) {
            if (key === assetId || key.startsWith(`${assetId}|`)) {
                tex.destroy(true);
                this.textures.delete(key);
            }
        }
        for (const [key, ctx] of this.contexts) {
            if (key === assetId || key.startsWith(`${assetId}|`)) {
                ctx.destroy();
                this.contexts.delete(key);
            }
        }
        this.svgSources.delete(assetId);
        this.mimeTypes.delete(assetId);
    }

    clear() {
        for (const tex of this.textures.values()) tex.destroy(true);
        this.textures.clear();
        for (const ctx of this.contexts.values()) ctx.destroy();
        this.contexts.clear();
        this.inflightMeta.clear();
        this.svgSources.clear();
        this.mimeTypes.clear();
    }
}

export const assetCache = new AssetCacheImpl();
