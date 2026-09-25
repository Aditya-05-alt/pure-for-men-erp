'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'sa_theme';
const DEFAULT_THEME = 'light';

const ThemeContext = createContext(null);

/**
 * Reads the theme from localStorage on the client.
 * SSR-safe: returns the default during initial render so client+server match.
 * The inline no-flash script in <head> sets data-theme before paint.
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(DEFAULT_THEME);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') {
        setThemeState(saved);
        document.documentElement.setAttribute('data-theme', saved);
      } else {
        document.documentElement.setAttribute('data-theme', DEFAULT_THEME);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.setAttribute('data-theme', next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    /* If a component renders outside the provider (e.g. in tests), fall back gracefully. */
    return { theme: DEFAULT_THEME, setTheme: () => {}, toggleTheme: () => {} };
  }
  return ctx;
}

/**
 * Tiny inline script that runs BEFORE first paint to apply the saved theme,
 * so there's no light→dark (or dark→light) flash on load.
 *
 * Render this in <head> via dangerouslySetInnerHTML.
 */
export const NO_FLASH_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='dark'&&t!=='light'){t='${DEFAULT_THEME}'}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','${DEFAULT_THEME}');}})();`;
