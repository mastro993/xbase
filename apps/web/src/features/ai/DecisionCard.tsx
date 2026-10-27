import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import {
  DECISION_PROVIDERS,
  DECISION_PROVIDER_IDS,
  type DecisionProvider,
  type ModelOption,
} from '@xbase/ai/providers';
import { type AiSettingsDto, KEY_ENV } from '@xbase/core/ai';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { Input } from '@xbase/ui/components/base/input/input';
import { Select, SelectItem } from '@xbase/ui/components/base/select/select';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { type FormEvent, useId, useRef, useState } from 'react';
import { SavedStatus } from '@/features/shell/SavedStatus';
import { SectionCard } from '@/features/shell/SectionCard';
import { readableError } from '@/lib/readable-error';
import { listDecisionModelsFn, saveDecisionFn } from './ai.functions';
import { either } from './either';
import { ModelField } from './ModelField';

const DESCRIPTION =
  'Decision models answer yes/no, score and choice questions with probabilities instead of writing text. TypeSafe’s Jev, OpenAI’s Decisions API and OpenRouter’s curated list serve them.';

const HINTS: Record<DecisionProvider, string> = {
  typesafe: 'jev-latest follows TypeSafe’s newest release; a numbered version stays put.',
  openai: 'OpenAI’s Decisions API has one fixed model; there is nothing to choose.',
  openrouter: 'A curated set of OpenRouter’s decision models, Jev included.',
};

/**
 * The provider and model decisions use: TypeSafe, OpenAI's Decisions API or OpenRouter. Only
 * providers with a key in the server's environment are offered.
 */
export function DecisionCard({ settings }: { settings: AiSettingsDto }) {
  const router = useRouter();
  const listModels = useServerFn(listDecisionModelsFn);
  const saveDecision = useServerFn(saveDecisionFn);
  const formId = useId();
  // Answers for an earlier provider are dropped.
  const request = useRef(0);

  const { decision, decisionProviders } = settings;
  const [provider, setProvider] = useState<DecisionProvider | null>(decision?.provider ?? null);
  const [model, setModel] = useState<ModelOption | null>(decision?.model ?? null);
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const chooseProvider = (next: DecisionProvider) => {
    if (next === provider) return;
    request.current += 1;
    setProvider(next);
    setModels(null);
    setLoading(false);
    setModel(decision?.provider === next ? decision.model : DECISION_PROVIDERS[next].defaultModel);
    setSaved(false);
    setError(null);
  };

  if (decisionProviders.length === 0) {
    return (
      <SectionCard title="Decision model" description={DESCRIPTION}>
        <Callout tone="info" role="note" title="No decision model key yet">
          Set {either(DECISION_PROVIDER_IDS.map((id) => KEY_ENV[id]))} in the server’s environment,
          then restart it. Decision features stay off until then.
        </Callout>
      </SectionCard>
    );
  }

  const loadModels = async () => {
    if (!provider) return;
    const id = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const list = await listModels({ data: { provider } });
      if (id === request.current) setModels(list);
    } catch (cause) {
      if (id === request.current) {
        setError({ title: 'Couldn’t load models', message: readableError(cause) });
      }
    } finally {
      if (id === request.current) setLoading(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (!provider || !model) {
      setError({ title: 'Not saved', message: 'Choose a provider first.' });
      return;
    }
    // A fixed model has nothing to choose: save the provider's own, not a stale stored label.
    const chosen = DECISION_PROVIDERS[provider].fixedModel
      ? DECISION_PROVIDERS[provider].defaultModel
      : model;
    setSaving(true);
    try {
      await saveDecision({ data: { provider, model: chosen } });
      setSaved(true);
      await router.invalidate({ sync: true });
    } catch (cause) {
      setError({ title: 'Not saved', message: readableError(cause) });
    } finally {
      setSaving(false);
    }
  };

  const missing = DECISION_PROVIDER_IDS.filter((id) => !decisionProviders.includes(id));
  const missingHint =
    missing.length > 0 &&
    `To offer ${either(missing.map((id) => DECISION_PROVIDERS[id].label))}, set ${either(missing.map((id) => KEY_ENV[id]))} and restart the server.`;
  const hint = [provider && HINTS[provider], missingHint].filter(Boolean).join(' ');

  return (
    <SectionCard
      title="Decision model"
      description={DESCRIPTION}
      hint={hint}
      actions={
        <>
          <SavedStatus saved={saved} />
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
          onSelectionChange={(id) => id && chooseProvider(id as DecisionProvider)}
          className="w-full"
          popoverClassName="w-(--trigger-width)"
        >
          {decisionProviders.map((id) => (
            <SelectItem key={id} id={id}>
              {DECISION_PROVIDERS[id].label}
            </SelectItem>
          ))}
        </Select>
        {provider &&
          (DECISION_PROVIDERS[provider].fixedModel ? (
            <Input
              label="Model"
              value={DECISION_PROVIDERS[provider].defaultModel.label}
              isReadOnly
            />
          ) : (
            <ModelField
              model={model}
              models={models}
              loading={loading}
              onChange={(next) => {
                setModel(next);
                setSaved(false);
                setError(null);
              }}
              onLoad={() => void loadModels()}
            />
          ))}
      </form>
    </SectionCard>
  );
}
