import { createContext } from 'react';

export type Theme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Where the chosen theme is remembered between visits. */
export const THEME_STORAGE_KEY = 'theme';
