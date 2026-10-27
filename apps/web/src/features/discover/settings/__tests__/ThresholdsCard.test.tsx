// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_DISCOVERY_SETTINGS } from '@xbase/core/discovery';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThresholdsCard } from '../ThresholdsCard';

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

const settings = DEFAULT_DISCOVERY_SETTINGS.thresholds;
const save = () => screen.getByRole('button', { name: 'Save' });
const bestAge = () => screen.getByRole('textbox', { name: 'Best post age (hours)' });

it('shows the server’s reason when a combination can’t work', async () => {
  const user = userEvent.setup();
  mocks.saveDiscoverySettingsFn.mockRejectedValue(
    new Error('✖ The hard age cap must be at least the best age\n  → at hardMaxAgeHours'),
  );
  render(<ThresholdsCard settings={settings} />);

  await user.click(save());

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('The hard age cap must be at least the best age');
  // The path means nothing to the owner.
  expect(alert.textContent).not.toContain('hardMaxAgeHours');
});

it('saves the values as numbers', async () => {
  const user = userEvent.setup();
  mocks.saveDiscoverySettingsFn.mockResolvedValue({
    ...DEFAULT_DISCOVERY_SETTINGS,
    thresholds: { ...settings, bestAgeHours: 3 },
  });
  render(<ThresholdsCard settings={settings} />);

  await user.clear(bestAge());
  await user.type(bestAge(), '3');
  await user.click(save());

  expect(mocks.saveDiscoverySettingsFn).toHaveBeenCalledWith({
    data: { section: 'thresholds', value: { ...settings, bestAgeHours: 3 } },
  });
  expect(await screen.findByText('Saved')).toBeDefined();
});

it('asks for a number in a cleared box instead of sending a zero', async () => {
  const user = userEvent.setup();
  render(<ThresholdsCard settings={settings} />);

  await user.clear(bestAge());
  await user.click(save());

  expect(screen.getByRole('alert').textContent).toContain('Fill in every threshold');
  expect(mocks.saveDiscoverySettingsFn).not.toHaveBeenCalled();
});
