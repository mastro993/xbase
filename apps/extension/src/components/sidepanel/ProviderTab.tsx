import { RiArrowRightUpLine, RiShieldKeyholeFill } from '@remixicon/react';
import { PROVIDER_IDS, PROVIDERS, type ProviderId } from '@xbase/ai/providers';
import { LinkButton } from '@xbase/ui/components/base/buttons/link-button';
import { Select, SelectItem } from '@xbase/ui/components/base/select/select';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { useEffect } from 'react';
import { useModels } from '@/hooks/use-models';
import { setProviderKey, updateSettings } from '@/hooks/use-settings';
import type { ProviderSettings, Settings } from '@/lib/settings';
import { ApiKeyField } from './ApiKeyField';
import { ModelPicker } from './ModelPicker';
import { OtherKeys } from './OtherKeys';

const LIMIT_KEY_URL = 'https://github.com/mastro993/x-companion#limit-what-a-key-can-spend';

export function ProviderTab({ settings }: { settings: Settings }) {
  const active = settings.activeProvider;
  return (
    <div className="flex flex-col gap-5">
      <Select
        label="Active provider"
        placeholder="Choose a provider"
        selectedKey={active}
        // The only keys are the provider IDs listed below.
        onSelectionChange={(id) =>
          id && updateSettings((s) => ({ ...s, activeProvider: id as ProviderId }))
        }
        className="w-full"
        popoverClassName="w-(--trigger-width)"
      >
        {PROVIDER_IDS.map((id) => (
          <SelectItem key={id} id={id}>
            {PROVIDERS[id].label}
          </SelectItem>
        ))}
      </Select>
      {active && (
        <ActiveProvider key={active} provider={active} saved={settings.providers[active]} />
      )}
      <OtherKeys settings={settings} />
      {/* Always on screen: role="alert" would announce it on every visit to the tab. */}
      <Callout
        role="note"
        tone="warning"
        icon={RiShieldKeyholeFill}
        title="Keys are stored in this browser"
      >
        They're saved unencrypted in your browser profile. Give each key a spending limit, and use
        one made only for x-companion.{' '}
        <LinkButton
          href={LIMIT_KEY_URL}
          target="_blank"
          rel="noreferrer"
          size="small"
          trailingIcon={RiArrowRightUpLine}
        >
          How to limit a key
        </LinkButton>
      </Callout>
    </div>
  );
}

function ActiveProvider({ provider, saved }: { provider: ProviderId; saved?: ProviderSettings }) {
  const { models, loading, error, load, reset } = useModels(provider);
  const apiKey = saved?.apiKey ?? '';

  // Validate the stored key and load its models whenever it changes, here or in another panel.
  useEffect(() => {
    if (apiKey) void load(apiKey);
    else reset();
  }, [apiKey, load, reset]);

  function commitKey(key: string) {
    void updateSettings((s) => setProviderKey(s, provider, key));
    // An unchanged key doesn't trigger the effect, so re-verify it here.
    if (key && key === apiKey) void load(key);
  }

  return (
    <>
      <ApiKeyField
        provider={provider}
        savedKey={apiKey}
        checking={loading}
        error={error}
        modelCount={models?.length ?? null}
        onCommit={commitKey}
      />
      <ModelPicker
        hasKey={!!apiKey}
        value={saved?.model ?? null}
        models={models}
        loading={loading}
        onChange={(model) =>
          updateSettings((s) => ({
            ...s,
            providers: {
              ...s.providers,
              [provider]: { apiKey: '', ...s.providers[provider], model },
            },
          }))
        }
        onRefresh={() => load(apiKey)}
      />
    </>
  );
}
