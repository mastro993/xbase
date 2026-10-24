import { isRedirect } from '@tanstack/react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedAccount } from '@/test/accounts';
import { createTestDb } from '@/test/db';
import { inRequest } from '@/test/request';
import { isPublicPath, pageGuard, PUBLIC_SERVER_FNS, serverFnGuard } from '../guards';
import { issueSession } from '../session.server';

vi.mock('@/server/env.server', () => ({
  getEnv: () => ({ APP_URL: 'https://xbase.test' }),
}));

beforeEach(() => {
  createTestDb();
});

describe('isPublicPath', () => {
  it.each([
    ['/login', true],
    ['/auth/x/start', true],
    ['/auth/x/callback', true],
    ['/api/health', true],
    ['/api/v1/drafts', true],
    ['/mcp', true],
    ['/oauth/token', true],
    ['/oauth/register', true],
    ['/oauth/revoke', true],
    ['/.well-known/oauth-protected-resource/mcp', true],
    ['/', false],
    ['/drafts', false],
    ['/oauth/authorize', false],
    ['/login/extra', false],
    ['/auth/x', false],
    ['/api', false],
    ['/mcpx', false],
  ])('%s -> %s', (pathname, expected) => {
    expect(isPublicPath(pathname)).toBe(expected);
  });
});

async function signedInCookie() {
  const account = seedAccount();
  const { response } = await inRequest(new Request('https://xbase.test/'), () =>
    issueSession(account),
  );
  return response.headers.get('set-cookie')!.split(';')[0];
}

describe('pageGuard', () => {
  const run = (url: string, handlerType: 'router' | 'serverFn' = 'router', cookie?: string) => {
    const request = new Request(url, { headers: cookie ? { cookie } : {} });
    const next = vi.fn(async () => ({
      request,
      pathname: '',
      context: {},
      response: new Response(),
    }));
    const call = inRequest(request, () =>
      pageGuard.options.server!({
        request,
        pathname: new URL(url).pathname,
        context: {},
        handlerType,
        next,
      } as never),
    );
    return { call, next };
  };

  it('sends a signed-out visitor to /login, keeping the page to come back to', async () => {
    const { call, next } = run('https://xbase.test/queue?day=2026-10-23');
    const error = await call.catch((thrown: unknown) => thrown);
    expect(isRedirect(error)).toBe(true);
    expect(error).toMatchObject({
      options: { to: '/login', search: { next: '/queue?day=2026-10-23' } },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ['https://xbase.test/login', 'router'],
    ['https://xbase.test/api/health', 'router'],
    ['https://xbase.test/_serverFn/abc', 'serverFn'],
  ] as const)('lets %s (%s) through', async (url, type) => {
    const { call, next } = run(url, type);
    await call;
    expect(next).toHaveBeenCalledOnce();
  });

  it('lets a signed-in owner through', async () => {
    const { call, next } = run('https://xbase.test/drafts', 'router', await signedInCookie());
    await call;
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('serverFnGuard', () => {
  // A renamed or moved function would otherwise lock everyone out of signing in.
  it.each([...PUBLIC_SERVER_FNS])('allowlists %s, which exists', async (key) => {
    const [file = '', name = ''] = key.split('#');
    const module = (await import(/* @vite-ignore */ `../../../../${file}`)) as object;
    expect(module).toHaveProperty(name);
  });

  const run = (name: string, cookie?: string) => {
    const request = new Request('https://xbase.test/_serverFn/abc', {
      method: 'POST',
      headers: cookie ? { cookie } : {},
    });
    const next = vi.fn(async () => ({}));
    const call = inRequest(request, () =>
      serverFnGuard.options.server!({
        next,
        serverFnMeta: { id: 'abc', name, filename: 'src/features/auth/auth.functions.ts' },
      } as never),
    );
    return { call, next };
  };

  it.each(['getAuthStateFn', 'logoutFn'])('allows %s without a session', async (name) => {
    const { call, next } = run(name);
    await call;
    expect(next).toHaveBeenCalledOnce();
  });

  it('answers 401 for any other function without a session', async () => {
    const { call, next } = run('signOutEverywhereFn');
    const error = await call.catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(401);
    await expect((error as Response).json()).resolves.toMatchObject({ error: 'unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows any function with a session', async () => {
    const { call, next } = run('signOutEverywhereFn', await signedInCookie());
    await call;
    expect(next).toHaveBeenCalledOnce();
  });
});
