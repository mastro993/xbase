import { createServerFn } from '@tanstack/react-start';
import { readSession } from '@/features/auth/session.server';
import { validator } from '@/lib/validate';
import { ConsentSearch, type ConsentView } from './consent.schema';
import { consentView } from './consent.server';

/** The consent page's data: the pending request bound to this browser's session. */
export const getConsentFn = createServerFn()
  .validator(validator(ConsentSearch))
  .handler(({ data }): ConsentView => consentView(data, readSession()?.id ?? null));
