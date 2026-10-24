import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessions } from '@/server/db/schema';
import { createTestDb } from '@/test/db';
import { inRequest } from '@/test/request';
import { loginLimiter } from '../rate-limit.server';
import {
  attemptLogin,
  checkPassword,
  issueSession,
  readSession,
  revokeAllSessions,
  revokeSession,
  sessionCookie,
} from '../session.server';

const env = vi.hoisted(() => ({
  APP_PASSWORD: 'correct horse battery',
  APP_URL: 'https://xbase.test',
  DATABASE_PATH: ':memory:',
  TRUST_PROXY_HOPS: 0,
}));
vi.mock('@/server/env.server', () => ({ getEnv: () => env }));

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const request = (cookie?: string) =>
  new Request('https://xbase.test/', { headers: cookie ? { cookie } : {} });
const tokenFrom = (response: Response) =>
  /__Host-xbase_session=([^;]+)/.exec(response.headers.get('set-cookie') ?? '')?.[1] ?? '';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => {
  env.APP_URL = 'https://xbase.test';
  env.TRUST_PROXY_HOPS = 0;
  db = createTestDb();
  for (const key of ['unknown', '198.51.100.1', '198.51.100.2']) loginLimiter.reset(key);
});

describe('checkPassword', () => {
  it.each([
    ['correct horse battery', true],
    ['correct horse batter', false],
    ['correct horse battery ', false],
    ['', false],
  ])('%j -> %s', (input, expected) => {
    expect(checkPassword(input)).toBe(expected);
  });
});

describe('sessionCookie', () => {
  it('uses the __Host- prefix and Secure over HTTPS', () => {
    expect(sessionCookie()).toEqual({
      name: '__Host-xbase_session',
      options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
    });
  });

  it('drops both over plain HTTP, where browsers would refuse the cookie', () => {
    env.APP_URL = 'http://192.168.1.5:3000';
    expect(sessionCookie()).toMatchObject({ name: 'xbase_session', options: { secure: false } });
  });
});

describe('sessions', () => {
  it('sets an HttpOnly, Lax cookie for 30 days and stores only its hash', async () => {
    const { response } = await inRequest(request(), issueSession);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^__Host-xbase_session=[\w-]{43};/);
    expect(cookie).toContain('Max-Age=2592000');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');

    const token = tokenFrom(response);
    expect(db.select().from(sessions).all()).toEqual([
      expect.objectContaining({ id: sha256(token) }),
    ]);
  });

  it('reads a valid session and ignores unknown or expired ones', async () => {
    const { response } = await inRequest(request(), issueSession);
    const token = tokenFrom(response);
    const cookie = `__Host-xbase_session=${token}`;

    await expect(inRequest(request(cookie), readSession)).resolves.toMatchObject({
      result: { id: sha256(token) },
    });
    await expect(
      inRequest(request('__Host-xbase_session=nope'), readSession),
    ).resolves.toMatchObject({ result: null });
    await expect(inRequest(request(), readSession)).resolves.toMatchObject({ result: null });

    db.update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .run();
    await expect(inRequest(request(cookie), readSession)).resolves.toMatchObject({ result: null });
  });

  it('replaces the old session on sign-in', async () => {
    const first = tokenFrom((await inRequest(request(), issueSession)).response);
    const second = tokenFrom(
      (await inRequest(request(`__Host-xbase_session=${first}`), issueSession)).response,
    );
    expect(second).not.toBe(first);
    expect(db.select({ id: sessions.id }).from(sessions).all()).toEqual([{ id: sha256(second) }]);
  });

  it('signs out this device, or every device', async () => {
    const a = tokenFrom((await inRequest(request(), issueSession)).response);
    const b = tokenFrom((await inRequest(request(), issueSession)).response);

    const { response } = await inRequest(request(`__Host-xbase_session=${a}`), revokeSession);
    expect(response.headers.get('set-cookie')).toMatch(/^__Host-xbase_session=;.*Max-Age=0/);
    expect(
      db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sha256(a)))
        .all(),
    ).toEqual([]);
    expect(
      db
        .select()
        .from(sessions)
        .where(eq(sessions.id, sha256(b)))
        .all(),
    ).toHaveLength(1);

    revokeAllSessions();
    expect(db.select().from(sessions).all()).toEqual([]);
  });
});

describe('attemptLogin', () => {
  it('starts a session for the right password', async () => {
    const { result, response } = await inRequest(request(), () =>
      attemptLogin('correct horse battery'),
    );
    expect(result).toBeNull();
    expect(tokenFrom(response)).not.toBe('');
  });

  it('rejects a wrong password without a cookie', async () => {
    const { result, response } = await inRequest(request(), () => attemptLogin('guess'));
    expect(result).toBe('invalid');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('stops checking after 10 wrong passwords, even the right one', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () => inRequest(request(), () => attemptLogin('guess'))),
    );
    expect(attempts.map(({ result }) => result)).toEqual(Array(10).fill('invalid'));
    const { result, response } = await inRequest(request(), () =>
      attemptLogin('correct horse battery'),
    );
    expect(result).toBe('rate_limited');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('counts each client behind a trusted proxy on its own', async () => {
    env.TRUST_PROXY_HOPS = 1;
    const via = (client: string) =>
      new Request('https://xbase.test/', { headers: { 'x-forwarded-for': `6.6.6.6, ${client}` } });
    await Promise.all(
      Array.from({ length: 10 }, () => inRequest(via('198.51.100.1'), () => attemptLogin('guess'))),
    );
    await expect(
      inRequest(via('198.51.100.1'), () => attemptLogin('correct horse battery')),
    ).resolves.toMatchObject({ result: 'rate_limited' });
    await expect(
      inRequest(via('198.51.100.2'), () => attemptLogin('correct horse battery')),
    ).resolves.toMatchObject({ result: null });
  });
});
