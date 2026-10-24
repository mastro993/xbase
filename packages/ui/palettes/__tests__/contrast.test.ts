// WCAG 2 contrast of each palette, resolved the way the cascade resolves it: Tailwind's and
// BoardUI's @theme values, then BoardUI's :root and .dark, then the palette's :root,
// :root:not(.dark) and .dark. Fails when a palette or a BoardUI update breaks AA.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Rgba = { r: number; g: number; b: number; a: number }; // sRGB 0–1
type Value = Rgba | { stops: Rgba[] };

const dir = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(path, 'utf8');
const tailwind = read(createRequire(import.meta.url).resolve('tailwindcss/theme.css'));
const boardui = read(join(dir, '../styles/theme.css'));

function topLevelBlocks(css: string) {
  const out: { head: string; body: string }[] = [];
  let i = 0;
  while (true) {
    const open = css.indexOf('{', i);
    if (open < 0) return out;
    let depth = 1;
    let j = open + 1;
    for (; depth > 0; j++) depth += css[j] === '{' ? 1 : css[j] === '}' ? -1 : 0;
    out.push({
      head: css.slice(i, open).split(';').pop()!.trim(),
      body: css.slice(open + 1, j - 1),
    });
    i = j;
  }
}

function declarations(body: string) {
  const flat = body.replace(/\{[^{}]*\}/g, '');
  const out: Record<string, string> = {};
  for (const d of flat.split(';')) {
    const m = d.match(/^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/);
    if (m) out[m[1]!] = m[2]!.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim();
  }
  return out;
}

