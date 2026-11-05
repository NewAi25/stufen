// Design tokens for Stufen. Source of truth: docs/06-ui-ux.md section 7.
//
// The values here are mirrored by hand in src/styles.css. The test in
// tests/tokens.test.ts fails when the two drift apart.

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export interface ColorTokens {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  onAccent: string;
  success: string;
  successSoft: string;
  error: string;
  errorSoft: string;
  warning: string;
  warningSoft: string;
  focus: string;
}

export interface TextStep {
  /** Font size in px at a 16 px root. Emitted as rem. */
  size: number;
  /** Line height in px at a 16 px root. Emitted as rem. */
  lineHeight: number;
}

const light: ColorTokens = {
  bg: '#F7F6F3',
  surface: '#FFFFFF',
  surface2: '#EFEDE8',
  border: '#D9D6CF',
  text: '#1F2421',
  textMuted: '#5C625E',
  accent: '#2F6F73',
  accentHover: '#255A5D',
  accentSoft: '#DCEBEB',
  onAccent: '#FFFFFF',
  // docs/06 lists #2E7D4F, which is 4.26 to 1 on success-soft. Darkened to pass 4.5.
  success: '#2C784C',
  successSoft: '#DFF0E5',
  // docs/06 lists #B4432F, which is 4.42 to 1 on error-soft. Darkened to pass 4.5.
  error: '#B1422E',
  errorSoft: '#F6E1DC',
  warning: '#8A5F10',
  warningSoft: '#F4EAD2',
  focus: '#2F6F73',
};

const dark: ColorTokens = {
  bg: '#15181A',
  surface: '#1E2224',
  surface2: '#272C2F',
  border: '#3A4145',
  text: '#ECEAE4',
  textMuted: '#A3A9A5',
  accent: '#6FB1B5',
  accentHover: '#8BC4C7',
  accentSoft: '#23393B',
  onAccent: '#15181A',
  success: '#6CC28E',
  successSoft: '#1F3328',
  error: '#E5806C',
  errorSoft: '#3A231E',
  warning: '#D9A94A',
  warningSoft: '#33290F',
  focus: '#6FB1B5',
};

export const tokens = {
  color: { light, dark },
  font: {
    sans: '"Inter", "Segoe UI", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
  fontWeight: { regular: 400, medium: 500, semibold: 600 },
  text: {
    xs: { size: 12, lineHeight: 16 },
    sm: { size: 14, lineHeight: 20 },
    base: { size: 16, lineHeight: 24 },
    md: { size: 18, lineHeight: 28 },
    lg: { size: 20, lineHeight: 28 },
    xl: { size: 24, lineHeight: 32 },
    '2xl': { size: 30, lineHeight: 36 },
    '3xl': { size: 36, lineHeight: 40 },
  },
  /** Spacing in px. Base 4. */
  space: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 },
  /** Corner radius in px. */
  radius: { sm: 4, md: 8, lg: 12, full: 999 },
  shadow: {
    light: { md: '0 4px 16px rgba(0, 0, 0, 0.12)' },
    dark: { md: '0 4px 16px rgba(0, 0, 0, 0.5)' },
  },
  /** Durations in ms plus the one easing curve. */
  motion: { fast: 120, base: 200, slow: 300, ease: 'cubic-bezier(0.2, 0, 0, 1)' },
  /** Content widths in px. */
  width: { read: 720, wide: 960 },
  /** Minimum touch target in px. */
  target: { min: 44 },
} as const satisfies {
  color: Record<Theme, ColorTokens>;
  text: Record<string, TextStep>;
  [group: string]: unknown;
};

export type Tokens = typeof tokens;

const ROOT_FONT_PX = 16;

function kebab(key: string): string {
  return key.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();
}

function px(value: number): string {
  return value === 0 ? '0' : `${value}px`;
}

function rem(value: number): string {
  return `${value / ROOT_FONT_PX}rem`;
}

/**
 * The CSS variables for one theme, keyed by variable name. Names are the
 * contract from docs/06-ui-ux.md section 7. Only the colour and shadow values
 * differ between themes.
 */
export function cssVariables(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const [key, value] of Object.entries(tokens.color[theme])) {
    vars[`--st-color-${kebab(key)}`] = value;
  }
  vars['--st-shadow-md'] = tokens.shadow[theme].md;

  vars['--st-font-sans'] = tokens.font.sans;
  vars['--st-font-mono'] = tokens.font.mono;
  for (const [key, value] of Object.entries(tokens.fontWeight)) {
    vars[`--st-weight-${key}`] = String(value);
  }
  for (const [key, step] of Object.entries(tokens.text)) {
    vars[`--st-text-${key}`] = rem(step.size);
    vars[`--st-leading-${key}`] = rem(step.lineHeight);
  }
  for (const [key, value] of Object.entries(tokens.space)) {
    vars[`--st-space-${key}`] = px(value);
  }
  for (const [key, value] of Object.entries(tokens.radius)) {
    vars[`--st-radius-${key}`] = px(value);
  }
  vars['--st-width-read'] = px(tokens.width.read);
  vars['--st-width-wide'] = px(tokens.width.wide);
  vars['--st-target-min'] = px(tokens.target.min);
  vars['--st-motion-fast'] = `${tokens.motion.fast}ms`;
  vars['--st-motion-base'] = `${tokens.motion.base}ms`;
  vars['--st-motion-slow'] = `${tokens.motion.slow}ms`;
  vars['--st-ease'] = tokens.motion.ease;

  return vars;
}
