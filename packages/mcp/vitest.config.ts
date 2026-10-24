import { defineConfig } from 'vitest/config';

// Services on an in-memory database (createTestDb in @xbase/db/testing), with fetch stubbed.
export default defineConfig({ test: { environment: 'node' } });
