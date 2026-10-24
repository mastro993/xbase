import { createRouter } from '@tanstack/react-router';
import { ErrorPage } from './features/shell/ErrorPage';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Instead of TanStack's unstyled fallback when a loader or a navigation fails.
    defaultErrorComponent: ErrorPage,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
