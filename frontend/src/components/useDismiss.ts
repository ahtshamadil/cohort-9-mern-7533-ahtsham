import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Closes a menu or dialog on Escape, or on a click outside it.
 *
 * Both need the same two listeners, and a copy in each one is a copy that can
 * drift. Whatever should happen after - moving focus back to a trigger, say -
 * belongs in the callback rather than in here.
 */
export function useDismiss(
  container: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  active = true,
): void {
  useEffect(() => {
    if (!active) {
      return;
    }

    function handlePointer(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) {
        onDismiss();
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onDismiss();
      }
    }

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [container, onDismiss, active]);
}
