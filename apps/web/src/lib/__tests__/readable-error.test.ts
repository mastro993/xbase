import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readableError } from '../readable-error';

describe('readableError', () => {
  it('keeps a plain message', () => {
    expect(readableError(new Error('Invalid API key'))).toBe('Invalid API key');
  });

  it('drops zod’s marks and field paths', () => {
    const schema = z.object({ name: z.string().min(1, 'Name the key'), id: z.string() });
    const parsed = schema.safeParse({ name: '', id: 1 });
    if (parsed.success) throw new Error('expected a failure');
    const message = z.prettifyError(parsed.error);
    expect(message).toContain('→ at name');
    expect(readableError(new Error(message))).toBe(
      'Name the key Invalid input: expected string, received number',
    );
  });

  it('asks to sign in again after serverFnGuard’s 401', () => {
    expect(readableError(new Response(null, { status: 401 }))).toBe(
      'Your session ended. Reload the page to sign in again.',
    );
    expect(readableError(new Response(null, { status: 500 }))).toBe(
      'Something went wrong. Try again.',
    );
  });

  it('falls back when there is no message', () => {
    expect(readableError(new Error(''))).toBe('Something went wrong. Try again.');
    expect(readableError({ status: 401 })).toBe('Something went wrong. Try again.');
  });
});
