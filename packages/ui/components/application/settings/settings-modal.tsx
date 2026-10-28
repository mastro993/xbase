'use client';

import { CloseButton } from '@xbase/ui/components/base/buttons/close-button';
import { cx } from '@xbase/ui/utils/cx';
import { IconGlyph, type IconReference } from '@xbase/ui/utils/icon';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import {
  Dialog as AriaDialog,
  Heading as AriaHeading,
  Modal as AriaModal,
  ModalOverlay as AriaModalOverlay,
} from 'react-aria-components';

/**
 * BoardUI's settings modal (Board UI → Settings/Profile, node 4081:13943), rebuilt on React Aria:
 * a centred panel with a grouped navigation rail and one page of settings at a time.
 *
 * Shell: 1120×840 (max the viewport), radius/3xl, white, shadow; the rail is 240px at lg and
 * 192px at md, on background/secondary with a border on its end, and the page's title row stays
 * while the content scrolls. Below md the rail turns into a horizontal scroller above the page,
 * so the content keeps the full panel width. The title row and the content's top fade keep a
 * long page from cutting off under the title.
 *
 * React Aria handles the dialog behaviour: focus stays inside, Escape and a press outside close,
 * the page behind is inert and the trigger gets focus back. Motion is the BoardUI modal recipe:
 * the panel condenses from scale 0.85 with a 4px blur over 300ms while the black 70% backdrop
 * cross-fades.
 *
 *   <SettingsModal
 *     isOpen={open}
 *     onOpenChange={setOpen}
 *     page={page}
 *     onPageChange={setPage}
 *     sections={sections}
 *     title="Accounts"
 *   >
 *     …the page…
 *   </SettingsModal>
 */

export interface SettingsNavItem {
  /** The page this row selects; the host maps it to a route or view. */
  id: string;
  label: string;
  icon: IconReference;
}

export interface SettingsNavSection {
  /** The domain the pages share, e.g. "AI" or "Integrations". */
  label: string;
  items: SettingsNavItem[];
}

export interface SettingsModalProps {
  /** Controlled open state, owned by the host page. */
  isOpen: boolean;
  /** Called by the backdrop, the close button and Escape. */
  onOpenChange: (isOpen: boolean) => void;
  /** The page currently shown: one of the ids in `sections`. */
  page: string;
  /** A row was picked. The host changes `page` (and, for routed settings, the URL). */
  onPageChange: (page: string) => void;
  sections: SettingsNavSection[];
  /** The page's title, at the top of the content; names the dialog. */
  title: string;
  children: ReactNode;
  /** The navigation landmark's name. */
  navLabel?: string;
}

export function SettingsModal({
  isOpen,
  onOpenChange,
  page,
  onPageChange,
  sections,
  title,
  children,
  navLabel = 'Settings sections',
}: SettingsModalProps) {
  const id = useId();
  const navRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // Another page starts at its top, not where the previous one was scrolled to.
  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.scrollTop = 0;
    setScrolled(false);
  }, [page]);

  // On a phone the rail is a scroller: a page opened from a link can sit outside the viewport.
  // Center its row so the current page is visible without hunting for it.
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current || nav.scrollWidth <= nav.clientWidth) return;
    const navBox = nav.getBoundingClientRect();
    const currentBox = current.getBoundingClientRect();
    nav.scrollLeft += currentBox.left - navBox.left - (navBox.width - currentBox.width) / 2;
  }, [page]);

  return (
    <AriaModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className={cx(
        'fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4',
        'transition-opacity duration-300 ease-out motion-reduce:transition-none',
        'data-[entering]:opacity-0 data-[exiting]:opacity-0',
      )}
    >
      <AriaModal
        className={cx(
          'w-full max-w-[1120px] outline-none',
          'transform-gpu transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[opacity,transform,filter] motion-reduce:transition-none',
          'data-[entering]:scale-[0.85] data-[entering]:opacity-0 data-[entering]:blur-[4px]',
          'data-[exiting]:scale-[0.85] data-[exiting]:opacity-0 data-[exiting]:blur-[4px]',
        )}
      >
        <AriaDialog
          className={cx(
            'relative flex h-[840px] max-h-[calc(100dvh-2rem)] w-full flex-col overflow-clip rounded-3xl border border-border-button-default bg-background-full shadow-xl outline-none',
            'md:flex-row',
          )}
        >
          <nav
            ref={navRef}
            aria-label={navLabel}
            className={cx(
              'flex w-full shrink-0 [scrollbar-width:none] gap-2 overflow-x-auto border-b border-separator-border bg-background-secondary-default p-2',
              'md:w-48 md:flex-col md:gap-5 md:overflow-y-auto md:border-e md:border-b-0 md:p-2.5 lg:w-60',
            )}
          >
            {sections.map((section, index) => {
              const labelId = `${id}-${index}`;
              return (
                <div
                  key={section.label}
                  role="group"
                  aria-labelledby={labelId}
                  className="flex shrink-0 gap-1 md:flex-col md:gap-1"
                >
                  <span
                    id={labelId}
                    className="hidden ps-2 text-body-medium text-text-secondary md:block"
                  >
                    {section.label}
                  </span>
                  <div className="flex gap-1 md:flex-col md:gap-1">
                    {section.items.map((item) => {
                      const selected = item.id === page;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-current={selected ? 'page' : undefined}
                          onClick={() => onPageChange(item.id)}
                          className={cx(
                            'flex w-auto shrink-0 cursor-pointer items-center gap-2 rounded-2lg p-2 text-start md:w-full',
                            'ease transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring',
                            selected
                              ? 'bg-background-secondary-hover'
                              : 'hover:bg-background-secondary-hover/60',
                          )}
                        >
                          <IconGlyph
                            icon={item.icon}
                            className="size-5 shrink-0 text-foreground-icon-secondary"
                            aria-hidden
                          />
                          <span
                            className={cx(
                              'truncate text-body-medium',
                              selected ? 'text-text-primary' : 'text-text-secondary',
                            )}
                          >
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-4 px-4 pt-4 pb-3 md:px-8 md:pt-8">
              <AriaHeading
                slot="title"
                className="min-w-0 truncate text-title-3-medium text-text-primary"
              >
                {title}
              </AriaHeading>
              <CloseButton
                size="md"
                aria-label="Close settings"
                onClick={() => onOpenChange(false)}
              />
            </div>
            <div className="relative min-h-0 flex-1">
              <div
                ref={contentRef}
                className="h-full overflow-y-auto px-4 pb-4 md:px-8 md:pb-8"
                onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
              >
                {children}
              </div>
              {/* Content dissolves under the title row instead of cutting off sharply. */}
              <div
                aria-hidden
                className={cx(
                  'pointer-events-none absolute inset-x-0 top-0 h-10 bg-linear-to-b from-background-full to-transparent',
                  'transition-opacity duration-200 ease-out',
                  scrolled ? 'opacity-100' : 'opacity-0',
                )}
              />
            </div>
          </div>
        </AriaDialog>
      </AriaModal>
    </AriaModalOverlay>
  );
}
