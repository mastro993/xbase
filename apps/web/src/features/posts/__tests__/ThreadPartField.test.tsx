// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ThreadPartField } from '../ThreadPartField';

afterEach(cleanup);

type Props = Partial<ComponentProps<typeof ThreadPartField>>;

function Field(props: Props) {
  const [text, setText] = useState(props.text ?? '');
  return (
    <ThreadPartField
      id="part"
      index={0}
      total={1}
      fieldRef={() => {}}
      readOnly={false}
      refining={false}
      {...props}
      text={text}
      onChange={setText}
    />
  );
}

const describedBy = (element: HTMLElement) =>
  (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent);

it('labels the field and describes it by X’s weighted count', async () => {
  const user = userEvent.setup();
  render(<Field index={1} total={3} />);
  const field = screen.getByRole('textbox', { name: 'Post 2 of 3' });
  expect(describedBy(field)).toEqual(['0/280']);
  // A link counts 23, whatever its length.
  await user.type(field, 'See https://example.com/a/very/long/path/to/a/page');
  expect(describedBy(field)).toEqual(['27/280']);
  expect(field.getAttribute('aria-invalid')).toBeNull();
});

it('says how far over the limit a post is, and marks it invalid', () => {
  render(<Field text={'x'.repeat(292)} />);
  const field = screen.getByRole('textbox', { name: 'Post' });
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect(describedBy(field)).toEqual(['292/280 · 12 over']);
});

it('keeps Refine focusable but unavailable without AI, pointing at the hint', async () => {
  const user = userEvent.setup();
  render(
    <>
      <Field text="Hello" refineHintId="hint" />
      <p id="hint">Refine with AI needs an AI provider.</p>
    </>,
  );
  const refine = screen.getByRole('button', { name: 'Refine with AI' });
  expect(refine.getAttribute('aria-disabled')).toBe('true');
  expect(describedBy(refine)).toEqual(['Refine with AI needs an AI provider.']);
  await user.click(refine);
  expect(document.activeElement).toBe(refine);
  expect(refine.getAttribute('aria-busy')).toBeNull();
});

it('refines only a part with text, and ignores presses while it works', async () => {
  const user = userEvent.setup();
  const onRefine = vi.fn();
  const { rerender } = render(<Field onRefine={onRefine} />);
  const refine = () => screen.getByRole('button', { name: 'Refine with AI' });
  expect(refine().getAttribute('aria-disabled')).toBe('true');
  await user.type(screen.getByRole('textbox'), 'Hello');
  expect(refine().getAttribute('aria-disabled')).toBeNull();
  await user.click(refine());
  expect(onRefine).toHaveBeenCalledTimes(1);

  rerender(<Field onRefine={onRefine} refining />);
  expect(refine().getAttribute('aria-busy')).toBe('true');
  expect(screen.getByRole('textbox').hasAttribute('readonly')).toBe(true);
  await user.click(refine());
  expect(onRefine).toHaveBeenCalledTimes(1);
});

it('names each part’s Remove, and offers Undo only after a refine', async () => {
  const user = userEvent.setup();
  const onUndo = vi.fn();
  const onRemove = vi.fn();
  render(<Field index={1} total={2} onUndo={onUndo} onRemove={onRemove} />);
  await user.click(screen.getByRole('button', { name: 'Undo refine' }));
  await user.click(screen.getByRole('button', { name: 'Remove post 2' }));
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(onRemove).toHaveBeenCalledTimes(1);
  cleanup();
  render(<Field readOnly />);
  expect(screen.queryAllByRole('button')).toEqual([]);
});
