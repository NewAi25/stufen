'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@stufen/ui-kit';
import { THEME_STORAGE_KEY } from './theme-script';

export type ThemeName = 'light' | 'dark';

interface ThemeContextValue {
  /** Null until the browser has been asked, so server and client markup match. */
  theme: ThemeName | null;
  toggle(): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readTheme(): ThemeName {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Holds the theme. The inline script in the layout has already set <html>. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName | null>(null);

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const toggle = useCallback(() => {
    const next: ThemeName = readTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be blocked. The theme still applies for this page view.
    }
    setTheme(next);
  }, []);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider.');
  return value;
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Use light theme' : 'Use dark theme';
  return (
    <Button variant="secondary" onClick={toggle}>
      {theme === null ? 'Switch theme' : label}
    </Button>
  );
}
