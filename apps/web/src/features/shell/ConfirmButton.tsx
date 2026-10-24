import { Button, type ButtonProps } from '@xbase/ui/components/base/buttons/button';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { Modal } from '@xbase/ui/components/xbase/modal';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { type ReactNode, useState } from 'react';
import { readableError } from '@/lib/readable-error';

type ConfirmButtonProps = Omit<ButtonProps, 'onClick' | 'title'> & {
  /** The question, e.g. "Delete this post?". */
  title: string;
  description: ReactNode;
  /** The answer button's text, e.g. "Delete". */
  action: string;
  /** The error's title when onConfirm throws, e.g. "Couldn’t delete". */
  errorTitle: string;
  /** Does the deed. If it throws, the dialog stays open and shows the error. */
  onConfirm: () => Promise<void>;
};

/**
 * A BoardUI Button whose destructive action is confirmed in an alertdialog. The trigger takes
 * Button's props (`variant`, `size`, `leadingIcon`…; secondary by default) and its label as
 * children. Focus starts on Cancel. While onConfirm runs, the answer button shows a spinner and
 * the dialog can't be dismissed; it closes when onConfirm resolves.
 */
export function ConfirmButton({
  title,
  description,
  action,
  errorTitle,
  onConfirm,
  variant = 'secondary',
  ...trigger
}: ConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        {...trigger}
        variant={variant}
        aria-haspopup="dialog"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      />
      <Modal
        role="alertdialog"
        isOpen={open}
        onOpenChange={setOpen}
        isKeyboardDismissDisabled={busy}
        title={title}
        description={description}
        footer={
          <>
            {/* The safe answer gets focus when the dialog opens. Disabled while the request runs:
                it can't be taken back. */}
            {/* oxlint-disable-next-line jsx-a11y/no-autofocus */}
            <Button variant="secondary" autoFocus disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              leadingIcon={busy ? Spinner : undefined}
              aria-busy={busy || undefined}
              onClick={() => void confirm()}
            >
              {action}
            </Button>
          </>
        }
      >
        {error ? (
          <Callout tone="error" role="alert" title={errorTitle}>
            {error}
          </Callout>
        ) : undefined}
      </Modal>
    </>
  );
}
