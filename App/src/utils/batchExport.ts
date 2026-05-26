// ─── Batch (folder-level) export builders ─────────────────────────────
//
// Each builder takes a list of fully-loaded Project objects (the modal
// loads them via Supabase before invoking) plus an AbortSignal and a
// progress callback, and returns a single Blob containing the combined
// zip output. Player / Pixi / data bundles are fetched once and shared
// across all projects in the output to keep the zip small.

import JSZip from 'jszip';
import type { Project } from '../types';
import { EXPORT_TEMPLATES, REACT_NATIVE_TEMPLATES } from '../data/exportTemplates';
import {
    blobToBase64,
    collectExportAssets,
    escapeForTemplate,
    extensionForImageMime,
    loadPlayerBundles,
    mergeCollectedAssets,
    parseDataUrl,
    safeFilename,
    stripThumbnail,
    type CollectedExport,
} from './exportHelpers';

type ProjectWithThumb = Project & { thumbnailData?: string };

// If the project carries a base64 data-URL thumbnail (stamped by the batch
// modal at load time), write it as a sibling file in the zip and return
// the path + extension used. The JSON files never embed it.
const writeThumbnailFile = (
    zip: JSZip,
    project: ProjectWithThumb,
    basePathWithoutExt: string,
): { filename: string; ext: string } | null => {
    const thumb = project.thumbnailData;
    if (!thumb) return null;
    const parsed = parseDataUrl(thumb);
    if (!parsed) return null;
    const ext = extensionForImageMime(parsed.mime);
    const filename = `${basePathWithoutExt}.${ext}`;
    zip.file(filename, parsed.base64, { base64: true });
    return { filename, ext };
};

export type BatchProgressStatus = 'pending' | 'running' | 'done' | 'error';
export type BatchProgressCb = (
    projectIndex: number,
    status: BatchProgressStatus,
    message?: string,
    percent?: number,
) => void;

export type BatchOpts = {
    projects: Project[];
    folderName: string;
    includeAstro: boolean;
    includeAmino: boolean;
    transparentBg: boolean;
    signal: AbortSignal;
    onProgress: BatchProgressCb;
};

const checkAbort = (signal: AbortSignal) => {
    if (signal.aborted) throw new Error('Aborted');
};

// Resolves slug collisions by appending _2, _3, … so each project is
// addressable by its own folder name in the output zip.
function buildSlugMap(projects: Project[]): string[] {
    const used = new Set<string>();
    const out: string[] = [];
    for (const p of projects) {
        let base = safeFilename(p.name) || 'project';
        let slug = base;
        let i = 2;
        while (used.has(slug)) slug = `${base}_${i++}`;
        used.add(slug);
        out.push(slug);
    }
    return out;
}

// ────────────────────────────────────────────────────────────────────
// JSON
// ────────────────────────────────────────────────────────────────────
export async function buildBatchJsonZip(opts: BatchOpts): Promise<Blob> {
    const { projects, signal, onProgress } = opts;
    const slugs = buildSlugMap(projects);
    const zip = new JSZip();

    for (let i = 0; i < projects.length; i++) {
        checkAbort(signal);
        onProgress(i, 'running', 'Writing JSON', 0);
        const p = projects[i] as ProjectWithThumb;
        zip.file(`${slugs[i]}.json`, JSON.stringify(stripThumbnail(p), null, 2));
        writeThumbnailFile(zip, p, slugs[i]);
        onProgress(i, 'done', 'Done', 100);
    }

    return zip.generateAsync({ type: 'blob' });
}

