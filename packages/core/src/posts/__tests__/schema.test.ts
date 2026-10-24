import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../errors';
import { validator } from '../../validate';
import {
  ApiDraftInput,
  CreateDraftInput,
  ListDraftsInput,
  ListDraftsQuery,
  SchedulePostInput,
} from '../schema';

// The server functions' validators: what the UI and the REST API may send.

describe('validator', () => {
  it('passes valid input through, typed', () => {
    expect(validator(CreateDraftInput)({ parts: ['', 'b'] })).toEqual({ parts: ['', 'b'] });
  });

  it('throws one readable ValidationError naming each problem and where it is', () => {
    const validate = validator(CreateDraftInput) as (data: unknown) => unknown;
    expect(() => validate({ parts: [] })).toThrow(
      new ValidationError('✖ Add at least one post\n  → at parts'),
    );
    expect(() => validate({ parts: ['ok', 42] })).toThrow(/expected string[\s\S]*parts\[1\]/);
    expect(() => validate(null)).toThrow(/expected object/);
  });
});

describe('ApiDraftInput', () => {
  it('needs text in every post', () => {
    expect(ApiDraftInput.safeParse({ parts: ['a', 'b'] }).success).toBe(true);
    const parsed = ApiDraftInput.safeParse({ parts: ['a', '  \n'] });
    expect(parsed.error?.issues).toEqual([
      expect.objectContaining({ message: 'Write some text in every post', path: ['parts', 1] }),
    ]);
  });

  it('caps the thread at 25 posts', () => {
    expect(ApiDraftInput.safeParse({ parts: Array(25).fill('x') }).success).toBe(true);
    expect(ApiDraftInput.safeParse({ parts: Array(26).fill('x') }).success).toBe(false);
  });
});

describe('SchedulePostInput', () => {
  it('turns an ISO time with a zone into a Date', () => {
    expect(
      SchedulePostInput.parse({ id: 'p1', publishAt: '2026-10-24T09:30:00+02:00' }).publishAt,
    ).toEqual(new Date('2026-10-24T07:30:00Z'));
    expect(
      SchedulePostInput.parse({ id: 'p1', publishAt: '2026-10-24T07:30:00.000Z' }).publishAt,
    ).toEqual(new Date('2026-10-24T07:30:00Z'));
  });

  it('rejects a time without a zone, which the server would read in its own', () => {
    const parsed = SchedulePostInput.safeParse({ id: 'p1', publishAt: '2026-10-24T09:30:00' });
    expect(parsed.error?.issues[0]?.message).toMatch(/with a time zone/);
    expect(SchedulePostInput.safeParse({ id: 'p1', publishAt: 'tomorrow' }).success).toBe(false);
  });
});

describe('list inputs', () => {
  it('make the limit optional', () => {
    expect(ListDraftsInput.parse(undefined)).toBeUndefined();
    expect(ListDraftsInput.parse({ limit: 10 })).toEqual({ limit: 10 });
    expect(ListDraftsInput.safeParse({ limit: 201 }).success).toBe(false);
  });

  it('read the REST limit from the query string', () => {
    expect(ListDraftsQuery.parse({})).toEqual({});
    expect(ListDraftsQuery.parse({ limit: '20' })).toEqual({ limit: 20 });
    for (const limit of ['0', '201', '1.5', 'ten', '']) {
      expect(ListDraftsQuery.safeParse({ limit }).success).toBe(false);
    }
  });
});
