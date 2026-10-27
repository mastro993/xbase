import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig, type Plugin } from 'vite';

// Vite prints `localhost` as the local address once it listens on the network. X's sign-in only
// returns to 127.0.0.1, and its cookie only comes back to the host that set it, so send the
// browser there first (see the dev APP_URL in env.ts, @xbase/server).
function localhostTo127(): Plugin {
  return {
    name: 'xbase:localhost-to-127',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const host = req.headers.host;
        if (host !== 'localhost' && !host?.startsWith('localhost:')) return next();
        const port = host.slice('localhost'.length);
        res.writeHead(307, { location: `http://127.0.0.1${port}${req.url ?? '/'}` });
        res.end();
      });
    },
  };
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // The dev APP_URL (env.ts in @xbase/server): X's sign-in only redirects back to 127.0.0.1, not
  // localhost, and the sign-in cookie only comes back to the host that set it. Nitro would
  // otherwise pick port 3000. 5173 comes first, but when it's taken (another checkout, say) Vite
  // moves to the next free port instead of stopping: the app works there, while signing in also
  // needs APP_URL and X's app to name that origin. `host: true` answers other devices on the
  // network too (their sign-ins likewise need their address in APP_URL).
  server: { host: true, port: 5173, strictPort: false },
  plugins: [
    localhostTo127(),
    tailwindcss(),
    tanstackStart({
      // The server-only packages join the *.server.* files the client bundle must never import.
      // Server functions and server routes may: the compiler strips them from the client first.
      importProtection: { client: { specifiers: [/^@xbase\/(db|server|mcp)(\/|$)/] } },
    }),
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
