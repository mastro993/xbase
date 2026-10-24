import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// Default environment is node; DOM tests opt in with `// @vitest-environment happy-dom`.
// tsconfigPaths resolves @xbase/ui's BoardUI sources, which import each other by that alias.
export default defineConfig({ plugins: [WxtVitest()], resolve: { tsconfigPaths: true } });
