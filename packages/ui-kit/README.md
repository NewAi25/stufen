# @stufen/ui-kit

## Purpose

Design tokens and presentational components.
Knows contracts types for props. Never calls a box or touches data.

Kind: `surface`. May import: `contracts`.

The kit has no Tailwind and no CSS in JS. Components render plain class names that start with `st-`. One stylesheet, `src/styles.css`, styles them from CSS variables that start with `--st-`. That keeps the kit usable in any host app.

## Public API

Everything is exported from `src/index.ts`. Version 0.2.0 ships the tokens and ten components.

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
| `TextArea` | `label` (required), `hint`, `error`, `inputClassName`, `remainingLabel` | The multiline partner of `TextInput` with the same wiring. Native props and `ref` go to the `<textarea>`. `maxLength` adds a character count |
| `RatingInput` | `label` (required), `max` (default 5), `value`, `defaultValue`, `onChange`, `lowLabel`, `highLabel`, `allowClear`, `optionLabel`, `hint`, `error`, `required`, `disabled` | A radiogroup of 1 to `max`. `onChange` receives the number, or `null` when cleared |
| `Sheet` | `open`, `onClose`, `title` (required), `description`, `side` (`bottom`, `right`), `closeLabel` (default "Close"), `initialFocusRef` | A modal dialog in a portal on `document.body`. Renders nothing while closed |
| `FeedbackFab` | `onSubmit` (required), `onSubmitted`, `label` (default "Give feedback"), `kindLabels`, `labels`, `defaultKind` (default `idea`), `side`, `hidden` | A floating button, bottom right, that opens the feedback form in a `Sheet` |
| `ToastProvider` | `timer`, `defaultDurationMs` (default 5000), `dismissLabel` (default "Dismiss"), `className` | Wrap the app once. Renders the toasts after its children |
| `useToast()` | | Returns `{ show({ message, tone, durationMs }), dismiss(id) }`. `show` returns the id. `tone` is `info`, `success` or `error` |

Exported types: `ButtonProps`, `ButtonVariant`, `ButtonSize`, `CardProps`, `CardElement`, `CardHeadingLevel`, `CardPadding`, `ProgressProps`, `ProgressSize`, `TextInputProps`, `ChoiceProps`, `ChoiceOption`, `ChoiceStateLabels`, `TextAreaProps`, `RatingInputProps`, `SheetProps`, `SheetSide`, `FeedbackFabProps`, `FeedbackFabInput`, `FeedbackFabLabels`, `ToastProviderProps`, `ToastOptions`, `ToastTone`, `ToastApi`, `ToastTimer`.

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

### FeedbackFab usage

```tsx
import '@stufen/ui-kit/src/styles.css';
import { FeedbackFab, ToastProvider, useToast } from '@stufen/ui-kit';
import type { FeedbackFabInput } from '@stufen/ui-kit';

function Feedback({ onLesson }: { onLesson: boolean }) {
  const toast = useToast();

  // The host decides where the feedback goes. The kit never calls a box.
  async function send(input: FeedbackFabInput): Promise<void> {
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, page: window.location.pathname }),
    });
    if (!response.ok) throw new Error('Could not send. Try again.');
  }

  return (
    <FeedbackFab
      label="Give feedback"
      defaultKind={onLesson ? 'confusing' : 'idea'}
      onSubmit={send}
      onSubmitted={() => toast.show({ message: 'Sent. Thank you.', tone: 'success' })}
    />
  );
}

export function App() {
  return (
    <ToastProvider>
      <Feedback onLesson={false} />
    </ToastProvider>
  );
}
```

### FeedbackFab behaviour

- The button is fixed bottom right, 48 px, and its accessible name comes from `label`. It opens a `Sheet` titled "Feedback" with three fields: kind, message and rating.
- Kind is a `Choice` over `bug`, `idea`, `confusing`, `rating` and `other`, the `FeedbackKind` values from `@stufen/contracts`. `kindLabels` gives the words, with English defaults Bug, Idea, Confusing, Rating and Other.
- Message is a `TextArea` of at most 4000 characters. It is required unless kind is `rating`. Text that is only spaces counts as empty.
- Rating is a `RatingInput` from 1 to 5. It is always shown, can be cleared, and is required when kind is `rating`.
- A failed check shows the error under the field, linked with `aria-describedby`, and moves focus to that field. `onSubmit` is not called.
- `onSubmit` receives `{ kind, message, rating? }`. The message is trimmed. `rating` is left out when nothing is picked.
- While the promise is pending the submit button is loading and a second submit is ignored.
- When the promise resolves the sheet closes, the form goes back to `defaultKind` with an empty message and no rating, and `onSubmitted` is called.
- When the promise rejects the sheet stays open with the text intact and the message of the error is shown in a `role="alert"` region. A rejection without a message shows `labels.submitFailed`. Sending again is the retry.
- Cancel, Escape, the close button and a backdrop click close the sheet and keep the draft.
- `labels` overrides every visible string: `title`, `kind`, `message`, `rating`, `submit`, `cancel`, `close`, `messageRequired`, `ratingRequired`, `submitFailed`.
- `hidden` renders nothing, neither the button nor the sheet.

