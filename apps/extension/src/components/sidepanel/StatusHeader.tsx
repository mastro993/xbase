import type { Status } from '@xbase/companion/settings';
import { Chip } from '@xbase/ui/components/base/badges/chip';
import { StatusDot } from '@xbase/ui/components/base/badges/status-dot';
import { statusHint } from './format';

export function StatusHeader({ status }: { status: Status }) {
  const label = status.ready ? 'Ready' : 'Setup needed';
  return (
    <header className="flex flex-col gap-1 border-b border-separator-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-title-3-bold text-text-primary">x-companion</h1>
        {/* Announced through the status line below instead. */}
        <Chip variant="caption" color="soft" className="gap-1.5" aria-hidden>
          <StatusDot color={status.ready ? 'green' : 'yellow'} />
          {label}
        </Chip>
      </div>
      <p role="status" className="text-body-regular text-text-secondary">
        <span className="sr-only">{label}: </span>
        {statusHint(status)}
      </p>
    </header>
  );
}
