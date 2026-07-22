import React, { useEffect, useRef } from 'react';
import { Application, Color } from 'pixi.js';
import { GeometryRenderer } from '../rendering/GeometryRenderer';
import { setPixiAppProvider } from '../utils/thumbnailGenerator';
import type { Project } from '../types';

interface GeometryPlayerProps {
    project: Project;
    width: number;
    height: number;
    currentTime: number;
    isPlaying: boolean;
    backgroundColor?: string;
    onTick?: (deltaTime: number) => void;
    disableTicker?: boolean;
    /** When true the wrapper is transparent, so a letterboxed canvas reveals
     *  whatever is behind it (e.g. the editor's checkerboard). Off by default
     *  so exports / thumbnails keep the solid background. */
    letterboxTransparent?: boolean;
}

const GeometryPlayer: React.FC<GeometryPlayerProps> = ({
    project,
    width,
    height,
    currentTime,
    isPlaying,
    backgroundColor = '#000000',
    onTick,
    disableTicker = false,
    letterboxTransparent = false
}) => {
    const appRef = useRef<Application | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<GeometryRenderer | null>(null);

    // Track latest props in refs for use in ticker
    const propsRef = useRef({ project, currentTime, isPlaying, onTick, disableTicker });

    useEffect(() => {
        propsRef.current = { project, currentTime, isPlaying, onTick, disableTicker };
    }, [project, currentTime, isPlaying, onTick, disableTicker]);

    // Initialize Pixi Application
    useEffect(() => {
        if (appRef.current) return;
        if (!containerRef.current) return;

        let aborted = false;

        const init = async () => {
            const app = new Application();
            try {
                await app.init({
                    width,
                    height,
                    backgroundColor: backgroundColor,
                    antialias: true,
                    autoDensity: true,
                    resolution: window.devicePixelRatio || 1,
                    preference: 'webgl'
                });
            } catch (e) {
                console.error("PixiJS Init Failed:", e);
                return;
            }

            if (aborted) return;

            if (containerRef.current) {
                containerRef.current.appendChild(app.canvas);
                app.canvas.style.display = 'block';
                app.canvas.style.width = '100%';
                app.canvas.style.height = '100%';
                app.canvas.style.objectFit = 'contain';
                app.renderer.resize(width, height);
            }
            appRef.current = app;
            rendererRef.current = new GeometryRenderer();
            setPixiAppProvider(() => appRef.current);

            app.ticker.add((ticker) => {
                if (!app.renderer || !rendererRef.current) return;

                const { project, currentTime, isPlaying, onTick, disableTicker } = propsRef.current;

                if (!disableTicker && isPlaying && onTick) {
                    const dt = ticker.elapsedMS / 1000;
                    onTick(dt);
                }

                try {
                    // Use rendererRef.current with FRESH props
                    rendererRef.current.render(app, project, currentTime, isPlaying);
                } catch (err) {
                    console.error("PixiJS Render Error:", err);
                    app.ticker.stop();
                }
            });
        };

        init();

        return () => {
            aborted = true;
            setPixiAppProvider(null);
            if (appRef.current) {
                appRef.current.ticker.stop();
                appRef.current.destroy(true, { children: true, texture: true });
                appRef.current = null;
            }
            if (rendererRef.current) {
                rendererRef.current.cleanup();
                rendererRef.current = null;
            }
        };
    }, []); // Run once on mount

    // Handle Props Changes (Resize & BG)
    useEffect(() => {
        if (appRef.current && appRef.current.renderer) {
            if (appRef.current.screen.width !== width || appRef.current.screen.height !== height) {
                // Resize only if changed
                appRef.current.renderer.resize(width, height);
            }
            appRef.current.renderer.background.color = new Color(backgroundColor);
        }
    }, [width, height, backgroundColor]);

    // Force Render when props change even if ticker is unused (e.g. paused or export preview)
    // NOTE: If isPlaying is true, the ticker handles it. If false, we need this effect to update the view on scrub.
    useEffect(() => {
        if (appRef.current && rendererRef.current && !isPlaying) {
            rendererRef.current.render(appRef.current, project, currentTime, false);
        }
    }, [project, currentTime, isPlaying]);


    return <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden', background: letterboxTransparent ? 'transparent' : backgroundColor }} />;
};

export default GeometryPlayer;
