// @vitest-environment happy-dom

import userEvent from '@testing-library/user-event';
import { MAX_PROJECTS } from '@xbase/ai/profile';
import { DEFAULT_SETTINGS, type Settings } from '@xbase/companion/settings';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { getSettings, saveSettings } from '@/lib/settings';
import { ProjectsTab } from '../ProjectsTab';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const button = (container: Element, name: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!;

it('adds a project, saves its edits on unmount and removes it after confirming', async () => {
  const keep = { id: 'keep', name: 'Acme', description: 'notes app', link: '' };
  let settings: Settings = { ...DEFAULT_SETTINGS, projects: [keep] };
  await saveSettings(settings);
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  const render = () => act(async () => root.render(<ProjectsTab settings={settings} />));
  await render();

  await act(async () => button(container, 'Add project').click());
  settings = await getSettings();
  const added = settings.projects[1]!;
  expect(settings.projects).toEqual([keep, { id: added.id, name: '', description: '', link: '' }]);
  await render();
  const name = container.querySelector<HTMLInputElement>(`#project-${added.id}-name`)!;
  expect(document.activeElement).toBe(name);

  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setValue.call(name, 'Beta');
    name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => root.unmount()); // switching tabs
  settings = await getSettings();
  expect(settings.projects).toEqual([keep, { ...added, name: 'Beta' }]);

  const again = createRoot(container);
  await act(async () => again.render(<ProjectsTab settings={settings} />));
  await act(async () => button(container, 'Remove Beta').click());
  expect(container.textContent).toContain('Remove Beta?');
  await act(async () => button(container, 'Remove').click());
  expect((await getSettings()).projects).toEqual([keep]);
  await act(async () => again.unmount());
});

it('keeps Add project focusable at the limit, so removing a project focuses it', async () => {
  const projects = Array.from({ length: MAX_PROJECTS }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    description: '',
    link: '',
  }));
  await saveSettings({ ...DEFAULT_SETTINGS, projects });
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  await act(async () => root.render(<ProjectsTab settings={{ ...DEFAULT_SETTINGS, projects }} />));

  const add = button(container, 'Add project');
  expect(add.getAttribute('aria-disabled')).toBe('true');
  await act(async () => add.click());
  expect((await getSettings()).projects).toHaveLength(MAX_PROJECTS);

  await act(async () => button(container, 'Remove P0').click());
  await act(async () => button(container, 'Remove').click());
  expect(document.activeElement).toBe(add);
  await act(async () => root.unmount());
});

it('takes a link without a scheme without marking it invalid', async () => {
  const project = { id: 'acme', name: 'Acme', description: '', link: '' };
  await saveSettings({ ...DEFAULT_SETTINGS, projects: [project] });
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  await act(async () =>
    root.render(<ProjectsTab settings={{ ...DEFAULT_SETTINGS, projects: [project] }} />),
  );
  const user = userEvent.setup();
  const link = container.querySelector<HTMLInputElement>('#project-acme-link')!;
  expect(link.type).toBe('url');
  await user.type(link, 'acme.app');
  // Blurring commits the browser's validity in React Aria's native mode: a scheme-less URL would
  // turn the field red with no message, although it's saved and used.
  await user.tab();
  expect(link.getAttribute('aria-invalid')).toBeNull();
  await vi.waitFor(async () => expect((await getSettings()).projects[0]!.link).toBe('acme.app'));
  await act(async () => root.unmount());
});
