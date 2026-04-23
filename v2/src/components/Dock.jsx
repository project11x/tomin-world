import React from 'react';
import { useWindowContext } from '../contexts/WindowContext';

export default function Dock() {
  const { openWindow } = useWindowContext();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[200] flex justify-center pb-3 pointer-events-none transition-transform duration-300 ease-in-out">
      <div className="pointer-events-auto rounded-[22px] mx-auto mb-1 w-fit px-4 py-2.5 bg-white/50 dark:bg-white/10 backdrop-blur-3xl shadow-2xl shadow-slate-900/30 dark:shadow-black/60 flex items-end space-x-2 border border-white/60 dark:border-white/15">
        
        {/* Edits */}
        <div 
          className="dock-item relative flex flex-col items-center cursor-pointer transition-all duration-200 ease-out hover:scale-125 hover:-translate-y-3 group" 
          title="Edits"
          onClick={() => openWindow('app-edits', 'Edits', { type: 'edits', width: 800, height: 600 })}
        >
          <div className="w-14 h-14 drop-shadow-lg group-hover:drop-shadow-xl transition-all">
            <img src="/icons/edits.png" className="w-full h-full object-contain" draggable="false" alt="Edits" />
          </div>
          <span className="absolute -bottom-5 text-[10px] font-medium text-slate-600 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Edits</span>
        </div>

        {/* Finder */}
        <div 
          className="dock-item relative flex flex-col items-center cursor-pointer transition-all duration-200 ease-out hover:scale-125 hover:-translate-y-3 group" 
          title="Finder"
          onClick={() => {
            // Original Finder action brings all windows to front or opens a default folder
            // For now we open a default finder window
            openWindow('LDN x UKG', 'LDN x UKG', { width: 640, height: 420 });
          }}
        >
          <div className="w-14 h-14 drop-shadow-lg group-hover:drop-shadow-xl transition-all">
            <img src="/icons/finder.png" className="w-full h-full object-contain" draggable="false" alt="Finder" />
          </div>
          <span className="absolute -bottom-5 text-[10px] font-medium text-slate-600 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Finder</span>
        </div>

        {/* Contact */}
        <div 
          className="dock-item relative flex flex-col items-center cursor-pointer transition-all duration-200 ease-out hover:scale-125 hover:-translate-y-3 group" 
          title="Contact"
          onClick={() => openWindow('app-contact', 'About This OS', { type: 'contact', width: 320, height: 260 })}
        >
          <div className="w-14 h-14 drop-shadow-lg group-hover:drop-shadow-xl transition-all">
            <img src="/icons/contact.png" className="w-full h-full object-contain" draggable="false" alt="Contact" />
          </div>
          <span className="absolute -bottom-5 text-[10px] font-medium text-slate-600 dark:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Contact</span>
        </div>

      </div>
    </nav>
  );
}

