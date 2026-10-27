import { afterEach, describe, expect, it, vi } from 'vitest';
import { listTypeSafeModels } from '../typesafe';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Stubs fetch with one response. Returns the mock for call inspection. */
function mockFetch(response: Response) {
  const fn = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(response));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listTypeSafeModels', () => {
  it('lists the models the key can use, sorted with numbers in order', async () => {
    const fn = mockFetch(
      json({
        models: [
          { name: 'jev-10', description: 'Newest', release_date: '2026-10-01' },
          { name: 'jev-latest', description: 'Alias', release_date: '2026-10-01' },
          { name: 'jev-2', description: 'Older', release_date: '2026-03-01' },
        ],
      }),
    );
    await expect(listTypeSafeModels('ts-123')).resolves.toEqual([
      { id: 'jev-2', label: 'jev-2', lowEffort: false },
      { id: 'jev-10', label: 'jev-10', lowEffort: false },
      { id: 'jev-latest', label: 'jev-latest', lowEffort: false },
    ]);

    const [url, init] = fn.mock.calls[0]!;
    expect(url).toBe('https://api.typesafe.ai/v1/models');
    expect(init?.method).toBeUndefined();
    expect(init?.headers).toEqual({ authorization: 'Bearer ts-123' });
  });

  it('treats a reply without models as an empty list', async () => {
    mockFetch(json({}));
    await expect(listTypeSafeModels('ts-123')).resolves.toEqual([]);
  });

  it('reports a rejected key', async () => {
    mockFetch(json({ error: { message: 'Unauthorized' } }, 401));
    await expect(listTypeSafeModels('bad')).rejects.toThrow('Invalid API key');
  });
});
