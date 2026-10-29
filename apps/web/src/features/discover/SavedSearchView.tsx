import {
  Delete02Icon,
  ExternalLinkIcon,
  PencilEdit01Icon,
  SearchFocusIcon,
} from '@hugeicons/core-free-icons';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import type { CandidateDto, SavedSearchDto } from '@xbase/core/discover';
import { ButtonLink } from '@xbase/ui/components/base/buttons/button';
import { Switch } from '@xbase/ui/components/base/switch/switch';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { useRef, useState } from 'react';
import { ADD_ACCOUNT_HREF } from '@/features/accounts/AccountMenu';
import { LocalTime } from '@/features/posts/LocalTime';
import { ConfirmButton } from '@/features/shell/ConfirmButton';
import { EmptyState } from '@/features/shell/EmptyState';
import { focusPageHeading } from '@/lib/focus';
import { readableError } from '@/lib/readable-error';
import { CandidateCard } from './CandidateCard';
import { deleteSavedSearchFn, setSavedSearchEnabledFn } from './discover.functions';
import { RunDiscoveryButton } from './RunDiscoveryButton';
import { SavedSearchDialog } from './SavedSearchDialog';

/** X's own search, newest first: handy beside the posts XBase read for the search. */
const xSearchUrl = (query: string) =>
  `https://x.com/search?${new URLSearchParams({ q: query, f: 'live' })}`;

/** Why a search shows no candidates, in the words that fit the reason. */
function emptyCopy({
  enabled,
  canRead,
  lastRunAt,
}: {
  enabled: boolean;
  canRead: boolean;
  lastRunAt: string | null;
}) {
  if (!canRead) {
    return {
      title: 'Results need the X API',
      description:
        'X no longer accepts this account’s access, so XBase can’t read posts with it. Sign in again to fill this search with fresh posts.',
    };
  }
  if (!enabled) {
    return {
      title: 'This search is off',
      description: 'Runs skip it until you turn it back on. Candidates already found stay here.',
    };
  }
  if (lastRunAt === null) {
    return {
      title: 'No candidates yet',
      description:
        'Run discovery to read your home timeline and this search. Fresh original and quote posts show up here, in full, unless your filters leave them out.',
    };
  }
  return {
    title: 'Nothing to reply to here',
    description:
      'What the last run found was a reply or a repost, older than your age cap, left out by your filters, or already skipped or replied to.',
  };
}

/**
 * The Discover workbench: one saved search, whether runs read it, when it last ran, and the
 * candidates that run stored. A manual run reads the home timeline and every enabled search, so
 * the button here fills the other searches too.
 */
export function SavedSearchView({
  search,
  candidates,
  canRead,
}: {
  search: SavedSearchDto;
  candidates: CandidateDto[];
  /** Whether the account's X access still works; when it doesn't, the empty state asks to reconnect. */
  canRead: boolean;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const deleteSearch = useServerFn(deleteSavedSearchFn);
  const setEnabled = useServerFn(setSavedSearchEnabledFn);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidatesHeading = useRef<HTMLHeadingElement>(null);
  const [announcement, setAnnouncement] = useState('');

  // The card and the button that had the focus are gone: say what happened and go to the list.
  // Cleared first, so the same message twice in a row is still announced.
  const handled = (message: string) => {
    setAnnouncement('');
    requestAnimationFrame(() => {
      setAnnouncement(message);
      candidatesHeading.current?.focus();
    });
  };
  const empty = emptyCopy({ enabled: search.enabled, canRead, lastRunAt: search.lastRunAt });

  // Leave first, so the workbench never renders a search that's gone.
  const destroy = async () => {
    await deleteSearch({ data: { id: search.id } });
    await navigate({ to: '/discover' });
    await router.invalidate();
    focusPageHeading();
  };

  const toggle = async (enabled: boolean) => {
    if (toggling) return;
    setToggling(true);
    setError(null);
    try {
      await setEnabled({ data: { id: search.id, enabled } });
      await router.invalidate();
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-title-3-semibold break-words text-text-primary">{search.name}</h2>
          <code className="rounded-xl bg-background-secondary-default px-3 py-2 font-mono text-body-2-regular break-all text-text-primary">
            {search.query}
          </code>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConfirmButton
            leadingIcon={Delete02Icon}
            title={`Delete “${search.name}”?`}
            description="The saved search is gone for good. This can’t be undone."
            action="Delete"
            errorTitle="Couldn’t delete"
            onConfirm={destroy}
          >
            Delete
          </ConfirmButton>
          <SavedSearchDialog search={search} variant="secondary" leadingIcon={PencilEdit01Icon}>
            Edit
          </SavedSearchDialog>
          <ButtonLink
            href={xSearchUrl(search.query)}
            target="_blank"
            rel="noreferrer"
            leadingIcon={ExternalLinkIcon}
          >
            Search on X<span className="sr-only"> (opens in a new tab)</span>
          </ButtonLink>
        </div>
      </header>

      <section
        aria-label="Run status"
        className="flex flex-col gap-3 rounded-3xl border border-border-button-default bg-background-primary-default p-4"
      >
        <Switch
          isSelected={search.enabled}
          isDisabled={toggling}
          onChange={(enabled) => void toggle(enabled)}
        >
          Run this search
        </Switch>
        <p className="text-body-2-regular text-text-secondary">
          {search.lastRunAt === null ? (
            'Not run yet.'
          ) : (
            <>
              Last run <LocalTime value={search.lastRunAt} format="dateTime" /> ·{' '}
              {search.lastCandidateCount.toLocaleString('en-US')}{' '}
              {search.lastCandidateCount === 1 ? 'candidate' : 'candidates'}
            </>
          )}
        </p>
        {canRead && <RunDiscoveryButton />}
        {error && (
          <Callout tone="error" role="alert" title="Couldn’t change the search">
            {error}
          </Callout>
        )}
        {!search.enabled && canRead && (
          <Callout tone="info" role="note">
            Runs skip this search while it’s off. Candidates already found stay here.
          </Callout>
        )}
      </section>

      <section aria-labelledby="candidates-heading" className="flex flex-col gap-3">
        <h3
          id="candidates-heading"
          ref={candidatesHeading}
          tabIndex={-1}
          className="text-title-3-semibold text-text-primary outline-none"
        >
          Latest candidates
        </h3>
        <p role="status" className="sr-only">
          {announcement}
        </p>
        {candidates.length === 0 ? (
          <EmptyState
            icon={SearchFocusIcon}
            title={empty.title}
            description={empty.description}
            action={
              !canRead ? (
                <ButtonLink href={ADD_ACCOUNT_HREF} variant="secondary">
                  Sign in again
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <CandidateCard candidate={candidate} onHandled={handled} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