### Sheet behaviour

- Nothing is rendered while `open` is false. When open, the sheet is rendered through a portal on `document.body` and copies `data-theme` and `data-motion` from the place it was rendered, so a forced theme carries over.
- The panel has `role="dialog"` and `aria-modal="true"`. `title` names it and `description` describes it.
- On open, focus moves to `initialFocusRef` when given, otherwise to the first focusable element, which is the close button. Tab and Shift Tab stay inside the sheet.
- Escape, a backdrop click and the close button call `onClose`. The host sets `open` to false.
- On close, focus returns to the element that had it before. Body scroll is locked while the sheet is open and restored after.

### TextArea behaviour

- Same contract as `TextInput`: a required visible label, `hint` and `error` linked with `aria-describedby`, `aria-invalid` on error.
- With `maxLength` a count such as `12 / 4000` sits under the field and is part of the description. Once the text is within 10 percent of the limit, a polite live region announces the characters left. `remainingLabel(remaining, maxLength)` translates those words.

### RatingInput behaviour

- A radiogroup named by its visible `label`, with one option per whole number from 1 to `max`. `max` is clamped to 2 to 9. Each option has an accessible name from `optionLabel`, by default "1 of 5".
- Arrow right and arrow down move to the next value and select it. Arrow left and arrow up move back. Both wrap at the ends. Home and End jump to 1 and to `max`. A number key picks that value while focus is in the group.
- Tab lands on the selected value, or on 1 when nothing is selected.
- `lowLabel` and `highLabel` show words under the two ends and describe the first and the last option.
- With `allowClear`, picking the selected value again, Backspace, Delete or 0 removes the selection and `onChange` receives `null`.
- `error` sets `aria-invalid` on the group and is announced. `required` sets `aria-required`. `disabled` blocks every change and keeps the options focusable.

### Not in this version

`LevelBadge`, `AudioButton`, `RecordButton`, `CorrectionInline`, `RubricBars` and `LevelMap` are named in `docs/04-module-contracts.md` and arrive in later rows of the build sequence.

`FeedbackFab` leaves three things from `docs/06-ui-ux.md` section 8 to the host app: the `f` keyboard shortcut, the sentence that says which context is attached, and the lower opacity on lesson screens. The host also shows the "Sent. Thank you." toast from `onSubmitted`.

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Accessibility notes

- Contrast. `tests/tokens.test.ts` computes the WCAG ratio for every text pair the components use, in both themes, and fails under 4.5 to 1. Two light colours were darkened to pass, see the changelog.
- Colour is never the only signal. A selected `Choice` option shows a filled dot. A selected rating is bold and ringed. A character count near its limit turns bold. Revealed options carry the words "Correct" or "Not quite" and a tick or a cross. Toasts carry an icon for the tone. An invalid `TextInput` shows the error text.
- Focus. Every focusable part has a 2 px ring in `--st-color-focus` with a 2 px offset. The stylesheet never removes an outline.
- Labels. `TextInput`, `TextArea` and `RatingInput` require a visible label. `Progress` and `Choice` require `label`. `Sheet` requires `title`. The toast dismiss button, the sheet close button and the feedback fab have accessible names. A `Button` with only an icon needs an `aria-label` from the caller.
- Errors. A `TextInput`, `TextArea` or `RatingInput` error is linked with `aria-describedby`, sets `aria-invalid` and is announced when it appears. A failed feedback submit is announced from a `role="alert"` region.
- Dialogs. `Sheet` traps Tab, closes on Escape, returns focus to where it was and locks body scroll while open.
- Language. Pass `lang="de"` to `TextInput` and `lang: 'de'` on `Choice` options so screen readers switch voice for German.
- Touch targets. Buttons, inputs, choice options, rating options, the toast dismiss button, the sheet close button and the feedback fab are at least 44 px.
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

The run prints one line per test file. `tests/gallery.test.tsx` is the acceptance check: all ten components render in light and in dark. `tests/feedback-fab.test.tsx` holds the check for row P0-21: the fab opens a sheet with kind, message and rating fields.

## Status

See the `ui-kit` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
