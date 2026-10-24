// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { ApiKeyDto } from '../api-keys.schema';
import { ApiKeysCard } from '../ApiKeysCard';

const mocks = vi.hoisted(() => ({ revokeApiKeyFn: vi.fn(async () => {}), reload: () => {} }));

// The server functions' module needs the server; the card only calls them.
vi.mock('../api-keys.functions', () => ({
  revokeApiKeyFn: mocks.revokeApiKeyFn,
  createApiKeyFn: vi.fn(),
}));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
// invalidate reloads the list, which no longer has the revoked key. The router's store renders
// the new data synchronously (useSyncExternalStore), before invalidate resolves.
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: async () => flushSync(mocks.reload) }),
}));

afterEach(cleanup);

const KEYS = [
  {
    id: 'k1',
    name: 'Backup script',
    prefix: 'xbase_ak_1Cm',
    createdAt: '2026-10-20T10:00:00.000Z',
    lastUsedAt: null,
  },
  {
    id: 'k2',
    name: 'Zapier',
    prefix: 'xbase_ak_9Qx',
    createdAt: '2026-10-21T10:00:00.000Z',
    lastUsedAt: '2026-10-23T10:00:00.000Z',
  },
] as ApiKeyDto[];

function Page() {
  const [keys, setKeys] = useState(KEYS);
  useEffect(() => {
    mocks.reload = () => setKeys((current) => current.filter((key) => key.id !== 'k1'));
  }, []);
  return <ApiKeysCard keys={keys} />;
}

it('lists keys by prefix and dates, and after a revoke moves focus to the card and says so', async () => {
  const user = userEvent.setup();
  render(<Page />);
  const list = screen.getByRole('list');
  expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  expect(list.textContent).toContain('xbase_ak_1Cm…');
  expect(list.textContent).toContain('Created Oct 20');
  expect(list.textContent).toContain('Never used');
  expect(list.textContent).toContain('Last used Oct 23');
  await user.click(screen.getByRole('button', { name: 'Revoke Backup script' }));
  const dialog = screen.getByRole('alertdialog', { name: 'Revoke Backup script?' });
  await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));
  expect(mocks.revokeApiKeyFn).toHaveBeenCalledWith({ data: { id: 'k1' } });
  await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  await vi.waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'API keys' })),
  );
  expect(
    screen
      .getAllByRole('status')
      .some((s) => s.textContent === 'The key Backup script was revoked.'),
  ).toBe(true);
});
