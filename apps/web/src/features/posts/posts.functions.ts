import { notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { requireSession } from '@/features/auth/session.server';
import { NotFoundError } from '@/lib/errors';
import { validator } from '@/lib/validate';
import {
  CreateDraftInput,
  ListDraftsInput,
  PostIdInput,
  SchedulePostInput,
  UpdateDraftInput,
} from './posts.schema';
import {
  createDraft,
  deletePost,
  getPost,
  listDrafts,
  listScheduled,
  schedulePost,
  unschedulePost,
  updateDraft,
} from './posts.server';

// The UI's entry points to posts.server.ts. Lists and new drafts are the account the browser works
// as. Errors reach the caller with their message.

export const listDraftsFn = createServerFn()
  .validator(validator(ListDraftsInput))
  .handler(({ data }) => listDrafts({ ...data, accountId: requireSession().accountId }));

export const listScheduledFn = createServerFn().handler(() =>
  listScheduled({ accountId: requireSession().accountId }),
);

/** A missing post throws notFound(), so a route loader renders its 404. */
export const getPostFn = createServerFn()
  .validator(validator(PostIdInput))
  .handler(({ data }) => {
    try {
      return getPost(data.id);
    } catch (error) {
      if (error instanceof NotFoundError) throw notFound();
      throw error;
    }
  });

export const createDraftFn = createServerFn({ method: 'POST' })
  .validator(validator(CreateDraftInput))
  .handler(({ data }) =>
    createDraft({ accountId: requireSession().accountId, parts: data.parts, origin: 'web' }),
  );

export const updateDraftFn = createServerFn({ method: 'POST' })
  .validator(validator(UpdateDraftInput))
  .handler(({ data }) => updateDraft(data.id, { parts: data.parts }));

export const deletePostFn = createServerFn({ method: 'POST' })
  .validator(validator(PostIdInput))
  .handler(({ data }) => deletePost(data.id));

export const schedulePostFn = createServerFn({ method: 'POST' })
  .validator(validator(SchedulePostInput))
  .handler(({ data }) => schedulePost(data.id, data.publishAt));

export const unschedulePostFn = createServerFn({ method: 'POST' })
  .validator(validator(PostIdInput))
  .handler(({ data }) => unschedulePost(data.id));
