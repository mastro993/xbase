import { RiArrowRightUpLine } from '@remixicon/react';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import {
  looksLikeKeyFor,
  type ModelOption,
  PROVIDER_IDS,
  PROVIDERS,
  type ProviderId,
} from '@xbase/ai/providers';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { LinkButton } from '@xbase/ui/components/base/buttons/link-button';
import { HintText } from '@xbase/ui/components/base/input/hint-text';
import { InputBase, TextField } from '@xbase/ui/components/base/input/input';
import { Label } from '@xbase/ui/components/base/input/label';
import { Select, SelectItem } from '@xbase/ui/components/base/select/select';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { type FormEvent, useId, useRef, useState } from 'react';
import { SectionCard } from '@/features/shell/SectionCard';
import { readableError } from '@/lib/readable-error';
import { listModelsFn, saveAiSettingsFn } from './ai.functions';
import type { AiSettingsDto } from './ai.schema';
import { ModelField } from './ModelField';
import { SavedStatus } from './SavedStatus';

// Keep password managers from offering to save or fill an API key. On InputBase, not TextField:
// React Aria puts a TextField's data-* props on its wrapper, and these must reach the <input>.
const NO_AUTOFILL = { autoComplete: 'off', 'data-1p-ignore': true, 'data-lpignore': 'true' };

/**
 * Provider, write-only key and model. A new key is checked with the provider (listModelsFn)
 * before it's saved; leaving the key empty keeps the stored one for the same provider.
 */
export function AiProviderCard({ settings }: { settings: AiSettingsDto }) {
  const router = useRouter();
  const listModels = useServerFn(listModelsFn);
  const saveSettings = useServerFn(saveAiSettingsFn);
  const formId = useId();
  const errorId = useId();
  const keyInput = useRef<HTMLInputElement>(null);
  // Answers from an older provider or key are dropped.
  const request = useRef(0);

  const [provider, setProvider] = useState<ProviderId | null>(settings?.provider ?? null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<ModelOption | null>(settings?.model ?? null);
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const info = provider ? PROVIDERS[provider] : null;
  const key = apiKey.trim();
  const storedKeyHint = settings && settings.provider === provider ? settings.keyHint : null;
  const canLoadModels = !!provider && (!!key || !!storedKeyHint);
  // listModels' wording (@xbase/ai/llm) for a key the provider refused.
  const keyRefused = error?.message === 'Invalid API key';
  // A partly typed prefix ("sk-an") doesn't flash the warning.
  const suspicious =
    !!provider && !!key && !info?.keyPrefix.startsWith(key) && !looksLikeKeyFor(provider, key);

  const edited = () => {
    setSaved(false);
    setError(null);
  };

  const chooseProvider = (next: ProviderId) => {
    if (next === provider) return;
    request.current += 1;
    setProvider(next);
    setModels(null);
    setLoadingModels(false);
    setModel(settings?.provider === next ? settings.model : PROVIDERS[next].defaultModel);
    edited();
  };

  /** Loads the models for the typed key, or the stored one; null when the provider refuses it. */
  const loadModels = async (errorTitle = 'Couldn’t load models'): Promise<ModelOption[] | null> => {
    if (!provider) return null;
    const id = ++request.current;
    setLoadingModels(true);
    setError(null);
    try {
      const list = await listModels({ data: { provider, apiKey: key || undefined } });
      if (id === request.current) setModels(list);
      return list;
    } catch (cause) {
      if (id === request.current) {
        setError({ title: errorTitle, message: readableError(cause) });
      }
      return null;
    } finally {
      if (id === request.current) setLoadingModels(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (!provider || !info || !model) {
      setError({ title: 'Not saved', message: 'Choose a provider first.' });
      return;
    }
    if (!key && !storedKeyHint) {
      setError({ title: 'Not saved', message: `Enter your ${info.label} API key.` });
      keyInput.current?.focus();
      return;
    }
    setSaving(true);
    try {
      // Check a new key with the provider before storing it.
      if (key && !(await loadModels('Not saved'))) return;
      await saveSettings({ data: { provider, model, apiKey: key || undefined } });
      setApiKey('');
      setSaved(true);
      await router.invalidate({ sync: true });
    } catch (cause) {
      setError({ title: 'Not saved', message: readableError(cause) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="AI provider"
      description="Refine with AI sends your draft to this provider, using your own API key."
      hint="The key stays on your server and is never shown again, here or anywhere else."
      actions={
        <>
          <SavedStatus saved={saved} />
          {/* Busy, not disabled: the button keeps focus while it checks and saves. */}
          <Button
            type="submit"
            form={formId}
            leadingIcon={saving ? Spinner : undefined}
            aria-busy={saving || undefined}
          >
            Save
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {error && (
          <Callout id={errorId} tone="error" role="alert" title={error.title}>
            {error.message}
          </Callout>
        )}
        <Select
          label="Provider"
          placeholder="Choose a provider"
          selectedKey={provider}
          // The only keys are the provider IDs listed below.
          onSelectionChange={(id) => id && chooseProvider(id as ProviderId)}
          className="w-full"
          popoverClassName="w-(--trigger-width)"
        >
          {PROVIDER_IDS.map((id) => (
            <SelectItem key={id} id={id}>
              {PROVIDERS[id].label}
            </SelectItem>
          ))}
        </Select>
        {provider && info && (
          <>
            <TextField
              type="password"
              value={apiKey}
              isInvalid={keyRefused}
              // The form reports errors itself: native validation would block a retry.
              validationBehavior="aria"
              aria-describedby={keyRefused ? errorId : undefined}
              onChange={(value) => {
                setApiKey(value);
                setModels(null);
                edited();
              }}
            >
              <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <Label>API key</Label>
                <LinkButton
                  href={info.keysUrl}
                  target="_blank"
                  rel="noreferrer"
                  size="xs"
                  trailingIcon={RiArrowRightUpLine}
                >
                  Get a key
                  <span className="sr-only"> from {info.label} (opens in a new tab)</span>
                </LinkButton>
              </div>
              <InputBase
                ref={keyInput}
                placeholder={
                  storedKeyHint ? `Leave empty to keep ${storedKeyHint}` : `${info.keyPrefix}…`
                }
                spellCheck={false}
                {...NO_AUTOFILL}
              />
              <HintText role="status">
                {suspicious
                  ? `This doesn’t look like an API key for ${info.label}. Check that you copied the right one.`
                  : storedKeyHint
                    ? `Saved key ${storedKeyHint}. A new key is checked with ${info.label} before it’s saved.`
                    : `XBase checks the key with ${info.label} before saving it.`}
              </HintText>
            </TextField>
            <ModelField
              model={model}
              models={models}
              loading={loadingModels}
              canLoad={canLoadModels}
              onChange={(next) => {
                setModel(next);
                edited();
              }}
              onLoad={() => void loadModels()}
            />
          </>
        )}
      </form>
    </SectionCard>
  );
}
