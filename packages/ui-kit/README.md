# @stufen/ui-kit

## Purpose

Design tokens and presentational components.
Knows contracts types for props. Never calls a box or touches data.

Kind: `surface`. May import: `contracts`.

The kit has no Tailwind and no CSS in JS. Components render plain class names that start with `st-`. One stylesheet, `src/styles.css`, styles them from CSS variables that start with `--st-`. That keeps the kit usable in any host app.

## Public API

Everything is exported from `src/index.ts`. Version 0.1.0 ships the tokens and six components.

### Styles

The host app imports the stylesheet once, for example in the root layout:

```ts
import '@stufen/ui-kit/src/styles.css';
```

Theme follows the system by default. Set `data-theme="light"` or `data-theme="dark"` on `<html>`, or on any wrapper, to force one. Set `data-motion="reduce"` on `<html>` when the learner turns on "Reduce animation". The system setting `prefers-reduced-motion` is respected without any attribute.

### Tokens

| Export | What it is |
|--------|------------|
| `tokens` | Typed constants: `color.light`, `color.dark`, `font`, `fontWeight`, `text`, `space`, `radius`, `shadow`, `motion`, `width`, `target` |
| `THEMES` | `['light', 'dark']` |
| `cssVariables(theme)` | `Record<string, string>` of every `--st-*` variable for that theme, for example `{ '--st-color-bg': '#F7F6F3', ... }` |
| Types | `Theme`, `Tokens`, `ColorTokens`, `TextStep` |

The variable names are the contract in `docs/06-ui-ux.md` section 7. `src/styles.css` repeats the values by hand, and `tests/tokens.test.ts` fails if a name or a value differs between the two files. Adding a token means editing both files.

Two things go beyond the names in `docs/06-ui-ux.md`:

- Each text step has a line height variable next to its size: `--st-text-base` is the size and `--st-leading-base` is the line height. Sizes and line heights are in rem.
- The three weights are variables: `--st-weight-regular`, `--st-weight-medium`, `--st-weight-semibold`.

### Components

Every component takes `className`. Components that wrap one native element take `ref` and pass other native props through.

| Component | Props beyond the native ones | Notes |
|-----------|------------------------------|-------|
| `Button` | `variant` (`primary`, `secondary`, `ghost`, `danger`), `size` (`md`, `lg`), `loading` | Native `<button>`, `type="button"` unless set. `loading` shows a spinner, sets `aria-busy` and disables |
| `Card` | `as` (`div`, `section`, `article`, `aside`, `li`), `title`, `headingLevel` (1 to 6, default 2), `padding` (`sm`, `md`) | `title` renders as a heading above the children |
| `Progress` | `value`, `max` (default 100), `label` (required), `valueText`, `size` (`sm`, `md`) | `role="progressbar"`. Values outside 0 to `max` are clamped. A `max` that is not a positive number gives an empty bar |
| `TextInput` | `label` (required), `hint`, `error`, `inputClassName` | Native props, `ref`, `lang`, `value`, `defaultValue` and `onChange` go to the `<input>`. `className` goes to the wrapper |
| `Choice` | `label` (required), `options`, `value`, `defaultValue`, `onChange`, `shortcuts`, `correctValue`, `revealed`, `disabled`, `orientation`, `stateLabels` | A radiogroup. Each option is `{ value, label, description?, disabled?, lang? }` |
| `ToastProvider` | `timer`, `defaultDurationMs` (default 5000), `dismissLabel` (default "Dismiss"), `className` | Wrap the app once. Renders the toasts after its children |
| `useToast()` | | Returns `{ show({ message, tone, durationMs }), dismiss(id) }`. `show` returns the id. `tone` is `info`, `success` or `error` |

Exported types: `ButtonProps`, `ButtonVariant`, `ButtonSize`, `CardProps`, `CardElement`, `CardHeadingLevel`, `CardPadding`, `ProgressProps`, `ProgressSize`, `TextInputProps`, `ChoiceProps`, `ChoiceOption`, `ChoiceStateLabels`, `ToastProviderProps`, `ToastOptions`, `ToastTone`, `ToastApi`, `ToastTimer`.

### Usage

