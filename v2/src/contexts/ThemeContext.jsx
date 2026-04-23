import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  // Can be 'light', 'dark', 'glass', or 'pink'
  const [theme, setTheme] = useState('light');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'theme-glass', 'theme-pink');
    
    if (isDark) {
      root.classList.add('dark');
    }
    
    if (theme === 'glass') {
      root.classList.add('theme-glass');
    } else if (theme === 'pink') {
      root.classList.add('theme-pink');
    }
  }, [theme, isDark]);

  const toggleDarkMode = () => setIsDark(!isDark);
  
  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
