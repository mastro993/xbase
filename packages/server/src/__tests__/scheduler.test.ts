import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startScheduler } from '../scheduler';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('startScheduler', () => {
  it('runs at once, then every interval, until stopped', async () => {
    const run = vi.fn();
    const scheduler = startScheduler({ name: 'test', intervalMs: 1000, run });
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBeInstanceOf(Date);

    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(3);

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('skips a tick while the previous one is still running', async () => {
    let finish = () => {};
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const scheduler = startScheduler({ name: 'test', intervalMs: 1000, run });
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('logs a failing tick and keeps going', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
    const scheduler = startScheduler({ name: 'test', intervalMs: 1000, run });
    await vi.advanceTimersByTimeAsync(1000);
    expect(error).toHaveBeenCalledWith('[scheduler] test failed', expect.any(Error));
    expect(run).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });
});
