import { looksLikeKeyFor, PROVIDERS, type ProviderId } from '@xbase/ai/providers';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { InputBase, TextField } from '@xbase/ui/components/base/input/input';
import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { maskKey, NO_AUTOFILL } from './format';

interface Props {
  provider: ProviderId;
  apiKey: string;
  /** Saves a trimmed key; "" removes it. */
  onSave: (key: string) => void;
  /** The active provider's row: titled "<Provider> API key", with the form open while no key is saved. */
  active?: boolean;
  invalid?: boolean;
  /** Extra description for the input, such as the active key's error. */
  describedBy?: string;
}

/** One provider's key. Write-only: a saved key shows masked and can be replaced or removed, never read back. */
export function KeyRow({ provider, apiKey, onSave, active = false, invalid, describedBy }: Props) {
  const { label, keyPrefix } = PROVIDERS[provider];
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState('');
  const editButton = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const refocus = useRef(false);
  const confirmId = useId();
  const warningId = useId();
  const showForm = editing || (active && !apiKey);
  const key = draft.trim();
  // A partial prefix typed by hand ("sk-an") doesn't flash the warning.
  const suspicious = !!key && !keyPrefix.startsWith(key) && !looksLikeKeyFor(provider, key);

  // A saved or removed key swaps the row's controls once storage reports it: keep focus in the row.
  useEffect(() => {
    // A key saved elsewhere closes the open form: drop any held draft so Replace starts empty.
    if (!editing) setDraft('');
    if (!refocus.current) return;
    refocus.current = false;
    (editButton.current ?? input.current)?.focus();
    // Not keyed on `editing`: Save closing the form would spend `refocus` before the key arrives.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- deliberate, see above
  }, [apiKey]);

  function finish(newKey?: string) {
    if (newKey !== undefined) onSave(newKey);
    refocus.current = newKey !== undefined && newKey !== apiKey;
    // Render the row's buttons now so focus can return to one of them.
    flushSync(() => {
      setEditing(false);
      setConfirming(false);
      setDraft('');
    });
    (editButton.current ?? input.current)?.focus();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {/* Stacked so the whole mask, including the identifying last 4, fits at 320px. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-body-medium text-text-primary">
            {active ? `${label} API key` : label}
          </span>
          <span className="font-mono text-caption-1-medium text-text-secondary">
            <span className="sr-only">{apiKey ? 'Key ' : 'No key'}</span>
            <span aria-hidden={!apiKey || undefined}>{maskKey(apiKey)}</span>
          </span>
        </div>
        {!showForm && !confirming && (
          <>
            <Button
              ref={editButton}
              size="small"
              variant="secondary"
              onClick={() => setEditing(true)}
            >
              {apiKey ? 'Replace' : 'Add'}
              <span className="sr-only"> {label} key</span>
            </Button>
            {apiKey && (
              <Button size="small" variant="secondary" onClick={() => setConfirming(true)}>
                Remove
                <span className="sr-only"> {label} key</span>
              </Button>
            )}
          </>
        )}
      </div>
      {confirming && (
        <div role="group" aria-labelledby={confirmId} className="flex items-center gap-2">
          <span id={confirmId} className="min-w-0 flex-1 text-body-regular text-text-primary">
            Remove {label} key?
          </span>
          <Button size="small" variant="danger" onClick={() => finish('')}>
            Remove
          </Button>
          {/* The safe choice gets focus, so a repeated Enter doesn't remove the key. */}
          <Button size="small" variant="secondary" autoFocus onClick={() => finish()}>
            Cancel
          </Button>
        </div>
      )}
      {showForm && (
        <div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (key) finish(key);
            }}
          >
            <TextField
              type="password"
              aria-label={`${label} API key`}
              isInvalid={invalid}
              // The row reports errors itself: native validation would block Save while the key
              // is marked invalid.
              validationBehavior="aria"
              aria-describedby={describedBy ? `${warningId} ${describedBy}` : warningId}
              value={draft}
              onChange={setDraft}
              className="min-w-0 flex-1"
            >
              <InputBase
                ref={input}
                placeholder={`${keyPrefix}…`}
                autoFocus={editing}
                // On the <input>: TextField puts data attributes on its wrapper.
                {...NO_AUTOFILL}
                // A paste replaces the whole draft. It saves right away only if it looks like this
                // provider's key: anything else (a password, most other providers' keys) waits for
                // Save. OpenAI and DeepSeek keys share sk-, so they pass for each other.
                onPaste={(e) => {
                  const v = e.clipboardData.getData('text').trim();
                  if (!v) return;
                  e.preventDefault();
                  if (looksLikeKeyFor(provider, v)) finish(v);
                  else setDraft(v);
                }}
                onKeyDown={(e) => e.key === 'Escape' && finish()}
              />
            </TextField>
            <Button type="submit" disabled={!key}>
              Save
            </Button>
            {editing && (
              <Button variant="secondary" onClick={() => finish()}>
                Cancel
              </Button>
            )}
          </form>
          {/* Mounted with the form, so screen readers announce the warning when it appears. */}
          <p
            id={warningId}
            role="status"
            className="text-caption-1-medium text-text-secondary not-empty:mt-2"
          >
            {suspicious &&
              `This doesn't look like a key for ${label}. Check that you copied the right key, then click Save.`}
          </p>
        </div>
      )}
    </div>
  );
}