// ────────────────────────────────────────────────────────────────────
// HTML — gallery + per-project subfolders + shared bundles at root
// ────────────────────────────────────────────────────────────────────
export async function buildBatchHtmlZip(opts: BatchOpts): Promise<Blob> {
    const { projects, folderName, includeAstro, includeAmino, transparentBg, signal, onProgress } = opts;
    const slugs = buildSlugMap(projects);
    const zip = new JSZip();

    onProgress(-1, 'running', 'Loading runtime bundles', 0);
    const { pixiScript, playerScript, astroScript, aminoScript } =
        await loadPlayerBundles({ includeAstro, includeAmino, signal });

    zip.file('pixi-bundle.js', pixiScript);
    zip.file('player.js', playerScript);
    if (includeAstro && astroScript) zip.file('astro-data.js', astroScript);
    if (includeAmino && aminoScript) zip.file('amino-data.js', aminoScript);

    // Per-project: collect assets first so we know whether the shared
    // registry will exist (each project's HTML needs to know whether to
    // <script src="../assets-registry.js">).
    const perProjectAssets: CollectedExport[] = [];
    for (let i = 0; i < projects.length; i++) {
        checkAbort(signal);
        onProgress(i, 'running', 'Collecting assets', 20);
        const collected = await collectExportAssets(projects[i], () => {});
        perProjectAssets.push(collected);
    }

    const merged = mergeCollectedAssets(perProjectAssets);
    const hasAssets = merged.assets.length > 0;

    const thumbFilesBySlug: Record<string, string | null> = {};
    for (let i = 0; i < projects.length; i++) {
        checkAbort(signal);
        const p = projects[i] as ProjectWithThumb;
        const slug = slugs[i];
        onProgress(i, 'running', 'Writing files', 60);
        const cleaned = stripThumbnail(p) as Project;
        const html = renderProjectHtml({
            project: cleaned,
            slug,
            transparentBg,
            includeAstro,
            includeAmino,
            hasAssets,
        });
        zip.file(`${slug}/index.html`, html);
        zip.file(`${slug}/${slug}.json`, JSON.stringify(cleaned, null, 2));
        const thumb = writeThumbnailFile(zip, p, `${slug}/thumbnail`);
        thumbFilesBySlug[slug] = thumb ? `${slug}/thumbnail.${thumb.ext}` : null;
        onProgress(i, 'done', 'Done', 100);
    }

    // Build shared deduped asset registry at root.
    checkAbort(signal);
    if (hasAssets) {
        const registryAssets: Record<string, { url: string; mimeType: string }> = {};
        for (const a of merged.assets) {
            checkAbort(signal);
            const b64 = await blobToBase64(a.blob);
            registryAssets[a.id] = {
                url: `data:${a.mimeType};base64,${b64}`,
                mimeType: a.mimeType,
            };
        }
        const registryJs =
            '// Auto-generated. Sets window.GEOMETRY_ASSETS so each animation\n' +
            '// can resolve asset_set / asset_single layers offline.\n' +
            'window.GEOMETRY_ASSETS = ' +
            JSON.stringify({ assets: registryAssets, folders: merged.folders }) +
            ';\n';
        zip.file('assets-registry.js', registryJs);
    }

    // Root gallery index.
    const galleryHtml = renderGalleryHtml(folderName, projects, slugs, thumbFilesBySlug);
    zip.file('index.html', galleryHtml);

    return zip.generateAsync({ type: 'blob' });
}

