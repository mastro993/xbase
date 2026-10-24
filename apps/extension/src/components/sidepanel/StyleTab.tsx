import { MAX_STYLE_FIELD_LENGTH, STYLE_FIELDS, type StyleField } from '@xbase/ai/profile';
import { useAutosave } from '@/hooks/use-autosave';
import type { Settings } from '@/lib/settings';
import { TextareaField } from './TextareaField';

const SECTIONS: Record<StyleField, { label: string; description: string; placeholder: string }> = {
  persona: {
    label: 'Persona',
    description: 'Describe who you are and your main interests.',
    placeholder:
      'e.g. "Indie iOS developer. Ships small apps, talks pricing and building in public."',
  },
  audience: {
    label: 'Audience',
    description: "Describe the people you're speaking to and what resonates with them.",
    placeholder:
      'e.g. "Indie makers and developers. They trust numbers from real launches over hot takes."',
  },
  voice: {
    label: 'Style & Vocabulary',
    description: 'Share tone, structure, and signature phrases so the AI can mimic your voice.',
    placeholder:
      'e.g. "Casual and direct, short sentences, often says \'imo\'."\n\nPaste 2–3 of your past replies: examples carry style better than adjectives.',
  },
  rules: {
    label: 'Rules',
    description: "Add specific dos and don'ts the AI must always respect.",
    placeholder: 'e.g. "No hashtags. Never mention my own apps. Always reply in English."',
  },
};

export function StyleTab({ settings }: { settings: Settings }) {
  return (
    // min-w-0: a fieldset defaults to min-content width, which overflows narrow panels.
    <fieldset className="flex min-w-0 flex-col gap-5">
      <legend className="mb-1 text-headline-medium text-text-primary">Style Guide</legend>
      <p className="text-body-regular text-text-secondary">
        Customize how the AI writes for your account. Every section is optional.
      </p>
      {STYLE_FIELDS.map((field) => (
        <StyleSection key={field} field={field} settings={settings} />
      ))}
    </fieldset>
  );
}

function StyleSection({ field, settings }: { field: StyleField; settings: Settings }) {
  const { draft, status, onChange, flush } = useAutosave(
    settings,
    settings.style[field],
    (s, text) => ({
      ...s,
      style: { ...s.style, [field]: text },
    }),
  );

  return (
    <TextareaField
      id={`style-${field}`}
      {...SECTIONS[field]}
      status={status === 'saved' && 'Saved'}
      value={draft}
      maxLength={MAX_STYLE_FIELD_LENGTH}
      className="min-h-20"
      onChange={onChange}
      onBlur={flush}
    />
  );
}
