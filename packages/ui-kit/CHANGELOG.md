# Changelog

## [Unreleased]

## [0.1.0] - 2026-11-05

### Added
- `src/tokens.ts`: `tokens` (colour for light and dark, font stacks, weights, type scale, spacing, radius, shadow, motion, widths, touch target), `THEMES`, and `cssVariables(theme)`, which returns the `--st-*` variables from `docs/06-ui-ux.md` section 7 as a record. Types `Theme`, `Tokens`, `ColorTokens`, `TextStep`.
- `src/styles.css`: the variables on `:root` and `[data-theme='light']`, the dark values on `[data-theme='dark']` and for a dark system on `:root:not([data-theme='light'])`, then the `st-` component classes. Components read only the variables. Focus ring is 2 px solid with a 2 px offset. `prefers-reduced-motion: reduce` and `data-motion="reduce"` set every duration to 0. Host apps import this file once.
- `Button`: variants `primary`, `secondary`, `ghost`, `danger`; sizes `md`, `lg`; `loading` sets `aria-busy` and disables; native button with `type="button"` by default.
- `Card`: optional `title` as a heading with `headingLevel` 1 to 6, `as` for the element, `padding` `sm` or `md`.
- `Progress`: `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, a required `label`, optional `valueText`, clamped values, `size` `sm` or `md`.
- `TextInput`: required visible label linked by `htmlFor` and `id`, optional `hint` and `error` linked by `aria-describedby`, `aria-invalid` on error, `lang` passthrough, controlled or uncontrolled.
- `Choice`: a radiogroup with single selection, arrow keys, Home and End, number keys 1 to 9 when `shortcuts` is true, `correctValue` and `revealed` for correct and incorrect states shown in words as well as colour, `disabled`, horizontal or vertical layout.
- `ToastProvider` and `useToast()`: `show({ message, tone, durationMs })` and `dismiss(id)`, a polite live region and an assertive one for tone `error`, auto dismiss on an injectable timer, a dismiss button with an accessible name.
- Tests: one file per component, `tests/gallery.test.tsx` rendering all six in light and in dark, and `tests/tokens.test.ts` checking that `styles.css` and `tokens.ts` agree on names and values and that the text pairs the components use reach 4.5 to 1 in both themes.
- Two light theme colours differ from `docs/06-ui-ux.md` because the listed values miss 4.5 to 1 on their soft backgrounds: `--st-color-success` is `#2C784C` (was `#2E7D4F`, 4.26 to 1 on `--st-color-success-soft`, now 4.55) and `--st-color-error` is `#B1422E` (was `#B4432F`, 4.42 to 1 on `--st-color-error-soft`, now 4.53).
- Variables that `docs/06-ui-ux.md` does not list yet: `--st-leading-xs` to `--st-leading-3xl` for the line height of each text step, and `--st-weight-regular`, `--st-weight-medium`, `--st-weight-semibold`.
