// @vitest-environment happy-dom
import { MAX_STYLE_FIELD_LENGTH } from '@xbase/ai/profile';
import { DEFAULT_SETTINGS, type Settings } from '@xbase/companion/settings';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { getSettings, saveSettings } from '@/lib/settings';
import { StyleTab } from '../StyleTab';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('saves an edited section on unmount, leaving the other sections alone', async () => {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    style: { persona: '', audience: '', voice: 'dry', rules: 'no hashtags' },
  };
  await saveSettings(settings);
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  act(() => root.render(<StyleTab settings={settings} />));

  const persona = container.querySelector<HTMLTextAreaElement>('#style-persona')!;
  const described = persona
    .getAttribute('aria-describedby')!
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent);
  expect(described).toEqual(['Describe who you are and your main interests.', '0/1000']);
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  act(() => {
    setValue.call(persona, 'indie dev');
    persona.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(container.querySelector('#style-persona-count')!.textContent).toBe('9/1000');

  await act(async () => root.unmount()); // switching tabs
  expect((await getSettings()).style).toEqual({ ...settings.style, persona: 'indie dev' });
  container.remove();
});

it('flags text over the limit, which only older versions could save', async () => {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    style: { ...DEFAULT_SETTINGS.style, rules: 'x'.repeat(MAX_STYLE_FIELD_LENGTH + 1) },
  };
  const container = document.body.appendChild(document.createElement('div'));
  const root = createRoot(container);
  act(() => root.render(<StyleTab settings={settings} />));
  const rules = container.querySelector<HTMLTextAreaElement>('#style-rules')!;
  expect(rules.getAttribute('aria-invalid')).toBe('true');
  expect(container.querySelector('#style-persona')!.hasAttribute('aria-invalid')).toBe(false);
  await act(async () => root.unmount());
  container.remove();
});
