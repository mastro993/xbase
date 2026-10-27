import { afterEach, describe, expect, it, vi } from 'vitest';
import { listDecisionModels } from '../decisions';
import { OPENROUTER_DECISION_MODELS } from '../providers';

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

describe('listDecisionModels', () => {
  it('offers the fixed Decisions API model for OpenAI, without listing models', async () => {
    const fn = mockFetch(json({}));
    await expect(listDecisionModels('openai', 'sk-123')).resolves.toEqual([
      { id: 'gpt-6-luna', label: 'Decisions API', lowEffort: false },
    ]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('checks the OpenRouter key and offers the curated list, Jev first', async () => {
    const fn = mockFetch(json({ data: { label: 'test' } }));
    await expect(listDecisionModels('openrouter', 'sk-or-123')).resolves.toBe(
      OPENROUTER_DECISION_MODELS,
    );

    const [url, init] = fn.mock.calls[0]!;
    expect(url).toBe('https://openrouter.ai/api/v1/key');
    expect(init?.headers).toEqual({ authorization: 'Bearer sk-or-123' });
    expect(OPENROUTER_DECISION_MODELS[0]?.id).toBe('~typesafe/jev-latest');
  });

  it('passes TypeSafe through to its model list', async () => {
    mockFetch(json({ models: [{ name: 'jev-2' }] }));
    await expect(listDecisionModels('typesafe', 'ts-123')).resolves.toEqual([
      { id: 'jev-2', label: 'jev-2', lowEffort: false },
    ]);
  });

  it('reports a rejected key', async () => {
    mockFetch(json({ error: { message: 'Unauthorized' } }, 401));
    await expect(listDecisionModels('openrouter', 'bad')).rejects.toThrow('Invalid API key');
  });
});
