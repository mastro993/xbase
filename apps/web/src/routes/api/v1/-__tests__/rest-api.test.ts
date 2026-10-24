import type { PostDto } from '@xbase/core/posts/schema';
import { posts } from '@xbase/db/schema';
import { createTestDb, seedAccount } from '@xbase/db/testing';
import { createApiKey } from '@xbase/server/api-keys';
import { createDraft } from '@xbase/server/posts';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route as DraftsRoute } from '../drafts';
import { Route as DraftRoute } from '../drafts.$draftId';
import { Route as MeRoute } from '../me';

// This folder starts with "-" so the route generator skips it.

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
type AnyRoute = { options: { server?: { handlers?: unknown } } };

const BASE = 'https://xbase.test/api/v1';
let key: string;
let db: ReturnType<typeof createTestDb>;
let accountId: string;
beforeEach(() => {
  db = createTestDb();
  accountId = seedAccount();
  key = createApiKey('test').key;
});

function call(
  route: AnyRoute,
  method: string,
  { path = '', body, auth = `Bearer ${key}`, params = {} }: CallOptions = {},
): Promise<Response> {
  const handlers = (route.options.server?.handlers ?? {}) as Record<string, Handler>;
  const handler = handlers[method];
  if (!handler) throw new Error(`No ${method} handler`);
  const headers = new Headers(auth ? { authorization: auth } : {});
  const init: RequestInit = { method, headers };
  // Only POST and PATCH carry a body; tests looping over methods pass one for all.
  if (body !== undefined && (method === 'POST' || method === 'PATCH')) {
    headers.set('content-type', 'application/json');
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return handler({ request: new Request(`${BASE}${path}`, init), params });
}
type CallOptions = {
  path?: string;
  body?: unknown;
  auth?: string | null;
  params?: Record<string, string>;
};

const draftParams = (id: string) => ({ params: { draftId: id } });
async function created(parts: string[]): Promise<PostDto> {
  return (await call(DraftsRoute, 'POST', { body: { parts } })).json();
}
const statuses = async (responses: Promise<Response>[]) =>
  (await Promise.all(responses)).map(({ status }) => status);

describe('API key auth', () => {
  it('answers 401 JSON with WWW-Authenticate without a key', async () => {
    const res = await call(MeRoute, 'GET', { auth: null });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Bearer');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      error: 'unauthorized',
      message: 'Send a valid API key as a Bearer token.',
    });
  });

  it.each([
    ['an unknown key', `Bearer xbase_ak_${'A'.repeat(43)}`],
    ['a malformed key', 'Bearer nope'],
  ])('answers 401 invalid_token for %s', async (_, auth) => {
    const res = await call(MeRoute, 'GET', { auth });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"');
    expect((await res.json()).error).toBe('unauthorized');
  });

  it('ignores keys sent any other way', async () => {
    const auths = [key, `Basic ${key}`, 'Bearer', `Bearer ${key} extra`];
    expect(await statuses(auths.map((auth) => call(MeRoute, 'GET', { auth })))).toEqual(
      Array(auths.length).fill(401),
    );
  });

  it('guards every v1 handler', async () => {
    const id = (await created(['x'])).id;
    const options = { auth: null, body: { parts: ['y'] }, ...draftParams(id) };
    const calls = [
      call(DraftsRoute, 'GET', options),
      call(DraftsRoute, 'POST', options),
      call(DraftRoute, 'GET', options),
      call(DraftRoute, 'PATCH', options),
      call(DraftRoute, 'DELETE', options),
    ];
    expect(await statuses(calls)).toEqual([401, 401, 401, 401, 401]);
    expect(db.select().from(posts).all()).toHaveLength(1);
  });
});

describe('other methods', () => {
  it('answer a JSON 405 listing the allowed ones', async () => {
    const res = await call(DraftsRoute, 'ANY');
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, POST');
    expect(await res.json()).toEqual({ error: 'method_not_allowed' });
    expect((await call(DraftRoute, 'ANY')).headers.get('allow')).toBe('GET, PATCH, DELETE');
    expect((await call(MeRoute, 'ANY')).headers.get('allow')).toBe('GET');
  });
});

describe('GET /api/v1/me', () => {
  it('identifies the server, with any scheme casing', async () => {
    const res = await call(MeRoute, 'GET', { auth: `bearer ${key}` });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ app: 'xbase', version: 1 });
  });
});

describe('/api/v1/drafts', () => {
  it('creates a draft from the API and lists it', async () => {
    const res = await call(DraftsRoute, 'POST', { body: { parts: ['Hello', 'World'] } });
    expect(res.status).toBe(201);
    const post: PostDto = await res.json();
    expect(post).toMatchObject({
      account: 'user1001',
      status: 'draft',
      parts: ['Hello', 'World'],
      origin: 'api',
    });

    const list = await call(DraftsRoute, 'GET');
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ items: [post] });
  });

  it('honours ?limit= and rejects a bad one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    for (const text of ['a', 'b', 'c']) {
      createDraft({ accountId, parts: [text], origin: 'api' });
      vi.advanceTimersByTime(1000);
    }
    vi.useRealTimers();
    const res = await call(DraftsRoute, 'GET', { path: '/drafts?limit=2' });
    expect((await res.json()).items.map((post: PostDto) => post.parts[0])).toEqual(['c', 'b']);

    const bad = await call(DraftsRoute, 'GET', { path: '/drafts?limit=500' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({
      error: 'invalid_request',
      message: expect.stringContaining('at most 200'),
    });
  });

  it.each([
    ['an empty post', { parts: ['ok', ''] }, 'Write some text in every post'],
    ['no posts', { parts: [] }, 'Add at least one post'],
    ['a wrong shape', { text: 'hi' }, 'parts'],
    ['a body that is not JSON', '{nope', 'must be JSON'],
  ])('rejects %s with 400', async (_, body, message) => {
    const res = await call(DraftsRoute, 'POST', { body });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'invalid_request',
      message: expect.stringContaining(message),
    });
    expect(db.select().from(posts).all()).toEqual([]);
  });
});

