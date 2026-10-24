import { RiCalendarScheduleLine } from '@remixicon/react';
import {
  earliestPublishInput,
  formatDateTime,
  fromDateTimeInput,
  suggestPublishTime,
  toDateTimeInput,
} from '@xbase/core/posts/dates';
import { MIN_PUBLISH_LEAD_MS } from '@xbase/core/posts/schema';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { HintText } from '@xbase/ui/components/base/input/hint-text';
import { InputBase, TextField } from '@xbase/ui/components/base/input/input';
import { Label } from '@xbase/ui/components/base/input/label';
import { Kbd } from '@xbase/ui/components/base/kbd/kbd';
import { Callout } from '@xbase/ui/components/xbase/callout';
import { Modal } from '@xbase/ui/components/xbase/modal';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { type FormEvent, type KeyboardEvent, useId, useState } from 'react';
import { readableError } from '@/lib/readable-error';
import { isShortcut, useModifierLabel } from './keyboard';
import { useClock } from './use-clock';

type ScheduleDialogProps = {
  /** The trigger's text and the dialog's title: "Schedule" or "Reschedule". */
  label: string;
  /** The post's current publish time (ISO), which the field starts at. */
  publishAt: string | null;
  /** Schedules the post; the dialog shows the error and stays open if it throws. */
  onConfirm: (publishAt: Date) => Promise<void>;
};

/**
 * Picks a time in the browser's zone. ⌘↵ / Ctrl+↵ (or Enter) in the field confirms. The field is
 * BoardUI's Input assembled from its parts, because its composed Input doesn't pass `min` and
 * `onKeyDown` through to the <input>.
 */
export function ScheduleDialog({ label, publishAt, onConfirm }: ScheduleDialogProps) {
  const formId = useId();
  const modifier = useModifierLabel();
  const clock = useClock();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Every opening starts from the post's time, unless it has passed: then the next full hour.
  const show = () => {
    const now = new Date();
    const current = publishAt ? new Date(publishAt) : null;
    const start =
      current && current.getTime() >= now.getTime() + MIN_PUBLISH_LEAD_MS
        ? current
        : suggestPublishTime(now);
    setValue(toDateTimeInput(start));
    setError(null);
    setOpen(true);
  };

  // A request in flight can't be taken back, so nothing closes the dialog until it settles.
  const onOpenChange = (next: boolean) => {
    if (!next && !busy) setOpen(false);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The dialog is portalled, but React still bubbles events up the component tree.
    event.stopPropagation();
    if (busy) return;
    const date = fromDateTimeInput(value);
    if (!date) return setError('Pick a date and a time.');
    if (date.getTime() < Date.now() + MIN_PUBLISH_LEAD_MS) {
      return setError('Pick a time at least a minute from now.');
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(date);
      setOpen(false);
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isShortcut(event, 'Enter')) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const date = fromDateTimeInput(value);
  // Only rendered while open, in the browser: reading its zone here can't mismatch hydration.
  const zone = open ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';

  return (
    <>
      <Button
        variant="secondary"
        leadingIcon={RiCalendarScheduleLine}
        aria-haspopup="dialog"
        onClick={show}
      >
        {label}
      </Button>
      <Modal
        isOpen={open}
        onOpenChange={onOpenChange}
        title={label === 'Schedule' ? 'Schedule post' : 'Reschedule post'}
        description={`Times are in your browser’s time zone, ${zone}.`}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              leadingIcon={busy ? Spinner : undefined}
              aria-busy={busy || undefined}
              aria-keyshortcuts="Meta+Enter Control+Enter"
            >
              <span className="inline-flex items-center gap-1.5">
                {label}
                {modifier && <Kbd aria-hidden="true">{modifier}↵</Kbd>}
              </span>
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {error && (
            <Callout tone="error" role="alert" title="Not scheduled">
              {error}
            </Callout>
          )}
          <TextField
            type="datetime-local"
            value={value}
            onChange={setValue}
            isRequired
            isInvalid={!!error}
            validationBehavior="aria"
          >
            <Label isRequired>Date and time</Label>
            <InputBase
              min={clock.now && earliestPublishInput(clock.now)}
              onKeyDown={onKeyDown}
              // The dialog is there to pick this time.
              // oxlint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <HintText>{date ? formatDateTime(date, clock) : 'No time picked yet.'}</HintText>
          </TextField>
        </form>
      </Modal>
    </>
  );
}
