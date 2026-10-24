import { describe, expect, it } from 'vitest';
import { needsHttpsWarning, parseEnv } from '../env.server';

const X = { X_CLIENT_ID: 'client-id', X_CLIENT_SECRET: 'client-secret' };

describe('parseEnv', () => {
  it('fills the development defaults', () => {
    expect(parseEnv(X, false)).toEqual({
      ...X,
      APP_URL: 'http://127.0.0.1:5173',
      DATABASE_PATH: './data/xbase.db',
      TRUST_PROXY_HOPS: 0,
    });
  });

  it.each([
    ['1', 1],
    ['5', 5],
  ])('reads TRUST_PROXY_HOPS=%s', (TRUST_PROXY_HOPS, expected) => {
    expect(parseEnv({ ...X, TRUST_PROXY_HOPS }, false).TRUST_PROXY_HOPS).toBe(expected);
  });

  it.each(['-1', '6', '1.5', 'yes'])('rejects TRUST_PROXY_HOPS=%s', (TRUST_PROXY_HOPS) => {
    expect(() => parseEnv({ ...X, TRUST_PROXY_HOPS }, false)).toThrow(
      'TRUST_PROXY_HOPS must be a whole number from 0 to 5',
    );
  });

  it('requires the X app’s client id and secret', () => {
    expect(() => parseEnv({ X_CLIENT_SECRET: 'secret' }, false)).toThrow('X_CLIENT_ID is required');
    expect(() => parseEnv({ X_CLIENT_ID: 'id' }, false)).toThrow('X_CLIENT_SECRET is required');
  });

  it('reads the optional AI keys, trimmed', () => {
    const env = parseEnv(
      {
        ...X,
        OPENAI_API_KEY: ' sk-openai\n',
        ANTHROPIC_API_KEY: 'sk-ant',
        XAI_API_KEY: 'xai-key',
        OPENROUTER_API_KEY: 'sk-or',
        TYPESAFE_API_KEY: 'ts-key',
      },
      false,
    );
    expect(env).toMatchObject({
      OPENAI_API_KEY: 'sk-openai',
      ANTHROPIC_API_KEY: 'sk-ant',
      XAI_API_KEY: 'xai-key',
      OPENROUTER_API_KEY: 'sk-or',
      TYPESAFE_API_KEY: 'ts-key',
    });
  });

  it('treats empty and blank values as unset', () => {
    expect(() => parseEnv({ ...X, X_CLIENT_ID: '' }, false)).toThrow('X_CLIENT_ID is required');
    expect(() => parseEnv({ ...X, X_CLIENT_SECRET: '  ' }, false)).toThrow(
      'X_CLIENT_SECRET is required',
    );
    const env = parseEnv({ ...X, DATABASE_PATH: '', OPENAI_API_KEY: '', XAI_API_KEY: ' ' }, false);
    expect(env.DATABASE_PATH).toBe('./data/xbase.db');
    expect(env).not.toHaveProperty('OPENAI_API_KEY');
    expect(env).not.toHaveProperty('XAI_API_KEY');
  });

  it('requires APP_URL in production', () => {
    expect(() => parseEnv(X, true)).toThrow('APP_URL is required in production');
  });

  it('reports every problem at once', () => {
    expect(() => parseEnv({}, true)).toThrow(
      /APP_URL is required in production[\s\S]*X_CLIENT_ID is required[\s\S]*X_CLIENT_SECRET is required/,
    );
  });

  it.each([
    ['https://x.example', 'https://x.example'],
    ['https://x.example/', 'https://x.example'],
    ['HTTPS://X.Example:443/', 'https://x.example'],
    ['http://192.168.1.5:3000', 'http://192.168.1.5:3000'],
  ])('keeps the origin of %s', (APP_URL, expected) => {
    expect(parseEnv({ ...X, APP_URL }, true).APP_URL).toBe(expected);
  });

  it.each([
    ['https://x.example/app', 'without a path'],
    ['https://x.example/?a=1', 'without a path'],
    ['https://x.example/#top', 'without a path'],
    ['https://user:pass@x.example', 'must not contain credentials'],
    ['ftp://x.example', 'must be an http(s) URL'],
    ['x.example', 'must be an http(s) URL'],
  ])('rejects APP_URL=%s', (APP_URL, message) => {
    expect(() => parseEnv({ ...X, APP_URL }, true)).toThrow(message);
  });
});

describe('needsHttpsWarning', () => {
  const env = (APP_URL: string) => ({ ...X, APP_URL, DATABASE_PATH: 'x', TRUST_PROXY_HOPS: 0 });

  it.each([
    ['https://x.example', false],
    ['http://localhost:5173', false],
    ['http://127.0.0.1:3000', false],
    ['http://[::1]:3000', false],
    ['http://192.168.1.5:3000', true],
    ['http://xbase.lan', true],
    ['http://xbase.localhost:5173', true],
    ['http://127.10.0.2', true],
  ])('%s -> %s', (url, expected) => {
    expect(needsHttpsWarning(env(url))).toBe(expected);
  });
});
