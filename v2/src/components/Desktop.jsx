import React, { useState } from 'react';
import DesktopIcon from './DesktopIcon';
import portfolioData from '../data';
import { useWindowContext } from '../contexts/WindowContext';

export default function Desktop() {
  const [selectedIcon, setSelectedIcon] = useState(null);
  const { openWindow } = useWindowContext();
  const folders = Object.keys(portfolioData).filter(key => !key.includes('/'));

  // Calculate grid positions for desktop icons (macOS style layout)
  const getIconPosition = (index) => {
    const colIndex = Math.floor(index / 6);
    const rowIndex = index % 6;
    
    // Starting from top right
    const top = 64 + rowIndex * 100;
    const right = 24 + colIndex * 100;
    
    return { top, right };
  };

  return (
    <main 
      className="desktop-bg w-full h-full pt-8 flex relative origin-left"
      style={{ background: '#ffffff' }}
      onClick={() => setSelectedIcon(null)} // Click on desktop clears selection
    >
      <div className="absolute inset-0 opacity-0 dark:opacity-100 transition-opacity duration-300 pointer-events-none z-0"
        style={{ background: 'linear-gradient(160deg, #06080f 0%, #0a0e20 50%, #0e0618 100%)' }}>
      </div>

      <div className="absolute inset-0 z-10">
        {folders.map((folder, idx) => {
          const { top, right } = getIconPosition(idx);
          return (
            <DesktopIcon 
              key={folder}
              name={folder}
              top={top}
              right={right}
              isSelected={selectedIcon === folder}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedIcon(folder);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                openWindow(folder, folder, { width: 640, height: 420 });
              }}
            />
          );
        })}
      </div>
    </main>
  );
}

