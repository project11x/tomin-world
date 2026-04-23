import React, { useEffect } from 'react';
import { useWindowContext } from '../contexts/WindowContext';

export default function QuickLookModal() {
  const { quickLookItem, closeQuickLook } = useWindowContext();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeQuickLook();
      if (e.key === ' ') {
        e.preventDefault();
        closeQuickLook();
      }
    };
    if (quickLookItem) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quickLookItem, closeQuickLook]);

  if (!quickLookItem) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center pointer-events-none">
      {/* Dimmed background overlay (optional, original seems to just float the panel, but it's good UX) */}
      <div 
        className="absolute inset-0 bg-black/20 pointer-events-auto" 
        onClick={closeQuickLook} 
      />
      
      {/* Modal panel */}
      <div className="relative pointer-events-auto min-w-[300px] max-w-[80vw] max-h-[80vh] bg-white/80 dark:bg-slate-900/95 glass-panel rounded-xl shadow-2xl border border-white/40 dark:border-white/10 flex flex-col ring-1 ring-black/5 overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="h-10 shrink-0 flex items-center px-4 border-b border-slate-200/20 dark:border-white/5 bg-slate-100/30 dark:bg-black/10">
          <div 
            className="w-3 h-3 relative rounded-full bg-red-500 hover:bg-red-600 transition-colors shadow-sm cursor-pointer"
            onClick={closeQuickLook}
            title="Schließen (ESC)"
          />
          <div className="flex-1 text-center text-[12px] font-semibold text-slate-500 dark:text-slate-400 mr-4 truncate px-4 pointer-events-none tracking-tight">
            {quickLookItem.name}
          </div>
        </div>

        {/* Content */}
        <div className="relative group bg-black flex-1 flex items-center justify-center overflow-hidden">
          {quickLookItem.isVideo ? (
            <video 
              src={`/${quickLookItem.src}`} 
              controls 
              autoPlay 
              className="max-w-full max-h-[calc(80vh-40px)] outline-none" 
            />
          ) : (
            <img 
              src={`/${quickLookItem.src}`} 
              alt={quickLookItem.name} 
              className="max-w-full max-h-[calc(80vh-40px)] object-contain" 
            />
          )}
        </div>
      </div>
    </div>
  );
}
