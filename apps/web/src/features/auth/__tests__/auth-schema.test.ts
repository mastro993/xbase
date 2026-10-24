import { describe, expect, it } from 'vitest';
import { LoginSearch, parseLoginForm, safeNext } from '../auth.schema';

describe('safeNext', () => {
  it.each<[unknown, string]>([
    ['/drafts', '/drafts'],
    ['/queue?day=2026-10-23#top', '/queue?day=2026-10-23#top'],
    ['/oauth/authorize?client_id=a&state=b', '/oauth/authorize?client_id=a&state=b'],
    ['/a/../settings', '/settings'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['/\t/evil.example', '/'],
    ['/\n/evil.example', '/'],
    ['/.//evil.example', '/'],
    ['/..//evil.example', '/'],
    ['/a/..//evil.example', '/'],
    ['/%2e//evil.example', '/'],
    ['/x/../\\evil.example', '/'],
    ['https://evil.example/', '/'],
    ['javascript:alert(1)', '/'],
    ['drafts', '/'],
    ['', '/'],
    [undefined, '/'],
    [42, '/'],
  ])('%j -> %s', (value, expected) => {
    expect(safeNext(value)).toBe(expected);
  });
});

describe('parseLoginForm', () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };

  it('reads the password and a safe next path', () => {
    expect(parseLoginForm(form({ password: 'secret', next: '/queue' }))).toEqual({
      password: 'secret',
      next: '/queue',
    });
    expect(parseLoginForm(form({ password: 'secret', next: '//evil.example' })).next).toBe('/');
  });

  it('turns a missing or oversized password into an empty one', () => {
    expect(parseLoginForm(form({})).password).toBe('');
    expect(parseLoginForm(form({ password: 'x'.repeat(1025) })).password).toBe('');
  });

  it('rejects anything but form data', () => {
    expect(() => parseLoginForm({ password: 'secret' })).toThrow('Expected form data');
  });
});

describe('LoginSearch', () => {
  it('drops values it does not know instead of failing', () => {
    expect(LoginSearch.parse({ next: '/drafts', error: 'invalid' })).toEqual({
      next: '/drafts',
      error: 'invalid',
    });
    expect(LoginSearch.parse({ next: 3, error: 'boom' })).toEqual({});
  });
});
