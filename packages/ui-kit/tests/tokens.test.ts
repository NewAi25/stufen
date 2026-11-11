// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cssVariables, THEMES, tokens } from '../src/index';
import type { ColorTokens } from '../src/index';

// A string goes to fileURLToPath because the jsdom URL class is not Node's.
const testsDir = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(testsDir, '..', 'src', 'styles.css'), 'utf8');

/** The variable names docs/06-ui-ux.md section 7 lists. These are the contract. */
const DOC_NAMES = [
  '--st-color-bg',
  '--st-color-surface',
  '--st-color-surface-2',
  '--st-color-border',
  '--st-color-text',
  '--st-color-text-muted',
  '--st-color-accent',
  '--st-color-accent-hover',
  '--st-color-accent-soft',
  '--st-color-on-accent',
  '--st-color-success',
  '--st-color-success-soft',
  '--st-color-error',
  '--st-color-error-soft',
  '--st-color-warning',
  '--st-color-warning-soft',
  '--st-color-focus',
  '--st-font-sans',
  '--st-font-mono',
  '--st-text-xs',
  '--st-text-sm',
  '--st-text-base',
  '--st-text-md',
  '--st-text-lg',
  '--st-text-xl',
  '--st-text-2xl',
  '--st-text-3xl',
  '--st-space-0',
  '--st-space-1',
  '--st-space-2',
  '--st-space-3',
  '--st-space-4',
  '--st-space-5',
  '--st-space-6',
  '--st-space-7',
  '--st-space-8',
  '--st-width-read',
  '--st-width-wide',
  '--st-target-min',
  '--st-radius-sm',
  '--st-radius-md',
  '--st-radius-lg',
  '--st-radius-full',
  '--st-shadow-md',
  '--st-motion-fast',
  '--st-motion-base',
  '--st-motion-slow',
  '--st-ease',
];

/** Names this box adds: one line height per text step and the three weights. */
const ADDED_NAMES = [
  '--st-leading-xs',
  '--st-leading-sm',
  '--st-leading-base',
  '--st-leading-md',
  '--st-leading-lg',
  '--st-leading-xl',
  '--st-leading-2xl',
  '--st-leading-3xl',
  '--st-weight-regular',
  '--st-weight-medium',
  '--st-weight-semibold',
];

/** Makes a value comparable whatever the formatter did to case, quotes and spaces. */
function normalize(value: string): string {
  return value.replace(/\s+/g, '').replace(/"/g, "'").toLowerCase();
}

function normalizeAll(vars: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(vars).map(([name, value]) => [name, normalize(value)]));
}

