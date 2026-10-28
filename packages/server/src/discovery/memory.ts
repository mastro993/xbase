import { MAX_WATCH_HANDLES } from '@xbase/core/discovery';
import type { MemoryStatus } from '@xbase/core/discovery-filters';
import { NotFoundError, ValidationError } from '@xbase/core/errors';
import { getDb } from '@xbase/db/client';
import { type DiscoveryCandidate, discoveryCandidates, suggestedPosts } from '@xbase/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDiscoverySettings, saveDiscoverySettings } from '../discovery-settings';

// What discovery remembers about each post for good, per account, and the owner's actions that
// write it. A remembered post never comes back: a run drops it before storing (fetch.ts), and the
// lists hide the ones the owner skipped or replied to. Batches (#16) will remember what they show.

/** The posts among `xPostIds` the account already remembers, whatever their status. */
export function rememberedAmong(accountId: string, xPostIds: string[]): Set<string> {
  if (xPostIds.length === 0) return new Set();
  return new Set(
    getDb()
      .select({ xPostId: suggestedPosts.xPostId })
      .from(suggestedPosts)
      .where(
        and(eq(suggestedPosts.accountId, accountId), inArray(suggestedPosts.xPostId, xPostIds)),
      )
      .all()
      .map(({ xPostId }) => xPostId),
  );
}

/**
 * Remembers one post, keeping the first time it was remembered. A reply outranks a skip, so
 * skipping a post already replied to leaves it replied.
 */
function remember(
  accountId: string,
  candidate: DiscoveryCandidate,
  status: Exclude<MemoryStatus, 'shown'>,
): void {
  getDb()
    .insert(suggestedPosts)
    .values({ accountId, xPostId: candidate.xPostId, authorId: candidate.authorId, status })
    .onConflictDoUpdate({
      target: [suggestedPosts.accountId, suggestedPosts.xPostId],
      set: {
        status: sql`case when ${suggestedPosts.status} = 'replied' then 'replied' else excluded.status end`,
        updatedAt: new Date(),
      },
    })
    .run();
}

/** One of the account's candidates; throws NotFoundError for another account's. */
function candidateOf(accountId: string, candidateId: string): DiscoveryCandidate {
  const row = getDb()
    .select()
    .from(discoveryCandidates)
    .where(
      and(eq(discoveryCandidates.accountId, accountId), eq(discoveryCandidates.id, candidateId)),
    )
    .get();
  if (!row) throw new NotFoundError('Candidate not found.');
  return row;
}

/** The owner passed on this post: it leaves the lists and never comes back. */
export function skipCandidate(accountId: string, candidateId: string): void {
  remember(accountId, candidateOf(accountId, candidateId), 'skipped');
}

/**
 * The owner replied on x.com (XBase can't reply for them): the post leaves the lists, and the
 * account's reply tracking can find it later.
 */
export function markCandidateReplied(accountId: string, candidateId: string): void {
  remember(accountId, candidateOf(accountId, candidateId), 'replied');
}

/**
 * Adds the post's author to the account's "never suggest" list, which hides every post of theirs
 * at once, and takes them off the watch list. Throws ValidationError when the list is full.
 */
export function muteCandidateAuthor(accountId: string, candidateId: string): void {
  const handle = candidateOf(accountId, candidateId).authorHandle?.toLowerCase();
  if (!handle) throw new ValidationError('This post has no author to mute.');
  const { watch } = getDiscoverySettings(accountId);
  if (watch.blocked.includes(handle)) return;
  if (watch.blocked.length >= MAX_WATCH_HANDLES) {
    throw new ValidationError(
      `Your Never suggest list is full (${MAX_WATCH_HANDLES}). Remove someone in Settings → Discovery → Watch list first.`,
    );
  }
  saveDiscoverySettings(accountId, 'watch', {
    accounts: watch.accounts.filter((watched) => watched !== handle),
    blocked: [...watch.blocked, handle],
  });
}
