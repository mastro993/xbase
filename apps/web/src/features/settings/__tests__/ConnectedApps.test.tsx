// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ConnectedAppDto } from '@/features/mcp/mcp.schema';
import { ConnectedApps, WATCH_MS } from '../ConnectedApps';

const mocks = vi.hoisted(() => ({
  listConnectedAppsFn: vi.fn(),
  revokeConnectedAppFn: vi.fn(),
  invalidate: vi.fn(async () => {}),
}));

// The server functions' module needs the server; the list only calls them.
vi.mock('@/features/mcp/mcp.functions', () => ({
  listConnectedAppsFn: mocks.listConnectedAppsFn,
  revokeConnectedAppFn: mocks.revokeConnectedAppFn,
}));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: mocks.invalidate }) }));

const app = (grantId: string, clientName: string): ConnectedAppDto => ({
  grantId,
  clientId: `dcr_${grantId}`,
  clientName,
  kind: 'dcr',
  verifiedHost: null,
  createdAt: '2026-10-24T10:00:00.000Z',
  lastUsedAt: null,
});
const CURSOR = app('g1', 'Cursor');
const CLAUDE = app('g2', 'Claude');

let visibility: DocumentVisibilityState = 'visible';
beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  mocks.listConnectedAppsFn.mockReset();
  mocks.invalidate.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const tick = () => act(() => vi.advanceTimersByTimeAsync(WATCH_MS));

it('reloads the page once an app connects from another tab', async () => {
  mocks.listConnectedAppsFn.mockResolvedValue([CURSOR]);
  render(<ConnectedApps apps={[CURSOR]} />);
  await tick();
  expect(mocks.listConnectedAppsFn).toHaveBeenCalledOnce();
  expect(mocks.invalidate).not.toHaveBeenCalled();

  mocks.listConnectedAppsFn.mockResolvedValue([CLAUDE, CURSOR]);
  await tick();
  expect(mocks.invalidate).toHaveBeenCalledOnce();
});

it('checks as soon as the tab comes back into view, and not while it’s hidden', async () => {
  mocks.listConnectedAppsFn.mockResolvedValue([CLAUDE]);
  render(<ConnectedApps apps={[]} />);
  visibility = 'hidden';
  await tick();
  expect(mocks.listConnectedAppsFn).not.toHaveBeenCalled();

  visibility = 'visible';
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(mocks.listConnectedAppsFn).toHaveBeenCalledOnce();
  expect(mocks.invalidate).toHaveBeenCalledOnce();
});

it('announces an app that wasn’t listed before', () => {
  const { rerender } = render(<ConnectedApps apps={[CURSOR]} />);
  expect(screen.getByRole('status').textContent).toBe('');
  rerender(<ConnectedApps apps={[CLAUDE, CURSOR]} />);
  expect(screen.getByRole('status').textContent).toBe('Claude connected.');
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
});

it('keeps checking after a failed check', async () => {
  mocks.listConnectedAppsFn.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([CLAUDE]);
  render(<ConnectedApps apps={[]} />);
  await tick();
  expect(mocks.invalidate).not.toHaveBeenCalled();
  await tick();
  expect(mocks.invalidate).toHaveBeenCalledOnce();
});
