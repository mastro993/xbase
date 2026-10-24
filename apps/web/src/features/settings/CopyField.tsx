import { RiCheckLine, RiFileCopyLine } from '@remixicon/react';
import { IconButton } from '@xbase/ui/components/base/buttons/icon-button';
import { Input } from '@xbase/ui/components/base/input/input';
import { Tooltip, TooltipTrigger } from '@xbase/ui/components/base/tooltip/tooltip';
import { useEffect, useId, useRef, useState } from 'react';
import { Focusable } from 'react-aria-components';

type CopyFieldProps = {
  label: string;
  value: string;
  /** The copy button's accessible name and tooltip, e.g. "Copy server URL". */
  copyLabel: string;
  /** Focus and select the value on mount: for a value shown once, like a new API key. */
  selectOnMount?: boolean;
};

/** A read-only value with a copy button that stays selectable when the clipboard is unavailable. */
export function CopyField({ label, value, copyLabel, selectOnMount }: CopyFieldProps) {
  const statusId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle');

  // Focus first: focusing selects the value too, and select() alone wouldn't move focus.
  const selectValue = () => {
    input.current?.focus();
    input.current?.select();
  };

  useEffect(() => {
    if (!selectOnMount) return;
    input.current?.focus();
    input.current?.select();
  }, [selectOnMount]);

  useEffect(() => {
    if (copy !== 'copied') return;
    const timer = setTimeout(() => setCopy('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copy]);

  // navigator.clipboard only exists on secure origins (https, localhost): on a plain-http LAN
  // address it's undefined. Select the text instead, so Ctrl+C or ⌘C copies it.
  const onCopy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('No clipboard');
      await navigator.clipboard.writeText(value);
      setCopy('copied');
    } catch {
      selectValue();
      setCopy('manual');
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-end gap-2">
        <Input
          ref={input}
          label={label}
          value={value}
          isReadOnly
          inputClassName="font-mono"
          aria-describedby={statusId}
          onFocus={(event) => event.target.select()}
          className="min-w-0 flex-1"
        />
        <TooltipTrigger>
          <Focusable>
            <IconButton
              icon={copy === 'copied' ? RiCheckLine : RiFileCopyLine}
              aria-label={copyLabel}
              onClick={() => void onCopy()}
            />
          </Focusable>
          <Tooltip>{copy === 'copied' ? 'Copied' : copyLabel}</Tooltip>
        </TooltipTrigger>
      </div>
      {/* Always mounted, so screen readers announce the text when it appears. */}
      <p id={statusId} role="status" className="text-caption-1-medium text-text-secondary">
        {copy === 'copied' && <span className="sr-only">Copied.</span>}
        {copy === 'manual' && (
          <span className="block pt-1">
            This browser only copies on https addresses. The text is selected: press Ctrl+C or ⌘C.
          </span>
        )}
      </p>
    </div>
  );
}
