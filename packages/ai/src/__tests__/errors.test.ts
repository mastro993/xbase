import { describe, expect, it } from 'vitest';
import { scrubSecrets } from '../errors';

describe('scrubSecrets', () => {
  const key = 'k3y-without-a-known-prefix';
  it.each([
    ['400: Model not found', '400: Model not found'],
    [`401: bad key ${key}`, '401: bad key …'],
    ['Incorrect API key provided: sk-proj-****abcd.', 'Incorrect API key provided: …'],
    [
      '403: Project `proj_Ab12` cannot use model `gpt-6-luna`',
      '403: Project `…` cannot use model `gpt-6-luna`',
    ],
    [
      '403: buy credits at https://console.x.ai/team/0f8fad5b-d9cb-469f-a165-70867728950e',
      '403: buy credits at https://console.x.ai/team/…',
    ],
    ['org-AbC123 has no access', '… has no access'],
    ['Bad key xai-abc and sk-ant-api03-xyz', 'Bad key … and …'],
  ])('%j -> %j', (message, expected) => expect(scrubSecrets(message, key, 200)).toBe(expected));

  it('works without a key', () => {
    expect(scrubSecrets('plain', '', 200)).toBe('plain');
  });

  it('caps the length, ellipsis included', () => {
    expect(scrubSecrets('x'.repeat(500), key, 200)).toHaveLength(200);
    expect(scrubSecrets('x'.repeat(500), key, 300)).toMatch(/^x{299}…$/);
    expect(scrubSecrets('x'.repeat(300), key, 300)).toBe('x'.repeat(300));
  });
});
