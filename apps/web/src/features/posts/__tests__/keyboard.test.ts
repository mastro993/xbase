import { describe, expect, it } from 'vitest';
import { isShortcut } from '../keyboard';

const key = (
  value: string,
  modifiers: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {},
) => ({
  key: value,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
});

describe('isShortcut', () => {
  it('matches ⌘ or Ctrl with the key, in any case', () => {
    expect(isShortcut(key('s', { metaKey: true }), 's')).toBe(true);
    expect(isShortcut(key('S', { ctrlKey: true }), 's')).toBe(true);
    expect(isShortcut(key('Enter', { metaKey: true }), 'Enter')).toBe(true);
  });

  it('ignores the key alone, other keys and extra modifiers', () => {
    expect(isShortcut(key('s'), 's')).toBe(false);
    expect(isShortcut(key('a', { metaKey: true }), 's')).toBe(false);
    expect(isShortcut(key('s', { metaKey: true, shiftKey: true }), 's')).toBe(false);
    expect(isShortcut(key('s', { ctrlKey: true, altKey: true }), 's')).toBe(false);
  });
});
