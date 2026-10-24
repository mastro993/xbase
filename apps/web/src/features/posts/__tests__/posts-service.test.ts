import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidStateError, NotFoundError, ValidationError } from '@/lib/errors';
import { type PostStatus, posts } from '@/server/db/schema';
import { createTestDb } from '@/test/db';
import {
  createDraft,
  deletePost,
  getPost,
  listDrafts,
  listScheduled,
  schedulePost,
  unschedulePost,
  updateDraft,
} from '../posts.server';

const MINUTE = 60_000;
const NOW = new Date('2026-10-23T12:00:00.000Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);

let db: ReturnType<typeof createTestDb>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  db = createTestDb();
});
afterEach(() => {
  vi.useRealTimers();
});

const draft = (...parts: string[]) => createDraft({ parts, origin: 'web' });
/** Puts a post straight into a state the service only reaches through publishing. */
const force = (id: string, status: PostStatus, publishAt: Date | null = later(5)) =>
  db.update(posts).set({ status, publishAt }).where(eq(posts.id, id)).run();

describe('createDraft', () => {
  it('stores a thread and answers with the shared DTO', () => {
    const post = draft('First', 'Second');
    expect(post).toEqual({
      id: expect.any(String),
      status: 'draft',
      parts: ['First', 'Second'],
      publishAt: null,
      publishedAt: null,
      xPostId: null,
      error: null,
      origin: 'web',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(getPost(post.id)).toEqual(post);
  });

  it('allows empty texts while writing, but not empty or oversized threads', () => {
    expect(draft('').parts).toEqual(['']);
    expect(() => draft()).toThrow(ValidationError);
    expect(() => draft(...Array.from({ length: 26 }, () => 'x'))).toThrow(/at most 25 posts/);
    expect(() => draft('x'.repeat(25_001))).toThrow(/at most 25,000 characters/);
  });

  it('records where the post came from', () => {
    expect(createDraft({ parts: ['From the API'], origin: 'api' }).origin).toBe('api');
  });
});

describe('getPost', () => {
  it('throws NotFoundError for an unknown id', () => {
    expect(() => getPost('nope')).toThrow(NotFoundError);
  });
});

describe('listDrafts', () => {
  it('lists drafts and failed posts, last edited first, up to the limit', () => {
    const a = draft('a');
    vi.setSystemTime(later(1));
    draft('b');
    vi.setSystemTime(later(2));
    const c = draft('c');
    force(c.id, 'scheduled');
    vi.setSystemTime(later(3));
    updateDraft(a.id, { parts: ['a, edited'] });
    const failed = draft('failed');
    force(failed.id, 'failed');

    expect(listDrafts().map(({ parts }) => parts[0])).toEqual(['failed', 'a, edited', 'b']);
    expect(listDrafts({ limit: 1 })).toHaveLength(1);
    expect(listDrafts({ limit: 0 })).toHaveLength(1);
    expect(listDrafts({ limit: 1000 })).toHaveLength(3);
  });
});

describe('updateDraft', () => {
  it('replaces the texts and bumps updatedAt', () => {
    const post = draft('old');
    vi.setSystemTime(later(1));
    expect(updateDraft(post.id, { parts: ['new', ''] })).toMatchObject({
      parts: ['new', ''],
      updatedAt: later(1).toISOString(),
      createdAt: NOW.toISOString(),
    });
  });

  it('keeps a scheduled post scheduled, as long as every post has text', () => {
    const post = draft('soon');
    schedulePost(post.id, later(10));
    expect(updateDraft(post.id, { parts: ['sooner'] })).toMatchObject({
      status: 'scheduled',
      publishAt: later(10).toISOString(),
    });
    expect(() => updateDraft(post.id, { parts: ['ok', ' '] })).toThrow(
      'Post 2 of the thread is empty.',
    );
  });

  it.each(['publishing', 'published'] as const)('refuses a %s post', (status) => {
    const post = draft('x');
    force(post.id, status);
    expect(() => updateDraft(post.id, { parts: ['y'] })).toThrow(InvalidStateError);
  });

  it('throws NotFoundError for an unknown id', () => {
    expect(() => updateDraft('nope', { parts: ['x'] })).toThrow(NotFoundError);
  });
});

describe('deletePost', () => {
  it('deletes drafts, scheduled and failed posts', () => {
    for (const status of ['draft', 'scheduled', 'failed'] as const) {
      const post = draft(status);
      force(post.id, status);
      deletePost(post.id);
      expect(() => getPost(post.id)).toThrow(NotFoundError);
    }
  });

  it.each(['publishing', 'published'] as const)('refuses a %s post', (status) => {
    const post = draft('x');
    force(post.id, status);
    expect(() => deletePost(post.id)).toThrow(InvalidStateError);
    expect(getPost(post.id).status).toBe(status);
  });

  it('throws NotFoundError for an unknown id', () => {
    expect(() => deletePost('nope')).toThrow(NotFoundError);
  });
});

describe('schedulePost', () => {
  it('schedules a draft at least a minute ahead', () => {
    const post = draft('Hello');
    expect(schedulePost(post.id, later(1))).toMatchObject({
      status: 'scheduled',
      publishAt: later(1).toISOString(),
    });
  });

  it('rejects a time in the past or less than a minute away', () => {
    const post = draft('Hello');
    expect(() => schedulePost(post.id, later(-5))).toThrow('at least a minute from now');
    expect(() => schedulePost(post.id, new Date(NOW.getTime() + MINUTE - 1))).toThrow(
      ValidationError,
    );
    expect(() => schedulePost(post.id, new Date(Number.NaN))).toThrow(ValidationError);
    expect(getPost(post.id).status).toBe('draft');
  });

  it('rejects a post with an empty part', () => {
    expect(() => schedulePost(draft('  ').id, later(10))).toThrow('Write something first.');
    expect(() => schedulePost(draft('one', '').id, later(10))).toThrow(
      'Post 2 of the thread is empty.',
    );
  });

  it('moves a scheduled post and retries a failed one, clearing its error', () => {
    const post = draft('x');
    schedulePost(post.id, later(10));
    expect(schedulePost(post.id, later(20)).publishAt).toBe(later(20).toISOString());

    db.update(posts)
      .set({ status: 'failed', error: 'X said no' })
      .where(eq(posts.id, post.id))
      .run();
    expect(schedulePost(post.id, later(30))).toMatchObject({ status: 'scheduled', error: null });
  });

  it.each(['publishing', 'published'] as const)('refuses a %s post', (status) => {
    const post = draft('x');
    force(post.id, status);
    expect(() => schedulePost(post.id, later(10))).toThrow(InvalidStateError);
  });

  it('throws NotFoundError for an unknown id', () => {
    expect(() => schedulePost('nope', later(10))).toThrow(NotFoundError);
  });
});

describe('unschedulePost', () => {
  it('turns a scheduled or failed post back into a draft', () => {
    const post = draft('x');
    schedulePost(post.id, later(10));
    expect(unschedulePost(post.id)).toMatchObject({ status: 'draft', publishAt: null });

    force(post.id, 'failed');
    expect(unschedulePost(post.id)).toMatchObject({ status: 'draft', publishAt: null });
  });

  it('leaves a draft as it is', () => {
    const post = draft('x');
    expect(unschedulePost(post.id)).toEqual(post);
  });

  it.each(['publishing', 'published'] as const)('refuses a %s post', (status) => {
    const post = draft('x');
    force(post.id, status);
    expect(() => unschedulePost(post.id)).toThrow(InvalidStateError);
  });
});

describe('listScheduled', () => {
  it('lists posts with a publish time, soonest first, within [from, to)', () => {
    const late = draft('late');
    const early = draft('early');
    const failed = draft('failed');
    const sending = draft('sending');
    draft('just a draft');
    const published = draft('published');
    schedulePost(late.id, later(60));
    schedulePost(early.id, later(10));
    force(failed.id, 'failed', later(30));
    force(sending.id, 'publishing', later(20));
    force(published.id, 'published', later(15));

    const texts = (list: { parts: string[] }[]) => list.map(({ parts }) => parts[0]);
    expect(texts(listScheduled())).toEqual(['early', 'sending', 'failed', 'late']);
    expect(texts(listScheduled({ from: later(20), to: later(60) }))).toEqual(['sending', 'failed']);
  });

  it('skips failed posts that never had a time', () => {
    force(draft('x').id, 'failed', null);
    expect(listScheduled()).toEqual([]);
  });
});
