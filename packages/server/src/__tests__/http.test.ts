import { describe, expect, it } from 'vitest';
import { json, jsonError } from '../http';

describe('json', () => {
  it('sends JSON that is never cached', async () => {
    const response = json({ ok: true }, { status: 201 });
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('keeps headers the caller sets', () => {
    expect(
      json({}, { headers: { 'Cache-Control': 'public, max-age=60' } }).headers.get('cache-control'),
    ).toBe('public, max-age=60');
  });
});

describe('jsonError', () => {
  it('sends { error, message? } with the status and extra headers', async () => {
    const response = jsonError(401, 'unauthorized', undefined, {
      headers: { 'WWW-Authenticate': 'Bearer' },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
    await expect(jsonError(400, 'invalid', 'Too long').json()).resolves.toEqual({
      error: 'invalid',
      message: 'Too long',
    });
  });
});
