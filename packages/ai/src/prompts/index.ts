// The package's "./prompts" entry: the builders and helpers the apps call.
import type { ActionId } from '../post';
import { matchStylePrompt } from './match-style';
import { polishPrompt } from './polish';
import { punchierPrompt } from './punchier';
import { replyPrompt } from './reply';
import type { PromptBuilder } from './types';

export { refinePostPrompt } from './refine-post';
export { cleanReply } from './shared';
export type { Prompt } from './types';

/** One prompt per composer action. A new action goes in ACTIONS (post.ts), then here. */
export const PROMPTS: Record<ActionId, PromptBuilder> = {
  reply: replyPrompt,
  polish: polishPrompt,
  punchier: punchierPrompt,
  'match-style': matchStylePrompt,
};
