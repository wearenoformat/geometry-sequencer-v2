import React from 'react';

import GeometryCanvas from './components/GeometryCanvas';
import TopBar from './components/TopBar';
import Inspector from './components/Inspector';
import Timeline from './components/Timeline';
import { useStore } from './store/useStore';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import Player from './components/Player';
import LandingPage from './components/LandingPage';
import { supabase } from './supabaseClient';
import { assetCache } from './rendering/AssetCache';
import { TooltipProvider, TooltipOverlay } from './components/InspectorTooltip';

const App: React.FC = () => {
  // useAnimation(); // Moved to GeometryCanvas internally
  const currentView = useStore(s => s.currentView);
  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);

  // --- Resizing Logic (Timeline) ---
  const [timelineHeight, setTimelineHeight] = React.useState(300);
  const [isResizingTimeline, setIsResizingTimeline] = React.useState(false);
  const timelineRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingTimeline) {
        // Calculate new height based on mouse position from bottom of screen
        // But the layout splits the main area.
        // It's easier to calculate top of timeline vs screen height.
        // Or essentially: appHeight - mouseY - (status bar etc if exists?)
        // The main container fills screen.
        // The timeline is at the bottom of the left column.
        // Height = window.innerHeight - e.clientY
        const newHeight = Math.max(150, Math.min(window.innerHeight - 100, window.innerHeight - e.clientY));
        setTimelineHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      if (isResizingTimeline) {
        setIsResizingTimeline(false);
      }
    };

    if (isResizingTimeline) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
    } else {
      document.body.style.cursor = '';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
    };
  }, [isResizingTimeline]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Command/Ctrl + Z
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Redo: Command/Ctrl + Shift + Z
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Wire AssetCache providers (renderer consults the store via these indirections).
  React.useEffect(() => {
    assetCache.setUrlProvider(async (id) => {
      const url = await useStore.getState().signedUrlForAsset(id);
      if (!url) return null;
      let mimeType = 'application/octet-stream';
      for (const list of Object.values(useStore.getState().assetsByFolder)) {
        const hit = list.find(a => a.id === id);
        if (hit) { mimeType = hit.mimeType; break; }
      }
      return { url, mimeType };
    });
    assetCache.setFolderAssetsProvider((folderId) => {
      const key = folderId ?? '';
      return (useStore.getState().assetsByFolder[key] || []).map(a => ({ id: a.id, mimeType: a.mimeType }));
    });
    return () => {
      assetCache.setUrlProvider(null);
      assetCache.setFolderAssetsProvider(null);
    };
  }, []);

  // Auth Listener
  React.useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      useStore.getState().setUser(session);

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        const urlProjectId = new URLSearchParams(window.location.search).get('p');
        if (session && urlProjectId) {
          useStore.getState().loadProject(urlProjectId, 'editor');
          return;
        }
        if (useStore.getState().currentView === 'landing' && session) {
          useStore.getState().setView('dashboard');
        }
      }
      if (event === 'SIGNED_OUT') {
        useStore.getState().setView('landing');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Mirror current project + view back to the URL so refresh / share-via-URL-bar work.
  React.useEffect(() => {
    const sync = (projectId: string | undefined, view: string) => {
      const url = new URL(window.location.href);
      const isEditing = view === 'editor' && projectId;
      if (isEditing) {
        url.searchParams.set('p', projectId);
      } else {
        url.searchParams.delete('p');
      }
      const next = url.pathname + (url.search || '') + url.hash;
      if (next !== window.location.pathname + window.location.search + window.location.hash) {
        window.history.replaceState(null, '', next);
      }
    };
    sync(useStore.getState().project?.id, useStore.getState().currentView);
    return useStore.subscribe((state, prev) => {
      if (state.project?.id !== prev.project?.id || state.currentView !== prev.currentView) {
        sync(state.project?.id, state.currentView);
      }
    });
  }, []);

  if (currentView === 'dashboard') return <Dashboard />;
  if (currentView === 'admin') return <AdminDashboard />;
  if (currentView === 'player') return <Player />;
  if (currentView === 'landing') return <LandingPage />;

  return (
    <TooltipProvider>
    <div className="h-screen w-screen bg-[#1a1a1a] text-white flex flex-col font-sans selection:bg-[#D4AF37]/30">
      <TopBar />

      <main className="flex-1 flex overflow-hidden relative">
        {/* Left Column: Canvas + Timeline */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-white/10 min-h-0 relative z-0">
          <div className="flex-1 relative bg-black min-h-0 overflow-hidden">
            <GeometryCanvas framed />
            <TooltipOverlay />
          </div>

          <div
            ref={timelineRef}
            style={{ height: timelineHeight }}
            className="min-h-[150px] border-t border-white/10 flex flex-col bg-[#252525] relative z-20"
          >
            {/* Resize Handle */}
            <div
              className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-[#D4AF37] z-50 transition-colors opacity-0 hover:opacity-100"
              onMouseDown={(e) => {
                e.stopPropagation();
                setIsResizingTimeline(true);
              }}
            />
            <div className="flex-1 flex overflow-hidden">
              <Timeline />
            </div>
          </div>
        </div>

        {/* Right Column: Inspector */}
        <aside className="w-[320px] bg-[#252525] border-l border-white/10 overflow-y-auto relative z-20">
          <Inspector />
        </aside>
      </main>
    </div>
    </TooltipProvider>
  );
};

export default App;
