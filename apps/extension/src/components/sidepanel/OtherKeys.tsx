import { PROVIDER_IDS } from '@xbase/ai/providers';
import { setProviderKey, updateSettings } from '@/hooks/use-settings';
import type { Settings } from '@/lib/settings';
import { KeyRow } from './KeyRow';

/** Keys for providers other than the active one. Never changes the active provider. */
export function OtherKeys({ settings }: { settings: Settings }) {
  const others = PROVIDER_IDS.filter((id) => id !== settings.activeProvider);
  return (
    // min-w-0: a fieldset defaults to min-content width, which overflows narrow panels.
    <fieldset className="min-w-0">
      <legend className="text-body-medium text-text-primary">
        {settings.activeProvider ? 'Other saved keys' : 'Saved keys'}
      </legend>
      <ul className="divide-y divide-separator-border">
        {others.map((id) => (
          <li key={id} className="py-2">
            <KeyRow
              provider={id}
              apiKey={settings.providers[id]?.apiKey ?? ''}
              onSave={(key) => void updateSettings((s) => setProviderKey(s, id, key))}
            />
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
