import { createCsrfMiddleware, createStart } from '@tanstack/react-start';
import { pageGuard, serverFnGuard } from './features/auth/guards';
import { serverFnBodyLimit } from './server/body-limit';

// Defining this file turns off the CSRF middleware Start adds by default, so it is added back
// here, for server functions only. Server routes (/api, /mcp, /oauth) are called by other apps
// with bearer tokens or OAuth requests, and check those themselves. The body limit goes first:
// Start reads a server function's body before serverFnGuard runs.
export const startInstance = createStart(() => ({
  requestMiddleware: [
    serverFnBodyLimit,
    createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' }),
    pageGuard,
  ],
  functionMiddleware: [serverFnGuard],
}));
