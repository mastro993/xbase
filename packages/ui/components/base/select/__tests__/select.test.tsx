import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Select, SelectItem } from '../select';

const tick = (option: HTMLElement) => option.querySelector('svg[aria-hidden="true"]');

// XBase's edits to BoardUI's Select: the label, and the tick on the selected row.
it('wires its label to the trigger and picks an item', async () => {
  const user = userEvent.setup();
  const onSelectionChange = vi.fn();
  render(
    <Select label="Provider" onSelectionChange={onSelectionChange}>
      <SelectItem id="openai">OpenAI</SelectItem>
      <SelectItem id="anthropic">Anthropic</SelectItem>
    </Select>,
  );
  await user.click(screen.getByRole('button', { name: /Provider/ }));
  await user.click(screen.getByRole('option', { name: 'Anthropic' }));
  expect(onSelectionChange).toHaveBeenLastCalledWith('anthropic');
});

it('ticks the selected row, so it reads apart from the focused one', async () => {
  const user = userEvent.setup();
  render(
    <Select label="Provider" defaultSelectedKey="openai">
      <SelectItem id="openai">OpenAI</SelectItem>
      <SelectItem id="anthropic">Anthropic</SelectItem>
    </Select>,
  );
  const trigger = screen.getByRole('button', { name: /Provider/ });
  // The trigger shows the value without the tick (its one icon is the chevron).
  expect(trigger.textContent).toBe('OpenAI');
  expect(trigger.querySelectorAll('svg')).toHaveLength(1);
  await user.click(trigger);
  const openai = screen.getByRole('option', { name: 'OpenAI' });
  const anthropic = screen.getByRole('option', { name: 'Anthropic' });
  expect(openai.getAttribute('aria-selected')).toBe('true');
  expect(tick(openai)).not.toBeNull();
  expect(tick(anthropic)).toBeNull();
  // Typeahead still finds a row by its text.
  await user.keyboard('a');
  expect(document.activeElement).toBe(anthropic);
});
