import React from 'react';
import Draggable from 'react-draggable';

export default function DesktopIcon({ name, top, right, isSelected, onClick, onDoubleClick }) {
  return (
    <Draggable
      bounds="parent"
      defaultPosition={{ x: 0, y: 0 }}
    >
      <div 
        className={`desktop-icon absolute group flex flex-col items-center space-y-1 cursor-pointer ${isSelected ? 'selected' : ''}`}
        style={{ top: `${top}px`, right: `${right}px` }}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        <div className="w-[60px] h-[60px] group-hover:scale-110 transition-all duration-200 drop-shadow-lg group-hover:drop-shadow-xl">
          <img src="/icons/folder.png" className="w-full h-full object-contain pointer-events-none" draggable="false" alt="folder" />
        </div>
        <span className="text-[11px] font-medium text-slate-800 dark:text-white/90 bg-white/50 dark:bg-black/50 px-1.5 py-0.5 rounded-md backdrop-blur-md shadow-sm pointer-events-none">
          {name}
        </span>
      </div>
    </Draggable>
  );
}
