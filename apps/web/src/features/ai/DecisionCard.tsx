import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import type { ModelOption } from '@xbase/ai/providers';
import { KEY_ENV } from '@xbase/core/ai';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { type FormEvent, useId, useState } from 'react';
import { SectionCard } from '@/features/shell/SectionCard';
import { readableError } from '@/lib/readable-error';
import { listDecisionModelsFn, saveDecisionFn } from './ai.functions';
import { ModelField } from './ModelField';
import { SavedStatus } from './SavedStatus';

const DESCRIPTION =
  'TypeSafe’s Jev answers yes/no, score and choice questions with probabilities instead of writing text, for features that decide rather than write.';

/** The TypeSafe model XBase decides with; TypeSafe is the only decision provider. */
export function DecisionCard({ model: savedModel }: { model: ModelOption | null }) {
  const router = useRouter();
  const listModels = useServerFn(listDecisionModelsFn);
  const saveDecision = useServerFn(saveDecisionFn);
  const formId = useId();
  const [model, setModel] = useState(savedModel);
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  if (!savedModel) {
    return (
      <SectionCard title="Decision model" description={DESCRIPTION}>
        <Callout tone="info" role="note" title="No TypeSafe key yet">
          Set {KEY_ENV.typesafe} in the server’s environment, then restart it.
        </Callout>
      </SectionCard>
    );
  }

  const loadModels = async () => {
    setLoading(true);
    setError(null);
    try {
      setModels(await listModels());
    } catch (cause) {
      setError({ title: 'Couldn’t load models', message: readableError(cause) });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !model) return;
    setSaving(true);
    try {
      await saveDecision({ data: { model } });
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
      title="Decision model"
      description={DESCRIPTION}
      hint="jev-latest follows TypeSafe’s newest release; a numbered version stays put."
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
      </form>
    </SectionCard>
  );
}
