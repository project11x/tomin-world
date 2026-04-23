import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';

export default function TopBar() {
  const [time, setTime] = useState('--:-- AM');
  const [battery, setBattery] = useState({ level: null, charging: false });
  const { theme, setTheme, isDark, toggleDarkMode } = useTheme();
  const [activeDropdown, setActiveDropdown] = useState(null);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 60000);

    // Battery API
    if (navigator.getBattery) {
      navigator.getBattery().then(batt => {
        const updateBatt = () => setBattery({ level: Math.round(batt.level * 100), charging: batt.charging });
        updateBatt();
        batt.addEventListener('levelchange', updateBatt);
        batt.addEventListener('chargingchange', updateBatt);
      });
    }

    return () => clearInterval(interval);
  }, []);

  const handleDropdownEnter = (name) => setActiveDropdown(name);
  const handleDropdownLeave = () => setActiveDropdown(null);

  return (
    <header className="fixed top-0 left-0 w-full z-[300] flex items-center h-8 px-4 justify-between bg-white/40 dark:bg-black/40 backdrop-blur-2xl border-b border-white/30 dark:border-white/8 transition-colors duration-150 ease-in-out">
      <div className="flex items-center space-x-4 h-full">
        <span 
          className="text-[14px] font-bold text-slate-900 dark:text-slate-100 px-2 tracking-normal cursor-pointer"
          style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
        >
          EDDIE
        </span>
        <nav className="hidden md:flex items-center space-x-1 h-full">
          {/* File Menu (Theme Selection) */}
          <div 
            className="relative h-full flex items-center group"
            onMouseEnter={() => handleDropdownEnter('view')}
            onMouseLeave={handleDropdownLeave}
          >
            <a className={`text-slate-900 dark:text-white font-semibold rounded px-2 py-0.5 text-[13px] tracking-tight transition-colors ${activeDropdown === 'view' ? 'bg-blue-500 text-white' : 'hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}>View</a>
            
            {activeDropdown === 'view' && (
              <div className="absolute top-8 left-0 min-w-[200px] bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 z-[400] animate-in fade-in slide-in-from-top-2 duration-200">
                <button onClick={() => setTheme('light')} className="w-full text-left px-4 py-1 text-[13px] text-slate-800 dark:text-slate-200 hover:bg-blue-500 hover:text-white flex items-center justify-between">
                  <span>Light Mode</span>
                  {theme === 'light' && !isDark && <span>✓</span>}
                </button>
                <button onClick={() => setTheme('glass')} className="w-full text-left px-4 py-1 text-[13px] text-slate-800 dark:text-slate-200 hover:bg-blue-500 hover:text-white flex items-center justify-between">
                  <span>Glass Theme</span>
                  {theme === 'glass' && <span>✓</span>}
                </button>
                <button onClick={() => setTheme('pink')} className="w-full text-left px-4 py-1 text-[13px] text-slate-800 dark:text-slate-200 hover:bg-blue-500 hover:text-white flex items-center justify-between">
                  <span>Pink Theme</span>
                  {theme === 'pink' && <span>✓</span>}
                </button>
              </div>
            )}
          </div>

          <a className="text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded px-2 py-0.5 text-[13px] tracking-tight transition-colors cursor-pointer" href="#">Edit</a>
          <a className="text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded px-2 py-0.5 text-[13px] tracking-tight transition-colors cursor-pointer" href="#">Go</a>
          <a className="text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded px-2 py-0.5 text-[13px] tracking-tight transition-colors cursor-pointer" href="#">Window</a>
          <a className="text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded px-2 py-0.5 text-[13px] tracking-tight transition-colors cursor-pointer" href="#">Help</a>
        </nav>
      </div>
      <div className="flex items-center space-x-3 text-slate-900 dark:text-slate-100 h-full">
        <span 
          className="material-symbols-outlined text-[18px] cursor-pointer hover:text-primary transition-colors" 
          title="Toggle Dark Mode"
          onClick={toggleDarkMode}
        >
          {isDark ? 'light_mode' : 'dark_mode'}
        </span>
        {battery.level !== null && (
          <div className="flex items-center space-x-1 cursor-default">
            <span className="text-[11px] font-medium">{battery.level}%</span>
            <span className="material-symbols-outlined text-[16px]">
              {battery.charging ? 'battery_charging_full' : battery.level > 80 ? 'battery_full' : battery.level > 40 ? 'battery_5_bar' : 'battery_2_bar'}
            </span>
          </div>
        )}
        <span className="material-symbols-outlined text-[18px] cursor-default">wifi</span>
        <span className="text-[12px] font-medium ml-2 cursor-default">{time}</span>
      </div>
    </header>
  );
}

