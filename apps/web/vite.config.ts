import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // The dev APP_URL (env.server.ts): X's sign-in only redirects back to 127.0.0.1, not localhost,
  // and the sign-in cookie only comes back to the host that set it. Nitro would otherwise pick
  // port 3000; strictPort stops `pnpm dev` when 5173 is taken instead of moving to a port X
  // won't redirect to.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
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
