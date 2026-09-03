import { useState } from 'react';
import type { KeyboardEvent } from 'react';

/** One labelled input, with the API's complaint about it and a caps-lock hint. */
export function FormField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  error,
  autoComplete,
  placeholder,
  required = true,
  autoFocus = false,
  maxLength,
}: Readonly<{
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
}>) {
  const isPassword = type === 'password';
  const [revealed, setRevealed] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const errorId = `${id}-error`;
  const capsId = `${id}-caps`;

  // a field can have both a message and a hint, and aria-describedby takes a
  // list, so a screen reader reads whichever are actually showing
  const describedBy =
    [error !== undefined ? errorId : null, capsLock ? capsId : null].filter(Boolean).join(' ') ||
    undefined;

  /** Caps lock is worth flagging on a password, where the text is hidden. */
  function checkCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    if (isPassword) {
      setCapsLock(event.getModifierState('CapsLock'));
    }
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>

      <div className="field-control">
        <input
          id={id}
          // revealing swaps the type, which is what lets the browser show the
          // characters without us reimplementing a text box
          type={isPassword && revealed ? 'text' : type}
          className={isPassword ? 'has-affix' : undefined}
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          onKeyUp={checkCapsLock}
          onKeyDown={checkCapsLock}
          onBlur={() => setCapsLock(false)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          // pointing the input at its messages is what lets a screen reader read
          // them together instead of announcing an unexplained invalid field
          aria-invalid={error !== undefined}
          aria-describedby={describedBy}
        />

        {isPassword && (
          <button
            type="button"
            className="field-reveal"
            onClick={() => setRevealed((shown) => !shown)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            // deliberately left in the tab order. it was out of it, to save a
            // stop between the password box and submit, but that is a
            // convenience traded against somebody on a keyboard being unable to
            // reach the control at all - and checking what you typed matters
            // most to the people least able to see it
          >
            <svg
              viewBox="0 0 24 24"
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12Z" />
              <circle cx="12" cy="12" r="2.6" />
              {revealed && <path d="M4 20 20 4" />}
            </svg>
          </button>
        )}
      </div>

      {capsLock && (
        <p className="field-hint" id={capsId}>
          Caps lock is on
        </p>
      )}

      {error !== undefined && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}
