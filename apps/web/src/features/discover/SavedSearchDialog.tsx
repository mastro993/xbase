import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { Button, type ButtonProps } from '@xbase/ui/components/base/buttons/button';
import { Input } from '@xbase/ui/components/base/input/input';
import { Textarea } from '@xbase/ui/components/base/textarea/textarea';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { Modal } from '@xbase/ui/components/xbase/modal';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { type FormEvent, useId, useRef, useState } from 'react';
import { readableError } from '@/lib/readable-error';
import { createSavedSearchFn, updateSavedSearchFn } from './discover.functions';
import { MAX_SEARCH_NAME, MAX_SEARCH_QUERY, type SavedSearchDto } from './discover.schema';

type SavedSearchDialogProps = Omit<ButtonProps, 'onClick'> & {
  /** The search to edit; unset to create one. */
  search?: SavedSearchDto;
  /** Runs after the save, once the list has reloaded: e.g. opens the new search. */
  onSaved?: (search: SavedSearchDto) => Promise<void>;
};

// Kept whole: `-is:reply` would otherwise break after its hyphen.
const code = (text: string) => <code className="font-mono whitespace-nowrap">{text}</code>;

/**
 * Creates or edits a saved search: a name and an X search query. The trigger is a BoardUI Button
 * taking Button's props (`variant`, `size`, `leadingIcon`…), its label as children.
 */
export function SavedSearchDialog({ search, onSaved, ...trigger }: SavedSearchDialogProps) {
  const router = useRouter();
  const createSearch = useServerFn(createSavedSearchFn);
  const updateSearch = useServerFn(updateSavedSearchFn);
  const formId = useId();
  const errorId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const queryInput = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const start = () => {
    setName(search?.name ?? '');
    setQuery(search?.query ?? '');
    setError(null);
    setOpen(true);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (!name.trim()) {
      setError('Name the search.');
      nameInput.current?.focus();
      return;
    }
    if (!query.trim()) {
      setError('Enter a search query.');
      queryInput.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = search
        ? await updateSearch({ data: { id: search.id, name, query } })
        : await createSearch({ data: { name, query } });
      await router.invalidate({ sync: true });
      await onSaved?.(saved);
      setOpen(false);
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setSaving(false);
    }
  };

  const nameMissing = !!error && !name.trim();
  const queryMissing = !!error && !!name.trim() && !query.trim();

  return (
    <>
      <Button {...trigger} aria-haspopup="dialog" onClick={start} />
      <Modal
        isOpen={open}
        onOpenChange={setOpen}
        size="lg"
        isDismissable={!saving}
        isKeyboardDismissDisabled={saving}
        title={search ? 'Edit saved search' : 'New saved search'}
        description="Once XBase is connected to the X API, Discover runs it and lists fresh posts worth replying to. Until then, you can open it on X."
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              leadingIcon={saving ? Spinner : undefined}
              aria-busy={saving || undefined}
            >
              {search ? 'Save' : 'Save search'}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          {error && (
            <Callout id={errorId} tone="error" role="alert" title="Not saved">
              {error}
            </Callout>
          )}
          <Input
            ref={nameInput}
            label="Name"
            value={name}
            onChange={setName}
            maxLength={MAX_SEARCH_NAME}
            placeholder="Indie makers"
            autoComplete="off"
            isRequired
            isInvalid={nameMissing}
            // The form reports errors itself: native validation would block a retry.
            validationBehavior="aria"
            aria-describedby={nameMissing ? errorId : undefined}
            // The dialog opens to fill it in: start with the name.
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <Textarea
            ref={queryInput}
            label="Query"
            value={query}
            onChange={setQuery}
            maxLength={MAX_SEARCH_QUERY}
            showCount
            autoResize
            maxRows={10}
            placeholder={'(buildinpublic OR "indie hacker") lang:en -is:reply'}
            inputClassName="font-mono"
            spellCheck="false"
            isRequired
            isInvalid={queryMissing}
            // The form reports errors itself: native validation would block a retry.
            validationBehavior="aria"
            aria-describedby={queryMissing ? errorId : undefined}
            hint={
              <>
                X’s search syntax: words, {code('"exact phrases"')}, {code('OR')}, {code('from:')},{' '}
                {code('lang:')}, {code('-is:reply')} and {code('min_likes:')}.
              </>
            }
          />
        </form>
      </Modal>
    </>
  );
}
