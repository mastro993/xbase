import { createServerFn } from '@tanstack/react-start';
import { ConsentSearch, type ConsentView } from '@xbase/core/consent';
import { validator } from '@xbase/core/validate';
import { consentView } from '@xbase/mcp/oauth/consent';
import { readSession } from '@/features/auth/session.server';

/** The consent page's data: the pending request bound to this browser's session. */
export const getConsentFn = createServerFn()
  .validator(validator(ConsentSearch))
  .handler(({ data }): ConsentView => consentView(data, readSession()?.id ?? null));
