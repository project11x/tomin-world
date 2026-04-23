import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';

export default function ContextMenu() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const { toggleDarkMode, theme, setTheme } = useTheme();

  useEffect(() => {
    const handleContextMenu = (e) => {
      // Don't override if right-clicking a window or dock
      if (e.target.closest('.glass-panel') || e.target.closest('#macos-dock')) {
        return;
      }
      e.preventDefault();
      setPosition({ x: e.clientX, y: e.clientY });
      setVisible(true);
    };

    const handleClick = () => setVisible(false);

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleClick);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('click', handleClick);
    };
  }, []);

  if (!visible) return null;

  return (
    <div 
      className="fixed z-[500] min-w-[220px] bg-white/80 dark:bg-slate-800/80 backdrop-blur-2xl border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl p-1 text-[13px] font-medium text-slate-800 dark:text-slate-200 animate-in fade-in zoom-in-95 duration-100"
      style={{ top: position.y, left: position.x }}
    >
      <div 
        className="px-3 py-1.5 hover:bg-blue-500 hover:text-white rounded-md cursor-pointer transition-colors"
        onClick={() => window.location.reload()}
      >
        Reload System
      </div>
      <div className="h-[1px] bg-slate-200 dark:bg-slate-700 my-1 mx-2"></div>
      <div 
        className="px-3 py-1.5 hover:bg-blue-500 hover:text-white rounded-md cursor-pointer transition-colors flex justify-between items-center"
        onClick={toggleDarkMode}
      >
        <span>Toggle Dark Mode</span>
      </div>
      <div className="h-[1px] bg-slate-200 dark:bg-slate-700 my-1 mx-2"></div>
      <div className="px-3 py-1 text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 mb-1">Themes</div>
      <div 
        className={`px-3 py-1.5 hover:bg-blue-500 hover:text-white rounded-md cursor-pointer transition-colors flex justify-between items-center`}
        onClick={() => setTheme('light')}
      >
        <span>Standard Light</span>
        {theme === 'light' && <span>✓</span>}
      </div>
      <div 
        className={`px-3 py-1.5 hover:bg-blue-500 hover:text-white rounded-md cursor-pointer transition-colors flex justify-between items-center`}
        onClick={() => setTheme('glass')}
      >
        <span>Silicon Glass</span>
        {theme === 'glass' && <span>✓</span>}
      </div>
      <div 
        className={`px-3 py-1.5 hover:bg-blue-500 hover:text-white rounded-md cursor-pointer transition-colors flex justify-between items-center`}
        onClick={() => setTheme('pink')}
      >
        <span>Aero Pink</span>
        {theme === 'pink' && <span>✓</span>}
      </div>
    </div>
  );
}
