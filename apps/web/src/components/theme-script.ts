// Shared by the server layout (inline script) and the client ThemeProvider.
// No 'use client' here, so the layout can read these values on the server.

export const THEME_STORAGE_KEY = 'stufen-theme';

/**
 * Runs before first paint. Copies a stored 'light' or 'dark' onto <html> so
 * the page never flashes the wrong theme. With nothing stored, the ui-kit
 * stylesheet follows the system preference.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
