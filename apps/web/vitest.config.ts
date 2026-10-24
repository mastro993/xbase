import { defineConfig } from 'vitest/config';

// Its own config, so test runs don't load vite.config.ts with the Start and Nitro plugins.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // The local-time helpers then give the same results on every machine.
    env: { TZ: 'UTC' },
  },
});
