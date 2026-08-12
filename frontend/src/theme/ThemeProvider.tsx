import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { THEME_STORAGE_KEY, ThemeContext } from './ThemeContext';
import type { Theme, ThemeContextValue } from './ThemeContext';

/**
 * Reads the theme the inline script in index.html already applied.
 *
 * Deciding it here instead would mean the first paint used one theme and the
 * second used another, which is the flash of the wrong colours that gives away
 * a dark mode added as an afterthought.
 */
function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Holds the active theme and writes it to the document and to storage. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  // everything here runs in the click handler rather than inside the setState
  // updater. an updater has to be a pure function of the previous state -
  // StrictMode calls it twice on purpose to catch exactly this - and a second
  // run was re-setting the flag below after its frame had already passed,
  // leaving it stuck on and transitions off for the rest of the session
  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';

    // transitions come off for the swap, for two reasons. the visible one is
    // that every surface would otherwise cross-fade at once, which reads as a
    // fault rather than a feature. the subtle one is a real bug: a property
    // mid-transition keeps the colour it resolved from the old theme's custom
    // property, so a button ends up chalk on chalk. one frame is enough.
    root.dataset.switching = 'true';
    root.dataset.theme = next;

    // a frame is the right moment to lift it, but a hidden tab never paints and
    // so never runs the callback - the flag would sit there with every
    // transition disabled until someone looked at the page again. the timer is
    // the backstop; whichever fires first cancels the other.
    const frame = requestAnimationFrame(() => {
      clearTimeout(backstop);
      delete root.dataset.switching;
    });

    const backstop = setTimeout(() => {
      cancelAnimationFrame(frame);
      delete root.dataset.switching;
    }, 120);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // private browsing can refuse to store. the theme still applies for this
      // visit, it just will not be remembered for the next one
    }

    setTheme(next);
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
