import { defineConfig } from 'vitest/config';

// Pure logic: no DOM or extension APIs needed.
export default defineConfig({ test: { environment: 'node' } });
