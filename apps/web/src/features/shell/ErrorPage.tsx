import { type ErrorComponentProps, useMatch, useRouter } from '@tanstack/react-router';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { readableError } from '@/lib/readable-error';
import { ButtonRouterLink } from './router-links';
import { StatusPage } from './StatusPage';

/**
 * The router's error page, for a loader or a navigation that failed: often the server restarting
 * or the network dropping. A page inside the shell keeps the rail; a workbench (a page inside a
 * list page, such as /drafts/$draftId) sits under the list page's h1, so its title is an h2.
 */
export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const routeId: string = useMatch({ strict: false, select: (match) => match.routeId }) ?? '';
  const inShell = routeId.startsWith('/_authed/');
  const inWorkbench = inShell && routeId.split('/').length > 3;
  // "Failed to fetch" and the like end without a full stop.
  const detail = readableError(error).replace(/[.!?]?$/, (end) => end || '.');

  const page = (
    <StatusPage
      code={500}
      title="Something went wrong"
      headingLevel={inWorkbench ? 2 : 1}
      description={`${detail} If XBase is restarting, try again in a moment.`}
      actions={
        <>
          <Button
            onClick={() => {
              reset();
              void router.invalidate();
            }}
          >
            Try again
          </Button>
          <ButtonRouterLink to="/" variant="secondary">
            Go to XBase
          </ButtonRouterLink>
        </>
      }
    />
  );
  // The shell already has a <main>.
  return inShell ? (
    <div className="flex min-h-full items-center justify-center p-6">{page}</div>
  ) : (
    <main className="flex min-h-svh items-center justify-center p-6">{page}</main>
  );
}
