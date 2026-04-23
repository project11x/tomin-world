import React, { useState, useEffect } from 'react';
import Window from './Window';
import portfolioData from '../data';
import { useWindowContext } from '../contexts/WindowContext';

export default function FolderWindow({ windowData }) {
  const { openQuickLook, openMagazine } = useWindowContext();
  const [viewMode, setViewMode] = useState('grid');
  const [activeFolder, setActiveFolder] = useState(windowData.id);
  
  // Sync if windowData.id changes
  useEffect(() => {
    setActiveFolder(windowData.id);
  }, [windowData.id]);

  // Folders to show in sidebar
  const favorites = Object.keys(portfolioData).filter(k => !k.includes('/'));
  const items = portfolioData[activeFolder] || [];

  return (
    <Window windowData={{ ...windowData, title: activeFolder }}>
      <div className="flex h-full bg-white/40 dark:bg-black/40">
        
        {/* Left Sidebar (Favorites) */}
        <div className="w-[160px] flex-shrink-0 border-r border-black/10 dark:border-white/10 bg-white/30 dark:bg-black/30 p-2 hidden sm:block">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-2 mt-2">Favorites</div>
          {favorites.map((fav) => (
            <div 
              key={fav}
              className={`px-2 py-1.5 rounded-md text-[12px] font-medium cursor-pointer mb-0.5 truncate transition-colors ${
                fav === activeFolder 
                  ? 'bg-blue-500 text-white' 
                  : 'text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10'
              }`}
              onClick={() => setActiveFolder(fav)}
            >

              {fav}
            </div>
          ))}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          
          {/* Toolbar */}
          <div className="h-10 border-b border-black/10 dark:border-white/10 flex items-center px-4 justify-between bg-white/50 dark:bg-black/50">
            <div className="text-[14px] font-medium text-slate-800 dark:text-slate-200 truncate">
              {activeFolder}
            </div>
            
            <div className="flex bg-black/5 dark:bg-white/10 rounded-md p-0.5">
              <button 
                className={`p-1 rounded-sm flex items-center justify-center transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-500' : 'text-slate-500 hover:bg-black/5 dark:hover:bg-white/5'}`}
                onClick={() => setViewMode('grid')}
              >
                <span className="material-symbols-outlined text-[16px]">grid_view</span>
              </button>
              <button 
                className={`p-1 rounded-sm flex items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-500' : 'text-slate-500 hover:bg-black/5 dark:hover:bg-white/5'}`}
                onClick={() => setViewMode('list')}
              >
                <span className="material-symbols-outlined text-[16px]">view_list</span>
              </button>
            </div>
          </div>

          {/* Files */}
          <div className="flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                <span className="material-symbols-outlined text-4xl mb-2 opacity-50">folder_open</span>
                <span className="text-sm">Folder is empty</span>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                {items.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="flex flex-col items-center space-y-1 cursor-pointer group"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (item.isMagazine) openMagazine(activeFolder, item.name);
                      else openQuickLook(item);
                    }}
                  >
                    <div className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center bg-white/50 dark:bg-black/30 rounded-lg group-hover:scale-105 group-hover:bg-blue-500/20 transition-all duration-200">
                      {item.isMagazine ? (
                        <span className="material-symbols-outlined text-[32px] text-pink-500">auto_stories</span>
                      ) : item.isVideo ? (
                        <video src={`/${item.src}`} className="w-full h-full object-cover rounded-lg" preload="metadata" muted />
                      ) : (
                        <img src={`/${item.src}`} className="w-full h-full object-cover rounded-lg" loading="lazy" />
                      )}
                    </div>
                    <span className="text-[10px] text-center font-medium leading-tight text-slate-800 dark:text-slate-200 line-clamp-2 break-words w-full group-hover:text-blue-500 transition-colors">
                      {item.name}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col">
                {/* List Header */}
                <div className="flex text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 border-b border-black/5 dark:border-white/5 pb-2">
                  <div className="flex-1">Name</div>
                  <div className="w-24">Type</div>
                  <div className="w-20 text-right">Size</div>
                </div>
                {/* List Items */}
                {items.map((item, idx) => (
                  <div 
                    key={idx}
                    className="flex text-[13px] text-slate-800 dark:text-slate-200 py-2 border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer items-center transition-colors rounded px-1"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (item.isMagazine) openMagazine(activeFolder, item.name);
                      else openQuickLook(item);
                    }}
                  >
                    <div className="flex-1 flex items-center truncate pr-4">
                      <span className={`material-symbols-outlined text-[16px] mr-2 ${item.isMagazine ? 'text-pink-500' : item.isVideo ? 'text-blue-500' : 'text-purple-500'}`}>
                        {item.isMagazine ? 'auto_stories' : item.isVideo ? 'movie' : 'image'}
                      </span>
                      <span className="truncate">{item.name}</span>
                    </div>
                    <div className="w-24 text-slate-500 text-[11px]">{item.isMagazine ? 'Magazine' : item.type}</div>
                    <div className="w-20 text-right text-slate-500 text-[11px]">{item.size || '--'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </Window>
  );
}
