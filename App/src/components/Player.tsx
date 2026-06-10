import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import GeometryCanvas from './GeometryCanvas';
import { X, ChevronRight, Square, Repeat, Folder, Play, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { ProjectMetadata } from '../types';

const Player: React.FC = () => {
    const setView = useStore(s => s.setView);
    const isPlaying = useStore(s => s.isPlaying);
    const setIsPlaying = useStore(s => s.setIsPlaying);
    const setProject = useStore(s => s.setProject);


    // If setProject isn't exposed, we might need to use setState on the store directly if possible or add it.
    // Looking at useStore, there is 'loadProject' but it uses API. 'setSavedProjects' exists. 
    // We might need to manually set the project state.
    // The store exposes `useStore.setState` if we use the hook differently, but inside generic usage:
    // We can use `useStore.setState({ project: ... })`.

    const [showControls, setShowControls] = useState(false);
    const [showBrowser, setShowBrowser] = useState(true);
    const [projects, setProjects] = useState<ProjectMetadata[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        // Fetch project list
        fetch('projects/index.json')
            .then(res => {
                if (res.ok) return res.json();
                throw new Error('No index');
            })
            .then(data => setProjects(data))
            .catch(err => console.warn('Could not load local projects', err));

        // Stop playing when entering browser
        setIsPlaying(false);
    }, [setIsPlaying]);

    const handleLoadProject = async (id: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`projects/${id}.json`);
            if (res.ok) {
                const projectData = await res.json();
                setProject(projectData);
                useStore.setState({
                    currentTime: 0,
                    isPlaying: true,
                    isLooping: true // Default to looping in standalone
                });
                setShowBrowser(false);
            }
        } catch (error) {
            console.error('Failed to load project', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (showBrowser) {
        return (
            <div className="fixed inset-0 bg-[#121212] z-50 flex flex-col items-center justify-center text-white">
                <div className="w-full max-w-4xl h-[80vh] flex flex-col md:flex-row bg-[#1a1a1a] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                    {/* Left Panel: Header */}
                    <div className="w-full md:w-1/3 p-8 border-b md:border-b-0 md:border-r border-white/10 flex flex-col justify-between bg-gradient-to-br from-[#1a1a1a] to-[#222]">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tighter mb-2 bg-gradient-to-r from-[#D4AF37] to-[#F5E091] bg-clip-text text-transparent">
                                RITUAL PLAYER
                            </h1>
                            <p className="text-white/40 text-xs tracking-widest uppercase mb-8">Sacred Geometry Sequencer</p>

                            <div className="space-y-4">
                                <p className="text-sm text-white/60 leading-relaxed">
                                    Select a ritual sequence from your library to begin playback.
                                </p>
                            </div>
                        </div>
                        <div className="mt-8">
                            <button
                                onClick={() => {
                                    setIsPlaying(false);
                                    setView('editor');
                                }}
                                className="flex items-center gap-2 px-4 py-2 text-white/40 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest"
                            >
                                <X size={14} /> Back to Editor
                            </button>
                        </div>
                    </div>

                    {/* Right Panel: List */}
                    <div className="flex-1 overflow-y-auto p-6 bg-[#151515]">
                        {projects.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-white/20">
                                <Folder size={48} className="mb-4 opacity-20" />
                                <p>No local rituals found.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {projects.sort((a, b) => b.lastModified - a.lastModified).map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => handleLoadProject(p.id)}
                                        disabled={isLoading}
                                        className="group flex items-center justify-between p-4 rounded-xl bg-[#1a1a1a] border border-white/5 hover:border-[#D4AF37]/50 hover:bg-[#202020] transition-all text-left"
                                    >
                                        <div>
                                            <h3 className="font-bold text-white/90 group-hover:text-[#D4AF37] transition-colors">{p.name}</h3>
                                            <div className="flex items-center text-white/30 text-[10px] mt-1 gap-2">
                                                <div className="flex items-center gap-1">
                                                    <Clock size={10} />
                                                    {formatDistanceToNow(p.lastModified)} ago
                                                </div>
                                            </div>
                                        </div>
                                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
                                            <Play size={14} fill="currentColor" />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="fixed inset-0 bg-black z-50 flex items-center justify-center overflow-hidden group"
            onMouseEnter={() => setShowControls(true)}
            onMouseLeave={() => setShowControls(false)}
        >
            {/* Canvas Layer */}
            <div className="absolute inset-0 z-0">
                <GeometryCanvas />
            </div>



            {/* Controls Layer */}
            <div className={`absolute top-0 right-0 p-6 z-50 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'} flex gap-3`}>
                <button
                    onClick={() => {
                        setIsPlaying(false);
                        setShowBrowser(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-black/50 hover:bg-black/80 text-white/70 hover:text-white border border-white/20 rounded-full backdrop-blur-sm transition-all shadow-lg"
                >
                    <Folder size={16} />
                    <span className="text-xs font-bold uppercase tracking-widest">Rituals</span>
                </button>
            </div>

            <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-50 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-4 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-full backdrop-blur-md transition-all shadow-2xl hover:scale-105 active:scale-95"
                >
                    {isPlaying ? <Square size={24} fill="currentColor" /> : <ChevronRight size={24} fill="currentColor" />}
                </button>

                <button
                    onClick={() => useStore.getState().setIsLooping(!useStore.getState().isLooping)}
                    className={`p-3 ml-2 rounded-full backdrop-blur-md transition-all shadow-lg hover:scale-105 active:scale-95 ${useStore.getState().isLooping ? 'bg-white/20 text-white border border-white/30' : 'bg-black/20 text-white/40 border border-white/5 hover:bg-white/10'}`}
                    title={useStore.getState().isLooping ? "Loop On" : "Loop Off"}
                >
                    <Repeat size={18} />
                </button>
            </div>
        </div>
    );
};

export default Player;
