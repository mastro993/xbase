import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { type ModelOption, PROVIDERS } from '@xbase/ai/providers';
import {
  type AiSettingsDto,
  KEY_ENV,
  WRITING_PROVIDERS,
  type WritingProvider,
} from '@xbase/core/ai';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { Select, SelectItem } from '@xbase/ui/components/base/select/select';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { type FormEvent, useId, useRef, useState } from 'react';
import { SectionCard } from '@/features/shell/SectionCard';
import { readableError } from '@/lib/readable-error';
import { listModelsFn, saveAiSettingsFn } from './ai.functions';
import { ModelField } from './ModelField';
import { SavedStatus } from './SavedStatus';

/** "A, B or C". */
const either = (items: string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;

/**
 * The provider and model Refine with AI uses. Only providers with a key in the server's
 * environment are offered; the keys themselves never reach the browser.
 */
export function AiProviderCard({ settings }: { settings: AiSettingsDto }) {
  const router = useRouter();
  const listModels = useServerFn(listModelsFn);
  const saveSettings = useServerFn(saveAiSettingsFn);
  const formId = useId();
  // Answers for an earlier provider are dropped.
  const request = useRef(0);

  const { available, writing } = settings;
  const [provider, setProvider] = useState<WritingProvider | null>(writing?.provider ?? null);
  const [model, setModel] = useState<ModelOption | null>(writing?.model ?? null);
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const missing = WRITING_PROVIDERS.filter((id) => !available.includes(id));
  const missingHint =
    missing.length > 0 &&
    `To offer ${either(missing.map((id) => PROVIDERS[id].label))}, set ${either(missing.map((id) => KEY_ENV[id]))} and restart the server.`;

  const chooseProvider = (next: WritingProvider) => {
    if (next === provider) return;
    request.current += 1;
    setProvider(next);
    setModels(null);
    setLoadingModels(false);
    setModel(writing?.provider === next ? writing.model : PROVIDERS[next].defaultModel);
    setSaved(false);
    setError(null);
  };

  const loadModels = async () => {
    if (!provider) return;
    const id = ++request.current;
    setLoadingModels(true);
    setError(null);
    try {
      const list = await listModels({ data: { provider } });
      if (id === request.current) setModels(list);
    } catch (cause) {
      if (id === request.current) {
        setError({ title: 'Couldn’t load models', message: readableError(cause) });
      }
    } finally {
      if (id === request.current) setLoadingModels(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (!provider || !model) {
      setError({ title: 'Not saved', message: 'Choose a provider first.' });
      return;
    }
    setSaving(true);
    try {
      await saveSettings({ data: { provider, model } });
      setSaved(true);
      await router.invalidate({ sync: true });
    } catch (cause) {
      setError({ title: 'Not saved', message: readableError(cause) });
    } finally {
      setSaving(false);
    }
  };

  if (available.length === 0) {
    return (
      <SectionCard
        title="AI provider"
        description="Refine with AI sends your draft to an AI provider, using your own API key."
      >
        <Callout tone="info" role="note" title="No provider key yet">
          Set {either(WRITING_PROVIDERS.map((id) => KEY_ENV[id]))} in the server’s environment, then
          restart it. AI writing stays off until then.
        </Callout>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="AI provider"
      description="Refine with AI sends your draft to this provider, using your own API key."
      hint={missingHint || 'The keys stay in the server’s environment and never reach the browser.'}
      actions={
        <>
          <SavedStatus saved={saved} />
          {/* Busy, not disabled: the button keeps focus while it saves. */}
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
          <Callout tone="error" role="alert" title={error.title}>
            {error.message}
          </Callout>
        )}
        <Select
          label="Provider"
          placeholder="Choose a provider"
          selectedKey={provider}
          // The only keys are the provider IDs listed below.
          onSelectionChange={(id) => id && chooseProvider(id as WritingProvider)}
          className="w-full"
          popoverClassName="w-(--trigger-width)"
        >
          {available.map((id) => (
            <SelectItem key={id} id={id}>
              {PROVIDERS[id].label}
            </SelectItem>
          ))}
        </Select>
        {provider && (
          <ModelField
            model={model}
            models={models}
            loading={loadingModels}
            onChange={(next) => {
              setModel(next);
              setSaved(false);
              setError(null);
            }}
            onLoad={() => void loadModels()}
          />
        )}
      </form>
    </SectionCard>
  );
}
