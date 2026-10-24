import { useBlocker } from '@tanstack/react-router';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { Modal } from '@xbase/ui/components/xbase/modal';

const BLOCK = () => true;

/**
 * Asks before a navigation drops unsaved edits; the browser asks on reload or close. Navigations
 * that mean to leave (after Delete) pass `ignoreBlocker`. Keep editing (focused first) and Escape
 * stay; Discard changes lets the navigation through.
 */
export function UnsavedChangesDialog({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker({ shouldBlockFn: BLOCK, disabled: !dirty, withResolver: true });
  const stay = () => blocker.reset?.();
  return (
    <Modal
      role="alertdialog"
      isOpen={blocker.status === 'blocked'}
      onOpenChange={(open) => {
        if (!open) stay();
      }}
      title="Leave without saving?"
      description="This draft has changes you haven’t saved. They’re lost if you leave."
      footer={
        <>
          {/* The safe answer gets focus when the dialog opens. */}
          {/* oxlint-disable-next-line jsx-a11y/no-autofocus */}
          <Button variant="secondary" autoFocus onClick={stay}>
            Keep editing
          </Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()}>
            Discard changes
          </Button>
        </>
      }
    />
  );
}
