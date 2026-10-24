import { describe, expect, it } from 'vitest';
import {
  type Clock,
  dayKey,
  dayLabel,
  earliestPublishInput,
  formatDate,
  formatStamp,
  formatTime,
  fromDateTimeInput,
  groupByDay,
  SERVER_CLOCK,
  suggestPublishTime,
  toDateTimeInput,
} from '../dates';
import type { PostDto } from '../posts.schema';

// ICU puts a narrow no-break space before AM/PM.
const plain = (text: string) => text.replace(/\s/g, ' ');

const rome = (now: string, hour12?: boolean): Clock => ({
  timeZone: 'Europe/Rome',
  hour12,
  now: new Date(now),
});

function post(id: string, publishAt: string | null): PostDto {
  return {
    id,
    account: 'xbase',
    status: 'scheduled',
    parts: [id],
    publishAt,
    publishedAt: null,
    xPostId: null,
    error: null,
    origin: 'web',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

describe('dayKey', () => {
  it('reads the calendar day in the given zone', () => {
    const date = new Date('2026-10-23T22:30:00Z');
    expect(dayKey(date, 'UTC')).toBe('2026-10-23');
    expect(dayKey(date, 'Europe/Rome')).toBe('2026-10-24');
    expect(dayKey(date, 'America/New_York')).toBe('2026-10-23');
  });
});

describe('dayLabel', () => {
  it('names today, tomorrow and yesterday in the reader’s zone', () => {
    const clock = rome('2026-10-23T22:30:00Z'); // 00:30 on the 24th in Rome
    expect(dayLabel(new Date('2026-10-24T08:00:00Z'), clock)).toBe('Today');
    expect(dayLabel(new Date('2026-10-24T22:30:00Z'), clock)).toBe('Tomorrow');
    expect(dayLabel(new Date('2026-10-23T12:00:00Z'), clock)).toBe('Yesterday');
    expect(dayLabel(new Date('2026-10-24T08:00:00Z'), { ...SERVER_CLOCK, now: clock.now })).toBe(
      'Tomorrow',
    );
  });

  it('counts calendar days across a daylight saving change', () => {
    // Rome's 25 October 2026 has 25 hours; 24 hours after "now" is still the 25th.
    const clock = rome('2026-10-24T22:30:00Z');
    expect(dayLabel(new Date('2026-10-25T23:30:00Z'), clock)).toBe('Tomorrow');
  });

  it('spells out other days, with the year only when it differs', () => {
    const clock = rome('2026-10-24T08:00:00Z');
    expect(dayLabel(new Date('2026-10-30T08:00:00Z'), clock)).toBe('Friday, October 30');
    expect(dayLabel(new Date('2027-01-05T08:00:00Z'), clock)).toBe('Tuesday, January 5, 2027');
  });

  it('renders a stable date before hydration, when "today" is unknown', () => {
    expect(dayLabel(new Date('2026-10-24T08:00:00Z'), SERVER_CLOCK)).toBe(
      'Saturday, October 24, 2026',
    );
  });
});

describe('formatTime and formatStamp', () => {
  it('names the zone when it renders in one the reader didn’t choose', () => {
    expect(plain(formatTime(new Date('2026-10-24T08:05:00Z'), SERVER_CLOCK))).toBe('8:05 AM UTC');
  });

  it('keeps English words on a 24-hour clock', () => {
    const clock = rome('2026-10-24T08:00:00Z', false);
    // The browser's own zone, unnamed: its offset may move the minutes (India is UTC+5:30).
    expect(plain(formatTime(new Date('2026-10-24T19:05:00Z'), { hour12: false }))).toMatch(
      /^\d{2}:\d{2}$/,
    );
    expect(plain(formatStamp(new Date('2026-10-24T19:05:00Z'), clock))).toBe('21:05 GMT+2');
  });

  it('shows the time for today and the date otherwise', () => {
    const clock = rome('2026-10-24T08:00:00Z');
    expect(plain(formatStamp(new Date('2026-10-24T07:00:00Z'), clock))).toBe('9:00 AM GMT+2');
    expect(formatStamp(new Date('2026-10-22T07:00:00Z'), clock)).toBe('Oct 22');
    expect(formatStamp(new Date('2025-10-22T07:00:00Z'), clock)).toBe('Oct 22, 2025');
    expect(formatStamp(new Date('2026-10-24T07:00:00Z'), SERVER_CLOCK)).toBe('Oct 24, 2026');
  });
});

describe('formatDate', () => {
  it('writes the day in English, with the year only when it isn’t this one', () => {
    const clock = rome('2026-10-24T08:00:00Z');
    expect(formatDate(new Date('2026-10-22T07:00:00Z'), clock)).toBe('Oct 22');
    expect(formatDate(new Date('2025-12-31T23:30:00Z'), clock)).toBe('Jan 1');
    expect(formatDate(new Date('2025-10-22T07:00:00Z'), clock)).toBe('Oct 22, 2025');
  });

  it('renders a stable UTC date before hydration', () => {
    expect(formatDate(new Date('2025-12-31T23:30:00Z'), SERVER_CLOCK)).toBe('Dec 31, 2025');
  });
});

describe('groupByDay', () => {
  it('groups by the reader’s day, keeps the order and skips posts without a time', () => {
    const posts = [
      post('a', '2026-10-23T21:00:00Z'), // 23:00 on the 23rd in Rome
      post('b', '2026-10-23T22:30:00Z'), // 00:30 on the 24th
      post('c', null),
      post('d', '2026-10-24T20:00:00Z'),
    ];
    const groups = groupByDay(posts, rome('2026-10-23T12:00:00Z'));
    expect(groups.map(({ label, posts: items }) => [label, items.map(({ id }) => id)])).toEqual([
      ['Today', ['a']],
      ['Tomorrow', ['b', 'd']],
    ]);
    expect(groupByDay(posts, SERVER_CLOCK).map(({ key }) => key)).toEqual([
      '2026-10-23',
      '2026-10-24',
    ]);
  });
});

describe('the schedule field', () => {
  it('writes and reads datetime-local values in the browser’s zone', () => {
    const date = new Date(2026, 5, 9, 7, 5);
    expect(toDateTimeInput(date)).toBe('2026-06-09T07:05');
    expect(fromDateTimeInput('2026-06-09T07:05')).toEqual(date);
    expect(fromDateTimeInput('2026-06-09T07:05:30')).toEqual(new Date(2026, 5, 9, 7, 5, 30));
  });

  it('rejects partial or invalid values', () => {
    expect(fromDateTimeInput('')).toBeNull();
    expect(fromDateTimeInput('2026-06-09')).toBeNull();
    expect(fromDateTimeInput('2026-06-09T07:05Z')).toBeNull();
    expect(fromDateTimeInput('2026-13-40T07:05')).toBeNull();
  });

  it('offers no time earlier than two minutes from now', () => {
    expect(earliestPublishInput(new Date(2026, 5, 9, 7, 5, 30))).toBe('2026-06-09T07:07');
  });

  it('suggests the next full hour at least 30 minutes away', () => {
    expect(suggestPublishTime(new Date(2026, 5, 9, 9, 10))).toEqual(new Date(2026, 5, 9, 10));
    expect(suggestPublishTime(new Date(2026, 5, 9, 9, 30))).toEqual(new Date(2026, 5, 9, 10));
    expect(suggestPublishTime(new Date(2026, 5, 9, 9, 31))).toEqual(new Date(2026, 5, 9, 11));
    expect(suggestPublishTime(new Date(2026, 5, 9, 23, 45))).toEqual(new Date(2026, 5, 10, 1));
  });
});
