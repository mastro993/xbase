import { Add01Icon } from '@hugeicons/core-free-icons';
import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { MAX_API_KEY_NAME } from '@xbase/core/api-keys';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { Input } from '@xbase/ui/components/base/input/input';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { Modal } from '@xbase/ui/components/xbase/modal';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { type FormEvent, useId, useRef, useState } from 'react';
import { CopyField } from '@/features/settings/CopyField';
import { readableError } from '@/lib/readable-error';
import { createApiKeyFn } from './api-keys.functions';

/**
 * Names a new key, then shows it once. The plaintext lives only in this component's state: it
 * never goes into loader data, and the next opening starts over.
 */
export function NewApiKeyDialog() {
  const router = useRouter();
  const createKey = useServerFn(createApiKeyFn);
  const formId = useId();
  const errorId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);

  const start = () => {
    setName('');
    setError(null);
    setCreated(null);
    setOpen(true);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;
    if (!name.trim()) {
      setError('Name the key, e.g. “Backup script”.');
      nameInput.current?.focus();
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const { key, apiKey } = await createKey({ data: { name } });
      setCreated({ key, name: apiKey.name });
      // Refresh the list behind the dialog; the key itself stays out of loader data.
      await router.invalidate({ sync: true });
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Button leadingIcon={Add01Icon} aria-haspopup="dialog" onClick={start}>
        New API key
      </Button>
      <Modal
        isOpen={open}
        onOpenChange={setOpen}
        size="lg"
        // While the key is on screen, a stray press outside mustn't lose it: Escape and Done
        // still close the dialog. Nothing closes it while the request runs.
        isDismissable={!created && !creating}
        isKeyboardDismissDisabled={creating}
        title={created ? `Your key for ${created.name}` : 'New API key'}
        description={
          created
            ? 'Send it in the Authorization header as a Bearer token.'
            : 'For a script or another app. It can read and write your drafts.'
        }
        footer={
          created ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" disabled={creating} onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                form={formId}
                leadingIcon={creating ? Spinner : undefined}
                aria-busy={creating || undefined}
              >
                Create key
              </Button>
            </>
          )
        }
      >
        {created ? (
          <>
            <Callout tone="success" role="status" title="Copy it now">
              XBase keeps only a hash, so this is the only time you’ll see it. Anyone with it can
              read and write your drafts.
            </Callout>
            <CopyField label="API key" value={created.key} copyLabel="Copy API key" selectOnMount />
          </>
        ) : (
          <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            {error && (
              <Callout id={errorId} tone="error" role="alert" title="Couldn’t create the key">
                {error}
              </Callout>
            )}
            <Input
              ref={nameInput}
              label="Name"
              // While invalid, BoardUI shows the hint as the error: the Callout above has it.
              hint={error ? undefined : 'Where you’ll use it.'}
              name="name"
              value={name}
              onChange={setName}
              maxLength={MAX_API_KEY_NAME}
              placeholder="Backup script"
              autoComplete="off"
              isRequired
              isInvalid={!!error}
              // The form reports errors itself: native validation would block a retry.
              validationBehavior="aria"
              aria-describedby={error ? errorId : undefined}
              // The dialog opens to name the key: start there.
              // oxlint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </form>
        )}
      </Modal>
    </>
  );
}
