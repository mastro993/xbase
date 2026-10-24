'use client';

import {
  MENU_ITEMS_CONTAINER,
  MENU_POPOVER_SURFACE,
} from '@xbase/ui/components/base/dropdown/menu-styles';
import { HintText } from '@xbase/ui/components/base/input/hint-text';
import { Label } from '@xbase/ui/components/base/input/label';
import { ChevronDownSmall } from '@xbase/ui/components/foundations/icons/chevrons';
import { cx } from '@xbase/ui/utils/cx';
import type { ReactNode } from 'react';
import {
  Button as AriaButton,
  ComboBox as AriaComboBox,
  Group as AriaGroup,
  Input as AriaInput,
  ListBox as AriaListBox,
  Popover as AriaPopover,
  type ComboBoxProps as AriaComboBoxProps,
} from 'react-aria-components';

/**
 * Why it exists: BoardUI's select can't be searched, and a model list hundreds of entries long
 * needs typing to narrow it.
 *
 * React Aria's ComboBox with Select's trigger surface, menu panel and rows, and Input's label and
 * hint. Type to filter, arrows to move, Enter to pick, Escape to close; the chevron opens the full
 * list. Rows are Select's `SelectItem`, re-exported as `ComboboxItem`:
 *
 *   <Combobox label="Model" defaultItems={models} selectedKey={id} onSelectionChange={setId}>
 *     {(model) => <ComboboxItem id={model.id} textValue={model.label}>{model.label}</ComboboxItem>}
 *   </Combobox>
 *
 * Built-in filtering needs `defaultItems`; with `items`, filter them yourself from `inputValue`.
 * `labelAction` puts a small control at the end of the label row (e.g. a refresh button), and
 * `footer` a note under the open list (e.g. "Showing 50 of 300").
 */

export { SelectItem as ComboboxItem } from '@xbase/ui/components/base/select/select';

export interface ComboboxProps<T extends object> extends Omit<
  AriaComboBoxProps<T>,
  'children' | 'className'
> {
  label?: ReactNode;
  /** A small control at the end of the label row, outside the label. */
  labelAction?: ReactNode;
  /** Help text below the field; shown as the error while `isInvalid`. */
  hint?: ReactNode;
  placeholder?: string;
  /** Shown in the open list when nothing matches. */
  emptyText?: ReactNode;
  /** A note under the open list. */
  footer?: ReactNode;
  children: ReactNode | ((item: T) => ReactNode);
}

export function Combobox<T extends object>({
  label,
  labelAction,
  hint,
  placeholder,
  emptyText = 'No matches',
  footer,
  children,
  allowsEmptyCollection = true,
  ...props
}: ComboboxProps<T>) {
  return (
    <AriaComboBox
      {...props}
      allowsEmptyCollection={allowsEmptyCollection}
      className="group flex w-full flex-col gap-1"
    >
      {({ isRequired, isInvalid, isDisabled }) => (
        <>
          {(label || labelAction) && (
            <div className="flex items-center justify-between gap-2">
              {label && (
                <Label isRequired={isRequired} isInvalid={isInvalid}>
                  {label}
                </Label>
              )}
              {labelAction}
            </div>
          )}
          <AriaGroup
            className={({ isFocusWithin, isHovered }) =>
              cx(
                'flex w-full items-center rounded-2lg border border-border-button-default bg-background-primary-default shadow-xs',
                'ease transition-[background-color,border-color,box-shadow] duration-150',
                isHovered && !isFocusWithin && !isDisabled && 'border-border-button-hover',
                isFocusWithin && 'ring-2 ring-border-focus-ring',
                isInvalid && 'border-border-error-default',
                isDisabled && 'cursor-not-allowed bg-background-primary-disabled shadow-none',
              )
            }
          >
            <AriaInput
              placeholder={placeholder}
              className={cx(
                'min-w-0 flex-1 border-0 bg-transparent py-2 ps-2.5 pe-1 outline-none',
                'font-sans text-body-medium text-text-primary placeholder:text-text-tertiary',
                'disabled:cursor-not-allowed disabled:text-text-tertiary',
              )}
            />
            <AriaButton
              className={cx(
                'flex shrink-0 cursor-pointer items-center self-stretch rounded-e-2lg ps-1 pe-2.5 outline-none',
                'disabled:cursor-not-allowed',
              )}
            >
              <ChevronDownSmall
                className={cx(
                  'ease size-4 shrink-0 text-text-secondary transition-transform duration-200',
                  'group-data-[open]:rotate-180',
                )}
              />
            </AriaButton>
          </AriaGroup>
          {hint && <HintText isInvalid={isInvalid}>{hint}</HintText>}
          <AriaPopover
            offset={4}
            className={cx(
              MENU_POPOVER_SURFACE,
              // Above a Modal's overlay; as wide as the field, so long names fit.
              'z-50 min-w-(--trigger-width) p-2',
            )}
          >
            <AriaListBox
              className={cx(MENU_ITEMS_CONTAINER, 'max-h-[240px] overflow-auto')}
              renderEmptyState={() => (
                <p className="p-2 text-body-regular text-text-tertiary">{emptyText}</p>
              )}
            >
              {children}
            </AriaListBox>
            {footer && (
              <div className="mt-2 border-t border-separator-border px-2 pt-2 text-caption-1-medium text-text-tertiary">
                {footer}
              </div>
            )}
          </AriaPopover>
        </>
      )}
    </AriaComboBox>
  );
}
