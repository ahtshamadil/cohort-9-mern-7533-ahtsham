import { useEffect, useRef, useState } from 'react';

import { ChangePasswordDialog } from './ChangePasswordDialog';

export function AccountMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);

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
        className="app-user"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
      >
        <span className="app-user-name">{name}</span>
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
          <button
            type="button"
            className="menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setChanging(true);
            }}
          >
            <span className="menu-item-label">Change password</span>
            <span className="menu-item-hint">Signs out everywhere else.</span>
          </button>
        </div>
      )}

      {changing && (
        <ChangePasswordDialog
          onClose={() => {
            setChanging(false);
            trigger.current?.focus();
          }}
        />
      )}
    </div>
  );
}
