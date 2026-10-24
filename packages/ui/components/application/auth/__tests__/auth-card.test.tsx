import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { AuthCard } from '../auth-card';

const password = () => screen.getByLabelText<HTMLInputElement>('Password');

it('is a native password form, so it works without JavaScript', () => {
  render(
    <AuthCard title="Sign in to XBase" method="post" action="/login">
      <input type="hidden" name="next" value="/queue" />
    </AuthCard>,
  );
  expect(screen.getByRole('heading', { level: 1, name: 'Sign in to XBase' })).toBeDefined();
  const form = password().form;
  expect(form?.getAttribute('method')).toBe('post');
  expect(form?.getAttribute('action')).toBe('/login');
  expect(password().type).toBe('password');
  expect(password().name).toBe('password');
  // The browser refuses an empty password before anything is sent.
  expect(password().required).toBe(true);
});

it('hands the FormData over, shows it’s busy, then clears and focuses the password', async () => {
  const user = userEvent.setup();
  let finish = () => {};
  const onSubmit = vi.fn((_data: FormData) => new Promise<void>((resolve) => (finish = resolve)));
  render(
    <AuthCard title="Sign in" onSubmit={onSubmit}>
      <input type="hidden" name="next" value="/queue" />
    </AuthCard>,
  );
  await user.type(password(), 'hunter2{Enter}');
  const data = onSubmit.mock.calls[0]?.[0];
  expect(data?.get('password')).toBe('hunter2');
  expect(data?.get('next')).toBe('/queue');
  const button = screen.getByRole('button', { name: 'Sign in' });
  expect(button.getAttribute('aria-busy')).toBe('true');
  // A second submit while the first runs is ignored.
  await user.click(button);
  expect(onSubmit).toHaveBeenCalledTimes(1);
  finish();
  await vi.waitFor(() => expect(button.getAttribute('aria-busy')).toBeNull());
  expect(password().value).toBe('');
  expect(document.activeElement).toBe(password());
});

it('marks a rejected password invalid without blocking another try', () => {
  const onSubmit = vi.fn();
  render(<AuthCard title="Sign in" onSubmit={onSubmit} isPasswordInvalid />);
  expect(password().getAttribute('aria-invalid')).toBe('true');
  fireEvent.change(password(), { target: { value: 'again' } });
  expect(password().checkValidity()).toBe(true);
  fireEvent.submit(password().form!);
  expect(onSubmit).toHaveBeenCalledTimes(1);
});
