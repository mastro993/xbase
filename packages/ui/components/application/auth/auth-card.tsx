'use client';

import { Button } from '@xbase/ui/components/base/buttons/button';
import { InputBase, TextField } from '@xbase/ui/components/base/input/input';
import { Label } from '@xbase/ui/components/base/input/label';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { cx } from '@xbase/ui/utils/cx';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';

/**
 * The sign-in card.
 *
 * XBase: trimmed to a single password form. Sign-up, the code step, social
 * providers, the media split, "remember me" and the footer links are gone.
 * The form also works without JavaScript: give it `action` and `method` and
 * the browser posts it. With JavaScript, `onSubmit` gets the form's FormData
 * instead; while its promise is pending the button shows a spinner, and once
 * it settles the password is cleared and focused for another try. In dark
 * mode the card keeps the card surface (BoardUI used the tray), so a status
 * Callout's tray still stands out on it.
 *
 *   <AuthCard title="Sign in" description="…" method="post" action="/login"
 *     onSubmit={(data) => signIn(data)} isPasswordInvalid={wrong}>
 *     <input type="hidden" name="next" value="/" />
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
  /** Where the browser posts the form when JavaScript is off. */
  action?: string;
  method?: 'get' | 'post';
  /** Fires with the form's own FormData; wire it to your auth library. */
  onSubmit?: (data: FormData) => unknown;
  /** Above the field: a status message, hidden inputs. */
  children?: ReactNode;
  /** Marks the password invalid, e.g. after the server rejected it. */
  isPasswordInvalid?: boolean;
  cta?: string;
  className?: string;
}

export function AuthCard({
  title,
  description,
  logo,
  headingLevel = 1,
  action,
  method,
  onSubmit,
  children,
  isPasswordInvalid = false,
  cta = 'Sign in',
  className,
}: AuthCardProps) {
  const TitleHeading = `h${headingLevel}` as const;
  const [pending, setPending] = useState(false);
  const password = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    if (!onSubmit) return;
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    setPending(true);
    try {
      await onSubmit(new FormData(form));
    } finally {
      setPending(false);
      form.reset();
      password.current?.focus();
    }
  };

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

      <form
        method={method}
        action={action}
        onSubmit={(event) => void submit(event)}
        className="mt-6 flex flex-col gap-4"
      >
        {children}
        {/* Native `required`, so an empty password never reaches the server,
            with or without JavaScript; the browser says what's missing. React
            Aria's native validation would also block a retry while the field
            is marked invalid, so the field validates the ARIA way. */}
        <TextField
          name="password"
          type="password"
          autoComplete="current-password"
          validationBehavior="aria"
          isInvalid={isPasswordInvalid}
        >
          <Label>Password</Label>
          <InputBase ref={password} required placeholder="Enter your password" />
        </TextField>

        <Button
          type="submit"
          className="w-full"
          leadingIcon={pending ? Spinner : undefined}
          aria-disabled={pending || undefined}
          aria-busy={pending || undefined}
        >
          {cta}
        </Button>
      </form>
    </div>
  );
}
