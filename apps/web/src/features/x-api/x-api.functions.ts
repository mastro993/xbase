import { createServerFn } from '@tanstack/react-start';
import { validator } from '@xbase/core/validate';
import { SaveXApiSettingsInput } from '@xbase/core/x-api';
import { saveXApiSettings } from '@xbase/server/x-api-settings';
import { getXApiUsage } from '@xbase/server/x-api-usage';

// The Settings page's entry points to the X API layer. Reading and writing happen in
// @xbase/server/x-api-usage and x-api-settings; this file only carries the session.

export const getXApiUsageFn = createServerFn().handler(() => getXApiUsage());

export const saveXApiSettingsFn = createServerFn({ method: 'POST' })
  .validator(validator(SaveXApiSettingsInput))
  .handler(({ data }) => saveXApiSettings(data));
