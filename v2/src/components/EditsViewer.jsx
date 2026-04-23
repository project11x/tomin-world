import React, { useState } from 'react';
import Window from './Window';
import portfolioData from '../data';
import { useWindowContext } from '../contexts/WindowContext';

export default function EditsViewer({ windowData }) {
  // Find all videos in the portfolio to list in the left pane
  const allVideos = [];
  Object.keys(portfolioData).forEach((folder) => {
    portfolioData[folder].forEach((item) => {
      if (item.isVideo) {
        allVideos.push({ ...item, folder });
      }
    });
  });

  const [activeVideo, setActiveVideo] = useState(allVideos[0] || null);

  return (
    <Window windowData={{ ...windowData, title: 'Edits Viewer' }}>
      <div className="flex h-full bg-[#f5f5f7] dark:bg-[#0a0e20]">
        
        {/* LEFT GLASS CARD: Edit List */}
        <div className="w-[260px] shrink-0 h-full border-r border-black/[0.06] dark:border-white/10 flex flex-col bg-white/50 dark:bg-black/20">
          <div className="h-12 shrink-0 flex items-center justify-between px-5 border-b border-black/[0.06] dark:border-white/10">
            <h2 className="text-slate-800 dark:text-white/80 font-light tracking-[0.3em] text-[11px] uppercase select-none">Edits</h2>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {allVideos.map((video, idx) => (
              <div 
                key={idx}
                className={`edit-row mx-2 px-4 py-2 rounded-lg cursor-pointer text-sm font-light tracking-wider truncate transition-colors ${
                  activeVideo?.src === video.src 
                    ? 'bg-blue-500 text-white' 
                    : 'text-slate-800 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10'
                }`}
                onClick={() => setActiveVideo(video)}
              >
                {video.name.replace('.mp4', '').replace('_web', '')}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT AREA: Video Viewer */}
        <div className="flex-1 relative flex flex-col p-4">
          <div className="flex-1 bg-black rounded-xl overflow-hidden relative shadow-lg">
            {activeVideo ? (
              <video 
                src={`/${activeVideo.src}`} 
                controls 
                autoPlay 
                className="absolute inset-0 w-full h-full object-contain outline-none" 
              />
            ) : (
              <div className="flex items-center justify-center h-full text-white/50">
                Select a video
              </div>
            )}
          </div>
        </div>

      </div>
    </Window>
  );
}
