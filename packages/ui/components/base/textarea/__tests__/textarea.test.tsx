import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it } from 'vitest';
import { Textarea } from '../textarea';

// XBase's edits to BoardUI's Textarea: its counter describes the field.
function Field({ initial = '', isInvalid }: { initial?: string; isInvalid?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <Textarea
      label="Persona"
      hint="Who you are."
      value={value}
      onChange={setValue}
      maxLength={10}
      showCount
      isInvalid={isInvalid}
      validationBehavior="aria"
    />
  );
}

const describedBy = (field: HTMLElement) =>
  (field.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent);

it('describes the field by its hint and its counter, which follows the text', async () => {
  const user = userEvent.setup();
  render(<Field />);
  const field = screen.getByRole('textbox', { name: 'Persona' });
  expect(describedBy(field)).toEqual(['Who you are.', '0/10']);
  await user.type(field, 'Indie dev');
  expect(describedBy(field)).toEqual(['Who you are.', '9/10']);
  expect(field.getAttribute('maxlength')).toBe('10');
  expect(field.getAttribute('aria-invalid')).toBeNull();
});

it('marks text saved before the limit existed as invalid', () => {
  render(<Field initial="Far more than ten" />);
  const field = screen.getByRole('textbox', { name: 'Persona' });
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect(describedBy(field)).toContain('17/10');
});

it('keeps the hint a description while the form marks the field invalid', () => {
  render(<Field isInvalid />);
  const field = screen.getByRole('textbox', { name: 'Persona' });
  expect(field.getAttribute('aria-invalid')).toBe('true');
  const hint = screen.getByText('Who you are.');
  expect(hint.getAttribute('slot')).toBe('description');
  expect(describedBy(field)).toEqual(['Who you are.', '0/10']);
});
