import { useContext } from 'react';

import { ThemeContext } from './ThemeContext';
import type { ThemeContextValue } from './ThemeContext';

/** Reads the theme context. Throws if used outside a ThemeProvider. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (context === null) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }

  return context;
}
