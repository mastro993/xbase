import { useHydrated } from '@tanstack/react-router';

// The composer's two shortcuts: ⌘S / Ctrl+S saves, ⌘↵ / Ctrl+↵ confirms the schedule dialog.

type KeyLike = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>;

/** ⌘ or Ctrl with `key` (e.g. 's', 'Enter'), and no other modifier. */
export function isShortcut(event: KeyLike, key: string): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === key.toLowerCase()
  );
}

/** "⌘" on Apple devices, "Ctrl+" elsewhere; null until hydration, when the platform is known. */
export function useModifierLabel(): string | null {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl+';
}
