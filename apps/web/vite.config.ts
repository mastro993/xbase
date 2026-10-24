import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    // A self-hosted Node server in .output/. The preset is explicit so a CI or host
    // auto-detection (Vercel, Netlify…) can't switch it. The boot plugin checks the
    // environment before the server listens.
    nitro({
      preset: 'node-server',
      plugins: ['./src/server/boot.nitro.ts'],
      rolldownConfig: {
        // "'use client' may not be preserved" notices from BoardUI's components: the directive
        // means nothing in a server bundle.
        onwarn(warning, warn) {
          if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning);
        },
      },
    }),
    // Must come after tanstackStart().
    viteReact(),
  ],
});
