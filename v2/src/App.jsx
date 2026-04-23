import React from 'react';
import TopBar from './components/TopBar';
import Desktop from './components/Desktop';
import WindowManager from './components/WindowManager';
import Dock from './components/Dock';
import QuickLookModal from './components/QuickLookModal';
import MobileIOSScreen from './components/MobileIOSScreen';
import MagazineReader from './components/MagazineReader';
import ContextMenu from './components/ContextMenu';
import { WindowProvider } from './contexts/WindowContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './index.css';

function AppContent() {
  return (
    <WindowProvider>
      <div className={`h-screen w-screen overflow-hidden select-none bg-background text-on-surface transition-colors duration-300`}>
        
        {/* Desktop / macOS View (Hidden on mobile) */}
        <div className="hidden md:block h-full w-full relative">
          <TopBar />
          <Desktop />
          <WindowManager />
          <Dock />
        </div>

        {/* Mobile / iOS View (Hidden on desktop) */}
        <div className="block md:hidden h-full w-full relative">
          <MobileIOSScreen />
        </div>

        <QuickLookModal />
        <MagazineReader />
        <ContextMenu />
      </div>
    </WindowProvider>
  );
}



function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
