import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    // Static site: every page reachable by a link is rendered to HTML at build time, so
    // dist/client deploys to any static host. Drop prerender and add a host adapter for SSR.
    tanstackStart({ prerender: { enabled: true, crawlLinks: true } }),
    // Must come after tanstackStart().
    viteReact(),
  ],
});
