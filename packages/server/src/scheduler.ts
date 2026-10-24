export type ScheduledJob = {
  name: string;
  intervalMs: number;
  run: (now: Date) => unknown;
};

export type Scheduler = { stop: () => void };

/**
 * Runs a job right away, then every `intervalMs`. A tick that outlives the interval makes the
 * next one skip rather than overlap, and a failing tick is logged without stopping the job.
 */
export function startScheduler({ name, intervalMs, run }: ScheduledJob): Scheduler {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await run(new Date());
    } catch (error) {
      console.error(`[scheduler] ${name} failed`, error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  // Never keep the process alive just for the timer.
  timer.unref();
  void tick();
  return { stop: () => clearInterval(timer) };
}
