'use client';

import { CloseButton } from '@xbase/ui/components/base/buttons/close-button';
import { cx } from '@xbase/ui/utils/cx';
import { useId, type ReactNode } from 'react';
import {
  Dialog as AriaDialog,
  Heading as AriaHeading,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
  type ModalOverlayProps as AriaModalOverlayProps,
} from 'react-aria-components';

/**
 * Why it exists: BoardUI's free registry has no general dialog (settings-modal is a fixed settings
 * shell), so this dresses React Aria's ModalOverlay, Modal and Dialog in BoardUI's modal recipe.
 *
 * React Aria traps focus, restores it to the trigger on close, locks page scroll, hides the rest of
 * the page from screen readers, closes on Escape and on a press outside, and names the dialog from
 * its title. Motion is the motion.md modal recipe: the panel condenses from scale 0.85 with a 4px
 * blur over 300ms on cubic-bezier(0.32, 0.72, 0, 1) while the black 70% backdrop cross-fades, and it
 * unmounts once the exit transition ends.
 *
 *   const [open, setOpen] = useState(false);
 *   <Modal isOpen={open} onOpenChange={setOpen} title="Schedule post" description="…"
 *     footer={<Button onClick={() => setOpen(false)}>Done</Button>}>
 *     …form…
 *   </Modal>
 *
 * Inside a React Aria DialogTrigger, omit isOpen and onOpenChange, and wrap the BoardUI trigger
 * button in React Aria's Pressable. `role="alertdialog"` is for confirmations: it also turns off
 * closing on a press outside. `isDismissable={false}` keeps a press outside from closing it (a
 * revealed secret, a request in flight); `isKeyboardDismissDisabled` does the same for Escape. A
 * control that should get focus first takes `autoFocus`; otherwise the dialog itself is focused.
 * A popover opened inside must stack at z-50 like the overlay: Combobox and Tooltip do, a Select
 * needs `popoverClassName="z-50"`.
 */

export type ModalSize = 'sm' | 'lg';

export interface ModalProps extends Omit<
  AriaModalOverlayProps,
  'children' | 'className' | 'style'
> {
  /** The dialog's accessible name, shown as its heading. */
  title: ReactNode;
  /** Supporting text under the title; becomes the dialog's description. */
  description?: ReactNode;
  /** The body. */
  children?: ReactNode;
  /** The action row, end-aligned; stacked full width on narrow screens. */
  footer?: ReactNode;
  /** `alertdialog` for confirmations that interrupt the user. */
  role?: 'dialog' | 'alertdialog';
  /** Panel width: 384 (default) or 512px. */
  size?: ModalSize;
  /** The X in the corner, named "Close". Defaults to on while the modal is dismissable. */
  showCloseButton?: boolean;
}

const SIZES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  lg: 'max-w-lg',
};

export function Modal({
  title,
  description,
  children,
  footer,
  role = 'dialog',
  size = 'sm',
  isDismissable = role !== 'alertdialog',
  isKeyboardDismissDisabled,
  showCloseButton = isDismissable,
  ...props
}: ModalProps) {
  const descriptionId = useId();
  return (
    <AriaModalOverlay
      {...props}
      isDismissable={isDismissable}
      isKeyboardDismissDisabled={isKeyboardDismissDisabled}
      className={cx(
        'fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4',
        'transition-opacity duration-300 ease-out motion-reduce:transition-none',
        'data-[entering]:opacity-0 data-[exiting]:opacity-0',
      )}
    >
      <AriaModal
        className={cx(
          'w-full outline-none',
          SIZES[size],
          'transform-gpu transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[opacity,transform,filter] motion-reduce:transition-none',
          'data-[entering]:scale-[0.85] data-[entering]:opacity-0 data-[entering]:blur-[4px]',
          'data-[exiting]:scale-[0.85] data-[exiting]:opacity-0 data-[exiting]:blur-[4px]',
        )}
      >
        <AriaDialog
          role={role}
          aria-describedby={description ? descriptionId : undefined}
          className="relative flex max-h-[calc(100dvh-2rem)] flex-col gap-5 overflow-y-auto rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-xl outline-none"
        >
          {({ close }) => (
            <>
              <div className={cx('flex flex-col gap-1', showCloseButton && 'pe-8')}>
                <AriaHeading slot="title" className="text-title-3-semibold text-text-primary">
                  {title}
                </AriaHeading>
                {description && (
                  <p id={descriptionId} className="text-body-regular text-text-secondary">
                    {description}
                  </p>
                )}
              </div>
              {showCloseButton && (
                <CloseButton
                  size="md"
                  aria-label="Close"
                  onClick={close}
                  className="absolute end-4 top-4"
                />
              )}
              {children !== undefined && <div className="flex flex-col gap-4">{children}</div>}
              {footer !== undefined && (
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  {footer}
                </div>
              )}
            </>
          )}
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}
