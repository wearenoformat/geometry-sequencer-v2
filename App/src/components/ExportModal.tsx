import React, { useState } from 'react';
import { X, Film, Download, FileCode, Check, FileJson, Share2, Code2, Smartphone, Image as ImageIcon } from 'lucide-react';
import { renderProjectToSVG, downloadSVG } from '../utils/svgExport';
import { useRecorder } from '../hooks/useRecorder';
import { useStore } from '../store/useStore';
import { EXPORT_TEMPLATES, REACT_NATIVE_TEMPLATES } from '../data/exportTemplates';
import JSZip from 'jszip';
import {
    blobToBase64,
    collectExportAssets,
    countAssetLayers,
    escapeForTemplate,
} from '../utils/exportHelpers';
import {
    VIDEO_RESOLUTIONS,
    VIDEO_ASPECT_RATIOS,
    RESOLUTION_LABELS,
    ASPECT_RATIO_LABELS,
    getVideoDimensions,
    applyExportViewScale,
    aspectRatioSlug,
    type VideoResolution,
    type VideoAspectRatio,
} from './videoFormats';

interface ExportModalProps {
    onClose: () => void;
}

import { ModernToggle } from './ModernToggle';

const ExportModal: React.FC<ExportModalProps> = ({ onClose }) => {
    const { startRecording, stopRecording, downloadVideo, getSupportedMimeTypes } = useRecorder();
    const project = useStore(s => s.project);

    const [activeTab, setActiveTab] = useState<'video' | 'svg' | 'html' | 'json' | 'react' | 'native'>('video');

    // SVG state
    const [svgFrameMode, setSvgFrameMode] = useState<'first' | 'last' | 'time'>('first');
    const [svgFrameTime, setSvgFrameTime] = useState<number>(0);

    // Auto-detect which optional SVG data bundles the animation uses
    const usesAstro = project.layers.some((l: any) => l.type === 'astrology');
    const usesAmino = project.layers.some((l: any) => l.type === 'amino');
    const usesCustomSvg = project.layers.some((l: any) => l.type === 'custom');
    const assetLayerCount = countAssetLayers(project);
    const [includeAstro, setIncludeAstro] = useState(false);
    const [includeAmino, setIncludeAmino] = useState(false);

    // Sync toggle defaults when project changes
    React.useEffect(() => {
        setIncludeAstro(usesAstro);
        setIncludeAmino(usesAmino);
    }, [usesAstro, usesAmino]);

    // Video State
    const [durationMode, setDurationMode] = useState<'loop' | 'time'>('loop');
    const [loopCount, setLoopCount] = useState(1);
    const [seconds, setSeconds] = useState(10);
    const [progress, setProgress] = useState(0);
    const [isExporting, setIsExporting] = useState(false);
    const [status, setStatus] = useState<string>('Ready');

    // New State for Transparent Background
    const [transparentBg, setTransparentBg] = useState(false);

    const [resolution, setResolution] = useState<VideoResolution>('1080p');
    const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>('16:9');

    const [supportedFormats, setSupportedFormats] = useState<string[]>([]);
    const [selectedFormat, setSelectedFormat] = useState<string>('');

    React.useEffect(() => {
        const formats = getSupportedMimeTypes();
        setSupportedFormats(formats);
        if (formats.length > 0) setSelectedFormat(formats[0]);
    }, [getSupportedMimeTypes]);

    const handleVideoExport = async () => {
        setIsExporting(true);
        setStatus('Initializing...');

        // 1. Setup Dimensions
        const dims = getVideoDimensions(resolution, aspectRatio);
        const { width, height } = dims;

        // 2. Create Detached Canvas & Pixi App
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        // Dynamically import to ensure no SSR issues
        const { Application } = await import('pixi.js');
        const { GeometryRenderer } = await import('../rendering/GeometryRenderer');

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
            backgroundAlpha: transparentBg ? 0 : 1
        });

        // Frame the export like the editor: same content region as the
        // crop-preview guides regardless of output resolution.
        applyExportViewScale(app.stage, dims);

        const renderer = new GeometryRenderer();

        // 3. Start Recording
        setStatus('Recording...');
        startRecording(canvas, selectedFormat);

        // 4. Render Loop
        const totalDuration = durationMode === 'loop'
            ? (project.duration || 10) * loopCount
            : seconds;

        const startTime = Date.now();
        let animationFrameId: number;

        const renderLoop = () => {
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;

            if (elapsed >= totalDuration) {
                finishExport();
                return;
            }

            // Simulate Loop logic
            const loopDuration = project.duration || 10;
            const projectTime = elapsed % loopDuration;

            // Render
            try {
                renderer.render(app, project, projectTime);
            } catch (e) {
                console.error("Export Render Error", e);
            }

            const p = Math.min(100, (elapsed / totalDuration) * 100);
            setProgress(p);

            animationFrameId = requestAnimationFrame(renderLoop);
        };

        // Start Loop
        renderLoop();

        const finishExport = async () => {
            cancelAnimationFrame(animationFrameId);
            setStatus('Finalizing...');

            const blob = await stopRecording();

            renderer.cleanup();
            app.destroy(true, { children: true, texture: true });

            const extension = selectedFormat.includes('mp4') ? 'mp4' : 'webm';
            const filename = `${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${resolution}_${aspectRatioSlug(aspectRatio)}.${extension}`;
            downloadVideo(blob, filename);

            setIsExporting(false);
            onClose();
        };
    };

    const handleHtmlExport = async () => {
        setIsExporting(true);
        setStatus('Bundling...');

        try {
            const zip = new JSZip();

            // 1. Fetch Player Scripts (PixiJS + Player separately)
            const [pixiRes, playerRes] = await Promise.all([
                fetch('./pixi-bundle.js?v=' + Date.now()),
                fetch('./player.js?v=' + Date.now()),
            ]);

            if (!pixiRes.ok || !playerRes.ok) throw new Error('Failed to load runtime files');

            const pixiScript = await pixiRes.text();
            const playerScript = await playerRes.text();

            // Conditionally fetch optional SVG data bundles
            let astroScript = '';
            let aminoScript = '';
            if (includeAstro) {
                const res = await fetch('./astro-data.js?v=' + Date.now());
                if (res.ok) astroScript = await res.text();
            }
            if (includeAmino) {
                const res = await fetch('./amino-data.js?v=' + Date.now());
                if (res.ok) aminoScript = await res.text();
            }

            // 2. Collect every asset_set/asset_single asset referenced by the
            //    project. Inline each blob as a base64 data URL — file:// loads
            //    block fetch() in Chrome/Safari, so loose ./assets/<id>.<ext>
            //    files would render as a black screen when users double-click
            //    the unzipped index.html. Data URLs work under file:// and
            //    keep the export self-contained.
            const collected = await collectExportAssets(project, setStatus);

            const registryAssets: Record<string, { url: string; mimeType: string }> = {};
            for (const a of collected.assets) {
                const b64 = await blobToBase64(a.blob);
                registryAssets[a.id] = {
                    url: `data:${a.mimeType};base64,${b64}`,
                    mimeType: a.mimeType,
                };
            }

            const hasAssets = collected.assets.length > 0;
            const assetsRegistryJs = hasAssets
                ? `// Auto-generated. Sets window.GEOMETRY_ASSETS so the player can\n// resolve asset_set / asset_single layers offline. Loaded before player.js.\nwindow.GEOMETRY_ASSETS = ${JSON.stringify({ assets: registryAssets, folders: collected.folders })};\n`
                : '';

            setStatus('Bundling...');

            // 3. Prepare Filenames
            const safeName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const jsonFilename = `${safeName}.json`;

            // 4. Create index.html
            const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${project.name} - Animation</title>
    <style>
        body { margin: 0; overflow: hidden; background: ${transparentBg ? 'transparent' : (project.backgroundColor || '#000000')}; display: flex; align-items: center; justify-content: center; height: 100vh; }
        #canvas-container { width: 100%; height: 100%; }
        canvas { display: block; width: 100%; height: 100%; }
        #error-msg { color: #ff5555; font-family: sans-serif; display: none; text-align: center; }
    </style>
</head>
<body>
    <div id="canvas-container"></div>
    <div id="error-msg"></div>

    <!-- PixiJS Rendering Engine (can be swapped/upgraded independently) -->
    <script src="pixi-bundle.js"></script>
${includeAstro ? '    <!-- Astro Symbol SVG Data (optional) -->\n    <script src="astro-data.js"></script>\n' : ''}\
${includeAmino ? '    <!-- Amino Acid SVG Data (optional) -->\n    <script src="amino-data.js"></script>\n' : ''}\
${hasAssets ? '    <!-- Asset Registry (asset_set / asset_single, inlined as data URLs) -->\n    <script src="assets-registry.js"></script>\n' : ''}\
    <script>
        // Ensure optional dependencies don't throw ReferenceErrors if omitted
        window.ASTRO_DATA = window.ASTRO_DATA || undefined;
        window.AMINO_DATA = window.AMINO_DATA || undefined;
    </script>
    <!-- Geometry Sequencer Player Logic -->
    <script src="player.js"></script>
    <script>
        // Embed the sequence data directly to support offline/local file viewing
        const embeddedProjectData = ${JSON.stringify(project)};

        // Allow overriding project data via ?project=filename.json & ?zoom=1.5
        const params = new URLSearchParams(window.location.search);
        const projectFile = params.get('project');
        const zoomOverride = params.get('zoom');

        const initPlayer = (projectData) => {
            if (zoomOverride !== null) {
                projectData.zoom = parseFloat(zoomOverride);
            }
            window.GeometryApp.init('canvas-container', projectData);
        };

        if (projectFile) {
            fetch(projectFile)
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok');
                    return response.json();
                })
                .then(initPlayer)
                .catch(err => {
                    console.error("Failed to load project:", err);
                    const errDiv = document.getElementById('error-msg');
                    errDiv.style.display = 'block';
                    errDiv.innerText = 'Failed to load project data: ' + projectFile;
                });
        } else {
            try {
                initPlayer(embeddedProjectData);
            } catch (err) {
                console.error("Failed to initialize project:", err);
                const errDiv = document.getElementById('error-msg');
                errDiv.style.display = 'block';
                errDiv.innerText = 'Initialization failed: ' + err.message;
            }
        }
    </script>
