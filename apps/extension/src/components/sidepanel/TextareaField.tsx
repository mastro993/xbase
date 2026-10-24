import { HintText } from '@xbase/ui/components/base/input/hint-text';
import { TextField } from '@xbase/ui/components/base/input/input';
import { Label } from '@xbase/ui/components/base/input/label';
import { TextareaBase } from '@xbase/ui/components/base/textarea/textarea';
import { cx } from '@xbase/ui/utils/cx';
import type { ReactNode } from 'react';

interface Props {
  /** The textarea's id; its counter is `<id>-count`. */
  id: string;
  label: string;
  /** Help under the label. */
  description?: string;
  /** A live save status at the start of the footer, such as "Saved". */
  status?: ReactNode;
  value: string;
  maxLength: number;
  placeholder: string;
  /** Classes for the textarea, e.g. its minimum height. */
  className?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}

/**
 * BoardUI's Textarea, assembled from its own parts in another order: help under the label, and a
 * footer with a live save status and a counter that also describes the field. BoardUI's Textarea
 * puts its hint below the field, doesn't describe the field by its counter and has no status slot.
 * The field grows with its text, and refits when the panel is resized.
 */
export function TextareaField({
  id,
  label,
  description,
  status,
  value,
  maxLength,
  placeholder,
  className,
  onChange,
  onBlur,
}: Props) {
  const countId = `${id}-count`;
  // Only text saved before the limit existed can be over it.
  const over = value.length > maxLength;
  return (
    <TextField
      id={id}
      value={value}
      maxLength={maxLength}
      isInvalid={over}
      aria-describedby={countId}
      onChange={onChange}
      onBlur={onBlur}
    >
      <Label>{label}</Label>
      {description && <HintText>{description}</HintText>}
      <TextareaBase
        placeholder={placeholder}
        resize="none"
        className={cx('field-sizing-content', className)}
      />
      <div className="flex w-full items-start justify-between gap-3 text-caption-1-medium">
        {status !== undefined && (
          <span role="status" className="text-text-secondary">
            {status}
          </span>
        )}
        <span
          id={countId}
          className={cx(
            'ms-auto shrink-0 text-text-tertiary tabular-nums',
            over && 'text-text-error-primary',
          )}
        >
          {value.length}/{maxLength}
        </span>
      </div>
    </TextField>
  );
}
