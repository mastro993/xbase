import type { ReactNode } from 'react';

type StatusPageProps = {
  /** The HTTP status, shown above the title, e.g. 404. */
  code: number;
  title: string;
  /** An h1 on a page of its own; an h2 under a list page's h1. */
  headingLevel?: 1 | 2;
  description: ReactNode;
  /** Buttons, e.g. Try again and Go to XBase. */
  actions: ReactNode;
};

/**
 * A page that stands in for one that can't show: not found, or an error. Centred in whatever
 * holds it; the caller decides whether that's a <main>.
 */
export function StatusPage({
  code,
  title,
  headingLevel = 1,
  description,
  actions,
}: StatusPageProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <div className="flex max-w-md flex-col items-center gap-4 text-center">
      <p className="text-title-1-medium text-text-tertiary tabular-nums">{code}</p>
      <div className="flex flex-col gap-1.5">
        <Heading className="text-title-2-medium text-text-primary">{title}</Heading>
        <div className="text-body-regular text-text-secondary">{description}</div>
      </div>
      <div className="flex flex-wrap justify-center gap-2">{actions}</div>
    </div>
  );
}