</body>
</html>`;

            // 5. Add to Zip
            zip.file('index.html', htmlContent);
            zip.file('pixi-bundle.js', pixiScript);
            if (includeAstro && astroScript) zip.file('astro-data.js', astroScript);
            if (includeAmino && aminoScript) zip.file('amino-data.js', aminoScript);
            if (hasAssets) zip.file('assets-registry.js', assetsRegistryJs);
            zip.file('player.js', playerScript);
            zip.file(jsonFilename, JSON.stringify(project, null, 2));

            // 6. Generate Blob
            const content = await zip.generateAsync({ type: 'blob' });

            // 7. Download
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_html_export.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setStatus('Done!');
            setTimeout(() => {
                setIsExporting(false);
                onClose();
            }, 1000);

        } catch (err) {
            console.error(err);
            setStatus(err instanceof Error ? `Error: ${err.message}` : 'Error!');
        }
    };


    const handleReactExport = async () => {
        setIsExporting(true);
        setStatus('Packaging React App...');
        try {
            const zip = new JSZip();

            // 1. Add Template Files
            Object.entries(EXPORT_TEMPLATES).forEach(([filename, content]) => {
                zip.file(filename, content);
            });

            // 2. Add Project Data
            zip.file('src/project.json', JSON.stringify(project, null, 2));

            // 3. Generate Blob
            const content = await zip.generateAsync({ type: 'blob' });

            // 4. Download
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_react_export.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setStatus('Done!');
            setTimeout(() => {
                setIsExporting(false);
                onClose();
            }, 1000);

        } catch (err) {
            console.error(err);
            setStatus('Error!');
        }
    };

    const handleReactNativeExport = async () => {
        setIsExporting(true);
        setStatus('Packaging React Native App...');
        try {
            const zip = new JSZip();
            const safeName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

            // ────────────────────────────────────────────────────────
            // 1. Fetch the Engine Bundles (PixiJS + Player + optional data)
            // ────────────────────────────────────────────────────────
            const [pixiRes, playerRes] = await Promise.all([
                fetch('./pixi-bundle.js?v=' + Date.now()),
                fetch('./player.js?v=' + Date.now()),
            ]);
            if (!pixiRes.ok) throw new Error('Failed to load PixiJS bundle');
            if (!playerRes.ok) throw new Error('Failed to load player bundle');

            const pixiScriptRaw = await pixiRes.text();
            const playerScriptRaw = await playerRes.text();

            // Conditionally fetch optional SVG data bundles
            let astroScriptRaw = '';
            let aminoScriptRaw = '';
            if (includeAstro) {
                const res = await fetch('./astro-data.js?v=' + Date.now());
                if (res.ok) astroScriptRaw = await res.text();
            }
            if (includeAmino) {
                const res = await fetch('./amino-data.js?v=' + Date.now());
                if (res.ok) aminoScriptRaw = await res.text();
            }

            // Bundle Supabase asset blobs as base64 data URLs. The WebView is
            // locked to about:blank so we can't ship loose files alongside the
            // HTML — everything has to live inside the HTML string itself.
            const collected = await collectExportAssets(project, setStatus);
            setStatus('Packaging React Native App...');

            const dataUrlAssets: Record<string, { url: string; mimeType: string }> = {};
            for (const a of collected.assets) {
                const b64 = await blobToBase64(a.blob);
                dataUrlAssets[a.id] = {
                    url: `data:${a.mimeType};base64,${b64}`,
                    mimeType: a.mimeType,
                };
            }

            const hasAssets = collected.assets.length > 0;
            const assetsRegistryScript = hasAssets
                ? 'window.GEOMETRY_ASSETS=' + JSON.stringify({ assets: dataUrlAssets, folders: collected.folders }) + ';'
                : '';

            // Escape both scripts for storage inside JS template literals.
            const escapedPixi = escapeForTemplate(pixiScriptRaw);
            const escapedPlayer = escapeForTemplate(playerScriptRaw);

            const backtick = '`';

            // Optional: Astro data bundle
            let astroBundleTs = '';
            if (includeAstro && astroScriptRaw) {
                const escapedAstro = escapeForTemplate(astroScriptRaw);
                astroBundleTs =
                    '// ═══════════════════════════════════════════════════════════\n'
                  + '// AUTO-GENERATED — Astrological Symbol SVG Paths\n'
                  + '// Contains 12 zodiac symbol outlines. Load before player.\n'
                  + '// ═══════════════════════════════════════════════════════════\n'
                  + 'export const ASTRO_BUNDLE = ' + backtick + escapedAstro + backtick + ';\n';
            }

            // Optional: Amino data bundle
            let aminoBundleTs = '';
            if (includeAmino && aminoScriptRaw) {
                const escapedAmino = escapeForTemplate(aminoScriptRaw);
                aminoBundleTs =
                    '// ═══════════════════════════════════════════════════════════\n'
                  + '// AUTO-GENERATED — Amino Acid Molecule SVG Paths\n'
                  + '// Contains 20 molecular structures. Load before player.\n'
                  + '// ═══════════════════════════════════════════════════════════\n'
                  + 'export const AMINO_BUNDLE = ' + backtick + escapedAmino + backtick + ';\n';
            }

            // Asset registry bundle — paths to every asset_set/asset_single
            // asset, inlined as base64 data URLs. Empty string if the project
            // doesn't reference any Supabase assets.
            let assetsBundleTs = '';
            if (hasAssets) {
                const escapedAssets = escapeForTemplate(assetsRegistryScript);
                const folderCount = Object.keys(collected.folders).length;
                const assetCount = collected.assets.length;
                assetsBundleTs =
                    '// ═══════════════════════════════════════════════════════════\n'
                  + '// AUTO-GENERATED — Asset Registry (base64 data URLs)\n'
                  + '// Contains ' + assetCount + ' asset' + (assetCount === 1 ? '' : 's')
                  + ' across ' + folderCount + ' folder' + (folderCount === 1 ? '' : 's') + '.\n'
                  + '// Sets window.GEOMETRY_ASSETS so the player can resolve\n'
                  + '// asset_set / asset_single layers offline.\n'
                  + '// ═══════════════════════════════════════════════════════════\n'
                  + 'export const ASSETS_BUNDLE = ' + backtick + escapedAssets + backtick + ';\n';
            }

            // PixiJS bundle — rendering engine library (can be swapped/upgraded independently)
            const pixiBundleTs =
                '// ═══════════════════════════════════════════════════════════\n'
              + '// AUTO-GENERATED — PixiJS Rendering Engine\n'
              + '// This file contains PixiJS core + filters.\n'
              + '// You can swap this for a custom or stripped-down PixiJS build.\n'
              + '// ═══════════════════════════════════════════════════════════\n'
              + 'export const PIXI_BUNDLE = ' + backtick + escapedPixi + backtick + ';\n';

            // Player bundle — Geometry Sequencer rendering logic
            const playerBundleTs =
                '// ═══════════════════════════════════════════════════════════\n'
              + '// AUTO-GENERATED — Geometry Sequencer Player\n'
              + '// This file contains the animation rendering logic.\n'
              + '// It depends on PIXI_BUNDLE being loaded first.\n'
              + '// Modify this file to customize rendering behavior.\n'
              + '// ═══════════════════════════════════════════════════════════\n'
              + 'export const PLAYER_BUNDLE = ' + backtick + escapedPlayer + backtick + ';\n';

            // ────────────────────────────────────────────────────────
            // ────────────────────────────────────────────────────────
            // 2. Generate the Reusable GeometryPlayer Component
            // ────────────────────────────────────────────────────────
            const geometryPlayerTsx = [
                '/**',
                ' * ════════════════════════════════════════════════════════════════',
                ' * GeometryPlayer — Reusable Animation Player Component',
                ' * ════════════════════════════════════════════════════════════════',
                ' *',
                ' * Renders a Geometry Sequencer animation inside a WebView.',
                ' * Pass any animation JSON data as a prop — the component handles',
                ' * all rendering internally using the PixiJS engine.',
                ' *',
                ' * USAGE:',
                ' *   import GeometryPlayer from "../engine/GeometryPlayer";',
                ' *   import myAnimation from "../animations/my_animation.json";',
                ' *',
                ' *   <GeometryPlayer',
                ' *     animationData={myAnimation}',
                ' *     onReady={() => console.log("Animation started!")}',
                ' *     onError={(msg) => console.error("Player error:", msg)}',
                ' *   />',
                ' *',
                ' * PROPS:',
                ' *   animationData (required)  — Parsed JSON from Geometry Sequencer',
                ' *   backgroundColor (optional) — Hex color override (e.g. "#1a1a2e")',
                ' *   onReady (optional)        — Called when the animation engine initializes',
                ' *   onError (optional)        — Called with error message string on failure',
                ' *   debug (optional)          — Enable verbose console logging from WebView',
                ' *',
                ' * ARCHITECTURE NOTES:',
                ' *   - originWhitelist is restricted to about:blank (local HTML only)',
                ' *   - RN↔WebView bridge via onMessage/postMessage for events',
                ' *   - 10s timeout: if the engine does not send "ready", an error is raised',
                ' *   - All WebView errors (load, HTTP, JS) are caught and surfaced',
                ' * ════════════════════════════════════════════════════════════════',
                ' */',
                'import React, { useState, useEffect, useRef, useCallback } from "react";',
                'import { View, StyleSheet, ActivityIndicator, Text } from "react-native";',
                'import { WebView } from "react-native-webview";',
                'import type { WebViewMessageEvent, WebViewErrorEvent, WebViewHttpErrorEvent } from "react-native-webview/lib/WebViewTypes";',
                'import { PIXI_BUNDLE } from "./pixi-bundle";',
                'import { PLAYER_BUNDLE } from "./player-bundle";',
                includeAstro ? 'import { ASTRO_BUNDLE } from "./astro-data-bundle";' : '// Astro data not included',
                includeAmino ? 'import { AMINO_BUNDLE } from "./amino-data-bundle";' : '// Amino data not included',
                hasAssets    ? 'import { ASSETS_BUNDLE } from "./assets-bundle";' : '// No Supabase assets used',
                '',
                '// ── Types ──────────────────────────────────────────────────────',
                'interface GeometryPlayerProps {',
                '  /** The animation JSON data exported from Geometry Sequencer */',
                '  animationData: Record<string, unknown>;',
                '  /** Optional background color override (hex string) */',
                '  backgroundColor?: string;',
                '  /** Called when the animation engine has initialized successfully */',
                '  onReady?: () => void;',
                '  /** Called with an error message when the animation fails to load */',
                '  onError?: (message: string) => void;',
                '  /** Called each frame with the current animation time (for analytics) */',
                '  onFrame?: (time: number) => void;',
                '  /** Enable verbose debug logging from the WebView (default: false) */',
                '  debug?: boolean;',
                '}',
                '',
                'type PlayerState = "loading" | "ready" | "error" | "timeout";',
                '',
                '// ── Constants ──────────────────────────────────────────────────',
                'const INIT_TIMEOUT_MS = 10000; // 10 seconds to initialize',
                '',
                '// ── Component ──────────────────────────────────────────────────',
                'export default function GeometryPlayer({',
                '  animationData,',
                '  backgroundColor,',
                '  onReady,',
                '  onError,',
                '  onFrame,',
                '  debug = false,',
                '}: GeometryPlayerProps) {',
                '  const [state, setState] = useState<PlayerState>("loading");',
                '  const [errorMessage, setErrorMessage] = useState<string>("");',
                '  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);',
                '',
                '  // Priority: prop override > animation data > fallback black',
                '  const bgColor = backgroundColor',
                '    || (animationData as any).backgroundColor',
                '    || "#000000";',
                '',
                '  // ── Timeout: if engine does not send "ready" within 10s ────',
                '  useEffect(() => {',
                '    timeoutRef.current = setTimeout(() => {',
                '      if (state === "loading") {',
                '        setState("timeout");',
                '        setErrorMessage("Animation engine timed out after 10s.");',
                '        onError?.("Animation engine timed out after 10s.");',
                '      }',
                '    }, INIT_TIMEOUT_MS);',
                '',
                '    return () => {',
                '      if (timeoutRef.current) clearTimeout(timeoutRef.current);',
                '    };',
                '  }, []);',
                '',
                '  // ── RN ↔ WebView Message Bridge ──────────────────────────────',
                '  // The WebView posts structured JSON messages:',
                '  //   { type: "ready" }            — engine initialized',
                '  //   { type: "error", message }   — init or runtime error',
                '  //   { type: "frame", time }      — animation frame tick',
                '  //   { type: "log", message }     — debug console output',
                '  const handleMessage = useCallback((event: WebViewMessageEvent) => {',
                '    try {',
                '      const data = JSON.parse(event.nativeEvent.data);',
                '',
                '      switch (data.type) {',
                '        case "ready":',
                '          if (timeoutRef.current) clearTimeout(timeoutRef.current);',
                '          setState("ready");',
                '          onReady?.();',
                '          break;',
                '        case "error":',
                '          if (timeoutRef.current) clearTimeout(timeoutRef.current);',
                '          setState("error");',
                '          setErrorMessage(data.message || "Unknown error");',
                '          onError?.(data.message || "Unknown error");',
                '          break;',
                '        case "frame":',
                '          onFrame?.(data.time);',
                '          break;',
                '        case "log":',
                '          if (debug) console.log("[GeometryPlayer]", data.message);',
                '          break;',
                '      }',
                '    } catch (e) {',
                '      if (debug) console.warn("[GeometryPlayer] Failed to parse message:", e);',
                '    }',
                '  }, [onReady, onError, onFrame, debug]);',
                '',
                '  // ── WebView Error Handlers ────────────────────────────────────',
                '  const handleWebViewError = useCallback((event: WebViewErrorEvent) => {',
                '    const msg = "WebView load error: " + event.nativeEvent.description;',
                '    setState("error");',
                '    setErrorMessage(msg);',
                '    onError?.(msg);',
                '  }, [onError]);',
                '',
                '  const handleHttpError = useCallback((event: WebViewHttpErrorEvent) => {',
                '    const msg = "HTTP error " + event.nativeEvent.statusCode;',
                '    if (debug) console.warn("[GeometryPlayer]", msg);',
                '  }, [debug]);',
                '',
                '  // Escape </script> in each bundle for safe HTML injection',
                '  const safePixi = PIXI_BUNDLE.replace(/<\\/script>/gi, "<\\\\/script>");',
                '  const safePlayer = PLAYER_BUNDLE.replace(/<\\/script>/gi, "<\\\\/script>");',
                includeAstro ? '  const safeAstro = ASTRO_BUNDLE.replace(/<\\/script>/gi, "<\\\\/script>");' : '',
                includeAmino ? '  const safeAmino = AMINO_BUNDLE.replace(/<\\/script>/gi, "<\\\\/script>");' : '',
                hasAssets    ? '  const safeAssets = ASSETS_BUNDLE.replace(/<\\/script>/gi, "<\\\\/script>");' : '',
                '',
                '  // ── Build self-contained HTML ─────────────────────────────────',
                '  // The HTML includes a postMessage bridge that sends structured',
                '  // events back to React Native for state management.',
                '  const html = [',
                '    "<!DOCTYPE html>",',
                '    "<html lang=\\"en\\"><head>",',
                '    "<meta charset=\\"UTF-8\\">",',
                '    "<meta name=\\"viewport\\" content=\\"width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no\\">",',
                '    "<style>",',
                '    "body{margin:0;overflow:hidden;background:" + bgColor + ";width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;}",',
                '    "#canvas-container{width:100%;height:100%}",',
                '    "canvas{display:block;width:100%;height:100%}",',
                '    "#error-msg{color:#ff5555;font-family:sans-serif;display:none;text-align:center;position:absolute;padding:20px}",',
                '    "</style></head><body>",',
                '    "<div id=\\"canvas-container\\"></div>",',
                '    "<div id=\\"error-msg\\"></div>",',
                '    "<!-- PixiJS Rendering Engine -->",',
'    "<script>" + safePixi + "<\\/script>",',
                includeAstro ? '    "<!-- Astrological Symbol SVG Data -->",' : '',
                includeAstro ? '    "<script>" + safeAstro + "<\\/script>",' : '',
                includeAmino ? '    "<!-- Amino Acid Molecule SVG Data -->",' : '',
                includeAmino ? '    "<script>" + safeAmino + "<\\/script>",' : '',
                hasAssets    ? '    "<!-- Asset Registry (asset_set / asset_single) -->",' : '',
                hasAssets    ? '    "<script>" + safeAssets + "<\\/script>",' : '',
'    "<!-- Geometry Sequencer Player -->",',
'    "<script>" + safePlayer + "<\\/script>",',
                '    "<script>",',
                '    // ── Bridge helper: send structured messages to React Native ──',
                '    "function postToRN(msg){",',
                '    "  if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){",',
                '    "    window.ReactNativeWebView.postMessage(JSON.stringify(msg));",',
                '    "  }",',
                '    "}",',
                '    "var projectData=" + JSON.stringify(animationData) + ";",',
                '    "window.onload=function(){",',
                '    "try{",',
                '    "  window.GeometryApp.init(\\"canvas-container\\",projectData);",',
                '    "  postToRN({type:\\"ready\\"});",',
                '    "}catch(e){",',
                '    "  console.error(\\"Init failed:\\",e);",',
                '    "  postToRN({type:\\"error\\",message:e.message||String(e)});",',
                '    "  var d=document.getElementById(\\"error-msg\\");",',
                '    "  d.style.display=\\"block\\";",',
                '    "  d.innerText=\\"Animation failed: \\"+e.message;",',
                '    "}",',
                '    "};",',
                '    "</script></body></html>",',
                '  ].join("\\n");',
                '',
                '  // ── Error / Timeout Fallback UI ──────────────────────────────',
                '  if (state === "error" || state === "timeout") {',
                '    return (',
                '      <View style={[styles.errorContainer, { backgroundColor: bgColor }]}>',
                '        <Text style={styles.errorIcon}>⚠</Text>',
                '        <Text style={styles.errorTitle}>',
                '          {state === "timeout" ? "Animation Timed Out" : "Animation Error"}',
                '        </Text>',
                '        <Text style={styles.errorMessage}>{errorMessage}</Text>',
                '      </View>',
                '    );',
                '  }',
                '',
                '  return (',
                '    <View style={[styles.container, { backgroundColor: bgColor }]}>',
                '      <WebView',
                '        // Security: restrict to local HTML content only',
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
                '        // ── RN ↔ WebView Bridge ──',
                '        onMessage={handleMessage}',
                '        // ── Error Handlers ──',
                '        onError={handleWebViewError}',
                '        onHttpError={handleHttpError}',
                '        // ── Media / Layout ──',
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
                '  loading: {',
                '    position: "absolute",',
                '    top: 0, left: 0, right: 0, bottom: 0,',
                '    justifyContent: "center",',
                '    alignItems: "center",',
                '  },',
                '  errorContainer: {',
                '    flex: 1,',
                '    justifyContent: "center",',
                '    alignItems: "center",',
                '    padding: 32,',
                '  },',
                '  errorIcon: { fontSize: 48, marginBottom: 16 },',
                '  errorTitle: { color: "#ff5555", fontSize: 18, fontWeight: "bold", marginBottom: 8 },',
                '  errorMessage: { color: "#999", fontSize: 14, textAlign: "center" },',
                '});',
            ].join('\n');

            // 3. Generate the Annotated Sample Screen
            // ────────────────────────────────────────────────────────
            const sampleScreenTsx = [
                '/**',
                ' * ════════════════════════════════════════════════════════════════',
                ' * SAMPLE SCREEN — How to Use Geometry Sequencer Animations',
                ' * ════════════════════════════════════════════════════════════════',
                ' *',
                ' * This file demonstrates how to load and display a Geometry',
                ' * Sequencer animation in your React Native app.',
                ' *',
                ' * ── QUICK START ──────────────────────────────────────────────',
                ' * 1. Import the GeometryPlayer component',
                ' * 2. Import your animation JSON file',
                ' * 3. Pass the JSON data to <GeometryPlayer />',
                ' *',
                ' * ── ADDING MORE ANIMATIONS ──────────────────────────────────',
                ' * 1. Export the animation as JSON from Geometry Sequencer',
                ' * 2. Place the .json file in  src/animations/',
                ' * 3. Import it:',
                ' *      import newAnim from "../animations/new_animation.json";',
                ' * 4. Use it:',
                ' *      <GeometryPlayer animationData={newAnim} />',
                ' *',
                ' * ── SWITCHING BETWEEN ANIMATIONS ────────────────────────────',
                ' * See the commented-out "Animation Switcher" pattern below',
                ' * for a ready-to-use multi-animation gallery.',
                ' *',
                ' * ── LOADING FROM A REMOTE API ───────────────────────────────',
                ' * See the commented-out "Remote Loading" section at the bottom',
                ' * of this file for a fetch-based pattern.',
                ' * ════════════════════════════════════════════════════════════════',
                ' */',
                'import React, { useState } from "react";',
                'import { View, StyleSheet, TouchableOpacity, Text, ScrollView } from "react-native";',
                'import GeometryPlayer from "../engine/GeometryPlayer";',
                '',
                '// ┌─────────────────────────────────────────────────────────────┐',
                '// │  STEP 1: Import your animation JSON files                  │',
                '// │  Each .json file is a complete Geometry Sequencer project.  │',
                '// │  Place them in src/animations/ and import them here.        │',
                '// └─────────────────────────────────────────────────────────────┘',
                'import sampleAnimation from "../animations/' + safeName + '.json";',
                '',
                '// ── Add more animation imports here: ──────────────────────────',
                '// import secondAnimation from "../animations/second_animation.json";',
                '// import thirdAnimation from "../animations/third_animation.json";',
                '',
                '',
                '// ┌─────────────────────────────────────────────────────────────┐',
                '// │  (Optional) ANIMATION REGISTRY                             │',
                '// │  If you have multiple animations, organize them in an      │',
                '// │  array so you can easily switch between them.              │',
                '// └─────────────────────────────────────────────────────────────┘',
                '// const ANIMATIONS = [',
                '//   { name: "' + project.name + '", data: sampleAnimation },',
                '//   { name: "Second Animation", data: secondAnimation },',
                '//   { name: "Third Animation",  data: thirdAnimation },',
                '// ];',
                '',
                '',
                'export default function SampleScreen() {',
                '  // ┌───────────────────────────────────────────────────────────┐',
                '  // │  STEP 2: Render the player                               │',
                '  // │  Just pass your animation data as a prop. The player     │',
                '  // │  handles all PixiJS rendering internally via WebView.    │',
                '  // └───────────────────────────────────────────────────────────┘',
                '  return (',
                '    <View style={styles.container}>',
                '      {/* ── Basic Usage ──────────────────────────────────────── */}',
                '      <GeometryPlayer animationData={sampleAnimation} />',
                '',
                '      {/* ── With custom background ──────────────────────────── */}',
                '      {/* <GeometryPlayer',
                '        animationData={sampleAnimation}',
                '        backgroundColor="#1a1a2e"',
                '      /> */}',
                '    </View>',
                '  );',
                '',
                '  // ┌───────────────────────────────────────────────────────────┐',
                '  // │  ALTERNATIVE: Animation Switcher Pattern                 │',
                '  // │  Uncomment below (and comment out the return above)      │',
                '  // │  to create a gallery that lets users pick an animation.  │',
                '  // └───────────────────────────────────────────────────────────┘',
                '  //',
                '  // const [activeIndex, setActiveIndex] = useState(0);',
                '  //',
                '  // return (',
                '  //   <View style={styles.container}>',
                '  //     <View style={styles.playerArea}>',
                '  //       <GeometryPlayer',
                '  //         animationData={ANIMATIONS[activeIndex].data}',
                '  //       />',
                '  //     </View>',
                '  //     <ScrollView horizontal style={styles.selector}>',
                '  //       {ANIMATIONS.map((anim, index) => (',
                '  //         <TouchableOpacity',
                '  //           key={index}',
                '  //           style={[',
                '  //             styles.selectorButton,',
                '  //             index === activeIndex && styles.selectorButtonActive,',
                '  //           ]}',
                '  //           onPress={() => setActiveIndex(index)}',
                '  //         >',
                '  //           <Text style={styles.selectorText}>{anim.name}</Text>',
                '  //         </TouchableOpacity>',
                '  //       ))}',
                '  //     </ScrollView>',
                '  //   </View>',
                '  // );',
                '}',
                '',
                '',
                'const styles = StyleSheet.create({',
                '  container: {',
                '    flex: 1,',
                '    backgroundColor: "#000",',
                '  },',
                '  // ── Styles for the animation switcher (uncomment if using): ──',
                '  // playerArea: { flex: 1 },',
                '  // selector: {',
                '  //   maxHeight: 60,',
                '  //   backgroundColor: "#111",',
                '  //   borderTopWidth: 1,',
                '  //   borderTopColor: "#333",',
                '  // },',
                '  // selectorButton: {',
                '  //   paddingHorizontal: 20,',
                '  //   paddingVertical: 16,',
                '  //   justifyContent: "center",',
                '  // },',
                '  // selectorButtonActive: {',
                '  //   borderBottomWidth: 2,',
                '  //   borderBottomColor: "#D4AF37",',
                '  // },',
                '  // selectorText: { color: "#fff", fontSize: 14 },',
                '});',
                '',
                '',
                '// ┌─────────────────────────────────────────────────────────────┐',
                '// │  ADVANCED: Loading Animations from a Remote API            │',
                '// └─────────────────────────────────────────────────────────────┘',
                '// You can load animation JSON from a server at runtime:',
                '//',
                '// async function loadAnimationFromUrl(url: string) {',
                '//   const response = await fetch(url);',
                '//   const data = await response.json();',
                '//   return data; // Pass this to <GeometryPlayer animationData={data} />',
                '// }',
                '//',
                '// Example in a component:',
                '//',
                '// const [remoteAnim, setRemoteAnim] = useState<any>(null);',
                '// useEffect(() => {',
                '//   loadAnimationFromUrl("https://your-api.com/animations/123.json")',
                '//     .then(data => setRemoteAnim(data));',
                '// }, []);',
                '//',
                '// if (!remoteAnim) return <ActivityIndicator />;',
                '// return <GeometryPlayer animationData={remoteAnim} />;',
            ].join('\n');

            // ────────────────────────────────────────────────────────
            // 4. Write all files to the ZIP
            // ────────────────────────────────────────────────────────

            // Static template files (package.json, app.json, tsconfig, App.tsx)
            Object.entries(REACT_NATIVE_TEMPLATES).forEach(([filename, content]) => {
                zip.file(filename, content);
            });

            // Generated engine files (PixiJS and Player are separate for debugging/versioning)
            zip.file('src/engine/pixi-bundle.ts', pixiBundleTs);
            if (includeAstro && astroBundleTs) zip.file('src/engine/astro-data-bundle.ts', astroBundleTs);
            if (includeAmino && aminoBundleTs) zip.file('src/engine/amino-data-bundle.ts', aminoBundleTs);
            if (hasAssets && assetsBundleTs) zip.file('src/engine/assets-bundle.ts', assetsBundleTs);
            zip.file('src/engine/player-bundle.ts', playerBundleTs);
            zip.file('src/engine/GeometryPlayer.tsx', geometryPlayerTsx);

            // Generated sample screen
            zip.file('src/screens/SampleScreen.tsx', sampleScreenTsx);

            // Animation JSON (the actual project data)
            const projectJson = JSON.stringify(project, null, 2);
            zip.file('src/animations/' + safeName + '.json', projectJson);

            // Default placeholder assets (prevents Expo build errors)
            const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
            const iconBlob = await (await fetch(`data:image/png;base64,${base64Png}`)).blob();
            zip.file('assets/icon.png', iconBlob);
            zip.file('assets/splash.png', iconBlob);
            zip.file('assets/adaptive-icon.png', iconBlob);
            zip.file('assets/favicon.png', iconBlob);

            // ────────────────────────────────────────────────────────
            // 5. Generate and Download ZIP
            // ────────────────────────────────────────────────────────
            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${safeName}_react_native_export.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setStatus('Done!');
            setTimeout(() => {
                setIsExporting(false);
                onClose();
            }, 1000);

        } catch (err) {
            console.error(err);
            setStatus(err instanceof Error ? `Error: ${err.message}` : 'Error!');
        }
    };

    const handleSvgExport = async () => {
        setIsExporting(true);
        setStatus('Rendering SVG...');
        try {
            const { svg, warnings } = await renderProjectToSVG(project, {
                mode: svgFrameMode,
                time: svgFrameTime,
            });
            if (warnings.length) console.warn('SVG export warnings:', warnings);
            const safeName = (project.name || 'snapshot').replace(/[^a-z0-9-_]+/gi, '_');
            const suffix = svgFrameMode === 'time' ? `_t${svgFrameTime.toFixed(2)}s` : `_${svgFrameMode}`;
            downloadSVG(svg, `${safeName}${suffix}.svg`);
            setStatus('Done!');
            setTimeout(() => { setIsExporting(false); onClose(); }, 600);
        } catch (e) {
            console.error('SVG export failed', e);
            setStatus(e instanceof Error ? `Error: ${e.message}` : 'Error!');
            setIsExporting(false);
        }
    };

    const handleJsonExport = () => {
        const safeName = project.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const jsonFilename = `${safeName}.json`;
        const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = jsonFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-xl w-[450px] shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <button
                    onClick={onClose}
                    disabled={isExporting}
                    className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors disabled:opacity-50"
                >
                    <X size={20} />
                </button>

                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37]">
                        <Film size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">Export Project</h2>
                        <p className="text-xs text-white/40">{project.name}</p>
                    </div>
                </div>

                {/* Tabs */}
                {!isExporting && (
                    <div className="flex bg-black/20 p-1 rounded-lg mb-6">
                        <button
                            onClick={() => setActiveTab('video')}
                            className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 transition-all ${activeTab === 'video' ? 'bg-[#D4AF37] text-black shadow' : 'text-white/40 hover:text-white'}`}
                        >
                            <Film size={14} /> Video
                        </button>
                        <button
                            onClick={() => setActiveTab('svg')}
                            className={`flex-1 py-1.5 text-[10px] font-bold rounded flex items-center justify-center gap-1.5 transition-all ${activeTab === 'svg' ? 'bg-[#D4AF37] text-black shadow' : 'text-white/40 hover:text-white'}`}
                        >
                            <ImageIcon size={12} /> SVG
                        </button>
                        <button
                            onClick={() => setActiveTab('html')}
                            className={`flex-1 py-1.5 text-[10px] font-bold rounded flex items-center justify-center gap-1.5 transition-all ${activeTab === 'html' ? 'bg-[#D4AF37] text-black shadow' : 'text-white/40 hover:text-white'}`}
                        >
                            <FileCode size={12} /> HTML
                        </button>
                        <button
                            onClick={() => setActiveTab('react')}
                            className={`flex-1 py-1.5 text-[10px] font-bold rounded flex items-center justify-center gap-1.5 transition-all ${activeTab === 'react' ? 'bg-[#D4AF37] text-black shadow' : 'text-white/40 hover:text-white'}`}
                        >
                            <Code2 size={12} /> React
                        </button>
                        <button
                            onClick={() => setActiveTab('json')}
                            className={`flex-1 py-1.5 text-[10px] font-bold rounded flex items-center justify-center gap-1.5 transition-all ${activeTab === 'json' ? 'bg-[#D4AF37] text-black shadow' : 'text-white/40 hover:text-white'}`}
                        >
                            <FileJson size={12} /> JSON
                        </button>
                        <button
                            onClick={() => setActiveTab('native')}
                            className={`flex-1 py-1.5 text-[10px] font-bold rounded flex items-center justify-center gap-1.5 transition-all ${activeTab === 'native' ? 'bg-[#D4AF37] text-black shadow' : 'text-white/40 hover:text-white'}`}
                        >
                            <Smartphone size={12} /> Mobile
                        </button>
                    </div>
                )}

                {/* Shared Output Options */}
                {!isExporting && activeTab !== 'json' && (
                    <div className="mb-6 flex items-center justify-between p-3 bg-black/20 border border-[#D4AF37]/20 rounded-lg">
                        <div>
                            <span className="text-xs font-bold text-white uppercase tracking-wider block">Transparent Background</span>
                            <span className="text-[10px] text-white/50 block mt-0.5">Overrides project proofing background</span>
                        </div>
                        <ModernToggle
                            checked={transparentBg}
                            onChange={setTransparentBg}
                            label=""
                        />
                    </div>
                )}

                {!isExporting ? (
                    <div className="space-y-6">
                        {activeTab === 'video' ? (
                            <>
                                {/* Resolution & Ratio */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Resolution</label>
                                        <div className="flex flex-col gap-1">
                                            {VIDEO_RESOLUTIONS.map(res => (
                                                <button
                                                    key={res}
                                                    onClick={() => setResolution(res)}
                                                    className={`px-3 py-2 text-xs rounded-md transition-all text-left ${resolution === res ? 'bg-[#D4AF37] text-black font-bold' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'}`}
                                                >
                                                    {res} <span className="opacity-50 ml-1">{RESOLUTION_LABELS[res]}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Ratio</label>
                                        <div className="flex flex-col gap-1">
                                            {VIDEO_ASPECT_RATIOS.map(ratio => (
                                                <button
                                                    key={ratio}
                                                    onClick={() => setAspectRatio(ratio)}
                                                    className={`px-3 py-2 text-xs rounded-md transition-all text-left ${aspectRatio === ratio ? 'bg-[#D4AF37] text-black font-bold' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'}`}
                                                >
                                                    {ratio} <span className="opacity-50 ml-1">{ASPECT_RATIO_LABELS[ratio]}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-[10px] text-white/30 px-1 -mt-3">
                                    Output: <span className="text-white/60">
                                        {getVideoDimensions(resolution, aspectRatio).width}×{getVideoDimensions(resolution, aspectRatio).height}
                                    </span>
                                    {resolution === '4K' && <span className="ml-2 text-[#D4AF37]/70">4K renders are slower</span>}
                                </div>

                                {/* Duration Settings */}
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Duration</label>
                                    <div className="grid grid-cols-2 gap-2 p-1 bg-black/20 rounded-lg">
                                        <button
                                            onClick={() => setDurationMode('loop')}
                                            className={`px-3 py-2 text-xs rounded-md transition-all ${durationMode === 'loop' ? 'bg-[#D4AF37] text-black font-bold' : 'text-white/40 hover:text-white'}`}
                                        >
                                            By Loops
                                        </button>
                                        <button
                                            onClick={() => setDurationMode('time')}
                                            className={`px-3 py-2 text-xs rounded-md transition-all ${durationMode === 'time' ? 'bg-[#D4AF37] text-black font-bold' : 'text-white/40 hover:text-white'}`}
                                        >
                                            By Time
                                        </button>
                                    </div>

                                    {durationMode === 'loop' ? (
                                        <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/5">
                                            <span className="text-sm text-white/80">Loop Count</span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={10}
                                                value={loopCount}
                                                onChange={(e) => setLoopCount(Math.max(1, parseInt(e.target.value) || 1))}
                                                className="w-16 bg-black/40 border border-white/10 rounded px-2 py-1 text-right text-sm text-[#D4AF37] focus:outline-none focus:border-[#D4AF37]"
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/5">
                                            <span className="text-sm text-white/80">Seconds</span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={300}
                                                value={seconds}
                                                onChange={(e) => setSeconds(Math.max(1, parseInt(e.target.value) || 1))}
                                                className="w-16 bg-black/40 border border-white/10 rounded px-2 py-1 text-right text-sm text-[#D4AF37] focus:outline-none focus:border-[#D4AF37]"
                                            />
                                        </div>
                                    )}
                                    <div className="text-[10px] text-white/30 px-1">
                                        Est. Time: <span className="text-white/60">
                                            {durationMode === 'loop' ? (project.duration || 10) * loopCount : seconds}s
                                        </span>
                                    </div>
                                </div>

                                {/* Format Info */}
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Format</label>
                                    {supportedFormats.length > 0 ? (
                                        <div className="grid grid-cols-2 gap-2">
                                            {supportedFormats.map(fmt => (
                                                <button
                                                    key={fmt}
                                                    onClick={() => setSelectedFormat(fmt)}
                                                    className={`p-3 rounded-lg border text-left text-xs transition-all ${selectedFormat === fmt
                                                        ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-white'
                                                        : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                                                        }`}
                                                >
                                                    <div className="font-bold mb-1">{fmt.includes('mp4') ? 'MP4 (H.264)' : 'WebM (VP9)'}</div>
                                                    <div className="text-[10px] opacity-60 truncate">{fmt.split(';')[0]}</div>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-white/5 p-3 rounded-lg border border-white/5 flex items-center justify-between">
                                            <span className="text-sm text-white/80">WebM Video</span>
                                            <span className="text-xs text-white/40 bg-white/10 px-2 py-1 rounded">Default</span>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleVideoExport}
                                    className="w-full h-12 bg-[#D4AF37] hover:bg-[#F4CF57] text-black font-bold rounded-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <Share2 size={18} />
                                    Export
                                </button>
                            </>
                        ) : activeTab === 'svg' ? (
                            <div className="space-y-4">
                                <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
                                    <h4 className="text-white font-bold mb-2 flex items-center gap-2"><ImageIcon size={16} className="text-[#D4AF37]" /> Vector Snapshot</h4>
                                    <p className="text-xs text-white/60 leading-relaxed">
                                        Exports a single SVG of the chosen frame. Filters, gradients, and raster sprites are skipped — vectors only. ViewBox auto-fits all geometry (including off-canvas).
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Frame</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['first', 'time', 'last'] as const).map(m => (
                                            <button
                                                key={m}
                                                onClick={() => setSvgFrameMode(m)}
                                                className={`px-3 py-2 text-xs rounded-md transition-all ${svgFrameMode === m ? 'bg-[#D4AF37] text-black font-bold' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'}`}
                                            >
                                                {m === 'first' ? 'First' : m === 'last' ? 'Last' : 'At time'}
                                            </button>
                                        ))}
                                    </div>
                                    {svgFrameMode === 'time' && (
                                        <div className="flex items-center gap-2 pt-1">
                                            <input
                                                type="number"
                                                min={0}
                                                max={project.duration || 10}
                                                step={0.01}
                                                value={svgFrameTime}
                                                onChange={(e) => setSvgFrameTime(parseFloat(e.target.value) || 0)}
                                                className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                                            />
                                            <span className="text-[10px] text-white/40">sec / {(project.duration || 10).toFixed(2)}s</span>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleSvgExport}
                                    className="w-full h-12 bg-[#D4AF37] hover:bg-[#F4CF57] text-black font-bold rounded-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <ImageIcon size={18} />
                                    Download SVG
                                </button>
                            </div>
                        ) : activeTab === 'html' ? (
                            <div className="space-y-4">
                                <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
                                    <h4 className="text-white font-bold mb-2 flex items-center gap-2"><Check size={16} className="text-green-500" /> Standalone Package</h4>
                                    <p className="text-xs text-white/60 mb-4 leading-relaxed">
                                        Download a ZIP file containing everything needed to run this animation on any website.
                                    </p>
                                    <div className="space-y-2 text-xs text-white/40">
                                        <div className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4AF37] rounded-full"></div>Includes index.html viewer</div>
                                        <div className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4AF37] rounded-full"></div>Includes bundled Player Runtime (PixiJS)</div>
                                        <div className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4AF37] rounded-full"></div>Includes Project Data JSON</div>
                                    </div>
                                </div>

                                {/* Optional Data Bundles */}
                                <div className="space-y-2">
                                    {(usesAstro || usesAmino || usesCustomSvg || assetLayerCount > 0) && (
                                        <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Included Bundles</label>
                                    )}
                                    {usesAstro && (
                                        <div className="flex items-center justify-between p-2.5 bg-black/20 border border-white/5 rounded-lg">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-white/70">Astro Symbols (legacy)</span>
                                                <span className="text-[9px] text-white/30">4 KB</span>
                                            </div>
                                            <ModernToggle checked={includeAstro} onChange={setIncludeAstro} label="" />
                                        </div>
                                    )}
                                    {usesAmino && (
                                        <div className="flex items-center justify-between p-2.5 bg-black/20 border border-white/5 rounded-lg">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-white/70">Amino Molecules (legacy)</span>
                                                <span className="text-[9px] text-white/30">47 KB</span>
                                            </div>
                                            <ModernToggle checked={includeAmino} onChange={setIncludeAmino} label="" />
                                        </div>
                                    )}
                                    {usesCustomSvg && (
                                        <div className="flex items-center gap-2 p-2.5 bg-black/20 border border-white/5 rounded-lg">
                                            <span className="text-[9px] text-green-500">✓</span>
                                            <span className="text-xs text-white/50">Custom SVGs included in animation data</span>
                                        </div>
                                    )}
                                    {assetLayerCount > 0 && (
                                        <div className="flex items-center gap-2 p-2.5 bg-black/20 border border-white/5 rounded-lg">
                                            <span className="text-[9px] text-green-500">✓</span>
                                            <span className="text-xs text-white/50">
                                                Bundling assets for {assetLayerCount} layer{assetLayerCount === 1 ? '' : 's'} (auto)
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleHtmlExport}
                                    className="w-full h-12 bg-[#D4AF37] hover:bg-[#F4CF57] text-black font-bold rounded-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <Download size={18} />
                                    Download ZIP Package
                                </button>
                            </div>
                        ) : activeTab === 'react' ? (
                            <div className="space-y-4">
                                <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
                                    <h4 className="text-white font-bold mb-2 flex items-center gap-2"><Check size={16} className="text-green-500" /> React Component</h4>
                                    <p className="text-xs text-white/60 mb-4 leading-relaxed">
                                        Download a ready-to-use React project (Vite + TypeScript) with the GeometryPlayer component.
                                    </p>
                                    <div className="space-y-2 text-xs text-white/40">
                                        <div className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4AF37] rounded-full"></div>Full Vite + React + TS Project</div>
                                        <div className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4AF37] rounded-full"></div>Includes GeometryPlayer.tsx</div>
                                        <div className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4AF37] rounded-full"></div>Includes Project Data</div>
                                    </div>
                                </div>

                                <button
                                    onClick={handleReactExport}
                                    className="w-full h-12 bg-[#D4AF37] hover:bg-[#F4CF57] text-black font-bold rounded-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <Code2 size={18} />
                                    Download React Project
                                </button>
                            </div>
                        ) : activeTab === 'native' ? (
                            <div className="space-y-4">
                                <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
                                    <h4 className="text-white font-bold mb-2 flex items-center gap-2"><Check size={16} className="text-green-500" /> React Native (Expo)</h4>
                                    <p className="text-xs text-white/60 mb-4 leading-relaxed">
                                        Download a ready-to-run Expo project for iOS and Android. Uses a WebView for maximum compatibility.
                                    </p>
                                    <div className="space-y-2 text-xs text-white/40">
                                        <div className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4AF37] rounded-full"></div>Expo / React Native configured</div>
                                        <div className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4AF37] rounded-full"></div>Includes WebView Player</div>
                                        <div className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4AF37] rounded-full"></div>Self-contained (no external assets)</div>
                                    </div>
                                </div>

                                {/* Optional Data Bundles */}
                                <div className="space-y-2">
                                    {(usesAstro || usesAmino || usesCustomSvg || assetLayerCount > 0) && (
                                        <label className="text-xs font-bold text-white/60 uppercase tracking-wider">Included Bundles</label>
                                    )}
                                    {usesAstro && (
                                        <div className="flex items-center justify-between p-2.5 bg-black/20 border border-white/5 rounded-lg">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-white/70">Astro Symbols (legacy)</span>
                                                <span className="text-[9px] text-white/30">4 KB</span>
                                            </div>
                                            <ModernToggle checked={includeAstro} onChange={setIncludeAstro} label="" />
                                        </div>
                                    )}
                                    {usesAmino && (
                                        <div className="flex items-center justify-between p-2.5 bg-black/20 border border-white/5 rounded-lg">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-white/70">Amino Molecules (legacy)</span>
                                                <span className="text-[9px] text-white/30">47 KB</span>
                                            </div>
                                            <ModernToggle checked={includeAmino} onChange={setIncludeAmino} label="" />
                                        </div>
                                    )}
                                    {usesCustomSvg && (
                                        <div className="flex items-center gap-2 p-2.5 bg-black/20 border border-white/5 rounded-lg">
                                            <span className="text-[9px] text-green-500">✓</span>
                                            <span className="text-xs text-white/50">Custom SVGs included in animation data</span>
                                        </div>
                                    )}
                                    {assetLayerCount > 0 && (
                                        <div className="flex items-center gap-2 p-2.5 bg-black/20 border border-white/5 rounded-lg">
                                            <span className="text-[9px] text-green-500">✓</span>
                                            <span className="text-xs text-white/50">
                                                Bundling assets for {assetLayerCount} layer{assetLayerCount === 1 ? '' : 's'} (auto)
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleReactNativeExport}
                                    className="w-full h-12 bg-[#D4AF37] hover:bg-[#F4CF57] text-black font-bold rounded-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <Smartphone size={18} />
                                    Download Mobile Project
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-white/5 border border-white/10 p-4 rounded-lg">
                                    <h4 className="text-white font-bold mb-2 flex items-center gap-2"><Check size={16} className="text-green-500" /> Project Data Only</h4>
                                    <p className="text-xs text-white/60 mb-4 leading-relaxed">
                                        Download only the raw JSON data for this project. Useful for backups or custom integrations.
                                    </p>
                                    <div className="space-y-2 text-xs text-white/40">
                                        <div className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4AF37] rounded-full"></div>Sanitized filename matches project name</div>
                                        <div className="flex items-center gap-2"><div className="w-1 h-1 bg-[#D4AF37] rounded-full"></div>Pure JSON format</div>
                                    </div>
                                </div>

                                <button
                                    onClick={handleJsonExport}
                                    className="w-full h-12 bg-[#D4AF37] hover:bg-[#F4CF57] text-black font-bold rounded-lg flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    <FileJson size={18} />
                                    Download JSON File
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="py-8 flex flex-col items-center justify-center space-y-6">
                        {activeTab === 'video' ? (
                            <div className="relative w-20 h-20 flex items-center justify-center">
                                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                                    <circle
                                        cx="50"
                                        cy="50"
                                        r="45"
                                        fill="none"
                                        stroke="#D4AF37"
                                        strokeWidth="8"
                                        strokeDasharray="283"
                                        strokeDashoffset={283 - (283 * progress / 100)}
                                        className="transition-all duration-300 ease-linear"
                                    />
                                </svg>
                                <div className="text-2xl font-bold text-white">{Math.round(progress)}%</div>
                            </div>
                        ) : (
                            <div className="w-20 h-20 flex items-center justify-center text-[#D4AF37] animate-bounce">
                                <Download size={48} />
                            </div>
                        )}

                        <div className="text-center space-y-2">
                            <h3 className="text-white font-bold animate-pulse">{status}</h3>
                            <p className="text-xs text-white/40">
                                {activeTab === 'video'
                                    ? (status === 'Resizing Canvas...' ? 'Adjusting resolution...' : 'Rendering video...')
                                    : 'Packaging files...'}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExportModal;
