import React from 'react';
import SmartStack from './SmartStack';
import { useWindowContext } from '../contexts/WindowContext';

export default function MobileIOSScreen() {
  const { openWindow } = useWindowContext();

  return (
    <div className="fixed inset-0 z-[60] flex flex-col select-none bg-black text-white">
      {/* Safe Area Spacer */}
      <div className="h-[env(safe-area-inset-top,0px)] shrink-0"></div>

      {/* Empty homescreen wallpaper area */}
      <div className="flex-1"></div>

      {/* iOS Smart Stack Wrapper */}
      <div className="mx-4 mb-3 relative">
        <SmartStack />
      </div>

      {/* iOS Dock */}
      <div className="mx-4 mb-4 mt-2 px-4 py-3 bg-white/10 backdrop-blur-2xl rounded-3xl flex justify-between items-center border border-white/10">
        <div 
          className="w-[50px] h-[50px] flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
          onClick={() => openWindow('app-edits', 'Edits', { type: 'edits', width: '100%', height: '100%' })}
        >
          <img src="/icons/edits.png" alt="Edits" className="w-[44px] h-[44px] object-contain drop-shadow-md" />
        </div>
        <div 
          className="w-[50px] h-[50px] flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
          onClick={() => openWindow('magazines', 'Magazines', { width: '100%', height: '100%' })}
        >
          <img src="/icons/folder.png" alt="Magazin" className="w-[44px] h-[44px] object-contain drop-shadow-md" />
        </div>
        <div 
          className="w-[50px] h-[50px] flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
          onClick={() => openWindow('BTS', 'BTS', { width: '100%', height: '100%' })}
        >
          <img src="/icons/folder.png" alt="BTS" className="w-[44px] h-[44px] object-contain drop-shadow-md" />
        </div>
        <div 
          className="w-[50px] h-[50px] flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
          onClick={() => openWindow('app-contact', 'About This OS', { type: 'contact', width: '100%', height: '100%' })}
        >
          <img src="/icons/contact.png" alt="Contact" className="w-[44px] h-[44px] object-contain drop-shadow-md" />
        </div>
      </div>
    </div>
  );
}

