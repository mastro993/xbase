import { describe, expect, it } from 'vitest';
import { LoginSearch, safeNext } from '../auth.schema';

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

describe('LoginSearch', () => {
  it('drops values it does not know instead of failing', () => {
    expect(LoginSearch.parse({ next: '/drafts', error: 'not_linked' })).toEqual({
      next: '/drafts',
      error: 'not_linked',
    });
    expect(LoginSearch.parse({ next: 3, error: 'invalid' })).toEqual({});
  });
});
