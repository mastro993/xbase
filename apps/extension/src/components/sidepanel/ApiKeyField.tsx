import { ArrowUpRight01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { PROVIDERS, type ProviderId } from '@xbase/ai/providers';
import { LinkButton } from '@xbase/ui/components/base/buttons/link-button';
import { IconGlyph } from '@xbase/ui/utils/icon';
import { KeyRow } from './KeyRow';

interface Props {
  provider: ProviderId;
  savedKey: string;
  checking: boolean;
  error: string;
  modelCount: number | null;
  /** Saves the trimmed key ("" removes it) and validates it. */
  onCommit: (apiKey: string) => void;
}

export function ApiKeyField({ provider, savedKey, checking, error, modelCount, onCommit }: Props) {
  const { label, keysUrl } = PROVIDERS[provider];
  // Other failures (network, quota, timeout) say nothing about the key itself.
  const invalid = error === 'Invalid API key' || undefined;

  return (
    <div className="flex flex-col gap-2">
      <KeyRow
        active
        provider={provider}
        apiKey={savedKey}
        onSave={onCommit}
        invalid={invalid}
        describedBy={error ? 'api-key-error' : undefined}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <LinkButton
          href={keysUrl}
          target="_blank"
          rel="noreferrer"
          size="xs"
          trailingIcon={ArrowUpRight01Icon}
        >
          Get your {label} key
        </LinkButton>
        <span
          role="status"
          className="inline-flex items-center gap-1 text-caption-1-medium text-text-secondary"
        >
          {checking
            ? 'Checking key…'
            : !error &&
              modelCount !== null && (
                <>
                  <IconGlyph
                    icon={Tick02Icon}
                    className="size-4 text-status-lime-text"
                    aria-hidden
                  />
                  Key verified · {modelCount} {modelCount === 1 ? 'model' : 'models'}
                </>
              )}
        </span>
      </div>
      {error && (
        <p
          id="api-key-error"
          role="alert"
          className="text-caption-1-medium text-text-error-primary"
        >
          {error}
        </p>
      )}
    </div>
  );
}