```tsx
import { useState } from 'react';
import '@stufen/ui-kit/src/styles.css';
import { Button, Card, Choice, Progress, TextInput, ToastProvider, useToast } from '@stufen/ui-kit';

function Question() {
  const toast = useToast();
  const [answer, setAnswer] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  return (
    <Card title="Listen and choose" as="section">
      <Progress value={8} max={20} label="Checkpoint progress" valueText="8 of 20" />
      <Choice
        label="Listen and choose"
        shortcuts
        value={answer}
        onChange={setAnswer}
        correctValue="bremen"
        revealed={checked}
        options={[
          { value: 'berlin', label: 'Er fährt nach Berlin.', lang: 'de' },
          { value: 'bremen', label: 'Er fährt nach Bremen.', lang: 'de' },
        ]}
      />
      <TextInput label="Your answer" lang="de" hint="Write one word." />
      <Button onClick={() => setChecked(true)}>Check</Button>
      <Button variant="ghost" onClick={() => toast.show({ message: 'Saved.', tone: 'success' })}>
        Save
      </Button>
    </Card>
  );
}

export function App() {
  return (
    <ToastProvider>
      <Question />
    </ToastProvider>
  );
}
```

### Choice behaviour

- Arrow down and arrow right move to the next option and select it. Arrow up and arrow left move back. Both wrap at the ends. Home and End jump to the first and last option. Disabled options are skipped.
- Tab lands on the selected option, or on the first enabled one when nothing is selected.
- With `shortcuts`, keys 1 to 9 select the matching option from anywhere on the page. The keys are ignored while focus is in a text field or in a different radiogroup, and while Ctrl, Alt or Meta is held. If two groups on one screen both use `shortcuts` and focus is in neither, both respond, so turn it on for one group at a time.
- `revealed` with `correctValue` marks the right option with the word "Correct" and a wrong selection with "Not quite". The group becomes read only but stays focusable so the result can be read. Pass `stateLabels` to translate the two words.
- `disabled` blocks every change. Options stay focusable and are marked `aria-disabled`.

### Toast behaviour

- Tone `info` and `success` go to a polite live region. Tone `error` goes to an assertive one. Both regions are in the page from the start so screen readers announce what is added.
- A toast leaves after `durationMs`, or after `defaultDurationMs` when none is given. A duration of zero or less keeps it until dismissed.
- `timer` replaces the clock. It needs `set(callback, ms)` returning a handle and `clear(handle)`. Tests pass a fake one.
- Toasts sit bottom centre on small screens and top right from 768 px.

### Not in this version

`LevelBadge`, `AudioButton`, `RecordButton`, `CorrectionInline`, `RubricBars`, `LevelMap`, `FeedbackFab` and `Sheet` are named in `docs/04-module-contracts.md` and arrive in later rows of the build sequence. `TextInput` is single line for now.

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Accessibility notes

- Contrast. `tests/tokens.test.ts` computes the WCAG ratio for every text pair the components use, in both themes, and fails under 4.5 to 1. Two light colours were darkened to pass, see the changelog.
- Colour is never the only signal. A selected `Choice` option shows a filled dot. Revealed options carry the words "Correct" or "Not quite" and a tick or a cross. Toasts carry an icon for the tone. An invalid `TextInput` shows the error text.
- Focus. Every focusable part has a 2 px ring in `--st-color-focus` with a 2 px offset. The stylesheet never removes an outline.
- Labels. `TextInput` requires a visible label. `Progress` and `Choice` require `label`. The toast dismiss button has an accessible name. A `Button` with only an icon needs an `aria-label` from the caller.
- Errors. A `TextInput` error is linked with `aria-describedby`, sets `aria-invalid` and is announced when it appears.
- Language. Pass `lang="de"` to `TextInput` and `lang: 'de'` on `Choice` options so screen readers switch voice for German.
- Touch targets. Buttons, inputs, choice options and the toast dismiss button are at least 44 px high.
- Motion. Transitions use the motion variables. `prefers-reduced-motion: reduce` and `data-motion="reduce"` set every duration to 0 and stop the button spinner.
- Borders of inputs and choice options use `--st-color-text-muted`, because `--st-color-border` is under 3 to 1 against the surface and these borders are what marks the control.
- A `loading` button is natively disabled, so it drops out of the tab order while it waits. Move focus yourself if the screen needs it to stay put.

## Owns tables

None. This box owns no database tables.

## Emits and listens

None. This box neither emits nor subscribes.

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/ui-kit/`. If `contracts` must change, do that in its own commit first.
3. A new token goes into `src/tokens.ts` and `src/styles.css` together. A new component gets a file in `src/components/`, an export in `src/index.ts`, classes in `src/styles.css` that read only the variables, a test file, and a place in `tests/gallery.test.tsx`.
4. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(ui-kit): message`.

## How to test it

```
pnpm --filter @stufen/ui-kit test
```

The run prints one line per test file. `tests/gallery.test.tsx` is the acceptance check: all six components render in light and in dark.

## Status

See the `ui-kit` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
