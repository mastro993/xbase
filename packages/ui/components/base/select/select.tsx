'use client';

import { RiCheckLine } from '@remixicon/react';
import {
  MENU_ITEM,
  MENU_ITEM_ACTIVE,
  MENU_ITEMS_CONTAINER,
  MENU_POPOVER_SURFACE,
  MENU_POPOVER_WIDTH,
} from '@xbase/ui/components/base/dropdown/menu-styles';
import { Label } from '@xbase/ui/components/base/input/label';
import { ChevronDownSmall } from '@xbase/ui/components/foundations/icons/chevrons';
import { cx } from '@xbase/ui/utils/cx';
import {
  useDismissOnOutsidePress,
  useTriggerToggle,
} from '@xbase/ui/utils/use-dismiss-on-outside-press';
import { createContext, useContext, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import {
  Button as AriaButton,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Popover as AriaPopover,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
} from 'react-aria-components';
import type {
  ListBoxItemProps as AriaListBoxItemProps,
  SelectProps as AriaSelectProps,
  SelectValueRenderProps as AriaSelectValueRenderProps,
} from 'react-aria-components';

/**
 * Figma source: Board UI → dashboard 1 dropdown triggers ("All prices" filter
 * node 3731:3208, table status dropdown node 3731:3264).
 *
 * Select with a button trigger styled 1:1 with Figma:
 *   trigger  bg color/white, 1px border/button/default, shadow/xs,
 *            px 10 py 8, radius/2lg (10px), gap 6,
 *            Body 1/Medium text color/neutral/950,
 *            16px chevron (custom stroke glyph) in text/secondary
 *
 * The open popover/listbox shares the BoardUI menu recipe with Dropdown:
 * radius/2xl panel, p 10, shadow/dropdown, 150ms fade/scale/blur motion,
 * and radius/2lg rows with the same hover/selected surface.
 *
 * Item content is free-form: pass a `StatusDot` + text for status selects.
 *
 * XBase edits:
 *   - an optional `label`, rendered with Input's `Label` so React Aria wires
 *     it to the trigger (`isRequired` adds the asterisk);
 *   - in the list, only the focused row takes the highlight, and the selected
 *     row shows a tick, so the two read apart while arrowing through it.
 */

export type SelectSize = 'sm' | 'md';

const SelectSizeContext = createContext<SelectSize>('md');

export interface SelectProps<T extends object> extends Omit<AriaSelectProps<T>, 'children'> {
  /** Trigger width. Defaults to hug content; the menu uses the shared 266px width. */
  className?: string;
  triggerClassName?: string;
  /** Classes for the open popover (e.g. constrain its width). */
  popoverClassName?: string;
  /** `md` (default) or `sm` for compact/dense contexts (e.g. compact tables). */
  size?: SelectSize;
  /** Visible label above the trigger, wired to it by React Aria. */
  label?: ReactNode;
  children: ReactNode;
  items?: Iterable<T>;
  /** Customise the trigger's rendered value (e.g. a compact flag + dial code).
   *  Falls back to the selected item's own content when omitted. */
  renderValue?: ReactNode | ((values: AriaSelectValueRenderProps<T>) => ReactNode);
  ref?: Ref<HTMLDivElement>;
}

export function Select<T extends object>({
  className,
  triggerClassName,
  popoverClassName,
  size = 'md',
  label,
  children,
  items,
  renderValue,
  ref,
  ...props
}: SelectProps<T>) {
  // The popover is `isNonModal`: react-aria's modal scroll lock puts
  // `overflow: hidden` on <html>, which — with this app's `h-full` root —
  // collapses the page scroll position and visibly yanks the sticky
  // sidebar upward every time a select opens. Non-modal skips the lock,
  // but also disables react-aria's outside-press dismissal (`isDismissable`
  // is hard-coupled to `!isNonModal` in usePopover), so open state is
  // controlled here and dismissal restored manually — the same fix as the
  // date-picker family (see utils/use-dismiss-on-outside-press.ts).
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  useDismissOnOutsidePress(isOpen, () => setIsOpen(false), [triggerRef, popoverRef]);
  // Pressing the trigger while open closes the popover instead of reopening
  const allowOpenChange = useTriggerToggle(isOpen, triggerRef);

  return (
    <AriaSelect
      ref={ref}
      {...props}
      isOpen={isOpen}
      onOpenChange={(o) => allowOpenChange(o) && setIsOpen(o)}
      className={cx('group flex flex-col gap-1', className)}
    >
      {({ isRequired, isInvalid }) => (
        <>
          {label && (
            <Label isRequired={isRequired} isInvalid={isInvalid}>
              {label}
            </Label>
          )}
          <AriaButton
            ref={triggerRef}
            className={cx(
              'flex w-full cursor-pointer items-center justify-between rounded-2lg',
              'border border-border-button-default bg-background-primary-default shadow-xs',
              'text-text-primary',
              'ease transition-[background-color,border-color,box-shadow,padding,font-size] duration-200',
              'hover:border-border-button-hover hover:bg-background-primary-hover',
              'outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:bg-background-primary-disabled disabled:text-text-tertiary disabled:shadow-none',
              size === 'sm'
                ? 'gap-1 px-[7px] py-1 text-body-2-medium'
                : 'gap-1.5 px-2.5 py-2 text-body-medium',
              triggerClassName,
            )}
          >
            <AriaSelectValue
              className={cx(
                'flex min-w-0 items-center truncate',
                size === 'sm' ? 'gap-1' : 'gap-[5px]',
              )}
            >
              {renderValue as never /* RAC accepts node or render-prop */}
            </AriaSelectValue>
            <ChevronDownSmall
              className={cx(
                'ease shrink-0 text-text-secondary transition-transform duration-200',
                size === 'sm' ? 'size-3.5' : 'size-4',
                isOpen && 'rotate-180',
              )}
            />
          </AriaButton>
          <AriaPopover
            ref={popoverRef}
            isNonModal
            offset={4}
            className={cx(
              MENU_POPOVER_WIDTH,
              MENU_POPOVER_SURFACE,
              // Listbox rows already space themselves 4px apart, so the
              // surface sits a touch tighter than the action-menu Dropdown.
              'p-2',
              popoverClassName,
            )}
          >
            <AriaListBox
              items={items}
              className={cx(MENU_ITEMS_CONTAINER, 'max-h-[240px] overflow-auto')}
            >
              <SelectSizeContext.Provider value={size}>{children}</SelectSizeContext.Provider>
            </AriaListBox>
          </AriaPopover>
        </>
      )}
    </AriaSelect>
  );
}

export interface SelectItemProps extends Omit<AriaListBoxItemProps, 'children'> {
  children?: ReactNode;
}

export function SelectItem({ className, children, textValue, ...props }: SelectItemProps) {
  const size = useContext(SelectSizeContext);
  return (
    <AriaListBoxItem
      {...props}
      // XBase: render-prop children (for the tick) hide a plain-text label from typeahead.
      textValue={textValue ?? (typeof children === 'string' ? children : undefined)}
      className={(state) =>
        cx(
          MENU_ITEM,
          size === 'sm' ? 'px-2 py-1.5 text-body-2-medium' : 'text-body-medium',
          // XBase: the highlight follows focus alone; the tick marks the selected row.
          state.isFocused && MENU_ITEM_ACTIVE,
          state.isDisabled && 'cursor-not-allowed text-text-disabled',
          typeof className === 'function' ? className(state) : className,
        )
      }
    >
      {({ isSelected }) => (
        <>
          {children}
          {isSelected && (
            <RiCheckLine aria-hidden className="ms-auto size-4 shrink-0 text-text-accent" />
          )}
        </>
      )}
    </AriaListBoxItem>
  );
}
