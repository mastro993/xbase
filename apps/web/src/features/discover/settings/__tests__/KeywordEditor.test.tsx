// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { KeywordEditor } from '../KeywordEditor';

afterEach(cleanup);

/** The editor is controlled, as the cards use it: the harness is what remembers the list. */
function Handles({ initial, max = 3 }: { initial: string[]; max?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <KeywordEditor
      kind="handle"
      label="Always check"
      hint="Their new posts arrive first."
      placeholder="@someone"
      value={value}
      max={max}
      onChange={setValue}
    />
  );
}

const entries = () => screen.getAllByRole('listitem').map((item) => item.textContent);
const field = () => screen.getByRole('textbox', { name: 'Add accounts' });
const add = () => screen.getByRole('button', { name: 'Add' });

it('adds a pasted list without the @, in lower case, and once each', async () => {
  const user = userEvent.setup();
  render(<Handles initial={['xbase']} />);
  expect(entries()).toEqual(['@xbase']);

  await user.type(field(), '@Mastro993, xbase, xbase\nshl');
  await user.click(add());

  expect(entries()).toEqual(['@xbase', '@mastro993', '@shl']);
  expect((field() as HTMLTextAreaElement).value).toBe('');
});

it('says which entry X wouldn’t take as a handle, and keeps the list as it was', async () => {
  const user = userEvent.setup();
  render(<Handles initial={['xbase']} />);

  await user.type(field(), 'bad!handle');
  await user.click(add());

  expect(screen.getByRole('alert').textContent).toContain('isn’t an X handle');
  expect(entries()).toEqual(['@xbase']);
});

it('stops at the list’s limit, rather than letting the save fail', async () => {
  const user = userEvent.setup();
  render(<Handles initial={['xbase', 'shl']} max={2} />);

  await user.type(field(), 'mastro993');
  await user.click(add());

  expect(screen.getByRole('alert').textContent).toContain('at most 2 accounts');
  expect(entries()).toEqual(['@xbase', '@shl']);
});

it('drops an entry when its chip is removed', async () => {
  const user = userEvent.setup();
  render(<Handles initial={['xbase', 'shl']} />);

  await user.click(screen.getByRole('button', { name: 'Remove xbase' }));

  expect(entries()).toEqual(['@shl']);
});

it('takes a list longer than a single paste of 600 characters, uncut', async () => {
  const user = userEvent.setup();
  render(<Handles initial={[]} max={100} />);
  // A full watch list is about 1,600 characters: the field must not cap what it accepts, or the
  // cut at the end lands as a valid handle nobody typed.
  const handles = Array.from(
    { length: 80 },
    (_, index) => `user_${String(index).padStart(3, '0')}`,
  );

  await user.click(field());
  await user.paste(handles.join('\n'));
  await user.click(add());

  expect(entries()).toHaveLength(80);
  expect(entries().at(-1)).toBe('@user_079');
});
