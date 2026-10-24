import {
  createRootRoute,
  HeadContent,
  Scripts,
  useRouter,
  type NavigateOptions,
} from '@tanstack/react-router';
import colorSchemeScript from '@xbase/ui/lib/color-scheme.js?raw';
import type { ReactNode } from 'react';
import { RouterProvider } from 'react-aria-components';
import { ButtonRouterLink } from '@/features/shell/router-links';
import { StatusPage } from '@/features/shell/StatusPage';
import appCss from '../styles.css?url';

// React Aria's links (Link, and a Tab, MenuItem or ListBoxItem with an href) take a plain href;
// routerOptions passes TanStack's navigation options through, e.g. routerOptions={{ replace: true }}.
declare module 'react-aria-components' {
  interface RouterConfig {
    routerOptions: Omit<NavigateOptions, 'to' | 'from' | 'href' | 'params' | 'search' | 'hash'>;
  }
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'XBase' },
      // A private, self-hosted app: keep it out of search engines.
      { name: 'robots', content: 'noindex, nofollow' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  // Every page shows the owner's data: no caching, no framing, no referrer to other sites.
  headers: () => ({
    'Cache-Control': 'private, no-store',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFoundPage,
});

function RootDocument({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    // The color-scheme script adds the dark class before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking, in <head>: the class is set before <body> is parsed, so a dark-mode page
            never paints light first. Inline: the server can't know the OS theme. */}
        <script dangerouslySetInnerHTML={{ __html: colorSchemeScript }} />
        <HeadContent />
      </head>
      <body>
        {/* React Aria's links navigate through TanStack Router instead of reloading the page. No
            useHref: without a basepath, an href is already the URL the browser shows. */}
        <RouterProvider navigate={(href, options) => void router.navigate({ ...options, href })}>
          {children}
        </RouterProvider>
        <Scripts />
      </body>
    </html>
  );
}

function NotFoundPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <StatusPage
        code={404}
        title="Nothing lives at this address"
        description="The link may be mistyped, or the page has moved."
        actions={<ButtonRouterLink to="/">Go to XBase</ButtonRouterLink>}
      />
    </main>
  );
}
