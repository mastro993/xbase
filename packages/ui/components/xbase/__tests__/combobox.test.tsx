import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Combobox, ComboboxItem } from '../combobox';

const MODELS = [
  { id: 'gpt-5', label: 'GPT-5' },
  { id: 'claude-opus', label: 'Claude Opus' },
  { id: 'claude-haiku', label: 'Claude Haiku' },
];

function Models(props: { onSelectionChange?: (key: unknown) => void }) {
  return (
    <Combobox label="Model" hint="Type to search" defaultItems={MODELS} {...props}>
      {(model) => (
        <ComboboxItem id={model.id} textValue={model.label}>
          {model.label}
        </ComboboxItem>
      )}
    </Combobox>
  );
}

it('labels and describes the field', () => {
  render(<Models />);
  const input = screen.getByRole('combobox', { name: 'Model' });
  const described = document.getElementById(input.getAttribute('aria-describedby') ?? '');
  expect(described?.textContent).toBe('Type to search');
});

it('filters as you type and picks with the keyboard', async () => {
  const user = userEvent.setup();
  const onSelectionChange = vi.fn();
  render(<Models onSelectionChange={onSelectionChange} />);
  const input = screen.getByRole('combobox', { name: 'Model' });
  await user.type(input, 'claude');
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
    'Claude Opus',
    'Claude Haiku',
  ]);
  await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
  expect(onSelectionChange).toHaveBeenLastCalledWith('claude-haiku');
  expect((input as HTMLInputElement).value).toBe('Claude Haiku');
});

it('says so when nothing matches', async () => {
  const user = userEvent.setup();
  render(<Models />);
  await user.type(screen.getByRole('combobox', { name: 'Model' }), 'zzz');
  // React Aria renders the empty state as the list's only row.
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['No matches']);
});
