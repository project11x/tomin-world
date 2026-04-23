import React from 'react';
import Draggable from 'react-draggable';
import { useWindowContext } from '../contexts/WindowContext';

export default function Window({ windowData, children }) {
  const { closeWindow, focusWindow, focusedWindowId, updateWindowPosition } = useWindowContext();
  const isFocused = focusedWindowId === windowData.id;

  return (
    <Draggable
      handle=".window-header"
      position={{ x: windowData.x, y: windowData.y }}
      onStop={(e, data) => {
        updateWindowPosition(windowData.id, data.x, data.y);
      }}
      onMouseDown={() => focusWindow(windowData.id)}
      bounds="parent"
    >
      <div 
        className={`absolute rounded-[12px] flex flex-col overflow-hidden glass-panel ambient-shadow border transition-all duration-200
          ${isFocused ? 'z-[100] border-slate-300/50 dark:border-white/20' : 'z-50 border-slate-300/30 dark:border-white/10 opacity-95'}
        `}
        style={{
          width: windowData.width,
          height: windowData.height,
          backgroundColor: 'rgba(252, 252, 252, 0.72)',
          boxShadow: isFocused ? '0 30px 60px rgba(0,0,0,0.12)' : '0 20px 40px rgba(0,0,0,0.08)'
        }}
        onClick={() => focusWindow(windowData.id)}
      >
        {/* Header (Draggable Handle) */}
        <div 
          className="window-header h-[36px] flex items-center justify-between px-3 cursor-default border-b border-black/5 dark:border-white/5"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.2) 100%)' }}
        >
          {/* Traffic Lights */}
          <div className="flex space-x-2 w-16">
            <button 
              className="w-3 h-3 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56] border border-[#e0443e] flex items-center justify-center group"
              onClick={(e) => {
                e.stopPropagation();
                closeWindow(windowData.id);
              }}
            >
              <span className="material-symbols-outlined text-[8px] text-black/50 opacity-0 group-hover:opacity-100">close</span>
            </button>
            <button className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]"></button>
            <button className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]"></button>
          </div>

          <div className="text-[12px] font-semibold tracking-wide text-slate-700 dark:text-slate-200 flex-1 text-center pointer-events-none">
            {windowData.title}
          </div>

          <div className="w-16"></div> {/* Spacer for centering */}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-white/60 dark:bg-black/40">
          {children}
        </div>
      </div>
    </Draggable>
  );
}
