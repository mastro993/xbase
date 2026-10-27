import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import {
  MAX_STYLE_FIELD_LENGTH,
  STYLE_FIELDS,
  type StyleField,
  type StyleGuide,
} from '@xbase/ai/profile';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { Textarea } from '@xbase/ui/components/base/textarea/textarea';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { type FormEvent, useId, useState } from 'react';
import { SavedStatus } from '@/features/shell/SavedStatus';
import { SectionCard } from '@/features/shell/SectionCard';
import { readableError } from '@/lib/readable-error';
import { saveVoiceFn } from './ai.functions';

const FIELDS: Record<StyleField, { label: string; hint: string; placeholder: string }> = {
  persona: {
    label: 'Persona',
    hint: 'Who you are and what you post about.',
    placeholder: 'Indie iOS developer. Ships small apps, talks pricing and building in public.',
  },
  audience: {
    label: 'Audience',
    hint: 'Who reads you, and what lands with them.',
    placeholder:
      'Indie makers and developers. They trust numbers from real launches over hot takes.',
  },
  voice: {
    label: 'Style and vocabulary',
    hint: 'Tone, structure and the phrases you use. Two or three of your posts work better than adjectives.',
    placeholder: 'Casual and direct, short sentences, often says “imo”.',
  },
  rules: {
    label: 'Rules',
    hint: 'What the AI must always or never do.',
    placeholder: 'No hashtags. Never mention my own apps. Always write in English.',
  },
};

/** The account's style guide, which every AI prompt gets. All four fields are optional. */
export function VoiceCard({ voice, username }: { voice: StyleGuide; username: string }) {
  const router = useRouter();
  const saveVoice = useServerFn(saveVoiceFn);
  const formId = useId();
  const [draft, setDraft] = useState(voice);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      // The server trims each field: show what was stored.
      setDraft(await saveVoice({ data: draft }));
      setSaved(true);
      await router.invalidate({ sync: true });
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Voice"
      description={`How the AI should sound when it refines @${username}’s drafts. Each account has its own.`}
      hint={`Every field is optional, up to ${MAX_STYLE_FIELD_LENGTH.toLocaleString('en-US')} characters each.`}
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
          <Callout tone="error" role="alert" title="Not saved">
            {error}
          </Callout>
        )}
        {STYLE_FIELDS.map((field) => (
          <Textarea
            key={field}
            name={field}
            label={FIELDS[field].label}
            hint={FIELDS[field].hint}
            placeholder={FIELDS[field].placeholder}
            value={draft[field]}
            maxLength={MAX_STYLE_FIELD_LENGTH}
            showCount
            autoResize
            maxRows={10}
            // The form reports errors itself: native validation would block a retry.
            validationBehavior="aria"
            onChange={(value) => {
              setDraft((current) => ({ ...current, [field]: value }));
              setSaved(false);
            }}
          />
        ))}
      </form>
    </SectionCard>
  );
}
