import type { ReactNode } from 'react';

import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeToggle';

/**
 * The shell both sign-in screens sit in.
 *
 * Two panels: the slate on the left carrying the branding, the form on the
 * right. Below 60rem the slate is dropped rather than stacked - on a phone it
 * would only push the form off the screen - and the wordmark moves inline.
 */
export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  /** The line under the card. Left out on a screen with nowhere else to go. */
  footer?: ReactNode;
}) {
  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        {/* texture only, so both are hidden from anything reading the page aloud */}
        <div className="auth-rules" aria-hidden="true" />
        <div className="auth-margin" aria-hidden="true" />

        <div className="auth-aside-inner">
          <Logo size="lg" />
        </div>

        <blockquote className="auth-quote">
          The palest ink is better than the best memory.
        </blockquote>
      </aside>

      <section className="auth-panel">
        <div className="auth-toolbar">
          <ThemeToggle />
        </div>

        <div className="auth-form">
          <Logo />

          <div className="auth-heading">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="muted">{subtitle}</p>
          </div>

          {children}

          {footer !== undefined && <p className="auth-footer muted">{footer}</p>}
        </div>
      </section>
    </div>
  );
}
