import { RiRefreshLine } from '@remixicon/react';
import type { ModelOption } from '@xbase/ai/providers';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { Combobox, ComboboxItem } from '@xbase/ui/components/xbase/combobox';
import { Spinner } from '@xbase/ui/components/xbase/spinner';

type ModelFieldProps = {
  model: ModelOption | null;
  /** The models the key can use, once loaded; until then only the chosen one is listed. */
  models: ModelOption[] | null;
  loading: boolean;
  onChange: (model: ModelOption) => void;
  onLoad: () => void;
};

/**
 * The model, in a searchable list: OpenRouter alone lists hundreds. Typing filters by name; the
 * chevron shows them all. Load models fetches the list with the key from the server's environment.
 */
export function ModelField({ model, models, loading, onChange, onLoad }: ModelFieldProps) {
  // The chosen model stays listed, first, even when the loaded list lacks it.
  const options = model
    ? [model, ...(models ?? []).filter((option) => option.id !== model.id)]
    : (models ?? []);

  return (
    <Combobox
      label="Model"
      labelAction={
        // Busy, not disabled, while it loads: the button keeps focus.
        <Button
          variant="secondary"
          size="xs"
          leadingIcon={loading ? Spinner : RiRefreshLine}
          aria-busy={loading || undefined}
          onClick={() => !loading && onLoad()}
        >
          Load models
        </Button>
      }
      placeholder="Choose a model"
      defaultItems={options}
      selectedKey={model?.id ?? null}
      onSelectionChange={(id) => {
        const next = options.find((option) => option.id === id);
        if (next) onChange(next);
      }}
      emptyText="No models match"
      hint={
        <span role="status">
          {models
            ? `The key works: ${models.length} ${models.length === 1 ? 'model' : 'models'} to choose from. Type to search them.`
            : 'Load the models your key can use to pick another.'}
        </span>
      }
    >
      {(option) => (
        <ComboboxItem id={option.id} textValue={option.label}>
          <span className="min-w-0 truncate">{option.label}</span>
        </ComboboxItem>
      )}
    </Combobox>
  );
}
