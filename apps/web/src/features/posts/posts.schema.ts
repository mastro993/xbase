import { z } from 'zod';
import type { PostOrigin, PostStatus } from '@/server/db/schema';

// Shared by the composer, the server functions, the REST API and the MCP tools: no server imports.

export const MAX_PARTS = 25;
export const MAX_PART_LENGTH = 25_000;
export const MAX_LIST_LIMIT = 200;
/** How far ahead a post must be scheduled. */
export const MIN_PUBLISH_LEAD_MS = 60_000;

/** A post as every client sees it. Times are ISO 8601 strings in UTC. */
export type PostDto = {
  id: string;
  status: PostStatus;
  /** One text per post; more than one is a thread. */
  parts: string[];
  publishAt: string | null;
  publishedAt: string | null;
  xPostId: string | null;
  error: string | null;
  origin: PostOrigin;
  createdAt: string;
  updatedAt: string;
};

export const hasText = (text: string) => text.trim() !== '';

const PartText = z
  .string()
  .max(
    MAX_PART_LENGTH,
    `A post can have at most ${MAX_PART_LENGTH.toLocaleString('en')} characters`,
  );
const thread = (part: z.ZodString) =>
  z
    .array(part)
    .min(1, 'Add at least one post')
    .max(MAX_PARTS, `A thread can have at most ${MAX_PARTS} posts`);

/** Texts as the composer saves them: a post may still be empty while it's being written. */
export const DraftParts = thread(PartText);
/** Texts from the REST API and MCP, which have no reason to save an empty post. */
export const NonEmptyParts = thread(PartText.refine(hasText, 'Write some text in every post'));

const Id = z.string().min(1, 'Missing id').max(100, 'Unknown id');
// A time zone is required: a bare local time would be read in the server's zone.
const Time = z.iso
  .datetime({
    offset: true,
    error: 'Use an ISO 8601 time with a time zone, e.g. 2026-10-24T09:30:00+02:00',
  })
  .transform((value) => new Date(value));
const Limit = z
  .int('The limit must be a whole number')
  .min(1, 'The limit must be at least 1')
  .max(MAX_LIST_LIMIT, `The limit can be at most ${MAX_LIST_LIMIT}`);

export const PostIdInput = z.object({ id: Id });
export const ListDraftsInput = z.object({ limit: Limit.optional() }).optional();
export const CreateDraftInput = z.object({ parts: DraftParts });
export const UpdateDraftInput = z.object({ id: Id, parts: DraftParts });
export const SchedulePostInput = z.object({ id: Id, publishAt: Time });

/** REST: the body of POST /api/v1/drafts and PATCH /api/v1/drafts/:id. */
export const ApiDraftInput = z.object({ parts: NonEmptyParts });
/** REST: the query of GET /api/v1/drafts. */
export const ListDraftsQuery = z.object({ limit: z.coerce.number().pipe(Limit).optional() });
