import React, { createContext, useContext, useState } from 'react';

const WindowContext = createContext();

export function WindowProvider({ children }) {
  const [windows, setWindows] = useState([]);
  const [focusedWindowId, setFocusedWindowId] = useState(null);
  const [quickLookItem, setQuickLookItem] = useState(null);
  const [magazineItem, setMagazineItem] = useState(null);

  const openWindow = (id, title, props = {}) => {
    setWindows((prev) => {
      if (prev.find((w) => w.id === id)) {
        setFocusedWindowId(id);
        return prev;
      }
      const offset = prev.length * 30;
      setFocusedWindowId(id);
      return [
        ...prev,
        {
          id,
          title,
          x: 100 + offset,
          y: 100 + offset,
          width: props.width || 600,
          height: props.height || 400,
          ...props,
        },
      ];
    });
  };

  const closeWindow = (id) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
    if (focusedWindowId === id) setFocusedWindowId(null);
  };

  const focusWindow = (id) => setFocusedWindowId(id);

  const updateWindowPosition = (id, x, y) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, x, y } : w)));
  };

  const openQuickLook = (item) => setQuickLookItem(item);
  const closeQuickLook = () => setQuickLookItem(null);

  const openMagazine = (folderName, magazineName) => setMagazineItem({ folderName, magazineName });
  const closeMagazine = () => setMagazineItem(null);

  return (
    <WindowContext.Provider
      value={{
        windows,
        focusedWindowId,
        openWindow,
        closeWindow,
        focusWindow,
        updateWindowPosition,
        quickLookItem,
        openQuickLook,
        closeQuickLook,
        magazineItem,
        openMagazine,
        closeMagazine,
      }}
    >
      {children}
    </WindowContext.Provider>
  );
}

export const useWindowContext = () => useContext(WindowContext);


