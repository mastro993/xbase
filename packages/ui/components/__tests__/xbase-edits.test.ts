// XBase's edits to installed BoardUI files (marked `XBase:` in their source) undo silently when a
// file is refreshed from the registry (`boardui add <name> --overwrite`, or a manual re-sync), and
// no other test notices these. Each of RULES names a class upstream uses and XBase doesn't; each of
// ADDITIONS names what XBase adds to a file.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const RULES = [
  {
    // Bare accent text only: fills (from-, to-, bg-) carry white text, and a pressed state
    // (active:) is momentary.
    pattern: /(?<![:\w-])text-accent-\d/,
    rule: 'accent text is text-text-accent: the accent-600 step fails AA on dark surfaces',
  },
  {
    pattern: /focus:placeholder:text-text-primary/,
    rule: 'a focused placeholder stays tertiary, so an empty field never looks filled in',
  },
];

it.each(RULES)('keeps XBase’s edit: $rule', ({ pattern }) => {
  const offenders = sources(root)
    .filter((path) => pattern.test(readFileSync(path, 'utf8')))
    .map((path) => relative(root, path));
  expect(offenders).toEqual([]);
});

const ADDITIONS = [
  {
    file: '../styles/globals.css',
    pattern: /--tw-ring-offset-color: var\(--color-background-full\);/,
    rule: 'ring offsets take the page colour: Tailwind’s white is a halo in dark mode',
  },
  {
    file: 'application/dashboard/dashboard-sidebar.tsx',
    pattern: /focus-visible:ring-offset-2/,
    rule: 'the selected rail row’s focus ring sits 2px off its accent fill',
  },
];

it.each(ADDITIONS)('keeps XBase’s edit: $rule', ({ file, pattern }) => {
  expect(readFileSync(join(root, file), 'utf8')).toMatch(pattern);
});
