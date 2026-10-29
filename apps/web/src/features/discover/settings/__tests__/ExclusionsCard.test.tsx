// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_DISCOVERY_SETTINGS } from '@xbase/core/discovery';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExclusionsCard } from '../ExclusionsCard';

const mocks = vi.hoisted(() => ({
  saveDiscoverySettingsFn: vi.fn(),
  resetDiscoverySectionFn: vi.fn(),
  invalidate: vi.fn(async () => {}),
}));

// The server function's module needs the server; the card only calls what it exposes.
vi.mock('../discovery.functions', () => ({
  saveDiscoverySettingsFn: mocks.saveDiscoverySettingsFn,
  resetDiscoverySectionFn: mocks.resetDiscoverySectionFn,
}));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: mocks.invalidate }) }));

beforeEach(() => {
  mocks.saveDiscoverySettingsFn.mockReset();
  mocks.invalidate.mockClear();
});
afterEach(cleanup);

const settings = DEFAULT_DISCOVERY_SETTINGS.exclusions;
const save = () => screen.getByRole('button', { name: 'Save' });
const longest = () => screen.queryByRole('textbox', { name: 'Longest thread (posts)' });

it('saves the longest thread as a number, with the rest of the section', async () => {
  const user = userEvent.setup();
  mocks.saveDiscoverySettingsFn.mockResolvedValue({
    ...DEFAULT_DISCOVERY_SETTINGS,
    exclusions: { ...settings, maxThreadPosts: 12 },
  });
  render(<ExclusionsCard settings={settings} />);

  const field = longest();
  if (!field) throw new Error('The thread length field is missing');
  await user.clear(field);
  await user.type(field, '12');
  await user.click(save());

  expect(mocks.saveDiscoverySettingsFn).toHaveBeenCalledWith({
    data: { section: 'exclusions', value: { ...settings, maxThreadPosts: 12 } },
  });
  expect(await screen.findByText('Saved')).toBeDefined();
});

it('asks for a number in a cleared box instead of sending a zero', async () => {
  const user = userEvent.setup();
  render(<ExclusionsCard settings={settings} />);

  const field = longest();
  if (!field) throw new Error('The thread length field is missing');
  await user.clear(field);
  await user.click(save());

  expect(screen.getByRole('alert').textContent).toContain(
    'Longest thread (posts): use a whole number',
  );
  expect(mocks.saveDiscoverySettingsFn).not.toHaveBeenCalled();
});

it('hides the thread length while long threads are let through', async () => {
  const user = userEvent.setup();
  render(<ExclusionsCard settings={settings} />);

  await user.click(screen.getByRole('switch', { name: 'Long threads' }));
  expect(longest()).toBeNull();
});

it('saves with long threads off even when the hidden box was cleared', async () => {
  const user = userEvent.setup();
  mocks.saveDiscoverySettingsFn.mockResolvedValue({
    ...DEFAULT_DISCOVERY_SETTINGS,
    exclusions: { ...settings, longThreads: false },
  });
  render(<ExclusionsCard settings={settings} />);

  const field = longest();
  if (!field) throw new Error('The thread length field is missing');
  await user.clear(field);
  await user.click(screen.getByRole('switch', { name: 'Long threads' }));
  await user.click(save());

  expect(mocks.saveDiscoverySettingsFn).toHaveBeenCalledWith({
    data: { section: 'exclusions', value: { ...settings, longThreads: false } },
  });
});