/** The `--st-*` declarations in the first rule whose selector ends with `selector`. */
function declarations(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`styles.css has no rule for ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const found: Record<string, string> = {};
  for (const match of css.slice(open + 1, close).matchAll(/(--st-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) found[name] = normalize(value);
  }
  return found;
}

// WCAG 2.x relative luminance and contrast ratio.
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => {
    const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [lighter = 0, darker = 0] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe('tokens', () => {
  it('exports the two themes', () => {
    expect([...THEMES]).toEqual(['light', 'dark']);
  });

  it.each(THEMES)('produces every variable name from docs/06 for %s', (theme) => {
    const names = Object.keys(cssVariables(theme));
    expect(DOC_NAMES.filter((name) => !names.includes(name))).toEqual([]);
  });

  it('produces only the documented names plus line heights and weights', () => {
    const names = Object.keys(cssVariables('light')).sort();
    expect(names).toEqual([...DOC_NAMES, ...ADDED_NAMES].sort());
  });

  it('defines the same variable names in light and dark', () => {
    expect(Object.keys(cssVariables('dark')).sort()).toEqual(
      Object.keys(cssVariables('light')).sort(),
    );
  });

  it('differs between themes only in colour and shadow', () => {
    const lightVars = cssVariables('light');
    const darkVars = cssVariables('dark');
    const differing = Object.keys(lightVars).filter((name) => lightVars[name] !== darkVars[name]);
    expect(differing.length).toBeGreaterThan(0);
    expect(differing.filter((name) => !/^--st-(color|shadow)-/.test(name))).toEqual([]);
  });

  it('carries the values from docs/06', () => {
    const lightVars = cssVariables('light');
    const darkVars = cssVariables('dark');
    expect(lightVars['--st-color-bg']).toBe('#F7F6F3');
    expect(darkVars['--st-color-bg']).toBe('#15181A');
    expect(lightVars['--st-color-accent']).toBe('#2F6F73');
    expect(darkVars['--st-color-accent']).toBe('#6FB1B5');
    expect(lightVars['--st-color-surface-2']).toBe('#EFEDE8');
    expect(lightVars['--st-color-text-muted']).toBe('#5C625E');
    expect(lightVars['--st-color-on-accent']).toBe('#FFFFFF');
    expect(lightVars['--st-text-base']).toBe('1rem');
    expect(lightVars['--st-leading-base']).toBe('1.5rem');
    expect(lightVars['--st-text-xs']).toBe('0.75rem');
    expect(lightVars['--st-text-3xl']).toBe('2.25rem');
    expect(lightVars['--st-space-0']).toBe('0');
    expect(lightVars['--st-space-5']).toBe('24px');
    expect(lightVars['--st-radius-full']).toBe('999px');
    expect(lightVars['--st-width-read']).toBe('720px');
    expect(lightVars['--st-target-min']).toBe('44px');
    expect(lightVars['--st-motion-base']).toBe('200ms');
    expect(lightVars['--st-ease']).toBe('cubic-bezier(0.2, 0, 0, 1)');
    expect(lightVars['--st-shadow-md']).toBe('0 4px 16px rgba(0, 0, 0, 0.12)');
    expect(darkVars['--st-shadow-md']).toBe('0 4px 16px rgba(0, 0, 0, 0.5)');
    expect(lightVars['--st-font-sans']).toBe('"Inter", "Segoe UI", system-ui, sans-serif');
  });

  it.each(THEMES)('uses six digit hex for every %s colour', (theme) => {
    const bad = Object.entries(tokens.color[theme]).filter(
      ([, value]) => !/^#[0-9A-F]{6}$/.test(value),
    );
    expect(bad).toEqual([]);
  });
});

describe('styles.css stays in step with tokens.ts', () => {
  it('mentions every variable name that cssVariables produces', () => {
    const missing = Object.keys(cssVariables('light')).filter((name) => !css.includes(`${name}:`));
    expect(missing).toEqual([]);
  });

  it('sets the light values on :root and on [data-theme=light]', () => {
    const declared = { ...declarations(':root'), ...declarations("[data-theme='light']") };
    expect(declared).toEqual(normalizeAll(cssVariables('light')));
  });

  it('declares the light colours on the same rule as :root', () => {
    expect(css).toMatch(/:root,\s*\[data-theme='light'\] \{/);
  });

  it('sets the dark values on [data-theme=dark]', () => {
    const declared = { ...declarations(':root'), ...declarations("[data-theme='dark']") };
    expect(declared).toEqual(normalizeAll(cssVariables('dark')));
  });

  it('sets the same dark values for a dark system unless light is chosen', () => {
    expect(css).toMatch(
      /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\) \{/,
    );
    expect(declarations(":root:not([data-theme='light'])")).toEqual(
      declarations("[data-theme='dark']"),
    );
  });

  it('overrides only colour and shadow in the dark rules', () => {
    const names = Object.keys(declarations("[data-theme='dark']"));
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => !/^--st-(color|shadow)-/.test(name))).toEqual([]);
  });

  it('has a visible focus ring and a reduced motion rule', () => {
    expect(css).toMatch(/:focus-visible[^{]*\{\s*outline: 2px solid var\(--st-color-focus\);/);
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });

  it('uses no raw colour outside the variable blocks', () => {
    const componentCss = css.slice(css.indexOf('/* ---------- Button'));
    expect(componentCss.length).toBeGreaterThan(0);
    expect(componentCss.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g)).toBeNull();
  });

  it.each([
    'st-button',
    'st-card',
    'st-progress',
    'st-input',
    'st-choice',
    'st-toast',
    'st-sheet',
    'st-sheet__backdrop',
    'st-sheet__panel',
    'st-sheet__close',
    'st-textarea__control',
    'st-textarea__count',
    'st-visually-hidden',
    'st-rating',
    'st-rating__option',
    'st-feedback-fab',
    'st-feedback',
    'st-feedback__error',
    'st-level-badge',
    'st-audio',
    'st-audio__button',
    'st-correction',
    'st-correction__mark',
    'st-exercise',
    'st-exercise__feedback',
    'st-cloze__input',
    'st-match',
    'st-match__item',
    'st-order',
    'st-order__word',
    'st-flashcard',
    'st-flashcard__rating',
    'st-passage',
    'st-questions',
    'st-transcript',
    'st-level-map',
    'st-level-map__toggle',
    'st-level-map__table',
  ])('styles the %s class', (name) => {
    expect(css).toContain(`.${name} {`);
  });

  it.each([
    'st-feedback-fab',
    'st-sheet__close',
    'st-rating__option',
    'st-audio__button',
    'st-cloze__input',
    'st-match__item',
    'st-order__word',
    'st-flashcard__rating',
    'st-level-map__toggle',
  ])('gives %s a touch target of at least 44 px', (name) => {
    const start = css.indexOf(`.${name} {`);
    const rule = css.slice(start, css.indexOf('}', start));
    expect(tokens.target.min).toBeGreaterThanOrEqual(44);
    expect(rule).toContain('min-width: var(--st-target-min);');
    expect(rule).toContain('min-height: var(--st-target-min);');
  });

  it('fixes the feedback fab to the bottom right', () => {
    const start = css.indexOf('.st-feedback-fab {');
    const rule = css.slice(start, css.indexOf('}', start));
    expect(rule).toContain('position: fixed;');
    expect(rule).toContain('inset: auto var(--st-space-4) var(--st-space-4) auto;');
  });
});

describe('contrast, WCAG AA 4.5 to 1', () => {
  it('computes known ratios', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  // [text, background, where it is used]
  const pairs: Array<[keyof ColorTokens, keyof ColorTokens, string]> = [
    ['text', 'bg', 'body text on the page'],
    ['onAccent', 'accent', 'primary button'],
    ['onAccent', 'accentHover', 'primary button, hover'],
    ['onAccent', 'error', 'danger button'],
    ['text', 'surface', 'card, input, choice, toast'],
    ['textMuted', 'bg', 'input hint'],
    ['textMuted', 'surface', 'placeholder, choice description'],
    ['textMuted', 'surface2', 'shortcut key hint'],
    ['textMuted', 'accentSoft', 'description on a selected choice'],
    ['accent', 'surface', 'secondary button'],
    ['accent', 'bg', 'ghost button'],
    ['accent', 'accentSoft', 'secondary and ghost button, hover'],
    ['text', 'accentSoft', 'selected choice'],
    ['error', 'bg', 'input error text'],
    ['error', 'surface', 'input error text on a card'],
    ['success', 'successSoft', 'correct choice label'],
    ['error', 'errorSoft', 'incorrect choice label'],
    ['text', 'successSoft', 'correct choice text'],
    ['text', 'errorSoft', 'incorrect choice text'],
    ['warning', 'warningSoft', 'partial feedback'],
    ['warning', 'surface', 'character count near the limit, in a sheet'],
    ['warning', 'bg', 'character count near the limit, on the page'],
    ['onAccent', 'accent', 'feedback fab and selected rating'],
    ['textMuted', 'surface', 'sheet description and rating scale words'],
    ['success', 'bg', 'correct mark beside a cloze gap or a pair'],
    ['success', 'surface', 'correct mark on a card'],
    ['success', 'successSoft', 'error category label in a correction'],
    ['text', 'warningSoft', 'partly correct feedback text'],
    ['text', 'surface2', 'level badge, paired item, transcript'],
    ['textMuted', 'surface2', 'partner text on a paired item'],
    ['accent', 'surface', 'audio button'],
    ['accent', 'accentSoft', 'audio button while playing'],
    ['textMuted', 'accentSoft', 'shortcut key on a placed word'],
  ];

  describe.each(THEMES)('%s theme', (theme) => {
    it.each(pairs)('%s on %s (%s)', (foreground, background) => {
      const colors = tokens.color[theme];
      expect(contrast(colors[foreground], colors[background])).toBeGreaterThanOrEqual(4.5);
    });
  });
});
