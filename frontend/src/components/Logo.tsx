/** The product name. One constant, so renaming is a one-line change. */
export const APP_NAME = 'Slate';

/** The wordmark: a ruled slate with a single marigold mark on it. */
export function Logo({ size = 'md' }: Readonly<{ size?: 'md' | 'lg' }>) {
  return (
    <span className={`logo logo-${size}`}>
      <span className="logo-mark" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          width="19"
          height="19"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          {/* the slate */}
          <rect x="4" y="3.5" width="16" height="17" rx="2" />
          {/* two ruled lines, and the mark someone left on it */}
          <path d="M8 9.5h8M8 13.5h5" />
          <circle className="logo-mark-dot" cx="16" cy="16.5" r="1.6" />
        </svg>
      </span>
      <span className="logo-text">{APP_NAME}</span>
    </span>
  );
}
