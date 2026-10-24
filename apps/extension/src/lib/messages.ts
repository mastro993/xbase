import type { ActionId, TargetPost } from '@xbase/ai/post';

/** Longest post text and draft the background accepts. */
export const MAX_TEXT = 8000;

/** content script -> background */
export type BackgroundRequest =
  | { type: 'get-status' }
  | { type: 'open-side-panel' }
  | { type: 'run-action'; action: ActionId; post: TargetPost; draft: string; me: string }
  | { type: 'refine-post'; draft: string }; // a new post's draft, never empty

/** background -> content script (pushed via tabs.sendMessage when settings change) */
export type ContentPush = { type: 'status'; ready: boolean };
export type StatusResponse = { ready: boolean };
export type ActionResponse = { ok: true; text: string } | { ok: false; error: string };
