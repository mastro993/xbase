import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import type { DiscoverySection, DiscoverySettings } from '@xbase/core/discovery';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { type ReactNode, useId, useState } from 'react';
import { ConfirmButton } from '@/features/shell/ConfirmButton';
import { SavedStatus } from '@/features/shell/SavedStatus';
import { SectionCard } from '@/features/shell/SectionCard';
import { readableError } from '@/lib/readable-error';
import { resetDiscoverySectionFn, saveDiscoverySettingsFn } from './discovery.functions';

/**
 * One section's draft, and the calls that save or forget it. Each card owns a section, so a save
 * that fails leaves the other sections untouched; a run reads the whole set through
 * getDiscoverySettings.
 */
export function useDiscoverySection<S extends DiscoverySection>(
  section: S,
  stored: DiscoverySettings[S],
) {
  const router = useRouter();
  const saveSection = useServerFn(saveDiscoverySettingsFn);
  const resetSection = useServerFn(resetDiscoverySectionFn);
  const [draft, setDraft] = useState(stored);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** An edit: the "Saved" note then belongs to the previous save. */
  const edit = (next: DiscoverySettings[S]) => {
    setDraft(next);
    setSaved(false);
  };

  /** The same, for a card that keeps its own text and only sends the section’s values. */
  const dirty = () => setSaved(false);

  /** Shows a problem the section found itself, before anything reaches the server. */
  const report = (message: string) => {
    setError(message);
    setSaved(false);
  };

  /** Resolves to what was stored, or null when it failed and the error is on screen. */
  const save = async (value: DiscoverySettings[S]): Promise<DiscoverySettings[S] | null> => {
    if (saving) return null;
    setSaving(true);
    setError(null);
    try {
      // The server trims, normalises and de-dupes: show what was stored.
      const next = (await saveSection({ data: { section, value } }))[section];
      setDraft(next);
      setSaved(true);
      await router.invalidate({ sync: true });
      return next;
    } catch (cause) {
      setError(readableError(cause));
      return null;
    } finally {
      setSaving(false);
    }
  };

  /** Throws on failure: ConfirmButton shows it in the dialog that asked. */
  const restore = async (): Promise<DiscoverySettings[S]> => {
    setError(null);
    const next = (await resetSection({ data: { section } }))[section];
    setDraft(next);
    setSaved(false);
    await router.invalidate({ sync: true });
    return next;
  };

  return { draft, edit, dirty, save, restore, report, saving, saved, error };
}

type DiscoveryCardProps = {
  title: string;
  description: ReactNode;
  /** The footer's line: what these settings do, or when they apply. */
  hint: ReactNode;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onSubmit: () => void;
  /** Rejects with the error to show in the confirmation dialog; resolves once it's done. */
  onReset: () => Promise<unknown>;
  children: ReactNode;
};

/**
 * A section of Discovery settings: a title, a form, and the two actions every section has, Save
 * and Reset. Reset asks first, since it throws away every value in the section at once.
 */
export function DiscoveryCard({
  title,
  description,
  hint,
  saving,
  saved,
  error,
  onSubmit,
  onReset,
  children,
}: DiscoveryCardProps) {
  const formId = useId();
  return (
    <SectionCard
      title={title}
      description={description}
      hint={hint}
      actions={
        <>
          <SavedStatus saved={saved} />
          <ConfirmButton
            title={`Reset “${title}” to the defaults?`}
            description="Every value in this section goes back to its default. The other sections keep theirs."
            action="Reset"
            errorTitle="Couldn’t reset"
            onConfirm={async () => {
              await onReset();
            }}
          >
            Reset
          </ConfirmButton>
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
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-5"
        noValidate
      >
        {error && (
          <Callout tone="error" role="alert" title="Not saved">
            {error}
          </Callout>
        )}
        {children}
      </form>
    </SectionCard>
  );
}
