import { MIN_PUBLISH_LEAD_MS, type PostDto } from './posts.schema';

// Dates on every page (through LocalTime). The server can't know the reader's time zone, so it
// renders in UTC, hydration renders the same, and then the browser switches to its own zone
// (useClock in use-clock.ts). Every function here takes that choice as a Clock.

// The UI is in English, so dates are too ("Tomorrow", then "Friday, October 30"), whatever the
// browser's language; only its 12- or 24-hour preference carries over.
const LOCALE = 'en-US';

export type Clock = {
  /** A zone to render in, which the text then names. Unset: the browser's own, unnamed. */
  timeZone?: string;
  /** The reader's preference. Unset: the locale's default, 12-hour. */
  hour12?: boolean;
  /** Unset until hydration: words like "Today" depend on the reader's clock. */
  now?: Date;
};

export const SERVER_CLOCK: Clock = { timeZone: 'UTC' };

const zoneName = (clock: Clock) => (clock.timeZone ? ('short' as const) : undefined);

/** The calendar day of `date` in `timeZone`, as YYYY-MM-DD. */
export function dayKey(date: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Calendar arithmetic on the key itself, so a 23- or 25-hour day around a DST change can't skip
// or repeat a date.
function shiftDay(key: string, days: number): string {
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

const sameYear = (date: Date, clock: Clock) =>
  clock.now !== undefined &&
  dayKey(date, clock.timeZone).slice(0, 4) === dayKey(clock.now, clock.timeZone).slice(0, 4);

/** "Today", "Tomorrow", "Yesterday", or the weekday and date. */
export function dayLabel(date: Date, clock: Clock): string {
  if (clock.now) {
    const key = dayKey(date, clock.timeZone);
    const today = dayKey(clock.now, clock.timeZone);
    if (key === today) return 'Today';
    if (key === shiftDay(today, 1)) return 'Tomorrow';
    if (key === shiftDay(today, -1)) return 'Yesterday';
  }
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: clock.timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: sameYear(date, clock) ? undefined : 'numeric',
  }).format(date);
}

/** The time of day: "9:30 AM", or "09:30" for a reader on a 24-hour clock. */
export function formatTime(date: Date, clock: Clock): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: clock.timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: clock.hour12,
    timeZoneName: zoneName(clock),
  }).format(date);
}

/** The full date and time, for a heading or a tooltip. */
export function formatDateTime(date: Date, clock: Clock): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: clock.timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: clock.hour12,
    timeZoneName: zoneName(clock),
  }).format(date);
}

/** The day alone: "Oct 22", with the year when it isn't this one. */
export function formatDate(date: Date, clock: Clock): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: clock.timeZone,
    month: 'short',
    day: 'numeric',
    year: sameYear(date, clock) ? undefined : 'numeric',
  }).format(date);
}

/** A list's short stamp: the time for today, otherwise the date. */
export function formatStamp(date: Date, clock: Clock): string {
  if (clock.now && dayKey(date, clock.timeZone) === dayKey(clock.now, clock.timeZone)) {
    return formatTime(date, clock);
  }
  return formatDate(date, clock);
}

type DayGroup = { key: string; label: string; posts: PostDto[] };

/** Scheduled posts by calendar day, keeping their order. Posts without a time are left out. */
export function groupByDay(posts: readonly PostDto[], clock: Clock): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const post of posts) {
    if (!post.publishAt) continue;
    const date = new Date(post.publishAt);
    const key = dayKey(date, clock.timeZone);
    const group = groups.get(key);
    if (group) group.posts.push(post);
    else groups.set(key, { key, label: dayLabel(date, clock), posts: [post] });
  }
  return [...groups.values()];
}

// <input type="datetime-local"> works in the browser's zone, without one in its value.

const pad = (value: number) => String(value).padStart(2, '0');

/** `date` as a datetime-local value, YYYY-MM-DDTHH:mm, in the browser's zone. */
export function toDateTimeInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A datetime-local value read in the browser's zone, or null when it isn't a whole one. */
export function fromDateTimeInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The `min` of the schedule field: the server's lead time from `now`, plus a minute's margin. */
export function earliestPublishInput(now: Date): string {
  return toDateTimeInput(new Date(now.getTime() + MIN_PUBLISH_LEAD_MS + 60_000));
}

/** A first suggestion: the next full hour at least 30 minutes away. */
export function suggestPublishTime(now: Date): Date {
  const date = new Date(now.getTime() + 30 * 60_000);
  if (date.getMinutes() !== 0 || date.getSeconds() !== 0 || date.getMilliseconds() !== 0) {
    date.setHours(date.getHours() + 1, 0, 0, 0);
  }
  return date;
}
