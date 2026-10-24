import { describe, expect, it } from 'vitest';
import { needsHttpsWarning, parseEnv } from '../env.server';

const PASSWORD = 'correct horse battery';

describe('parseEnv', () => {
  it('fills the development defaults', () => {
    expect(parseEnv({ APP_PASSWORD: PASSWORD }, false)).toEqual({
      APP_PASSWORD: PASSWORD,
      APP_URL: 'http://localhost:5173',
      DATABASE_PATH: './data/xbase.db',
      TRUST_PROXY_HOPS: 0,
    });
  });

  it.each([
    ['1', 1],
    ['5', 5],
  ])('reads TRUST_PROXY_HOPS=%s', (TRUST_PROXY_HOPS, expected) => {
    expect(parseEnv({ APP_PASSWORD: PASSWORD, TRUST_PROXY_HOPS }, false).TRUST_PROXY_HOPS).toBe(
      expected,
    );
  });

  it.each(['-1', '6', '1.5', 'yes'])('rejects TRUST_PROXY_HOPS=%s', (TRUST_PROXY_HOPS) => {
    expect(() => parseEnv({ APP_PASSWORD: PASSWORD, TRUST_PROXY_HOPS }, false)).toThrow(
      'TRUST_PROXY_HOPS must be a whole number from 0 to 5',
    );
  });

  it('requires APP_PASSWORD of at least 12 characters', () => {
    expect(() => parseEnv({}, false)).toThrow('APP_PASSWORD is required');
    expect(() => parseEnv({ APP_PASSWORD: 'short' }, false)).toThrow(
      'APP_PASSWORD must be at least 12 characters',
    );
  });

  it('treats empty values as unset', () => {
    expect(() => parseEnv({ APP_PASSWORD: '' }, false)).toThrow('APP_PASSWORD is required');
    expect(parseEnv({ APP_PASSWORD: PASSWORD, DATABASE_PATH: '' }, false).DATABASE_PATH).toBe(
      './data/xbase.db',
    );
  });

  it('requires APP_URL in production', () => {
    expect(() => parseEnv({ APP_PASSWORD: PASSWORD }, true)).toThrow(
      'APP_URL is required in production',
    );
  });

  it('reports every problem at once', () => {
    expect(() => parseEnv({ APP_PASSWORD: 'short' }, true)).toThrow(
      /APP_PASSWORD must be at least 12 characters[\s\S]*APP_URL is required in production/,
    );
  });

  it.each([
    ['https://x.example', 'https://x.example'],
    ['https://x.example/', 'https://x.example'],
    ['HTTPS://X.Example:443/', 'https://x.example'],
    ['http://192.168.1.5:3000', 'http://192.168.1.5:3000'],
  ])('keeps the origin of %s', (APP_URL, expected) => {
    expect(parseEnv({ APP_PASSWORD: PASSWORD, APP_URL }, true).APP_URL).toBe(expected);
  });

  it.each([
    ['https://x.example/app', 'without a path'],
    ['https://x.example/?a=1', 'without a path'],
    ['https://x.example/#top', 'without a path'],
    ['https://user:pass@x.example', 'must not contain credentials'],
    ['ftp://x.example', 'must be an http(s) URL'],
    ['x.example', 'must be an http(s) URL'],
  ])('rejects APP_URL=%s', (APP_URL, message) => {
    expect(() => parseEnv({ APP_PASSWORD: PASSWORD, APP_URL }, true)).toThrow(message);
  });
});

describe('needsHttpsWarning', () => {
  const env = (APP_URL: string) => ({
    APP_PASSWORD: PASSWORD,
    APP_URL,
    DATABASE_PATH: 'x',
    TRUST_PROXY_HOPS: 0,
  });

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
