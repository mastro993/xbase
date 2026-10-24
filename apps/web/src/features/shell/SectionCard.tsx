import { type ReactNode, type Ref, useId } from 'react';

type SectionCardProps = {
  /** An h2: the page's h1 sits above it. */
  title: string;
  description: ReactNode;
  /** Muted text at the start of the footer band: what the action does, or where to get help. */
  hint?: ReactNode;
  /** The card's actions, at the end of the footer band. */
  actions?: ReactNode;
  /** Lets the card move focus to its heading, e.g. after a row it listed is removed. */
  headingRef?: Ref<HTMLHeadingElement>;
  children?: ReactNode;
};

/**
 * A section of a full-width page, such as Settings or Stats: a BoardUI card with its actions in a
 * footer band on the tray surface (Vercel's pattern). The band shows when there's a hint or an
 * action.
 */
export function SectionCard({
  title,
  description,
  hint,
  actions,
  headingRef,
  children,
}: SectionCardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col overflow-hidden rounded-3xl border border-border-button-default bg-background-primary-default"
    >
      <div className="flex flex-col gap-1 px-6 pt-6 pb-5">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          className="text-title-3-semibold text-text-primary outline-none"
        >
          {title}
        </h2>
        <div className="text-body-regular text-text-secondary">{description}</div>
      </div>
      {children && <div className="flex flex-col gap-5 px-6 pb-6">{children}</div>}
      {(hint || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-separator-border bg-background-secondary-default px-6 py-3">
          {hint && (
            <p className="min-w-0 flex-1 basis-60 text-body-regular text-text-secondary">{hint}</p>
          )}
          <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      )}
    </section>
  );
}
