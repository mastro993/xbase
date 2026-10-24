import { defineConfig } from 'vitest/config';

// Pure logic with fetch stubbed: no DOM needed.
export default defineConfig({ test: { environment: 'node' } });