function renderProjectHtml(args: {
    project: Project;
    slug: string;
    transparentBg: boolean;
    includeAstro: boolean;
    includeAmino: boolean;
    hasAssets: boolean;
}): string {
    const { project, transparentBg, includeAstro, includeAmino, hasAssets } = args;
    const bg = transparentBg ? 'transparent' : (project.backgroundColor || '#000000');
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(project.name)} - Animation</title>
    <style>
        body { margin: 0; overflow: hidden; background: ${bg}; display: flex; align-items: center; justify-content: center; height: 100vh; }
        #canvas-container { width: 100%; height: 100%; }
        canvas { display: block; width: 100%; height: 100%; }
        #error-msg { color: #ff5555; font-family: sans-serif; display: none; text-align: center; }
        a.back { position: fixed; top: 12px; left: 12px; color: #D4AF37; text-decoration: none; font-family: sans-serif; font-size: 12px; opacity: 0.6; }
        a.back:hover { opacity: 1; }
    </style>
</head>
<body>
    <a class="back" href="../index.html">← Gallery</a>
    <div id="canvas-container"></div>
    <div id="error-msg"></div>
    <script src="../pixi-bundle.js"></script>
${includeAstro ? '    <script src="../astro-data.js"></script>\n' : ''}\
${includeAmino ? '    <script src="../amino-data.js"></script>\n' : ''}\
${hasAssets ? '    <script src="../assets-registry.js"></script>\n' : ''}\
    <script>
        window.ASTRO_DATA = window.ASTRO_DATA || undefined;
        window.AMINO_DATA = window.AMINO_DATA || undefined;
    </script>
    <script src="../player.js"></script>
    <script>
        const embeddedProjectData = ${JSON.stringify(project)};
        try {
            window.GeometryApp.init('canvas-container', embeddedProjectData);
        } catch (err) {
            console.error("Failed to initialize project:", err);
            const errDiv = document.getElementById('error-msg');
            errDiv.style.display = 'block';
            errDiv.innerText = 'Initialization failed: ' + err.message;
        }
    </script>
</body>
</html>`;
}

function renderGalleryHtml(
    folderName: string,
    projects: Project[],
    slugs: string[],
    thumbFilesBySlug: Record<string, string | null>,
): string {
    const tiles = projects.map((p, i) => {
        const slug = slugs[i];
        const thumbFile = thumbFilesBySlug[slug];
        const thumb = thumbFile
            ? `<img src="${thumbFile}" alt="" loading="lazy">`
            : `<div class="thumb-fallback" style="background:${p.backgroundColor || '#111'}"></div>`;
        return `        <a class="tile" href="${slug}/index.html">
            ${thumb}
            <div class="label">${escapeHtml(p.name)}</div>
        </a>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(folderName)} - Gallery</title>
    <style>
        body { margin: 0; background: #0f0f0f; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; }
        h1 { color: #D4AF37; padding: 32px 32px 8px; margin: 0; font-size: 22px; letter-spacing: 0.05em; text-transform: uppercase; }
        p.sub { padding: 0 32px 24px; margin: 0; color: rgba(255,255,255,0.4); font-size: 12px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; padding: 0 32px 48px; }
        .tile { display: block; background: #1a1a1a; border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; overflow: hidden; text-decoration: none; color: #fff; transition: border-color 0.15s; }
        .tile:hover { border-color: #D4AF37; }
        .tile img, .thumb-fallback { display: block; width: 100%; aspect-ratio: 16/9; object-fit: cover; }
        .label { padding: 10px 12px; font-size: 13px; font-weight: 600; }
    </style>
</head>
<body>
    <h1>${escapeHtml(folderName)}</h1>
    <p class="sub">${projects.length} animation${projects.length === 1 ? '' : 's'}</p>
    <div class="grid">
${tiles}
    </div>
</body>
</html>`;
}

const escapeHtml = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ────────────────────────────────────────────────────────────────────
// React (Vite) — single project with multi-animation switcher
// ────────────────────────────────────────────────────────────────────
export async function buildBatchReactZip(opts: BatchOpts): Promise<Blob> {
    const { projects, signal, onProgress } = opts;
    const slugs = buildSlugMap(projects);
    const zip = new JSZip();

    // Static template files, but skip src/App.tsx — we replace it.
    for (const [filename, content] of Object.entries(EXPORT_TEMPLATES)) {
        if (filename === 'src/App.tsx') continue;
        zip.file(filename, content);
    }

    for (let i = 0; i < projects.length; i++) {
        checkAbort(signal);
        onProgress(i, 'running', 'Writing animation JSON', 0);
        const p = projects[i] as ProjectWithThumb;
        zip.file(`src/animations/${slugs[i]}.json`, JSON.stringify(stripThumbnail(p), null, 2));
        writeThumbnailFile(zip, p, `src/animations/${slugs[i]}`);
        onProgress(i, 'done', 'Done', 100);
    }

    const imports = slugs.map((s, i) => `import anim_${i} from './animations/${s}.json';`).join('\n');
    const registry = projects.map((p, i) =>
        `  { name: ${JSON.stringify(p.name)}, data: anim_${i} as unknown as Project },`
    ).join('\n');

    const appTsx = `import React, { useState, useEffect } from 'react';
import GeometryPlayer from './components/GeometryPlayer';
import { Project } from './types';
${imports}

const ANIMATIONS: { name: string; data: Project }[] = [
${registry}
];

function App() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const projectData = ANIMATIONS[activeIndex].data;

  useEffect(() => {
    setCurrentTime(0);
  }, [activeIndex]);

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      if (isPlaying) {
        setCurrentTime(prev => {
          const duration = (projectData as any).duration || 10;
          return (prev + dt) % duration;
        });
      }
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, projectData]);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <GeometryPlayer
        project={projectData}
        width={window.innerWidth}
        height={window.innerHeight}
        currentTime={currentTime}
        isPlaying={isPlaying}
        backgroundColor={(projectData as any).backgroundColor}
      />

      <div style={{
        position: 'absolute', top: 20, left: 20,
        background: 'rgba(0,0,0,0.6)', borderRadius: 8, padding: 8,
        display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 'calc(100vw - 40px)',
        fontFamily: 'sans-serif',
      }}>
        {ANIMATIONS.map((a, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            style={{
              background: i === activeIndex ? '#D4AF37' : 'rgba(255,255,255,0.1)',
              color: i === activeIndex ? '#000' : '#fff',
              border: 'none', borderRadius: 4, padding: '6px 10px',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            {a.name}
          </button>
        ))}
      </div>

      <div style={{
        position: 'absolute', bottom: 20, left: 20,
        background: 'rgba(0,0,0,0.5)', color: 'white',
        padding: '10px 20px', borderRadius: 8,
        display: 'flex', gap: 10, alignItems: 'center', fontFamily: 'sans-serif',
      }}>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          style={{
            background: '#D4AF37', border: 'none', borderRadius: 4,
            padding: '5px 10px', cursor: 'pointer', fontWeight: 'bold',
          }}
        >
          {isPlaying ? 'PAUSE' : 'PLAY'}
        </button>
        <span>Time: {currentTime.toFixed(2)}s</span>
      </div>
    </div>
  );
}

export default App;
`;
    zip.file('src/App.tsx', appTsx);

    return zip.generateAsync({ type: 'blob' });
}

// ────────────────────────────────────────────────────────────────────
// React Native — shared engine + per-project JSON + switcher screen
// ────────────────────────────────────────────────────────────────────
export async function buildBatchReactNativeZip(opts: BatchOpts): Promise<Blob> {
    const { projects, includeAstro, includeAmino, signal, onProgress } = opts;
    const slugs = buildSlugMap(projects);
    const zip = new JSZip();

    onProgress(-1, 'running', 'Loading runtime bundles', 0);
    const { pixiScript, playerScript, astroScript, aminoScript } =
        await loadPlayerBundles({ includeAstro, includeAmino, signal });

    // Per-project asset collection, then merge.
    const perProjectAssets: CollectedExport[] = [];
    for (let i = 0; i < projects.length; i++) {
        checkAbort(signal);
        onProgress(i, 'running', 'Collecting assets', 30);
        const collected = await collectExportAssets(projects[i], () => {});
        perProjectAssets.push(collected);
        onProgress(i, 'running', 'Done', 80);
    }

    const merged = mergeCollectedAssets(perProjectAssets);
    const dataUrlAssets: Record<string, { url: string; mimeType: string }> = {};
    for (const a of merged.assets) {
        checkAbort(signal);
        const b64 = await blobToBase64(a.blob);
        dataUrlAssets[a.id] = {
            url: `data:${a.mimeType};base64,${b64}`,
            mimeType: a.mimeType,
        };
    }

    const hasAssets = merged.assets.length > 0;
    const assetsRegistryScript = hasAssets
        ? 'window.GEOMETRY_ASSETS=' + JSON.stringify({ assets: dataUrlAssets, folders: merged.folders }) + ';'
        : '';

    const backtick = '`';
    const escapedPixi = escapeForTemplate(pixiScript);
    const escapedPlayer = escapeForTemplate(playerScript);

    const pixiBundleTs =
        '// AUTO-GENERATED — PixiJS Rendering Engine (shared by all animations)\n'
      + 'export const PIXI_BUNDLE = ' + backtick + escapedPixi + backtick + ';\n';
    const playerBundleTs =
        '// AUTO-GENERATED — Geometry Sequencer Player (shared by all animations)\n'
      + 'export const PLAYER_BUNDLE = ' + backtick + escapedPlayer + backtick + ';\n';

    let astroBundleTs = '';
    if (includeAstro && astroScript) {
        astroBundleTs = 'export const ASTRO_BUNDLE = ' + backtick + escapeForTemplate(astroScript) + backtick + ';\n';
    }
    let aminoBundleTs = '';
    if (includeAmino && aminoScript) {
        aminoBundleTs = 'export const AMINO_BUNDLE = ' + backtick + escapeForTemplate(aminoScript) + backtick + ';\n';
    }
    let assetsBundleTs = '';
    if (hasAssets) {
        const escapedAssets = escapeForTemplate(assetsRegistryScript);
        assetsBundleTs = 'export const ASSETS_BUNDLE = ' + backtick + escapedAssets + backtick + ';\n';
    }

    // Static template files (package.json, app.json, tsconfig, App.tsx)
    Object.entries(REACT_NATIVE_TEMPLATES).forEach(([filename, content]) => {
        zip.file(filename, content);
    });

    zip.file('src/engine/pixi-bundle.ts', pixiBundleTs);
    zip.file('src/engine/player-bundle.ts', playerBundleTs);
    if (astroBundleTs) zip.file('src/engine/astro-data-bundle.ts', astroBundleTs);
    if (aminoBundleTs) zip.file('src/engine/amino-data-bundle.ts', aminoBundleTs);
    if (assetsBundleTs) zip.file('src/engine/assets-bundle.ts', assetsBundleTs);

    zip.file('src/engine/GeometryPlayer.tsx', renderRnGeometryPlayerTsx({
        includeAstro: !!astroBundleTs,
        includeAmino: !!aminoBundleTs,
        hasAssets,
    }));

    for (let i = 0; i < projects.length; i++) {
        checkAbort(signal);
        const p = projects[i] as ProjectWithThumb;
        zip.file(`src/animations/${slugs[i]}.json`, JSON.stringify(stripThumbnail(p), null, 2));
        writeThumbnailFile(zip, p, `src/animations/${slugs[i]}`);
        onProgress(i, 'done', 'Done', 100);
    }

    zip.file('src/screens/SampleScreen.tsx', renderRnSampleScreenTsx(projects, slugs));

    // Default placeholder Expo assets.
    const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const iconBlob = await (await fetch(`data:image/png;base64,${base64Png}`)).blob();
    zip.file('assets/icon.png', iconBlob);
    zip.file('assets/splash.png', iconBlob);
    zip.file('assets/adaptive-icon.png', iconBlob);
    zip.file('assets/favicon.png', iconBlob);

    return zip.generateAsync({ type: 'blob' });
}

function renderRnGeometryPlayerTsx(args: {
    includeAstro: boolean;
    includeAmino: boolean;
    hasAssets: boolean;
}): string {
    const { includeAstro, includeAmino, hasAssets } = args;
    return [
        'import React, { useState, useEffect, useRef, useCallback } from "react";',
        'import { View, StyleSheet, ActivityIndicator, Text } from "react-native";',
        'import { WebView } from "react-native-webview";',
        'import type { WebViewMessageEvent, WebViewErrorEvent, WebViewHttpErrorEvent } from "react-native-webview/lib/WebViewTypes";',
        'import { PIXI_BUNDLE } from "./pixi-bundle";',
        'import { PLAYER_BUNDLE } from "./player-bundle";',
        includeAstro ? 'import { ASTRO_BUNDLE } from "./astro-data-bundle";' : '',
        includeAmino ? 'import { AMINO_BUNDLE } from "./amino-data-bundle";' : '',
        hasAssets    ? 'import { ASSETS_BUNDLE } from "./assets-bundle";' : '',
        '',
        'interface GeometryPlayerProps {',
        '  animationData: Record<string, unknown>;',
        '  backgroundColor?: string;',
        '  onReady?: () => void;',
        '  onError?: (message: string) => void;',
        '}',
        '',
        'type PlayerState = "loading" | "ready" | "error" | "timeout";',
        'const INIT_TIMEOUT_MS = 10000;',
        '',
        'export default function GeometryPlayer({ animationData, backgroundColor, onReady, onError }: GeometryPlayerProps) {',
        '  const [state, setState] = useState<PlayerState>("loading");',
        '  const [errorMessage, setErrorMessage] = useState<string>("");',
        '  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);',
        '  const bgColor = backgroundColor || (animationData as any).backgroundColor || "#000000";',
        '',
        '  useEffect(() => {',
        '    setState("loading");',
        '    if (timeoutRef.current) clearTimeout(timeoutRef.current);',
        '    timeoutRef.current = setTimeout(() => {',
        '      setState(prev => prev === "loading" ? "timeout" : prev);',
        '    }, INIT_TIMEOUT_MS);',
        '    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };',
        '  }, [animationData]);',
        '',
        '  const handleMessage = useCallback((event: WebViewMessageEvent) => {',
        '    try {',
        '      const data = JSON.parse(event.nativeEvent.data);',
        '      if (data.type === "ready") {',
        '        if (timeoutRef.current) clearTimeout(timeoutRef.current);',
        '        setState("ready");',
        '        onReady?.();',
        '      } else if (data.type === "error") {',
        '        setState("error");',
        '        setErrorMessage(data.message || "Unknown error");',
        '        onError?.(data.message || "Unknown error");',
        '      }',
        '    } catch {}',
        '  }, [onReady, onError]);',
        '',
        '  const handleWebViewError = useCallback((event: WebViewErrorEvent) => {',
        '    setState("error");',
        '    setErrorMessage(event.nativeEvent.description);',
        '  }, []);',
        '  const handleHttpError = useCallback((_event: WebViewHttpErrorEvent) => {}, []);',
        '',
        '  const safePixi = PIXI_BUNDLE.replace(/<\\/script>/gi, "<\\\\/script>");',
        '  const safePlayer = PLAYER_BUNDLE.replace(/<\\/script>/gi, "<\\\\/script>");',
        includeAstro ? '  const safeAstro = ASTRO_BUNDLE.replace(/<\\/script>/gi, "<\\\\/script>");' : '',
        includeAmino ? '  const safeAmino = AMINO_BUNDLE.replace(/<\\/script>/gi, "<\\\\/script>");' : '',
        hasAssets    ? '  const safeAssets = ASSETS_BUNDLE.replace(/<\\/script>/gi, "<\\\\/script>");' : '',
        '',
        '  const html = [',
        '    "<!DOCTYPE html><html><head><meta charset=\\"UTF-8\\">",',
        '    "<meta name=\\"viewport\\" content=\\"width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no\\">",',
        '    "<style>body{margin:0;overflow:hidden;background:" + bgColor + ";width:100vw;height:100vh;}",',
        '    "#canvas-container{width:100%;height:100%}canvas{display:block;width:100%;height:100%}",',
        '    "#error-msg{color:#ff5555;font-family:sans-serif;display:none;text-align:center;position:absolute;padding:20px}</style>",',
        '    "</head><body><div id=\\"canvas-container\\"></div><div id=\\"error-msg\\"></div>",',
        '    "<script>" + safePixi + "<\\/script>",',
        includeAstro ? '    "<script>" + safeAstro + "<\\/script>",' : '',
        includeAmino ? '    "<script>" + safeAmino + "<\\/script>",' : '',
        hasAssets    ? '    "<script>" + safeAssets + "<\\/script>",' : '',
        '    "<script>" + safePlayer + "<\\/script>",',
        '    "<script>",',
        '    "function postToRN(msg){if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){window.ReactNativeWebView.postMessage(JSON.stringify(msg));}}",',
        '    "var projectData=" + JSON.stringify(animationData) + ";",',
        '    "window.onload=function(){try{window.GeometryApp.init(\\"canvas-container\\",projectData);postToRN({type:\\"ready\\"});}catch(e){postToRN({type:\\"error\\",message:e.message||String(e)});}};",',
        '    "</script></body></html>",',
        '  ].filter(Boolean).join("\\n");',
        '',
        '  if (state === "error" || state === "timeout") {',
        '    return (',
        '      <View style={[styles.errorContainer, { backgroundColor: bgColor }]}>',
        '        <Text style={styles.errorTitle}>Animation Error</Text>',
        '        <Text style={styles.errorMessage}>{errorMessage}</Text>',
        '      </View>',
        '    );',
        '  }',
        '',
        '  return (',
        '    <View style={[styles.container, { backgroundColor: bgColor }]}>',
        '      <WebView',
        '        originWhitelist={["about:blank"]}',
        '        source={{ html }}',
        '        style={styles.webview}',
        '        javaScriptEnabled={true}',
        '        domStorageEnabled={true}',
        '        startInLoadingState={true}',
        '        renderLoading={() => (',
        '          <View style={[styles.loading, { backgroundColor: bgColor }]}>',
        '            <ActivityIndicator size="large" color="#D4AF37" />',
        '          </View>',
        '        )}',
        '        onMessage={handleMessage}',
        '        onError={handleWebViewError}',
        '        onHttpError={handleHttpError}',
        '        scalesPageToFit={true}',
        '        mediaPlaybackRequiresUserAction={false}',
        '        allowsInlineMediaPlayback={true}',
        '      />',
        '    </View>',
        '  );',
        '}',
        '',
        'const styles = StyleSheet.create({',
        '  container: { flex: 1 },',
        '  webview: { flex: 1, backgroundColor: "transparent" },',
        '  loading: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center" },',
        '  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },',
        '  errorTitle: { color: "#ff5555", fontSize: 18, fontWeight: "bold", marginBottom: 8 },',
        '  errorMessage: { color: "#999", fontSize: 14, textAlign: "center" },',
        '});',
    ].filter(line => line !== '' || true).join('\n');
}

function renderRnSampleScreenTsx(projects: Project[], slugs: string[]): string {
    const imports = slugs.map((s, i) => `import anim_${i} from "../animations/${s}.json";`).join('\n');
    const registry = projects.map((p, i) =>
        `  { name: ${JSON.stringify(p.name)}, data: anim_${i} as Record<string, unknown> },`
    ).join('\n');

    return `import React, { useState } from "react";
import { View, StyleSheet, TouchableOpacity, Text, ScrollView } from "react-native";
import GeometryPlayer from "../engine/GeometryPlayer";
${imports}

const ANIMATIONS: { name: string; data: Record<string, unknown> }[] = [
${registry}
];

export default function SampleScreen() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <View style={styles.container}>
      <View style={styles.playerArea}>
        <GeometryPlayer animationData={ANIMATIONS[activeIndex].data} />
      </View>
      <ScrollView horizontal style={styles.selector} showsHorizontalScrollIndicator={false}>
        {ANIMATIONS.map((anim, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.selectorButton, index === activeIndex && styles.selectorButtonActive]}
            onPress={() => setActiveIndex(index)}
          >
            <Text style={styles.selectorText}>{anim.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  playerArea: { flex: 1 },
  selector: { maxHeight: 60, backgroundColor: "#111", borderTopWidth: 1, borderTopColor: "#333" },
  selectorButton: { paddingHorizontal: 20, paddingVertical: 16, justifyContent: "center" },
  selectorButtonActive: { borderBottomWidth: 2, borderBottomColor: "#D4AF37" },
  selectorText: { color: "#fff", fontSize: 14 },
});
`;
}

// ────────────────────────────────────────────────────────────────────
// Video — sequential per-project render, zipped together
// ────────────────────────────────────────────────────────────────────
export type BatchVideoOpts = BatchOpts & {
    resolution: '720p' | '1080p';
    aspectRatio: '16:9' | '1:1';
    durationMode: 'loop' | 'time';
    loopCount: number;
    seconds: number;
    selectedFormat: string;
    startRecording: (canvas: HTMLCanvasElement, mimeType?: string) => void;
    stopRecording: () => Promise<Blob>;
};

// ────────────────────────────────────────────────────────────────────
// SVG (vector snapshot per project at a chosen frame)
// ────────────────────────────────────────────────────────────────────
export type BatchSvgOpts = BatchOpts & {
    frameMode: 'first' | 'last' | 'time';
    frameTime?: number;
    width?: number;
    height?: number;
};

export async function buildBatchSvgZip(opts: BatchSvgOpts): Promise<Blob> {
    const { projects, signal, onProgress, frameMode, frameTime, width, height } = opts;
    const slugs = buildSlugMap(projects);
    const zip = new JSZip();

    const { renderProjectToSVG } = await import('./svgExport');

    for (let i = 0; i < projects.length; i++) {
        checkAbort(signal);
        onProgress(i, 'running', 'Rendering SVG', 0);
        try {
            const { svg } = await renderProjectToSVG(projects[i], {
                mode: frameMode,
                time: frameTime,
                width,
                height,
            });
            zip.file(`${slugs[i]}.svg`, svg);
            onProgress(i, 'done', 'Done', 100);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            onProgress(i, 'error', msg);
            throw e;
        }
    }

    return zip.generateAsync({ type: 'blob' });
}

export async function runBatchVideoExport(opts: BatchVideoOpts): Promise<Blob> {
    const {
        projects, signal, onProgress,
        resolution, aspectRatio, durationMode, loopCount, seconds, selectedFormat,
        transparentBg, startRecording, stopRecording,
    } = opts;
    const slugs = buildSlugMap(projects);
    const zip = new JSZip();

    let width = 1920;
    let height = 1080;
    if (resolution === '720p') {
        height = 720;
        width = aspectRatio === '16:9' ? 1280 : 720;
    } else {
        height = 1080;
        width = aspectRatio === '16:9' ? 1920 : 1080;
    }

    const { Application } = await import('pixi.js');
    const { GeometryRenderer } = await import('../rendering/GeometryRenderer');

    const extension = selectedFormat.includes('mp4') ? 'mp4' : 'webm';

    for (let i = 0; i < projects.length; i++) {
        checkAbort(signal);
        const project = projects[i];
        onProgress(i, 'running', 'Initializing', 0);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const app = new Application();
        await app.init({
            canvas: canvas as any,
            width,
            height,
            backgroundColor: transparentBg ? 'transparent' : (project.backgroundColor || '#000000'),
            antialias: true,
            autoDensity: true,
            resolution: 1,
            preference: 'webgl',
            backgroundAlpha: transparentBg ? 0 : 1,
        });

        const renderer = new GeometryRenderer();
        const totalDuration = durationMode === 'loop'
            ? (project.duration || 10) * loopCount
            : seconds;

        startRecording(canvas, selectedFormat);
        onProgress(i, 'running', 'Recording', 0);

        await new Promise<void>((resolve, reject) => {
            const startTime = Date.now();
            let raf = 0;

            const onAbort = () => {
                cancelAnimationFrame(raf);
                signal.removeEventListener('abort', onAbort);
                reject(new Error('Aborted'));
            };
            signal.addEventListener('abort', onAbort);

            const tick = () => {
                if (signal.aborted) return;
                const elapsed = (Date.now() - startTime) / 1000;
                if (elapsed >= totalDuration) {
                    signal.removeEventListener('abort', onAbort);
                    resolve();
                    return;
                }
                const loopDuration = project.duration || 10;
                const projectTime = elapsed % loopDuration;
                try {
                    renderer.render(app, project, projectTime);
                } catch (e) {
                    console.error('Batch video render error', e);
                }
                onProgress(i, 'running', 'Recording', Math.min(99, (elapsed / totalDuration) * 100));
                raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
        }).catch(async (err) => {
            // On abort, still stop the recorder so MediaRecorder doesn't leak.
            try { await stopRecording(); } catch {}
            renderer.cleanup();
            app.destroy(true, { children: true, texture: true });
            throw err;
        });

        const blob = await stopRecording();
        renderer.cleanup();
        app.destroy(true, { children: true, texture: true });

        zip.file(`${slugs[i]}.${extension}`, blob);
        onProgress(i, 'done', 'Done', 100);
    }

    return zip.generateAsync({ type: 'blob' });
}
