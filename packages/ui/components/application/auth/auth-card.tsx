'use client';

import { cx } from '@xbase/ui/utils/cx';
import type { ReactNode } from 'react';

/**
 * The sign-in card.
 *
 * XBase: trimmed to a provider sign-in. Sign-up, the email and password
 * fields, the code step, the media split, "remember me" and the footer links
 * are gone; the social providers are whatever the app puts in `children`,
 * usually one `SocialButton` with an `href`, so signing in is a plain
 * navigation that works without JavaScript. In dark mode the card keeps the
 * card surface (BoardUI used the tray), so a status Callout's tray still
 * stands out on it.
 *
 *   <AuthCard title="Sign in" description="…">
 *     <SocialButton brand="x" href="/auth/x/start" fullWidth />
 *   </AuthCard>
 */

export interface AuthCardProps {
  title: ReactNode;
  description?: ReactNode;
  /**
   * Mark above the title — a wordmark, an app icon, anything. Deliberately a
   * node rather than a src, so the card stays brand-agnostic.
   */
  logo?: ReactNode;
  /**
   * Heading level for the card title. Defaults to `1`, because on a real
   * sign-in screen the card *is* the page.
   */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Below the title: a status message, then the providers. */
  children?: ReactNode;
  className?: string;
}

export function AuthCard({
  title,
  description,
  logo,
  headingLevel = 1,
  children,
  className,
}: AuthCardProps) {
  const TitleHeading = `h${headingLevel}` as const;
  return (
    <div
      className={cx(
        'flex w-full max-w-[400px] flex-col rounded-3xl border border-border-button-default bg-background-primary-default p-6 shadow-xs sm:p-8',
        className,
      )}
    >
      {logo ? <div className="mb-5 flex justify-start">{logo}</div> : null}

      <div className="flex flex-col gap-1.5">
        <TitleHeading className="text-title-2-medium text-text-primary">{title}</TitleHeading>
        {description ? (
          <p className="text-body-regular text-text-secondary">{description}</p>
        ) : null}
      </div>

      {children ? <div className="mt-6 flex flex-col gap-4">{children}</div> : null}
    </div>
  );
}
