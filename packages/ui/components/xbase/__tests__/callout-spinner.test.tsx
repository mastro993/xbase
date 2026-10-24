import { render, screen } from '@testing-library/react';
import { Button } from '@xbase/ui/components/base/buttons/button';
import { expect, it } from 'vitest';
import { Callout } from '../callout';
import { Spinner } from '../spinner';

it('Callout passes its role through and shows title, message and action', () => {
  render(
    <Callout tone="error" role="alert" title="Couldn't save" action={<Button>Retry</Button>}>
      The server is restarting.
    </Callout>,
  );
  const alert = screen.getByRole('alert');
  expect(alert.textContent).toContain("Couldn't save");
  expect(alert.textContent).toContain('The server is restarting.');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(alert.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
});

it('Callout sets no role of its own', () => {
  const { container } = render(
    <Callout tone="info">Only apps on this computer can connect.</Callout>,
  );
  expect(container.firstElementChild?.getAttribute('role')).toBeNull();
});

it('Spinner is decorative, alone and as a button icon', () => {
  const { container } = render(<Spinner />);
  expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  render(
    <Button leadingIcon={Spinner} aria-busy>
      Save
    </Button>,
  );
  const icon = screen.getByRole('button', { name: 'Save' }).querySelector('svg');
  expect(icon?.getAttribute('aria-hidden')).toBe('true');
  expect(icon?.getAttribute('role')).toBeNull();
});
