import { EMPTY_STYLE, type Project, type StyleGuide } from '@xbase/ai/profile';
import {
  type ApiKeys,
  DEFAULT_SETTINGS,
  getStatus,
  mergeSettings,
  type Settings,
  splitSettings,
  type StoredSettings,
} from '@xbase/companion/settings';
import { storage } from 'wxt/utils/storage';

// Settings in chrome.storage.local; the model and its rules are @xbase/companion/settings.

// The background restricts storage.local to TRUSTED_CONTEXTS, so content scripts can't read it.
const keysItem = storage.defineItem<ApiKeys>('local:apiKeys', { fallback: {} });

export const settingsItem = storage.defineItem<StoredSettings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
  version: 4,
  migrations: {
    // v1 kept one free-form style (tone plus pasted replies), which is what `voice` holds.
    // It could reach 2000 chars; the panel flags anything over the new limit.
    // A v2 value can lack the version meta (WXT writes it separately on the first save),
    // so anything that isn't the v1 string passes through.
    2: (v1: Omit<Settings, 'style'> & { style: string | StyleGuide }) =>
      typeof v1.style === 'string' ? { ...v1, style: { ...EMPTY_STYLE, voice: v1.style } } : v1,
    // Same caveat: a value may already have projects.
    3: (v2: Omit<Settings, 'projects'> & { projects?: Project[] }) => ({
      ...v2,
      projects: v2.projects ?? [],
    }),
    // Moves the keys into their own item, so style and project saves stop rewriting them. Same
    // caveat, and the service worker and the panel can run this at once: both write the same keys.
    4: async (v3: Settings) => {
      const [stored, keys] = splitSettings(v3);
      if (Object.keys(keys).length) {
        await keysItem.setValue({ ...keys, ...(await keysItem.getValue()) });
      }
      return stored;
    },
  },
});

export async function getSettings(): Promise<Settings> {
  // Settings first: its migration may still be moving keys into keysItem.
  const stored = await settingsItem.getValue();
  return mergeSettings(stored, await keysItem.getValue());
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Writes only the parts of `next` that differ from `prev` (everything without `prev`), so a style
 * edit never rewrites the keys.
 */
export async function saveSettings(next: Settings, prev?: Settings): Promise<void> {
  const [stored, keys] = splitSettings(next);
  const [prevStored, prevKeys] = prev ? splitSettings(prev) : [];
  if (!same(keys, prevKeys)) await keysItem.setValue(keys);
  if (!same(stored, prevStored)) await settingsItem.setValue(stored);
}

/** Calls `onChange` after any write to the settings or the keys. Returns the unwatch function. */
export function watchSettings(onChange: () => void): () => void {
  const unwatch = [settingsItem, keysItem].map((item) => item.watch(onChange));
  return () => unwatch.forEach((u) => u());
}

/**
 * Calls `onReady` when a write flips whether actions can run, and after the first write either way.
 * No baseline read: a write can be what wakes the service worker, and the read would see its result.
 */
export function watchReady(onReady: (ready: boolean) => void): () => void {
  // Chained so each change compares against the one before it.
  let last: Promise<boolean | undefined> = Promise.resolve(undefined);
  return watchSettings(() => {
    last = last.then(async (was) => {
      const ready = await getSettings().then(
        (s) => getStatus(s).ready,
        () => was,
      );
      if (ready !== undefined && ready !== was) onReady(ready);
      return ready;
    });
  });
}
