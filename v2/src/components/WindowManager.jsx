import React from 'react';
import { useWindowContext } from '../contexts/WindowContext';
import FolderWindow from './FolderWindow';
import EditsViewer from './EditsViewer';
import ContactApp from './ContactApp';

export default function WindowManager() {
  const { windows, focusedWindowId } = useWindowContext();

  const renderWindowContent = (windowData) => {
    switch (windowData.type) {
      case 'edits':
        return <EditsViewer windowData={windowData} />;
      case 'contact':
        return <ContactApp windowData={windowData} />;
      default:
        return <FolderWindow windowData={windowData} />;
    }
  };

  return (
    <>
      {windows.map((windowData) => (
        <div 
          key={windowData.id} 
          style={{ zIndex: focusedWindowId === windowData.id ? 100 : 50 }}
          className="absolute inset-0 pointer-events-none"
        >
          <div className="pointer-events-auto">
            {renderWindowContent(windowData)}
          </div>
        </div>
      ))}
    </>
  );
}

