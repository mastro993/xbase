import { defineConfig } from 'vitest/config';

// Pure logic: no DOM needed. In UTC, so the date helpers give the same results on every machine.
export default defineConfig({ test: { environment: 'node', env: { TZ: 'UTC' } } });
