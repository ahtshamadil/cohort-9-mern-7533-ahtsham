import { useEffect, useRef, useState } from 'react';

/** Which of the two files the export button was asked for. */
export type ExportFormat = 'json' | 'text';

const choices: { format: ExportFormat; label: string; hint: string }[] = [
  { format: 'json', label: 'JSON', hint: 'Keeps formatting. Import reads this one.' },
  { format: 'text', label: 'Plain text', hint: 'A readable copy. Formatting is lost.' },
];

/**
 * The export button and the menu of formats behind it.
 *
 * One button rather than one per format, because the two are the same action
 * with a choice inside it, and the choice is worth a sentence each - which
 * there is nowhere to put on a toolbar button.
 */
export function ExportMenu({
  disabled = false,
  onChoose,
}: {
  disabled?: boolean;
  onChoose: (format: ExportFormat) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointer(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      setOpen(false);
      // without this the focus is left on nothing once the menu unmounts, and a
      // keyboard user has to tab from the top of the page again
      trigger.current?.focus();
    }

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={wrapper}>
      <button
        ref={trigger}
        type="button"
        className="button button-ghost"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
      >
        Export
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="menu-list" role="menu">
          {choices.map(({ format, label, hint }) => (
            <button
              key={format}
              type="button"
              className="menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onChoose(format);
              }}
            >
              <span className="menu-item-label">{label}</span>
              <span className="menu-item-hint">{hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
