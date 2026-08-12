import { useTheme } from '../theme/useTheme';

/** Switches between the light and dark themes. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const goingToDark = theme === 'light';

  return (
    <button
      type="button"
      className="icon-button"
      onClick={toggleTheme}
      // the icon alone says nothing to a screen reader, and the label has to
      // describe what the button will do rather than what is currently on
      aria-label={goingToDark ? 'Switch to dark theme' : 'Switch to light theme'}
      title={goingToDark ? 'Switch to dark theme' : 'Switch to light theme'}
    >
      <svg
        className="theme-icon"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {goingToDark ? (
          // a moon, because clicking takes you to dark
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </>
        )}
      </svg>
    </button>
  );
}
