import { describe, expect, it, vi } from 'vitest';
import { MAX_PART_LENGTH, MAX_PARTS } from '@/features/posts/posts.schema';
import { MAX_SERVER_FN_BODY, serverFnBodyLimit } from '../body-limit';

function run(
  init: { method?: string; headers?: Record<string, string> },
  handlerType: 'serverFn' | 'router' = 'serverFn',
) {
  const request = new Request('https://xbase.test/_serverFn/abc', init);
  const next = vi.fn(async () => ({
    request,
    pathname: '',
    context: {},
    response: new Response(),
  }));
  const result = serverFnBodyLimit.options.server!({
    request,
    pathname: '/_serverFn/abc',
    context: {},
    handlerType,
    next,
  } as never);
  return { result: result as Response | Promise<unknown>, next };
}

describe('serverFnBodyLimit', () => {
  it('leaves room for the largest thread a draft can hold', () => {
    // Seroval, then JSON, can take up to 7 bytes for one UTF-16 unit.
    expect(MAX_SERVER_FN_BODY).toBeGreaterThan(MAX_PARTS * MAX_PART_LENGTH * 7);
  });

  it('refuses a body over the limit before anything reads it', async () => {
    const { result, next } = run({
      method: 'POST',
      headers: { 'content-length': String(MAX_SERVER_FN_BODY + 1) },
    });
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(413);
    await expect((result as Response).json()).resolves.toMatchObject({
      error: 'payload_too_large',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('asks for a length when the body is chunked', () => {
    const { result, next } = run({ method: 'POST', headers: { 'transfer-encoding': 'chunked' } });
    expect((result as Response).status).toBe(411);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ['a normal POST', { method: 'POST', headers: { 'content-length': '512' } }],
    ['a POST without a body', { method: 'POST' }],
    ['a GET', { method: 'GET' }],
  ])('lets %s through', async (_, init) => {
    const { result, next } = run(init);
    await result;
    expect(next).toHaveBeenCalledOnce();
  });

  it('leaves pages and server routes alone', async () => {
    const { result, next } = run(
      { method: 'POST', headers: { 'content-length': String(MAX_SERVER_FN_BODY + 1) } },
      'router',
    );
    await result;
    expect(next).toHaveBeenCalledOnce();
  });
});
