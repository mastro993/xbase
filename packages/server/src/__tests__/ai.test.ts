import { PROVIDERS } from '@xbase/ai/providers';
import { DEFAULT_DECISION_MODEL } from '@xbase/ai/typesafe';
import { AI_NOT_CONFIGURED, VoiceInput } from '@xbase/core/ai';
import { InvalidStateError, ValidationError } from '@xbase/core/errors';
import { settings } from '@xbase/db/schema';
import { createTestDb, seedAccount } from '@xbase/db/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAiSettings,
  getVoice,
  listDecisionModelsFor,
  listModelsFor,
  refineDraft,
  saveAiSettings,
  saveDecisionModel,
  saveVoice,
} from '../ai';
import type { Env } from '../env';

// The provider keys come from the environment: each test sets the ones it needs.
const env = vi.hoisted(() => ({ vars: {} as Partial<Env> }));
vi.mock('../env', () => ({ getEnv: () => env.vars }));

const OPENAI_KEY = 'sk-test-openai-0000000000001234';
const XAI_KEY = 'xai-test-0000000000005678';
const TYPESAFE_KEY = 'ts-test-0000000000009012';
const gpt = PROVIDERS.openai.defaultModel;
const grok = PROVIDERS.xai.defaultModel;

const fetchMock = vi.fn<typeof fetch>();
const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
/** The key a request was sent with, whatever the provider's header. */
const sentKey = (call = 0) => {
  const headers = new Headers(fetchMock.mock.calls[call]?.[1]?.headers);
  return headers.get('x-api-key') ?? headers.get('authorization')?.replace('Bearer ', '');
};

let db: ReturnType<typeof createTestDb>;
let accountId: string;
beforeEach(() => {
  env.vars = {};
  db = createTestDb();
  accountId = seedAccount();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI settings', () => {
  it('offers the providers with a key, and never returns a key', () => {
    expect(getAiSettings()).toEqual({ available: [], writing: null, decision: null });

    env.vars = { XAI_API_KEY: XAI_KEY, OPENAI_API_KEY: OPENAI_KEY };
    const ai = getAiSettings();
    expect(ai).toEqual({
      available: ['openai', 'xai'],
      writing: { provider: 'openai', model: gpt },
      decision: null,
    });
    expect(JSON.stringify(ai)).not.toMatch(/sk-test|xai-test/);
  });

  it('saves a provider and model, only for a provider with a key', () => {
    env.vars = { OPENAI_API_KEY: OPENAI_KEY };
    expect(() => saveAiSettings({ provider: 'xai', model: grok })).toThrow(
      new ValidationError('Set XAI_API_KEY in the server’s environment first.'),
    );
    expect(db.select().from(settings).all()).toEqual([]);

    env.vars.XAI_API_KEY = XAI_KEY;
    expect(saveAiSettings({ provider: 'xai', model: grok }).writing).toEqual({
      provider: 'xai',
      model: grok,
    });
    expect(db.select().from(settings).all()).toEqual([
      expect.objectContaining({ key: 'ai', value: { provider: 'xai', model: grok } }),
    ]);
  });

  it('rejects a provider XBase doesn’t write with before looking for its key', () => {
    env.vars = { OPENAI_API_KEY: OPENAI_KEY };
    const deepseek = { provider: 'deepseek', model: gpt } as never;
    expect(() => saveAiSettings(deepseek)).toThrow(ValidationError);
    expect(() => saveAiSettings(deepseek)).not.toThrow(/Set undefined/);
    expect(db.select().from(settings).all()).toEqual([]);
  });

  it('falls back to the first provider with a key once the saved one loses its key', () => {
    env.vars = { OPENAI_API_KEY: OPENAI_KEY, XAI_API_KEY: XAI_KEY };
    saveAiSettings({ provider: 'xai', model: grok });

    delete env.vars.XAI_API_KEY;
    expect(getAiSettings().writing).toEqual({ provider: 'openai', model: gpt });
    delete env.vars.OPENAI_API_KEY;
    expect(getAiSettings().writing).toBeNull();
  });

  it('treats a stored value it cannot read as unset', () => {
    env.vars = { OPENAI_API_KEY: OPENAI_KEY };
    db.insert(settings)
      .values({ key: 'ai', value: { provider: 'deepseek', model: gpt, apiKey: 'sk-old' } })
      .run();
    expect(getAiSettings().writing).toEqual({ provider: 'openai', model: gpt });
  });
});

describe('decision model', () => {
  const jev = { id: 'jev-2', label: 'jev-2', lowEffort: false };

  it('is null without TYPESAFE_API_KEY, which saving it needs', () => {
    expect(() => saveDecisionModel({ model: jev })).toThrow(
      new ValidationError('Set TYPESAFE_API_KEY in the server’s environment first.'),
    );
    expect(getAiSettings().decision).toBeNull();
  });

  it('is the saved model, else the default, while the key is set', () => {
    env.vars = { TYPESAFE_API_KEY: TYPESAFE_KEY };
    expect(getAiSettings().decision).toEqual(DEFAULT_DECISION_MODEL);
    expect(saveDecisionModel({ model: jev }).decision).toEqual(jev);

    delete env.vars.TYPESAFE_API_KEY;
    expect(getAiSettings().decision).toBeNull();
  });
});