describe('the account of /api/v1/drafts', () => {
  const create = (body: Record<string, unknown>) => call(DraftsRoute, 'POST', { body });
  const invalid = (message: string) => ({ error: 'invalid_request', message });

  it('may be left out, or named with or without the @, while one account is linked', async () => {
    const responses = await Promise.all(
      [undefined, 'user1001', '@USER1001'].map((account) => create({ parts: ['x'], account })),
    );
    expect(responses.map(({ status }) => status)).toEqual([201, 201, 201]);
    const bodies: PostDto[] = await Promise.all(responses.map((res) => res.json()));
    expect(bodies.map((post) => post.account)).toEqual(['user1001', 'user1001', 'user1001']);
  });

  it('is required once several accounts are linked', async () => {
    seedAccount({ id: '2002', username: 'other' });
    const res = await create({ parts: ['x'] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual(invalid('Say which account: @user1001, @other.'));

    const named = await create({ parts: ['x'], account: '@other' });
    expect(named.status).toBe(201);
    expect((await named.json()).account).toBe('other');
  });

  it('answers 400 for an account that isn’t linked or isn’t a username', async () => {
    const unknown = await create({ parts: ['x'], account: '@nobody' });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual(
      invalid('@nobody isn’t linked to XBase. Linked accounts: @user1001.'),
    );
    const malformed = await create({ parts: ['x'], account: 'not a username' });
    expect(malformed.status).toBe(400);
    expect(db.select().from(posts).all()).toEqual([]);
  });

  it('narrows the list with ?account=, which lists every account without it', async () => {
    const other = seedAccount({ id: '2002', username: 'other' });
    createDraft({ accountId, parts: ['mine'], origin: 'api' });
    createDraft({ accountId: other, parts: ['theirs'], origin: 'api' });
    const accounts = async (path: string) =>
      (await (await call(DraftsRoute, 'GET', { path })).json()).items.map(
        (post: PostDto) => post.account,
      );

    expect(await accounts('/drafts?account=other')).toEqual(['other']);
    expect(await accounts('/drafts?account=%40user1001')).toEqual(['user1001']);
    expect(new Set(await accounts('/drafts'))).toEqual(new Set(['other', 'user1001']));
    const unknown = await call(DraftsRoute, 'GET', { path: '/drafts?account=nobody' });
    expect(unknown.status).toBe(400);
  });
});

describe('/api/v1/drafts/:draftId', () => {
  it('reads, updates and deletes a draft', async () => {
    const post = await created(['first']);

    const got = await call(DraftRoute, 'GET', draftParams(post.id));
    expect(await got.json()).toEqual(post);

    const patched = await call(DraftRoute, 'PATCH', {
      ...draftParams(post.id),
      body: { parts: ['second', 'third'] },
    });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ id: post.id, parts: ['second', 'third'] });

    const deleted = await call(DraftRoute, 'DELETE', draftParams(post.id));
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe('');

    const gone = await call(DraftRoute, 'GET', draftParams(post.id));
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: 'not_found', message: 'Post not found.' });
  });

  it('answers 404 for an unknown id on every method', async () => {
    const options = { ...draftParams('nope'), body: { parts: ['x'] } };
    const methods = ['GET', 'PATCH', 'DELETE'];
    expect(await statuses(methods.map((method) => call(DraftRoute, method, options)))).toEqual([
      404, 404, 404,
    ]);
  });

  it('answers 400 for an empty post on PATCH', async () => {
    const post = await created(['x']);
    const res = await call(DraftRoute, 'PATCH', {
      ...draftParams(post.id),
      body: { parts: [' '] },
    });
    expect(res.status).toBe(400);
  });

  it('answers 409 when the post is already on X', async () => {
    const post = await created(['x']);
    db.update(posts).set({ status: 'published' }).where(eq(posts.id, post.id)).run();
    const options = { ...draftParams(post.id), body: { parts: ['y'] } };
    const responses = await Promise.all([
      call(DraftRoute, 'PATCH', options),
      call(DraftRoute, 'DELETE', options),
    ]);
    const bodies = await Promise.all(responses.map((res) => res.json()));
    expect(responses.map(({ status }) => status)).toEqual([409, 409]);
    expect(bodies).toEqual([
      { error: 'invalid_state', message: "This post is already on X, so it can't be changed." },
      { error: 'invalid_state', message: "This post is already on X, so it can't be changed." },
    ]);
  });

  it('answers a JSON 500 for an unexpected error, without details', async () => {
    const post = await created(['x']);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.$client.exec('DROP TABLE posts');
    const res = await call(DraftRoute, 'GET', draftParams(post.id));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'internal_error',
      message: 'Something went wrong on the server.',
    });
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
