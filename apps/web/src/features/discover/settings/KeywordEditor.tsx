import { Add01Icon } from '@hugeicons/core-free-icons';
import { isHandle, MAX_KEYWORD_LENGTH, parseHandles, parseKeywords } from '@xbase/core/discovery';
import { Chip } from '@xbase/ui/components/base/badges/chip';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { CloseButton } from '@xbase/ui/components/base/buttons/close-button';
import { Textarea } from '@xbase/ui/components/base/textarea/textarea';
import { type ReactNode, useId, useState } from 'react';

type KeywordEditorProps = {
  /** Handles get X's rules and lose their @; keywords keep the spelling they were typed in. */
  kind: 'handle' | 'keyword';
  label: string;
  hint: ReactNode;
  placeholder: string;
  /** The list as the draft holds it, in the order the entries were added. */
  value: string[];
  /** The section's limit: adding the one past it says so now, rather than on Save. */
  max: number;
  onChange: (value: string[]) => void;
};

/**
 * A list of handles or keywords, edited a few at a time: what's in it shows as chips with a
 * remove button, and a field below takes a pasted list, one entry per line or after a comma.
 * Entries are normalised here the way the server does, so the chips show what will be saved.
 */
export function KeywordEditor({
  kind,
  label,
  hint,
  placeholder,
  value,
  max,
  onChange,
}: KeywordEditorProps) {
  const labelId = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const noun = kind === 'handle' ? 'account' : 'keyword';

  const add = () => {
    const entries = kind === 'handle' ? parseHandles(text) : parseKeywords(text);
    const invalid = entries.find((entry) =>
      kind === 'handle' ? !isHandle(entry) : entry.length > MAX_KEYWORD_LENGTH,
    );
    if (invalid) {
      setError(
        kind === 'handle'
          ? `“${invalid}” isn’t an X handle: up to 15 letters, numbers or underscores.`
          : `A keyword has at most ${MAX_KEYWORD_LENGTH} characters.`,
      );
      return;
    }
    const added: string[] = [];
    const seen = new Set(value.map((kept) => kept.toLowerCase()));
    for (const entry of entries) {
      const key = entry.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      added.push(entry);
    }
    if (value.length + added.length > max) {
      setError(`This list holds at most ${max} ${noun}s.`);
      return;
    }
    setText('');
    setError(null);
    onChange([...value, ...added]);
  };

  return (
    <div className="flex flex-col gap-3" role="group" aria-labelledby={labelId}>
      <div className="flex flex-col gap-1">
        <span id={labelId} className="text-body-medium text-text-primary">
          {label}
        </span>
        <p className="text-body-regular text-text-secondary">{hint}</p>
      </div>
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((entry) => (
            <li key={entry}>
              <Chip variant="subtle" className="gap-0.5 ps-2 pe-0.5">
                {kind === 'handle' ? `@${entry}` : entry}
                <CloseButton
                  size="2xs"
                  aria-label={`Remove ${entry}`}
                  onClick={() => {
                    setError(null);
                    onChange(value.filter((kept) => kept !== entry));
                  }}
                />
              </Chip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-regular text-text-secondary">Nothing here yet.</p>
      )}
      <Textarea
        label={kind === 'handle' ? 'Add accounts' : 'Add keywords'}
        value={text}
        onChange={(next) => {
          setText(next);
          setError(null);
        }}
        placeholder={placeholder}
        rows={2}
        autoResize
        maxRows={6}
        spellCheck="false"
      />
      {error && (
        <p role="alert" className="text-body-regular text-text-error-primary">
          {error}
        </p>
      )}
      <div>
        <Button
          type="button"
          variant="secondary"
          size="small"
          leadingIcon={Add01Icon}
          disabled={!text.trim()}
          onClick={add}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
