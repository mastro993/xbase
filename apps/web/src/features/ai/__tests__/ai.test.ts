import { PROVIDERS } from '@xbase/ai/providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidStateError, ValidationError } from '@/lib/errors';
import { settings } from '@/server/db/schema';
import { createTestDb } from '@/test/db';
import { AI_NOT_CONFIGURED, VoiceInput } from '../ai.schema';
import {
  getAiSettings,
  getVoice,
  listModelsFor,
  refineDraft,
  saveAiSettings,
  saveVoice,
} from '../ai.server';

const OPENAI_KEY = 'sk-test-openai-0000000000001234';
const XAI_KEY = 'xai-test-0000000000005678';
const model = PROVIDERS.openai.defaultModel;

const fetchMock = vi.fn<typeof fetch>();
const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
/** The key a request was sent with, whatever the provider's header. */
const sentKey = (call = 0) => {
  const headers = new Headers(fetchMock.mock.calls[call]?.[1]?.headers);
  return headers.get('x-api-key') ?? headers.get('authorization')?.replace('Bearer ', '');
};

let db: ReturnType<typeof createTestDb>;
beforeEach(() => {
  db = createTestDb();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI settings', () => {
  it('is null until saved, and never returns the key', () => {
    expect(getAiSettings()).toBeNull();
    const saved = saveAiSettings({ provider: 'openai', model, apiKey: OPENAI_KEY });
    expect(saved).toEqual({ provider: 'openai', model, keyHint: '…1234' });
    expect(getAiSettings()).toEqual(saved);
    expect(JSON.stringify(getAiSettings())).not.toContain(OPENAI_KEY);
  });

  it('keeps the stored key when none is sent for the same provider', () => {
    saveAiSettings({ provider: 'openai', model, apiKey: OPENAI_KEY });
    const other = { id: 'gpt-6', label: 'gpt-6', lowEffort: false };
    expect(saveAiSettings({ provider: 'openai', model: other })).toEqual({
      provider: 'openai',
      model: other,
      keyHint: '…1234',
    });
    expect(db.select().from(settings).all()).toEqual([
      expect.objectContaining({
        key: 'ai',
        value: { provider: 'openai', model: other, apiKey: OPENAI_KEY },
      }),
    ]);
  });

  it('needs a new key when the provider changes', () => {
    saveAiSettings({ provider: 'openai', model, apiKey: OPENAI_KEY });
    const grok = PROVIDERS.xai.defaultModel;
    expect(() => saveAiSettings({ provider: 'xai', model: grok })).toThrow(
      new ValidationError('Enter your xAI (Grok) API key.'),
    );
    expect(getAiSettings()?.provider).toBe('openai');
    expect(saveAiSettings({ provider: 'xai', model: grok, apiKey: XAI_KEY })?.keyHint).toBe(
      '…5678',
    );
  });

  it('needs a key the first time', () => {
    expect(() => saveAiSettings({ provider: 'openai', model })).toThrow(ValidationError);
  });

  it('treats a stored value it cannot read as unset', () => {
    db.insert(settings)
      .values({ key: 'ai', value: { provider: 'nope' } })
      .run();
    expect(getAiSettings()).toBeNull();
  });
});

describe('listModelsFor', () => {
  const models = { data: [{ id: 'gpt-6' }, { id: 'gpt-5.5' }, { id: 'whisper-1' }] };

  it('lists models with the key it is given', async () => {
    fetchMock.mockReturnValueOnce(reply(models));
    await expect(listModelsFor({ provider: 'openai', apiKey: OPENAI_KEY })).resolves.toEqual([
      { id: 'gpt-5.5', label: 'gpt-5.5', lowEffort: true },
      { id: 'gpt-6', label: 'gpt-6', lowEffort: true },
    ]);
    expect(sentKey()).toBe(OPENAI_KEY);
  });

  it('falls back to the stored key for the same provider only', async () => {
    saveAiSettings({ provider: 'openai', model, apiKey: OPENAI_KEY });
    fetchMock.mockReturnValueOnce(reply(models));
    await listModelsFor({ provider: 'openai' });
    expect(sentKey()).toBe(OPENAI_KEY);

    await expect(listModelsFor({ provider: 'xai' })).rejects.toThrow(ValidationError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports a rejected key without echoing it', async () => {
    fetchMock.mockReturnValueOnce(reply({ error: { message: `Bad key ${OPENAI_KEY}` } }, 401));
    await expect(listModelsFor({ provider: 'openai', apiKey: OPENAI_KEY })).rejects.toThrow(
      'Invalid API key',
    );

    fetchMock.mockReturnValueOnce(
      reply({ error: { message: `Key ${OPENAI_KEY} is broken` } }, 500),
    );
    await expect(listModelsFor({ provider: 'openai', apiKey: OPENAI_KEY })).rejects.toThrow(
      /^500: Key … is broken$/,
    );
  });
});

describe('voice', () => {
  it('starts empty, then saves trimmed fields', () => {
    expect(getVoice()).toEqual({ persona: '', audience: '', voice: '', rules: '' });
    const voice = { persona: ' Indie dev ', audience: 'Makers', voice: 'Dry', rules: 'No emoji\n' };
    expect(saveVoice(voice)).toEqual({
      persona: 'Indie dev',
      audience: 'Makers',
      voice: 'Dry',
      rules: 'No emoji',
    });
    expect(getVoice().persona).toBe('Indie dev');
  });

  it('caps each field at 1000 characters', () => {
    expect(VoiceInput.safeParse({ ...getVoice(), rules: 'x'.repeat(1001) }).success).toBe(false);
  });
});

describe('refineDraft', () => {
  const chat = (content: string) => ({
    choices: [{ finish_reason: 'stop', message: { content } }],
  });

  it('needs a provider first', async () => {
    await expect(refineDraft('hi')).rejects.toThrow(new InvalidStateError(AI_NOT_CONFIGURED));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the draft and the voice with the stored config, and cleans the answer', async () => {
    saveAiSettings({ provider: 'openai', model, apiKey: OPENAI_KEY });
    saveVoice({ persona: 'Indie dev', audience: '', voice: '', rules: '' });
    fetchMock.mockReturnValueOnce(reply(chat('"Shipped XBase today."')));

    await expect(refineDraft('  shipped xbase today  ')).resolves.toBe('Shipped XBase today.');

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(sentKey()).toBe(OPENAI_KEY);
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe(model.id);
    expect(body.messages[0].content).toContain('Indie dev');
    expect(body.messages[1].content).toContain('<draft>\nshipped xbase today\n</draft>');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('turns provider failures into errors without the key', async () => {
    saveAiSettings({ provider: 'openai', model, apiKey: OPENAI_KEY });
    fetchMock.mockReturnValueOnce(reply({ error: { message: `quota for ${OPENAI_KEY}` } }, 503));
    await expect(refineDraft('hi')).rejects.toThrow(/^503: quota for …$/);

    fetchMock.mockReturnValueOnce(reply(chat('   ')));
    await expect(refineDraft('hi')).rejects.toThrow(/empty reply/);
  });
});
