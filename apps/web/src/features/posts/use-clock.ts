import { useMemo, useSyncExternalStore } from 'react';
import { type Clock, SERVER_CLOCK } from './dates';

// The current minute, shared by every reader through one timer. The server snapshot is null, so
// the server and the hydrating browser both render in UTC; then React rerenders in local time.
// Later mounts read the browser's minute at once, and "Today" turns over at midnight.

const MINUTE = 60_000;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  timer ??= setInterval(() => {
    for (const notify of listeners) notify();
  }, MINUTE);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const currentMinute = () => Math.floor(Date.now() / MINUTE);
const serverMinute = () => null;
let hour12: boolean | undefined;
function clockAt(minute: number | null): Clock {
  if (minute === null) return SERVER_CLOCK;
  // Only reached in the browser: the server snapshot is null.
  hour12 ??= new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12;
  return { now: new Date(minute * MINUTE), hour12 };
}

/** UTC on the server and while hydrating; then the browser's zone, clock and current day. */
export function useClock(): Clock {
  const minute = useSyncExternalStore(subscribe, currentMinute, serverMinute);
  return useMemo(() => clockAt(minute), [minute]);
}
