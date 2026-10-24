// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SavedSearchDto } from '@xbase/core/discover';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SavedSearchDialog } from '../SavedSearchDialog';

const mocks = vi.hoisted(() => ({
  createSavedSearchFn: vi.fn(),
  updateSavedSearchFn: vi.fn(),
  invalidate: vi.fn(async () => {}),
}));

// The server functions' module needs the server; the dialog only calls them.
vi.mock('../discover.functions', () => ({
  createSavedSearchFn: mocks.createSavedSearchFn,
  updateSavedSearchFn: mocks.updateSavedSearchFn,
}));
vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: mocks.invalidate }) }));

const SEARCH = {
  id: 's1',
  name: 'Indie makers',
  query: 'buildinpublic lang:en',
} as SavedSearchDto;

beforeEach(() => {
  mocks.createSavedSearchFn.mockReset();
  mocks.updateSavedSearchFn.mockReset();
});
afterEach(cleanup);

it('checks the fields in order, focusing the one to fix', async () => {
  const user = userEvent.setup();
  render(<SavedSearchDialog>New search</SavedSearchDialog>);
  await user.click(screen.getByRole('button', { name: 'New search' }));
  const name = screen.getByRole('textbox', { name: /Name/ });
  const query = screen.getByRole('textbox', { name: /Query/ });
  await user.click(screen.getByRole('button', { name: 'Save search' }));
  expect(screen.getByRole('alert').textContent).toContain('Name the search.');
  expect(name.getAttribute('aria-invalid')).toBe('true');
  expect(document.activeElement).toBe(name);
  await user.type(name, 'Indie makers');
  await user.click(screen.getByRole('button', { name: 'Save search' }));
  expect(screen.getByRole('alert').textContent).toContain('Enter a search query.');
  expect(name.getAttribute('aria-invalid')).toBeNull();
  expect(query.getAttribute('aria-invalid')).toBe('true');
  expect(document.activeElement).toBe(query);
  expect(mocks.createSavedSearchFn).not.toHaveBeenCalled();
});

it('creates a search with Enter in the name, then hands it on and closes', async () => {
  const user = userEvent.setup();
  mocks.createSavedSearchFn.mockResolvedValue(SEARCH);
  const onSaved = vi.fn(async () => {});
  render(<SavedSearchDialog onSaved={onSaved}>New search</SavedSearchDialog>);
  await user.click(screen.getByRole('button', { name: 'New search' }));
  await user.type(screen.getByRole('textbox', { name: /Query/ }), 'buildinpublic lang:en');
  await user.type(screen.getByRole('textbox', { name: /Name/ }), 'Indie makers{Enter}');
  expect(mocks.createSavedSearchFn).toHaveBeenCalledWith({
    data: { name: 'Indie makers', query: 'buildinpublic lang:en' },
  });
  expect(mocks.invalidate).toHaveBeenCalled();
  expect(onSaved).toHaveBeenCalledWith(SEARCH);
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('edits a search, starting from its saved values', async () => {
  const user = userEvent.setup();
  mocks.updateSavedSearchFn.mockResolvedValue(SEARCH);
  render(<SavedSearchDialog search={SEARCH}>Edit</SavedSearchDialog>);
  await user.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.getByRole('dialog', { name: 'Edit saved search' })).toBeTruthy();
  const name = screen.getByRole<HTMLInputElement>('textbox', { name: /Name/ });
  expect(name.value).toBe('Indie makers');
  await user.type(name, ' 2');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(mocks.updateSavedSearchFn).toHaveBeenCalledWith({
    data: { id: 's1', name: 'Indie makers 2', query: 'buildinpublic lang:en' },
  });
});
