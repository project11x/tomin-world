import React, { useState, useEffect } from 'react';
import portfolioData from '../data';
import { useWindowContext } from '../contexts/WindowContext';
import { useTheme } from '../contexts/ThemeContext';

export default function MagazineReader() {
  const { magazineItem, closeMagazine } = useWindowContext();
  const { toggleDarkMode } = useTheme();
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeMagazine();
    };
    if (magazineItem) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [magazineItem, closeMagazine]);

  if (!magazineItem) return null;

  const pages = portfolioData[`${magazineItem.folderName}/${magazineItem.magazineName}`] || [];
  const totalPages = pages.length;

  return (
    <div className="fixed inset-0 z-[100] bg-[#f5f5f7] dark:bg-black transition-colors duration-300 animate-in slide-in-from-right duration-500 flex flex-col">
      <div className="absolute inset-0 bg-gradient-to-br from-[#06080f] to-[#0e0618] opacity-0 dark:opacity-100 transition-opacity pointer-events-none z-0"></div>

      {/* Top Left Controls */}
      <div className="absolute top-5 left-5 z-20">
        <button 
          onClick={closeMagazine}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-full cursor-pointer bg-white/50 dark:bg-white/10 backdrop-blur-xl shadow-lg border border-white/20 hover:opacity-80 transition-opacity"
        >
          <span className="material-symbols-outlined text-slate-600 dark:text-white/70 text-[18px]">arrow_back_ios</span>
          <span className="text-[13px] font-medium text-slate-800 dark:text-white/80 tracking-wide">Magazine</span>
        </button>
      </div>

      {/* Top Right Controls */}
      <div className="absolute top-5 right-5 z-20 flex gap-2">
        <button 
          onClick={toggleDarkMode}
          className="w-11 h-11 rounded-full cursor-pointer flex items-center justify-center bg-white/50 dark:bg-white/10 backdrop-blur-xl shadow-lg border border-white/20 hover:opacity-80 transition-opacity"
        >
          <span className="material-symbols-outlined text-slate-600 dark:text-white/70 text-[20px]">dark_mode</span>
        </button>
      </div>

      {/* Scroller */}
      <div 
        className="absolute inset-0 flex overflow-x-auto overflow-y-hidden items-center z-10 snap-x snap-mandatory pt-[80px] pb-[185px] scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
        onScroll={(e) => {
          const scrollX = e.target.scrollLeft;
          const width = e.target.clientWidth;
          const page = Math.round(scrollX / width) + 1;
          setCurrentPage(page);
        }}
      >
        {pages.map((page, idx) => (
          <div key={idx} className="flex-shrink-0 w-full h-full flex items-center justify-center snap-center p-4">
            {page.isVideo ? (
              <video 
                src={`/${page.src}`} 
                controls 
                autoPlay 
                loop 
                className="max-h-full max-w-full rounded-lg shadow-2xl object-contain outline-none" 
              />
            ) : (
              <img 
                src={`/${page.src}`} 
                alt={`Page ${idx + 1}`} 
                className="max-h-full max-w-full rounded-lg shadow-2xl object-contain" 
              />
            )}
          </div>
        ))}
      </div>

      {/* Bottom Pagination */}
      <div className="absolute left-1/2 -translate-x-1/2 z-20 bottom-[118px]">
        <div className="bg-white/50 dark:bg-white/10 backdrop-blur-xl shadow-lg border border-white/20 rounded-[16px] px-5 py-3 flex items-center gap-4 min-w-[320px]">
          <span className="text-slate-500 dark:text-white/60 font-mono text-[12px] tracking-widest whitespace-nowrap select-none">
            {currentPage}&thinsp;/&thinsp;{totalPages}
          </span>
          <input 
            type="range" 
            min="1" 
            max={totalPages} 
            value={currentPage}
            onChange={(e) => {
              const newPage = parseInt(e.target.value);
              setCurrentPage(newPage);
              // Find scroller and scroll
              const scroller = e.target.closest('div.z-20').previousElementSibling;
              if (scroller) {
                scroller.scrollTo({ left: (newPage - 1) * scroller.clientWidth, behavior: 'smooth' });
              }
            }}
            className="flex-1 h-1 bg-slate-300 dark:bg-white/20 rounded-full appearance-none outline-none cursor-pointer accent-blue-500"
          />
        </div>
      </div>
    </div>
  );
}
