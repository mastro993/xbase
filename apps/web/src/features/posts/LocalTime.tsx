import { useMemo } from 'react';
import { formatDate, formatDateTime, formatStamp, formatTime } from './dates';
import { useClock } from './use-clock';

const FORMATS = {
  time: formatTime,
  date: formatDate,
  dateTime: formatDateTime,
  stamp: formatStamp,
};

type LocalTimeProps = {
  /** An ISO 8601 time. */
  value: string;
  /**
   * `time` "9:30 AM", `date` "Oct 22", `dateTime` the full date and time, `stamp` the time today
   * or the date.
   */
  format: keyof typeof FORMATS;
};

/** A time in the reader's zone, with the full date and time on hover. */
export function LocalTime({ value, format }: LocalTimeProps) {
  const clock = useClock();
  const date = useMemo(() => new Date(value), [value]);
  return (
    <time dateTime={value} title={formatDateTime(date, clock)}>
      {FORMATS[format](date, clock)}
    </time>
  );
}
