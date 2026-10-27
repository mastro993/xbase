import { createServerFn } from '@tanstack/react-start';
import { DiscoverySectionInput, SaveDiscoverySectionInput } from '@xbase/core/discovery';
import { validator } from '@xbase/core/validate';
import {
  getDiscoverySettings,
  resetDiscoverySection,
  saveDiscoverySettings,
} from '@xbase/server/discovery-settings';
import { requireSession } from '@/features/auth/session.server';

// The Settings page's entry points to @xbase/server/discovery-settings. Every section belongs to
// the account the browser works as.

export const getDiscoverySettingsFn = createServerFn().handler(() =>
  getDiscoverySettings(requireSession().accountId),
);

export const saveDiscoverySettingsFn = createServerFn({ method: 'POST' })
  .validator(validator(SaveDiscoverySectionInput))
  .handler(({ data }) =>
    saveDiscoverySettings(requireSession().accountId, data.section, data.value),
  );

export const resetDiscoverySectionFn = createServerFn({ method: 'POST' })
  .validator(validator(DiscoverySectionInput))
  .handler(({ data }) => resetDiscoverySection(requireSession().accountId, data.section));
