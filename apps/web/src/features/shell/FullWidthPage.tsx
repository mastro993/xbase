import { cx } from '@xbase/ui/utils/cx';
import type { ReactNode } from 'react';

type FullWidthPageProps = {
  /** The page's h1. */
  title: string;
  description?: ReactNode;
  /** `3xl` for a single column of forms, `5xl` for dashboards. */
  width?: '3xl' | '5xl';
  children: ReactNode;
};

/** A page without the list pane, such as Stats. Its sections stack with a 24px gap. */
export function FullWidthPage({ title, description, width = '3xl', children }: FullWidthPageProps) {
  return (
    <div
      className={cx(
        'mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8',
        width === '5xl' ? 'max-w-5xl' : 'max-w-3xl',
      )}
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-title-1-medium text-text-primary">{title}</h1>
        {description && <p className="text-body-regular text-text-secondary">{description}</p>}
      </header>
      {children}
    </div>
  );
}
