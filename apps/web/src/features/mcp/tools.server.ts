import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { listSavedSearches } from '@/features/discover/discover.server';
import { MAX_LIST_LIMIT, NonEmptyParts, type PostDto } from '@/features/posts/posts.schema';
import {
  createDraft,
  deletePost,
  getPost,
  listDrafts,
  listScheduled,
  schedulePost,
  unschedulePost,
  updateDraft,
} from '@/features/posts/posts.server';
import { ServiceError } from '@/lib/errors';
import { POST_ORIGINS, POST_STATUSES } from '@/server/db/schema';

// The MCP tools: the same services as the UI and the REST API, with origin 'mcp'. Registered in a
// fixed order, so tools/list is stable. None publishes: posting to X can't be undone.

const Id = z
  .string()
  .min(1)
  .max(100)
  .describe('The post id, from list_drafts, list_scheduled or create_draft');
const Parts = NonEmptyParts.describe(
  'One string per post; more than one makes a thread. X counts each URL as 23 characters and most emoji and CJK characters as 2, against a limit of 280 for standard accounts.',
);
const Time = z.iso.datetime({ offset: true });

const Post = z.object({
  id: z.string(),
  // From the schema: a status this enum lacked would fail output validation for every list.
  status: z.enum(POST_STATUSES),
  parts: z.array(z.string()),
  publishAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  xPostId: z.string().nullable(),
  error: z.string().nullable(),
  origin: z.enum(POST_ORIGINS),
  createdAt: z.string(),
  updatedAt: z.string(),
}) satisfies z.ZodType<PostDto>;
const PostList = z.object({ items: z.array(Post) });
const SavedSearchList = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      query: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
});

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

const HINTS: Record<ServiceError['code'], string> = {
  not_found: 'Call list_drafts or list_scheduled for current post ids.',
  invalid_state: 'Call get_draft to see the post’s status.',
  invalid_request: 'Fix the arguments and try again.',
};

/** Runs a service call: the answer as JSON text and structured content, or a tool error. */
function result(work: () => Record<string, unknown>): CallToolResult {
  try {
    const data = work();
    return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
  } catch (error) {
    // Expected failures go to the model with a next step; anything else is a bug, kept private.
    if (error instanceof ServiceError) {
      return {
        isError: true,
        content: [{ type: 'text', text: `${error.message} ${HINTS[error.code]}` }],
      };
    }
    console.error('[mcp] tool failed', error);
    return { isError: true, content: [{ type: 'text', text: 'XBase failed to run this tool.' }] };
  }
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    'list_drafts',
    {
      title: 'List drafts',
      description: 'Drafts and failed posts, last edited first.',
      inputSchema: z.object({
        limit: z
          .int()
          .min(1)
          .max(MAX_LIST_LIMIT)
          .optional()
          .describe(`How many to return, 1 to ${MAX_LIST_LIMIT}; default 50`),
      }),
      outputSchema: PostList,
      annotations: READ,
    },
    async ({ limit }) => result(() => ({ items: listDrafts({ limit }) })),
  );

  server.registerTool(
    'get_draft',
    {
      title: 'Get a post',
      description: 'One post by id, in any status: draft, scheduled, published or failed.',
      inputSchema: z.object({ id: Id }),
      outputSchema: Post,
      annotations: READ,
    },
    async ({ id }) => result(() => getPost(id)),
  );

  server.registerTool(
    'create_draft',
    {
      title: 'Create a draft',
      description: 'Saves a new post or thread as a draft. It is not published.',
      inputSchema: z.object({ parts: Parts }),
      outputSchema: Post,
      annotations: { ...WRITE, idempotentHint: false },
    },
    async ({ parts }) => result(() => createDraft({ parts, origin: 'mcp' })),
  );

  server.registerTool(
    'update_draft',
    {
      title: 'Update a draft',
      description:
        'Replaces the texts of a draft, scheduled or failed post. A scheduled post keeps its time.',
      inputSchema: z.object({ id: Id, parts: Parts }),
      outputSchema: Post,
      annotations: { ...WRITE, destructiveHint: true, idempotentHint: true },
    },
    async ({ id, parts }) => result(() => updateDraft(id, { parts })),
  );

  server.registerTool(
    'delete_draft',
    {
      title: 'Delete a post',
      description: 'Deletes a draft, scheduled or failed post for good.',
      inputSchema: z.object({ id: Id }),
      outputSchema: z.object({ id: z.string(), deleted: z.literal(true) }),
      annotations: { ...WRITE, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) =>
      result(() => {
        deletePost(id);
        return { id, deleted: true };
      }),
  );

  server.registerTool(
    'schedule_post',
    {
      title: 'Schedule a post',
      description:
        'Queues a post at a time at least a minute from now, or moves it. Every part needs text. Publishing to X isn’t connected yet, so scheduled posts wait in the queue.',
      inputSchema: z.object({
        id: Id,
        publishAt: Time.describe('ISO 8601 with a time zone, e.g. 2026-10-24T09:30:00+02:00'),
      }),
      outputSchema: Post,
      annotations: { ...WRITE, idempotentHint: true },
    },
    async ({ id, publishAt }) => result(() => schedulePost(id, new Date(publishAt))),
  );

  server.registerTool(
    'unschedule_post',
    {
      title: 'Unschedule a post',
      description: 'Takes a scheduled or failed post out of the queue, back to the drafts.',
      inputSchema: z.object({ id: Id }),
      outputSchema: Post,
      annotations: { ...WRITE, idempotentHint: true },
    },
    async ({ id }) => result(() => unschedulePost(id)),
  );

  server.registerTool(
    'list_scheduled',
    {
      title: 'List the queue',
      description: 'Scheduled, publishing and failed posts with a publish time, soonest first.',
      inputSchema: z.object({
        from: Time.optional().describe('Only posts at or after this ISO 8601 time'),
        to: Time.optional().describe('Only posts before this ISO 8601 time'),
      }),
      outputSchema: PostList,
      annotations: READ,
    },
    async ({ from, to }) =>
      result(() => ({
        items: listScheduled({
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to) : undefined,
        }),
      })),
  );

  server.registerTool(
    'list_saved_searches',
    {
      title: 'List saved searches',
      description: 'The owner’s saved X searches from Discover, by name, in X search syntax.',
      outputSchema: SavedSearchList,
      annotations: READ,
    },
    async () => result(() => ({ items: listSavedSearches() })),
  );
}
