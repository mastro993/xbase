import { defineConfig } from 'vitest/config';

// Component tests in a DOM. tsconfigPaths resolves BoardUI's @xbase/ui/... imports.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { environment: 'happy-dom', setupFiles: ['./test/setup.ts'] },
});
