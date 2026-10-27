import { ArrowTurnBackwardIcon, Delete02Icon, SparklesIcon } from '@hugeicons/core-free-icons';
import { MAX_WEIGHTED_LENGTH, weightedLength } from '@xbase/core/posts/weighted-length';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { TextField } from '@xbase/ui/components/base/input/input';
import { Label } from '@xbase/ui/components/base/input/label';
import { TextareaBase } from '@xbase/ui/components/base/textarea/textarea';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { cx } from '@xbase/ui/utils/cx';
import type { Ref } from 'react';

type ThreadPartFieldProps = {
  id: string;
  index: number;
  total: number;
  text: string;
  onChange: (text: string) => void;
  fieldRef: Ref<HTMLTextAreaElement>;
  readOnly: boolean;
  /** Unset while the part can't be refined (AI isn't set up, or the post is frozen). */
  onRefine?: () => void;
  refining: boolean;
  /** Set right after a refine: puts back the text from before it. */
  onUndo?: () => void;
  /** Unset for the only part of a post. */
  onRemove?: () => void;
  /** Ids of text that explains why Refine is unavailable. */
  refineHintId?: string;
};

/**
 * One post of a thread: its text, X's weighted counter, and Refine / Undo / Remove. BoardUI's
 * Textarea parts in another order: its counter counts characters, not X's weights, sits under the
 * field and doesn't describe it, so the label row carries this one instead.
 */
export function ThreadPartField({
  id,
  index,
  total,
  text,
  onChange,
  fieldRef,
  readOnly,
  onRefine,
  refining,
  onUndo,
  onRemove,
  refineHintId,
}: ThreadPartFieldProps) {
  const name = total > 1 ? `Post ${index + 1} of ${total}` : 'Post';
  const length = weightedLength(text);
  const over = length - MAX_WEIGHTED_LENGTH;
  const countId = `${id}-count`;
  // aria-disabled rather than disabled: the button stays focusable, so its hint is read out.
  const refinable = !!onRefine && text.trim() !== '';

  return (
    <div className="flex flex-col gap-2">
      <TextField
        id={id}
        value={text}
        onChange={onChange}
        isReadOnly={readOnly || refining}
        isInvalid={over > 0}
        validationBehavior="aria"
        aria-describedby={countId}
        className="gap-2"
      >
        <div className="flex w-full items-baseline justify-between gap-3">
          <Label>{name}</Label>
          {/* The words matter as much as the colour: "12 over" says what's wrong. */}
          <span
            id={countId}
            className={cx(
              'text-caption-1-medium text-text-secondary tabular-nums',
              over > 0 && 'text-text-error-primary',
            )}
          >
            {length}/{MAX_WEIGHTED_LENGTH}
            {over > 0 && ` · ${over} over`}
          </span>
        </div>
        <TextareaBase
          ref={fieldRef}
          rows={3}
          autoResize
          maxRows={14}
          placeholder={index === 0 ? 'What do you want to say?' : 'Continue the thread'}
          aria-busy={refining || undefined}
        />
      </TextField>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="small"
            leadingIcon={refining ? Spinner : SparklesIcon}
            aria-busy={refining || undefined}
            aria-disabled={!refinable || undefined}
            aria-describedby={refineHintId}
            onClick={refinable && !refining ? onRefine : undefined}
          >
            Refine with AI
            {total > 1 && <span className="sr-only"> post {index + 1}</span>}
          </Button>
          {onUndo && (
            <Button
              variant="secondary"
              size="small"
              leadingIcon={ArrowTurnBackwardIcon}
              onClick={onUndo}
            >
              Undo refine
            </Button>
          )}
          {onRemove && (
            <Button
              variant="secondary"
              size="small"
              leadingIcon={Delete02Icon}
              className="ms-auto"
              onClick={onRemove}
            >
              Remove<span className="sr-only"> post {index + 1}</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