describe('listModelsFor', () => {
  const models = { data: [{ id: 'gpt-6' }, { id: 'gpt-5.5' }, { id: 'whisper-1' }] };

  it('lists models with the key from the environment', async () => {
    env.vars = { OPENAI_API_KEY: OPENAI_KEY };
    fetchMock.mockReturnValueOnce(reply(models));
    await expect(listModelsFor({ provider: 'openai' })).resolves.toEqual([
      { id: 'gpt-5.5', label: 'gpt-5.5', lowEffort: true },
      { id: 'gpt-6', label: 'gpt-6', lowEffort: true },
    ]);
    expect(sentKey()).toBe(OPENAI_KEY);
  });

  it('names the variable to set for a provider without a key', async () => {
    env.vars = { OPENAI_API_KEY: OPENAI_KEY };
    await expect(listModelsFor({ provider: 'xai' })).rejects.toThrow(
      new ValidationError('Set XAI_API_KEY in the server’s environment first.'),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a rejected key without echoing it', async () => {
    env.vars = { OPENAI_API_KEY: OPENAI_KEY };
    fetchMock.mockReturnValueOnce(reply({ error: { message: `Bad key ${OPENAI_KEY}` } }, 401));
    await expect(listModelsFor({ provider: 'openai' })).rejects.toThrow('Invalid API key');

    fetchMock.mockReturnValueOnce(
      reply({ error: { message: `Key ${OPENAI_KEY} is broken` } }, 500),
    );
    await expect(listModelsFor({ provider: 'openai' })).rejects.toThrow(/^500: Key … is broken$/);
  });
});

describe('listDecisionModelsFor', () => {
  it('lists TypeSafe’s models with TYPESAFE_API_KEY', async () => {
    await expect(listDecisionModelsFor()).rejects.toThrow(ValidationError);
    expect(fetchMock).not.toHaveBeenCalled();

    env.vars = { TYPESAFE_API_KEY: TYPESAFE_KEY };
    fetchMock.mockReturnValueOnce(reply({ models: [{ name: 'jev-latest' }, { name: 'jev-2' }] }));
    await expect(listDecisionModelsFor()).resolves.toEqual([
      { id: 'jev-2', label: 'jev-2', lowEffort: false },
      { id: 'jev-latest', label: 'jev-latest', lowEffort: false },
    ]);
    expect(sentKey()).toBe(TYPESAFE_KEY);
  });

  it('reports a failure without echoing the key', async () => {
    env.vars = { TYPESAFE_API_KEY: TYPESAFE_KEY };
    fetchMock.mockReturnValueOnce(reply({ error: { message: `No ${TYPESAFE_KEY}` } }, 500));
    await expect(listDecisionModelsFor()).rejects.toThrow(/^500: No …$/);
  });
});

describe('voice', () => {
  it('belongs to one account: it starts empty, then saves trimmed fields', () => {
    const empty = { persona: '', audience: '', voice: '', rules: '' };
    expect(getVoice(accountId)).toEqual(empty);
    const voice = { persona: ' Indie dev ', audience: 'Makers', voice: 'Dry', rules: 'No emoji\n' };
    expect(saveVoice(accountId, voice)).toEqual({
      persona: 'Indie dev',
      audience: 'Makers',
      voice: 'Dry',
      rules: 'No emoji',
    });
    expect(getVoice(accountId).persona).toBe('Indie dev');
    expect(getVoice(seedAccount({ id: '2002' }))).toEqual(empty);
  });

  it('caps each field at 1000 characters', () => {
    expect(VoiceInput.safeParse({ ...getVoice(accountId), rules: 'x'.repeat(1001) }).success).toBe(
      false,
    );
  });
});

describe('refineDraft', () => {
  const chat = (content: string) => ({
    choices: [{ finish_reason: 'stop', message: { content } }],
  });

  it('needs a provider with a key first', async () => {
    env.vars = { TYPESAFE_API_KEY: TYPESAFE_KEY };
    await expect(refineDraft(accountId, 'hi')).rejects.toThrow(
      new InvalidStateError(AI_NOT_CONFIGURED),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the draft and the account’s voice with the default model, and cleans the answer', async () => {
    env.vars = { OPENAI_API_KEY: OPENAI_KEY };
    saveVoice(accountId, { persona: 'Indie dev', audience: '', voice: '', rules: '' });
    const other = seedAccount({ id: '2002' });
    saveVoice(other, { persona: 'Chef', audience: '', voice: '', rules: '' });
    fetchMock.mockReturnValueOnce(reply(chat('"Shipped XBase today."')));

    await expect(refineDraft(accountId, '  shipped xbase today  ')).resolves.toBe(
      'Shipped XBase today.',
    );

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(sentKey()).toBe(OPENAI_KEY);
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe(gpt.id);
    expect(body.messages[0].content).toContain('Indie dev');
    expect(body.messages[0].content).not.toContain('Chef');
    expect(body.messages[1].content).toContain('<draft>\nshipped xbase today\n</draft>');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('uses the saved provider and model', async () => {
    env.vars = { OPENAI_API_KEY: OPENAI_KEY, XAI_API_KEY: XAI_KEY };
    saveAiSettings({ provider: 'xai', model: grok });
    fetchMock.mockReturnValueOnce(reply(chat('Done.')));
    await refineDraft(accountId, 'done');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.x.ai/v1/chat/completions');
    expect(sentKey()).toBe(XAI_KEY);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string).model).toBe(grok.id);
  });

  it('turns provider failures into errors without the key', async () => {
    env.vars = { OPENAI_API_KEY: OPENAI_KEY };
    fetchMock.mockReturnValueOnce(reply({ error: { message: `quota for ${OPENAI_KEY}` } }, 503));
    await expect(refineDraft(accountId, 'hi')).rejects.toThrow(/^503: quota for …$/);

    fetchMock.mockReturnValueOnce(reply(chat('   ')));
    await expect(refineDraft(accountId, 'hi')).rejects.toThrow(/empty reply/);
  });
});