function tokens(paletteCss: string, mode: 'light' | 'dark') {
  const base: Record<string, string> = {};
  const rules: { spec: number; order: number; decls: Record<string, string> }[] = [];
  let order = 0;
  for (const css of [tailwind, boardui, paletteCss]) {
    for (const { head, body } of topLevelBlocks(css.replace(/\/\*[\s\S]*?\*\//g, ''))) {
      if (head === '@theme' || (head.startsWith('@theme ') && !head.includes('inline'))) {
        Object.assign(base, declarations(body));
      } else if (head === ':root' || (head === '.dark' && mode === 'dark')) {
        rules.push({ spec: 1, order: order++, decls: declarations(body) });
      } else if (head === ':root:not(.dark)' && mode === 'light') {
        rules.push({ spec: 2, order: order++, decls: declarations(body) });
      }
    }
  }
  rules.sort((a, b) => a.spec - b.spec || a.order - b.order);
  return Object.assign(base, ...rules.map((r) => r.decls)) as Record<string, string>;
}

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp = (c: number) => Math.min(1, Math.max(0, c));

function fromOklab(L: number, A: number, B: number, a = 1): Rgba {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: clamp(gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    g: clamp(gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    b: clamp(gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
    a,
  };
}

function toOklab({ r, g, b }: Rgba) {
  const [R, G, B] = [r, g, b].map(linear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * R + 0.5363371296 * G + 0.0514359082 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ] as const;
}

function splitArgs(s: string) {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  return [...out, cur.trim()];
}

function parseValue(v: string): Value {
  v = v.trim();
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (v === 'white') return { r: 1, g: 1, b: 1, a: 1 };
  if (v === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  let m = v.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (m) {
    const hex = m[1]!.length === 3 ? m[1]!.replace(/./g, '$&$&') : m[1]!;
    const n = parseInt(hex, 16);
    return { r: (n >> 16) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 };
  }
  m = v.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (m) {
    const L = +m[1]! / (m[2] ? 100 : 1);
    const h = (+m[4]! * Math.PI) / 180;
    return fromOklab(L, +m[3]! * Math.cos(h), +m[3]! * Math.sin(h));
  }
  m = v.match(/^color-mix\(in (srgb|oklab),\s*([\s\S]*)\)$/);
  if (m) {
    const [x, y] = splitArgs(m[2]!).map((part) => part.match(/^([\s\S]*?)(?:\s+([\d.]+)%)?$/)!);
    const p = x![2] ? +x![2] / 100 : y![2] ? 1 - +y![2] / 100 : 0.5;
    const a = parseValue(x![1]!) as Rgba;
    const b = parseValue(y![1]!) as Rgba;
    if (b.a === 0) return { ...a, a: a.a * p };
    if (m[1] === 'srgb') {
      return {
        r: a.r * p + b.r * (1 - p),
        g: a.g * p + b.g * (1 - p),
        b: a.b * p + b.b * (1 - p),
        a: 1,
      };
    }
    const [la, aa, ba] = toOklab(a);
    const [lb, ab, bb] = toOklab(b);
    return fromOklab(la * p + lb * (1 - p), aa * p + ab * (1 - p), ba * p + bb * (1 - p));
  }
  m = v.match(/^linear-gradient\(([\s\S]*)\)$/);
  if (m) {
    const stops = splitArgs(m[1]!).slice(1);
    return { stops: stops.map((s) => parseValue(s.replace(/\s+[\d.]+%$/, '')) as Rgba) };
  }
  throw new Error(`Can't read the colour ${v}`);
}

function resolver(paletteCss: string, mode: 'light' | 'dark') {
  const vars = tokens(paletteCss, mode);
  const expand = (v: string): string =>
    v.replace(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/g, (_, name: string, fallback?: string) => {
      if (vars[name] !== undefined) return expand(vars[name]);
      if (fallback !== undefined) return fallback;
      throw new Error(`${name} is not defined in ${mode} mode`);
    });
  return (name: string) => {
    if (vars[name] === undefined) throw new Error(`${name} is not defined in ${mode} mode`);
    return parseValue(expand(vars[name]));
  };
}

const over = (fg: Rgba, bg: Rgba): Rgba => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
});
const luminance = ({ r, g, b }: Rgba) =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const contrast = (fg: Rgba, bg: Rgba) => {
  const [a, b] = [luminance(over(fg, bg)), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
const WHITE: Rgba = { r: 1, g: 1, b: 1, a: 1 };

// Every pair a BoardUI or XBase component draws with these tokens, and its minimum.
function pairs(paletteCss: string, mode: 'light' | 'dark', withCharts: boolean) {
  const raw = resolver(paletteCss, mode);
  const color = (name: string) => raw(name) as Rgba;
  const page = color('--color-background-full');
  const card = over(color('--color-background-primary-default'), page);
  const surfaces = {
    page,
    card,
    tray: over(color('--color-background-secondary-default'), page),
    field: over(color('--color-background-tertiary-default'), card),
  };
  const on = (name: string) => over(color(name), card);
  const out: [string, Rgba, Rgba, number][] = [];
  const text = ['primary', 'secondary', 'tertiary'] as const;
  for (const [surface, bg] of Object.entries(surfaces)) {
    for (const t of text)
      out.push([`text-${t} on ${surface}`, color(`--color-text-${t}`), bg, 4.5]);
    out.push([`text-error on ${surface}`, color('--color-text-error-primary'), bg, 4.5]);
    out.push([`focus ring vs ${surface}`, color('--color-border-focus-ring'), bg, 3]);
  }
  for (const surface of ['page', 'card', 'tray'] as const) {
    out.push([`text-accent on ${surface}`, color('--color-text-accent'), surfaces[surface], 4.5]);
  }
  out.push(
    ['placeholder on field', color('--color-text-placeholder'), surfaces.field, 4.5],
    [
      'menu row hover',
      color('--color-text-primary'),
      on('--color-dropdown-item-hover-background'),
      4.5,
    ],
    [
      'Select tick on the focused row',
      color('--color-text-accent'),
      on('--color-dropdown-item-hover-background'),
      3,
    ],
    ['card hover', color('--color-text-secondary'), on('--color-background-primary-hover'), 4.5],
    ['kbd', color('--color-kbd-foreground'), on('--color-kbd-background'), 4.5],
    [
      'ghost button',
      color('--color-button-ghost-foreground'),
      on('--color-button-ghost-background'),
      4.5,
    ],
    [
      'ghost button hover',
      color('--color-button-ghost-foreground'),
      on('--color-button-ghost-hover'),
      4.5,
    ],
    [
      'invalid field text',
      color('--color-text-error-primary'),
      on('--color-background-tertiary-error'),
      4.5,
    ],
    [
      'invalid field placeholder',
      color('--color-text-error-placeholder'),
      on('--color-background-tertiary-error'),
      4.5,
    ],
    ['input focus ring vs field', color('--color-border-button-active'), surfaces.field, 3],
    ['input focus ring vs card', color('--color-border-button-active'), card, 3],
    [
      'white on accent-500 (selected sidebar and list row)',
      WHITE,
      color('--color-accent-500'),
      4.5,
    ],
    [
      'white on accent-600 (selected sidebar and list row)',
      WHITE,
      color('--color-accent-600'),
      4.5,
    ],
    // The open row in a list pane (ROW_LINK) sits on the tray, and its look is the only visible
    // cue: shadow-nav-selected rings its accent-500 to accent-600 fill with accent-500.
    ['selected list row edge (accent-500) vs tray', color('--color-accent-500'), surfaces.tray, 3],
    [
      'Callout warning icon',
      color('--color-status-yellow-text'),
      on('--color-status-yellow-background'),
      3,
    ],
  );
  for (const kind of ['primary', 'danger'] as const) {
    for (const state of ['default', 'hover', 'active'] as const) {
      const { stops } = raw(`--gradient-button-${kind}-${state}`) as { stops: Rgba[] };
      stops.forEach((stop, i) =>
        out.push([`white on ${kind} button ${state} stop ${i}`, WHITE, stop, 4.5]),
      );
    }
  }
  for (const tone of ['information', 'success', 'error'] as const) {
    const fg = color(`--color-notification-${tone}-foreground`);
    out.push([`Callout ${tone} icon`, fg, on(`--color-notification-${tone}-background`), 3]);
  }
  for (const chip of ['lime', 'yellow', 'rose', 'cyan', 'blue', 'orange', 'purple']) {
    out.push([
      `${chip} chip`,
      color(`--color-status-${chip}-text`),
      on(`--color-status-${chip}-background`),
      4.5,
    ]);
  }
  if (withCharts) {
    for (let i = 1; i <= 5; i++)
      out.push([`chart-${i} vs card`, color(`--color-chart-${i}`), card, 3]);
  }
  return out;
}

const PALETTES = [
  { file: 'petrol.css', charts: true },
  // The extension draws no charts, so x.css keeps BoardUI's series colours.
  { file: 'x.css', charts: false },
];

describe.each(PALETTES)('$file', ({ file, charts }) => {
  const css = read(join(dir, file));
  it.each(['light', 'dark'] as const)('meets WCAG AA in %s mode', (mode) => {
    const failures = pairs(css, mode, charts)
      .map(([label, fg, bg, min]) => ({ label, ratio: +contrast(fg, bg).toFixed(2), min }))
      .filter(({ ratio, min }) => ratio < min);
    expect(failures).toEqual([]);
  });
});
