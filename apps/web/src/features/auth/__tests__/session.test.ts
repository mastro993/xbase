import { createHash } from 'node:crypto';
import { sessions, xAccounts } from '@xbase/db/schema';
import { createTestDb, seedAccount } from '@xbase/db/testing';
import { deleteAllSessions, setSessionAccount } from '@xbase/server/sessions';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inRequest } from '@/test/request';
import {
  issueSession,
  readSession,
  requireSession,
  revokeSession,
  sessionCookie,
} from '../session.server';

const env = vi.hoisted(() => ({ APP_URL: 'https://xbase.test' }));
vi.mock('@xbase/server/env', () => ({ getEnv: () => env }));

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const request = (cookie?: string) =>
  new Request('https://xbase.test/', { headers: cookie ? { cookie } : {} });
const tokenFrom = (response: Response) =>
  /__Host-xbase_session=([^;]+)/.exec(response.headers.get('set-cookie') ?? '')?.[1] ?? '';

let db: ReturnType<typeof createTestDb>;
let account: string;
beforeEach(() => {
  env.APP_URL = 'https://xbase.test';
  db = createTestDb();
  account = seedAccount();
});

const signIn = (cookie?: string) => inRequest(request(cookie), () => issueSession(account));

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
    const { response } = await signIn();
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
    const { response } = await signIn();
    const token = tokenFrom(response);
    const cookie = `__Host-xbase_session=${token}`;

    await expect(inRequest(request(cookie), readSession)).resolves.toMatchObject({
      result: { id: sha256(token), accountId: account },
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
    const first = tokenFrom((await signIn()).response);
    const second = tokenFrom((await signIn(`__Host-xbase_session=${first}`)).response);
    expect(second).not.toBe(first);
    expect(db.select({ id: sessions.id }).from(sessions).all()).toEqual([{ id: sha256(second) }]);
  });

  it('signs out this device, or every device', async () => {
    const a = tokenFrom((await signIn()).response);
    const b = tokenFrom((await signIn()).response);

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

    deleteAllSessions();
    expect(db.select().from(sessions).all()).toEqual([]);
  });
});

describe('the session’s account', () => {
  const read = (cookie: string) => inRequest(request(cookie), readSession).then((r) => r.result);

  it('switches to another linked account', async () => {
    const other = seedAccount({ id: '2002' });
    const token = tokenFrom((await signIn()).response);
    setSessionAccount(sha256(token), other);
    await expect(read(`__Host-xbase_session=${token}`)).resolves.toMatchObject({
      accountId: other,
    });
  });

  it('signs out once its account is removed', async () => {
    const other = seedAccount({ id: '2002' });
    const token = tokenFrom((await signIn()).response);
    setSessionAccount(sha256(token), other);
    db.delete(xAccounts).where(eq(xAccounts.id, other)).run();
    await expect(read(`__Host-xbase_session=${token}`)).resolves.toBeNull();
    expect(db.select().from(sessions).all()).toEqual([]);
  });

  it('answers a call without a session with a 401', async () => {
    const error = await inRequest(request(), requireSession).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(401);
  });
});
