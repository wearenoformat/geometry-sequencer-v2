import { Application } from 'pixi.js';
import { GeometryRenderer } from './rendering/GeometryRenderer';
import { assetCache } from './rendering/AssetCache';
import { migrateProject, ProjectTooNewError } from './utils/projectMigrations';
import type { Project } from './types';

// Asset registry shape produced by the exporter:
//   window.GEOMETRY_ASSETS = {
//     assets: { [assetId]: { url, mimeType } },
//     folders: { [folderId]: [assetId, ...] },  // ordered for asset_set cycling
//   }
// HTML exports point `url` at relative paths (./assets/<id>.<ext>); RN exports
// inline `url` as base64 data URLs since the WebView has no real filesystem.
type AssetRegistry = {
    assets?: Record<string, { url: string; mimeType: string }>;
    folders?: Record<string, string[]>;
};

// Define the global namespace
declare global {
    interface Window {
        GeometryApp: {
            init: (containerId: string, projectData: Project) => void;
        };
        GEOMETRY_ASSETS?: AssetRegistry;
    }
}

// Ensure namespace exists
window.GeometryApp = window.GeometryApp || {};

// Wire AssetCache to the embedded registry (idempotent — safe to call
// multiple times if the player init runs more than once on the page).
const wireAssetRegistry = () => {
    const registry = window.GEOMETRY_ASSETS;
    if (!registry || !registry.assets) return;

    assetCache.setUrlProvider(async (id) => {
        const entry = registry.assets?.[id];
        return entry ? { url: entry.url, mimeType: entry.mimeType } : null;
    });

    assetCache.setFolderAssetsProvider((folderId) => {
        if (!folderId) return [];
        const ids = registry.folders?.[folderId] || [];
        return ids
            .map((id) => {
                const a = registry.assets?.[id];
                return a ? { id, mimeType: a.mimeType } : null;
            })
            .filter((x): x is { id: string; mimeType: string } => x !== null);
    });
};

window.GeometryApp.init = async (containerId: string, projectData: Project) => {

    wireAssetRegistry();

    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`GeometryApp: Container #${containerId} not found.`);
        return;
    }

    // Bring older project payloads (e.g. loose ?project= JSON files) up to the
    // current format; refuse payloads stamped newer than this player build.
    let project: Project;
    try {
        project = migrateProject(projectData).project;
    } catch (e) {
        if (e instanceof ProjectTooNewError) {
            container.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:center;height:100%;padding:24px;' +
                'color:#d4af37;font-family:sans-serif;font-size:14px;text-align:center;">' +
                'This animation was exported with a newer version of Geometry Sequencer. ' +
                'Re-export it with a matching player, or update this export.</div>';
            return;
        }
        throw e;
    }

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 800;

    const app = new Application();

    await app.init({
        width,
        height,
        backgroundColor: project.backgroundColor || '#000000',
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        preference: 'webgl',
        resizeTo: container // Auto-resize to container
    });

    container.appendChild(app.canvas);

    const renderer = new GeometryRenderer();

    // ── Music track ────────────────────────────────────────────────────
    // The exporter ships the mp3 in the asset registry (base64 data URL for
    // HTML/RN exports). The wall-clock loop stays the visual driver; the audio
    // element is (re)started at each loop boundary. If the browser's autoplay
    // policy rejects play(), a tap-to-start overlay appears while the visuals
    // keep running silently — no overlay at all for projects without audio.
    const audioConfig = project.audio;
    const audioEntry = audioConfig ? window.GEOMETRY_ASSETS?.assets?.[audioConfig.assetId] : undefined;
    let audioEl: HTMLAudioElement | null = null;
    if (audioConfig && !audioConfig.muted && audioConfig.volume > 0 && audioEntry?.url) {
        audioEl = new Audio(audioEntry.url);
        audioEl.volume = Math.max(0, Math.min(1, audioConfig.volume));
        audioEl.preload = 'auto';
    }
    const audioOffset = audioConfig?.offset || 0;
    // When true, the ticker starts the audio once the loop time reaches the
    // track's offset (immediately for offset <= 0).
    let audioPendingStart = audioEl !== null;
    let audioBlocked = false;
    let overlayShown = false;

    const showStartOverlay = () => {
        if (overlayShown) return;
        overlayShown = true;
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }
        const overlay = document.createElement('div');
        overlay.setAttribute('style',
            'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
            'background:rgba(0,0,0,0.35);cursor:pointer;z-index:10;');
        overlay.innerHTML =
            '<div style="width:64px;height:64px;border-radius:50%;background:rgba(0,0,0,0.6);' +
            'border:1px solid rgba(212,175,55,0.6);display:flex;align-items:center;justify-content:center;">' +
            '<div style="width:0;height:0;border-top:12px solid transparent;border-bottom:12px solid transparent;' +
            'border-left:18px solid #d4af37;margin-left:5px;"></div></div>';
        overlay.addEventListener('click', () => {
            overlay.remove();
            overlayShown = false;
            audioBlocked = false;
            // Restart the loop from 0 so audio and visuals begin together.
            startTime = Date.now();
            lastLoopIndex = 0;
            audioPendingStart = true;
        });
        container.appendChild(overlay);
    };

    // Start Animation Loop
    let startTime = Date.now();
    let lastLoopIndex = 0;

    app.ticker.add(() => {
        // Calculate loop time
        const now = Date.now();
        const duration = project.duration || 10;
        const elapsed = (now - startTime) / 1000;
        const currentTime = elapsed % duration;

        if (audioEl && !audioBlocked) {
            const loopIndex = Math.floor(elapsed / duration);
            if (loopIndex !== lastLoopIndex) {
                // Loop boundary — rewind and rearm.
                lastLoopIndex = loopIndex;
                audioEl.pause();
                audioPendingStart = true;
            }
            if (audioPendingStart && currentTime >= Math.max(0, audioOffset)) {
                audioPendingStart = false;
                audioEl.currentTime = Math.max(0, currentTime - audioOffset);
                audioEl.play().catch(() => {
                    // Autoplay blocked — wait for a tap, visuals keep running.
                    audioBlocked = true;
                    showStartOverlay();
                });
            }
        }

        if (app.renderer) {
            renderer.render(app, project, currentTime);
        }
    });

    // Handle Resize (if not using resizeTo, but resizeTo handles canvas size. 
    // We might need to handle logic if renderer needs explicit updates, 
    // but GeometryRenderer uses app.screen so it should be fine)
};
