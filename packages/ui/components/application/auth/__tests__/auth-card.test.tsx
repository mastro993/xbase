import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AuthCard } from '../auth-card';

it('titles the page and holds the providers', () => {
  render(
    <AuthCard title="Sign in to XBase" description="Use your X account.">
      <a href="/auth/x/start">Continue with X</a>
    </AuthCard>,
  );
  expect(screen.getByRole('heading', { level: 1, name: 'Sign in to XBase' })).toBeDefined();
  expect(screen.getByText('Use your X account.')).toBeDefined();
  expect(screen.getByRole('link', { name: 'Continue with X' }).getAttribute('href')).toBe(
    '/auth/x/start',
  );
});

it('takes another heading level when the card is part of a page', () => {
  render(<AuthCard title="Sign in" headingLevel={2} />);
  expect(screen.getByRole('heading', { level: 2, name: 'Sign in' })).toBeDefined();
});
