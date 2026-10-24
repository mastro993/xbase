import { RiRefreshLine } from '@remixicon/react';
import type { ModelOption } from '@xbase/ai/providers';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { Combobox, ComboboxItem } from '@xbase/ui/components/xbase/combobox';
import { Spinner } from '@xbase/ui/components/xbase/spinner';
import { useState } from 'react';

interface Props {
  hasKey: boolean;
  value: ModelOption | null;
  models: ModelOption[] | null;
  loading: boolean;
  onChange: (model: ModelOption) => void;
  onRefresh: () => void;
}

const LIMIT = 50;

const matches = (m: ModelOption, query: string) =>
  `${m.label} ${m.id}`.toLowerCase().includes(query.toLowerCase());

export function ModelPicker({ hasKey, value, models, loading, onChange, onRefresh }: Props) {
  // What the user typed. Until then the field shows the selected model, and the list shows them all.
  const [query, setQuery] = useState('');
  // Prefer the listed entry so the input and the highlighted item show the same label.
  const selected = hasKey ? (models?.find((m) => m.id === value?.id) ?? value) : null;
  // Selected first: it stays selectable before the list loads, if the list no longer has it,
  // and when it sorts past the display limit.
  const items = selected
    ? [selected, ...(models ?? []).filter((m) => m.id !== selected.id)]
    : (models ?? []);
  const search = query === selected?.label ? '' : query.trim();
  const found = search ? items.filter((m) => matches(m, search)) : items;
  const shown = found.slice(0, LIMIT);
  const refreshDisabled = !hasKey || loading;
  const loadingNote = (
    <span className="inline-flex items-center gap-2">
      <Spinner className="size-4" />
      Loading models…
    </span>
  );

  return (
    <Combobox
      label="Model"
      labelAction={
        <Button
          variant="secondary"
          size="xs"
          iconOnly
          leadingIcon={loading ? Spinner : RiRefreshLine}
          aria-label="Refresh models"
          // aria-disabled, not disabled: the button keeps focus while the list reloads.
          aria-disabled={refreshDisabled || undefined}
          onClick={() => !refreshDisabled && onRefresh()}
        />
      }
      placeholder={hasKey ? 'Search models…' : 'Add a key to load models'}
      isDisabled={!hasKey}
      items={shown}
      selectedKey={selected?.id ?? null}
      onSelectionChange={(id) => {
        const model = items.find((m) => m.id === id);
        if (model) onChange(model);
      }}
      onInputChange={setQuery}
      emptyText={loading ? loadingNote : 'No models found'}
      footer={
        shown.length > 0 &&
        (loading
          ? loadingNote
          : found.length > LIMIT && `Showing ${LIMIT} of ${found.length}. Type to search.`)
      }
    >
      {(m) => (
        <ComboboxItem id={m.id} textValue={m.label}>
          <span className="min-w-0 truncate">{m.label}</span>
        </ComboboxItem>
      )}
    </Combobox>
  );
}
