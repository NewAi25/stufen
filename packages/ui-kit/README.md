# @stufen/ui-kit

## Purpose

Design tokens and presentational components.
Knows contracts types for props. Never calls a box or touches data.

Kind: `surface`. May import: `contracts`.

The kit has no Tailwind and no CSS in JS. Components render plain class names that start with `st-`. One stylesheet, `src/styles.css`, styles them from CSS variables that start with `--st-`. That keeps the kit usable in any host app.

## Public API

Everything is exported from `src/index.ts`. Version 0.4.0 ships the tokens, fourteen components and the renderers for the eight deterministic exercise types.

### Styles

The host app imports the stylesheet once, for example in the root layout:

```ts
import '@stufen/ui-kit/src/styles.css';
```

Theme follows the system by default. Set `data-theme="light"` or `data-theme="dark"` on `<html>`, or on any wrapper, to force one. Set `data-motion="reduce"` on `<html>` when the learner turns on "Reduce animation". The system setting `prefers-reduced-motion` is respected without any attribute.

### Server components

The interactive components carry the `'use client'` directive as their first line: `AudioButton`, `Choice`, `CorrectionInline`, `FeedbackFab`, `LevelMap`, `RatingInput`, `Sheet`, `TextArea`, `TextInput`, `Toast` (`ToastProvider` and `useToast`), `ExerciseRenderer` and the eight exercise renderers. A React Server Component in Next.js can import them from `@stufen/ui-kit` directly. No wrapper file with its own directive is needed in the host.

`Button`, `Card`, `LevelBadge` and `Progress` have no directive. They are markup only and render on the server with no script. A handler such as `onClick` is a function, so a component that passes one to `Button` must itself be a client component. That is a React rule and not a kit rule.

`src/index.ts` and `src/tokens.ts` have no directive either, so `tokens`, `THEMES` and `cssVariables` can be called on the server. The same holds for `emptyValue`, `isComplete` and `RENDERABLE_TYPES`.

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
| `FeedbackFab` | `onSubmit` (required), `onSubmitted`, `label` (default "Give feedback"), `kindLabels`, `labels`, `defaultKind` (default `idea`), `side`, `hidden`, `open`, `onOpenChange` | A floating button, bottom right, that opens the feedback form in a `Sheet` |
| `ToastProvider` | `timer`, `defaultDurationMs` (default 5000), `dismissLabel` (default "Dismiss"), `className` | Wrap the app once. Renders the toasts after its children |
| `useToast()` | | Returns `{ show({ message, tone, durationMs }), dismiss(id) }`. `show` returns the id. `tone` is `info`, `success` or `error` |
| `LevelBadge` | `level` (required), `label`, `size` (`sm`, `md`), `tone` (`neutral`, `accent`, `success`) | A `<span role="img">` named "Level B1". `label(level)` translates the name. Takes `ref` and native span props |
| `AudioButton` | `src`, `text`, `lang`, `rate` (default 1), `labels`, `disabled`, `shortcut`, `onPlay`, `onEnded`, `ref` | Plays a file, or speaks `text` when there is no file. See "AudioButton behaviour" |
| `CorrectionInline` | `text` (required), `corrections` (required), `lang`, `labels` | A learner text with each correction marked in place. See "CorrectionInline behaviour" |
| `LevelMap` | `levels` (required), `onStartCheckpoint`, `labels`, `defaultExpanded`, `order` (`ascending`, `descending`), `headingLevel` (2 to 6, default 3), `lang` | The ladder of CEFR levels with the evidence per descriptor. See "LevelMap behaviour" |

Exported types: `ButtonProps`, `ButtonVariant`, `ButtonSize`, `CardProps`, `CardElement`, `CardHeadingLevel`, `CardPadding`, `ProgressProps`, `ProgressSize`, `TextInputProps`, `ChoiceProps`, `ChoiceOption`, `ChoiceStateLabels`, `TextAreaProps`, `RatingInputProps`, `SheetProps`, `SheetSide`, `FeedbackFabProps`, `FeedbackFabInput`, `FeedbackFabLabels`, `ToastProviderProps`, `ToastOptions`, `ToastTone`, `ToastApi`, `ToastTimer`, `LevelBadgeProps`, `LevelBadgeSize`, `LevelBadgeTone`, `AudioButtonProps`, `AudioButtonLabels`, `AudioButtonState`, `CorrectionInlineProps`, `CorrectionInlineLabels`, `InlineCorrection`, `LevelMapProps`, `LevelMapLevel`, `LevelMapDescriptor`, `LevelMapLabels`, `LevelMapStatus`, `LevelMapCheckpoint`. The types of the exercise renderers are listed under "Exercise renderers".

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

### FeedbackFab open state

By default the fab keeps its own open state. Pass `open` and the host controls it: the sheet shows exactly when `open` is true. In that mode a click on the fab, Cancel, Escape, the close button, the backdrop and a successful submit do not change anything by themselves. Each one calls `onOpenChange` with the value it asks for, and the host sets `open`.

`onOpenChange` also works without `open`. It is then a report: `true` on every open and `false` on every close.

This host opens feedback with the `f` key:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { FeedbackFab } from '@stufen/ui-kit';
import type { FeedbackFabInput } from '@stufen/ui-kit';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function FeedbackWithShortcut({
  onSubmit,
}: {
  onSubmit: (input: FeedbackFabInput) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'f' || event.ctrlKey || event.altKey || event.metaKey) return;
      if (isTyping(event.target)) return;
      event.preventDefault();
      setOpen(true);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return <FeedbackFab onSubmit={onSubmit} open={open} onOpenChange={setOpen} />;
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
- When the promise resolves the sheet closes (in controlled mode it asks the host to close), the form goes back to `defaultKind` with an empty message and no rating, and `onSubmitted` is called.
- When the promise rejects the sheet stays open with the text intact and the message of the error is shown in a `role="alert"` region. A rejection without a message shows `labels.submitFailed`. Sending again is the retry.
- Cancel, Escape, the close button and a backdrop click close the sheet and keep the draft.
- `labels` overrides every visible string: `title`, `kind`, `message`, `rating`, `submit`, `cancel`, `close`, `messageRequired`, `ratingRequired`, `submitFailed`.
- `hidden` renders nothing, neither the button nor the sheet, also when `open` is true.
- `open` makes the sheet controlled by the host. `onOpenChange(next)` is called on every open and close in both modes. On a successful submit it is called with `false` before `onSubmitted`. It is not called when the host changes `open` itself, and not when the sheet is already in the state that is asked for.
- The field errors and the submit error are dropped whenever the sheet closes, whoever closed it.

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

### Exercise renderers

One renderer per deterministic exercise type, plus `ExerciseRenderer`, which picks the renderer from the type id. A renderer shows the payload and reports a response. It never grades. The host sends the response to the grader and hands the grade back as `result`.

Every renderer takes the same props:

| Prop | Type | What it does |
|------|------|--------------|
| `payload` | the payload of that type | The exercise as it comes from the content pack, see `content/schema/exercise.schema.json`. Answer keys may be stripped: every renderer works without them |
| `value` | the value of that type, or `null` | The response so far. `null` means nothing is answered |
| `onChange(value)` | function | Called with the whole new response on every change |
| `disabled` | boolean | Blocks every change. Set it while grading |
| `result` | `{ correct, score, feedback: { message, explanation?, expected? } }` or `null` | The grade. A `GradeResult` from `@stufen/contracts` fits. Once set, the renderer is read only and shows the feedback under the exercise |
| `labels` | partial object | Every visible string, with English defaults |
| `lang` | BCP 47 tag | The target language, for example `de`. Set on target language text and on the inputs, so screen readers switch voice |
| `promptLang` | BCP 47 tag | The language of the questions, when the host knows it. The payload does not say whether a question is in English or in the target language, so nothing is set without this |
| `instruction` | string | The instruction line above the exercise, for example `instruction_en` |
| `className` | string | Goes to the outer element |

The value is exactly the response the grader of that type expects:

| Type | Component | `value` | Empty value | Keys |
|------|-----------|---------|-------------|------|
| `multiple_choice` | `MultipleChoiceExercise` | `{ selected: number }`, an index into the options | `null` | 1 to 9 select from anywhere on the page, arrow keys move and select, Home and End jump |
| `cloze` | `ClozeExercise` | `{ answers: string[] }`, one per blank, in order | one empty text per blank | Tab moves between the gaps |
| `match_pairs` | `MatchPairsExercise` | `{ pairs: { left: string; right: string }[] }` | `{ pairs: [] }` | Arrow up and down move within a column, arrow left and right change column, Home and End jump, Enter or Space picks. A number picks a left item and a letter a right item, for example 2 then c. Backspace undoes the last pair |
| `order_words` | `OrderWordsExercise` | `{ order: string[] }`, the tokens in the chosen order | `{ order: [] }` | Tab moves between the words, Enter or Space moves a word to the line or back, arrow left and right reorder the focused word in the line, 1 to 9 append the nth word of the bank, Backspace takes the last word back |
| `flashcard` | `FlashcardExercise` | `{ rating: 'again' \| 'hard' \| 'good' \| 'easy' }` | `null` | Space shows the answer, 1 to 4 rate |
| `read_answer` | `ReadAnswerExercise` | `{ answers: (number \| string)[] }`, one per question, an option index or a short text | one `''` per question | Tab moves between the questions, arrow keys move within one, 1 to 9 pick an option of the question that has focus |
| `listen_answer` | `ListenAnswerExercise` | the same as `read_answer` | one `''` per question | Space plays or stops the audio, the rest as `read_answer` |
| `dictation` | `DictationExercise` | `{ text: string; replays?: number }` | `{ text: '' }` | Space plays the audio while the text area is empty, Ctrl plus Space plays it from the text area at any time |

The number and letter keys of `match_pairs` and `order_words` work while focus is inside the exercise. The number keys of `multiple_choice` and `flashcard` and the Space key of the audio button work from anywhere on the page, except while focus is in a text field. Enter for Check and Continue belongs to the host.

Helpers:

| Export | What it is |
|--------|------------|
| `RENDERABLE_TYPES` | The eight type ids above, as a readonly array |
| `emptyValue(type, payload)` | The value to start with, as in the table. `null` for a type without a renderer and for a payload that does not fit |
| `isComplete(type, payload, value)` | `true` when the response is whole, so the host may enable the Check button: an option is picked, every blank has text, every pair is joined, every word is placed, a rating is given, every question is answered, the text area has text |
| `ExerciseRenderer` | Takes `type` (a string), `payload` and `value` (both `unknown`) and the common props, and renders the matching renderer. A type outside `RENDERABLE_TYPES`, or a payload that does not fit its type, renders the message in `labels.unsupported` and never throws |
| `FLASHCARD_RATINGS` | `['again', 'hard', 'good', 'easy']` |

```tsx
'use client';

import { useState } from 'react';
import { Button, emptyValue, ExerciseRenderer, isComplete } from '@stufen/ui-kit';
import type { ExerciseResult, ExerciseValue } from '@stufen/ui-kit';

export function Step({
  type,
  payload,
  instruction,
  grade,
}: {
  type: string;
  payload: unknown;
  instruction: string;
  grade: (value: ExerciseValue) => Promise<ExerciseResult>;
}) {
  const [value, setValue] = useState<ExerciseValue | null>(() => emptyValue(type, payload));
  const [result, setResult] = useState<ExerciseResult | null>(null);

  return (
    <>
      <ExerciseRenderer
        type={type}
        payload={payload}
        value={value}
        onChange={setValue}
        result={result}
        lang="de"
        instruction={instruction}
      />
      <Button
        disabled={result !== null || !isComplete(type, payload, value)}
        onClick={() => value !== null && grade(value).then(setResult)}
      >
        Check
      </Button>
    </>
  );
}
```

### Renderer behaviour

- Shared frame. Each renderer is a `div.st-exercise.st-exercise--<type>` with the instruction line, the exercise, then the feedback. The feedback is a `role="alert"` box with an icon, the word "Correct", "Not quite" or "Partly correct" (when the score is above 0), the message, the expected answer and the explanation. A grader message that already opens with the word does not get it twice.
- `MultipleChoiceExercise`. The question, an `AudioButton` when the payload has `audio`, and a `Choice` over the options. After a result the right option says "Correct" and a wrong selection says "Not quite". Without `answer_index` in the payload the selection is marked from `result.correct`.
- `ClozeExercise`. The text is split at every `___` (three underscores) and each gap is an inline input named "Blank 1 of N" with the `hint` of its blank under it. After a result each gap is marked on its own: "Correct", or "Not quite" and the expected answer. The check per gap trims, collapses spaces and ignores case against `answer` and `accept`. It does not know the language pack, so the grader stays the authority: a correct result marks every gap right.
- `MatchPairsExercise`. The left column keeps the payload order with keys 1 to 9, the right column is shuffled with keys a to z. The shuffle depends only on the texts, so the server and the browser agree. A paired item shows its partner on the item and says "Paired with hello. Select to undo." After a result a list names every pair with its mark, and for a wrong pair what was chosen.
- `OrderWordsExercise`. The answer line is above the word bank. A word that moves keeps the focus close: the next word in the bank, or the word itself once the bank is empty. A polite status region says where a word landed. Two equal words are two separate tokens. After a wrong answer the correct sentence is shown with the first differing word underlined.
- `FlashcardExercise`. The front, then "Show answer". The back shows `back`, `hint` and an `AudioButton` that plays `audio` or speaks the front. Focus moves to the back when it opens. The four rating buttons are "Again", "Hard", "Good" and "Easy". A card that already has a rating is shown open.
- `ReadAnswerExercise`. The passage is a `section` named by `title`, or "Text", with `lang`. Blank lines split paragraphs. A question with `options` is a `Choice`, a question without is a `TextInput`. After a result each question with an `answer_index` is corrected in place and its `explanation_en` is shown.
- `ListenAnswerExercise`. An `AudioButton` plays `audio`, or speaks `transcript` through speech synthesis when there is no file. The transcript is not in the page before the answer. After a result a "Show transcript" button with `aria-expanded` opens it.
- `DictationExercise`. An `AudioButton`, a counter ("Played 2 times") in a status region, and a `TextArea` with `lang`. Every play after the first is a replay and goes into the value as `replays`. The spoken text is not in the page before the answer and is shown after a result.

Exported types: `ExerciseRendererProps`, `ExerciseResult`, `ExerciseOutcome`, `ExerciseCommonLabels`, `ExerciseAudioLabels`, `QuestionLabels`, `RenderableExerciseType`, `ExercisePayload`, `ExercisePayloadMap`, `ExerciseValue`, `ExerciseValueMap`, `ExerciseRendererComponentProps`, `ExerciseRendererLabels`, `ExerciseLabels`, and per type the props, labels, payload and value: `MultipleChoiceExerciseProps`, `MultipleChoiceLabels`, `MultipleChoicePayload`, `MultipleChoiceValue`, `ClozeExerciseProps`, `ClozeLabels`, `ClozePayload`, `ClozeBlank`, `ClozeValue`, `MatchPairsExerciseProps`, `MatchPairsLabels`, `MatchPairsPayload`, `MatchPair`, `MatchPairsValue`, `OrderWordsExerciseProps`, `OrderWordsLabels`, `OrderWordsPayload`, `OrderWordsValue`, `FlashcardExerciseProps`, `FlashcardLabels`, `FlashcardPayload`, `FlashcardRating`, `FlashcardValue`, `ReadAnswerExerciseProps`, `ReadAnswerLabels`, `ReadAnswerPayload`, `ListenAnswerExerciseProps`, `ListenAnswerLabels`, `ListenAnswerPayload`, `QuestionPayload`, `QuestionsValue`, `DictationExerciseProps`, `DictationLabels`, `DictationPayload`, `DictationValue`.

The payload and value types are declared in the kit. The kit does not import `core-exercise-types`. If a grader changes its response shape, `src/exercises/types.ts` changes with it.

### AudioButton behaviour

- With `src` the file plays through an `<audio>` element. Without `src`, `text` is spoken with `window.speechSynthesis` in the language of `lang`. When a file fails to play and there is a `text`, the text is spoken instead.
- Three states, on `data-state` of the wrapper: `idle`, `playing`, `error`. The accessible name of the button is "Play audio" while idle and "Stop audio" while playing. An error shows "The audio did not play. Try again." in a `role="alert"` and the button stays usable.
- It is a native button, so Space and Enter on it toggle playback. With `shortcut`, Space toggles from anywhere on the page unless focus is in a text field or on another control, and Ctrl plus Space toggles from a text field.
- `rate` sets the speed for both the file and the speech. 1 is normal and 0.7 is slow. It is clamped to 0.25 to 4.
- When there is neither a file nor a way to speak (no `src`, and no `text` or no speech synthesis in the browser), the button is disabled and the message "Audio is not available in this browser." is shown.
- `onPlay` is called on every start. `onEnded` is called when playback reaches the end, not on stop.
- The sound stops when the component unmounts and when `src` or `text` changes.

### CorrectionInline behaviour

- `corrections` is a list of `{ span, errorType, correction, note? }`, the shape of `Correction` in `@stufen/contracts` with `note` optional. Each `span` is looked up in `text`, first free occurrence first, so the same span can be corrected at two places.
- A mark keeps the original in place with a line through it and adds the error category in words and the corrected form beside it. The mark is a tab stop with `role="group"` and a name such as `Case. "ein Kaffee" should be "einen Kaffee".`
- A `note` is listed under the text and linked to its mark with `aria-describedby`. A correction whose span is not in the text is listed there too and never dropped.
- An empty `correction` means the span should go, and reads "remove".
- `labels.errorTypes` translates the nine categories, `labels.mark` builds the spoken name.

### LevelMap behaviour

- `levels` is a list of `{ level, status, descriptorText?, masteredCount, totalCount, checkpoint, descriptors }`. The levels are shown in CEFR order whatever order they arrive in. `order="descending"` puts C2 first, as in the wireframe of `docs/06-ui-ux.md` section 5.
- Each level is a heading that holds one button with `aria-expanded`. The button shows the `LevelBadge`, the status in words ("Reached", "Working towards B1", "Not started") and the count ("12 of 61 mastered"). A thin `Progress` shows the same count.
- An open level shows `descriptorText` beside a table with one row per descriptor: code and text, skill, state ("Mastered", "In progress", "Not started"), attempts, exercise types, best production score ("best 2 of 5", or "None"). From 768 px the two sit side by side. The table scrolls inside its own box on narrow screens.
- The levels with status `working_towards` start open, or the ones in `defaultExpanded`. Levels open and close on their own.
- The checkpoint button calls `onStartCheckpoint(level)` and is enabled only when `checkpoint` is `available`. `locked` and `failed` show a disabled button with a sentence beside it. `passed` shows "Checkpoint passed." and no button.
- `labels.names` maps skill ids and exercise type ids to words. An id without a name is shown with spaces for underscores.

### Not in this version

`RecordButton` and `RubricBars` are named in `docs/04-module-contracts.md` and arrive in later rows of the build sequence. `translate`, `write_free` and `speak_prompt` have no renderer yet: `ExerciseRenderer` shows its fallback message for them.

The renderers leave these parts of `docs/06-ui-ux.md` section 4 to later rows or to the host:

- Enter for Check and Continue, Escape, `H` and `?` belong to the lesson screen. A renderer only reports its value.
- `GradeResult.errorTypes` is not part of the `result` prop, so the small error category labels are not shown under a cloze gap or a sentence.
- `match_pairs` checks every pair once, when the result arrives. It does not unmatch wrong pairs and let the learner continue, and it draws no joining line: a paired item names its partner instead.
- `order_words` has no drag. Click, Enter and the arrow keys do the same job.
- `dictation` shows the text that was spoken after the result, not a word by word diff. The diff shape comes from `core-speech.compare`, which the kit may not import.
- `read_answer` has no "Show where" link and `listen_answer` does not highlight a sentence or limit the number of plays, because the payload carries none of that.
- `cloze` gaps are always text inputs. The payload has no options for a blank.

`LevelMap` shows what its props carry. Recent accuracy, the "needs" line, the date and score of a checkpoint, the attempt history sheet and the exam simulation buttons from section 5 are not in the props.

`FeedbackFab` leaves three things from `docs/06-ui-ux.md` section 8 to the host app: the `f` keyboard shortcut (the host listens for the key and sets `open`, see "FeedbackFab open state"), the sentence that says which context is attached, and the lower opacity on lesson screens. The host also shows the "Sent. Thank you." toast from `onSubmitted`.

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Accessibility notes

- Contrast. `tests/tokens.test.ts` computes the WCAG ratio for every text pair the components use, in both themes, and fails under 4.5 to 1. Two light colours were darkened to pass, see the changelog.
- Colour is never the only signal. A selected `Choice` option shows a filled dot. A selected rating is bold and ringed. A character count near its limit turns bold. Revealed options carry the words "Correct" or "Not quite" and a tick or a cross. Toasts carry an icon for the tone. An invalid `TextInput` shows the error text. A cloze gap, a pair and the feedback box carry a tick or a cross and the word "Correct", "Not quite" or "Partly correct". A paired item has a dashed border and names its partner. A chosen flashcard rating is bold with a thick border. A corrected span has a line through it with the category and the correction beside it. A level says its status in words.
- Focus. Every focusable part has a 2 px ring in `--st-color-focus` with a 2 px offset. The stylesheet never removes an outline.
- Labels. `TextInput`, `TextArea` and `RatingInput` require a visible label. `Progress` and `Choice` require `label`. `Sheet` requires `title`. The toast dismiss button, the sheet close button and the feedback fab have accessible names. A `Button` with only an icon needs an `aria-label` from the caller. Each cloze gap is named "Blank 1 of N". The two columns of `match_pairs`, the answer line and the word bank of `order_words` and the rating buttons of a flashcard are named groups. `AudioButton` is named "Play audio" or "Stop audio" by its state. `LevelBadge` is named "Level B1".
- Errors. A `TextInput`, `TextArea` or `RatingInput` error is linked with `aria-describedby`, sets `aria-invalid` and is announced when it appears. A failed feedback submit is announced from a `role="alert"` region.
- Dialogs. `Sheet` traps Tab, closes on Escape, returns focus to where it was and locks body scroll while open.
- Language. Pass `lang="de"` to `TextInput` and `lang: 'de'` on `Choice` options so screen readers switch voice for German. Every renderer takes `lang` and sets it on target language text, on each word, option and input, and on the transcript. `promptLang` does the same for questions. `AudioButton` passes `lang` to the speech synthesis so the right voice speaks.
- Touch targets. Buttons, inputs, choice options, rating options, the toast dismiss button, the sheet close button and the feedback fab are at least 44 px. The same holds for the audio button, cloze inputs, match items, word chips, flashcard rating buttons and the level map toggles.
- Motion. Transitions use the motion variables. `prefers-reduced-motion: reduce` and `data-motion="reduce"` set every duration to 0 and stop the button spinner.
- Borders of inputs and choice options use `--st-color-text-muted`, because `--st-color-border` is under 3 to 1 against the surface and these borders are what marks the control.
- A `loading` button is natively disabled, so it drops out of the tab order while it waits. Move focus yourself if the screen needs it to stay put.
- Keyboard. Every renderer works without a pointer and without drag. `match_pairs` and `order_words` are built from native buttons. Items that are locked after a result keep their place in the tab order and are marked `aria-disabled`, so the result can still be read.
- Shortcut safety. Single key shortcuts are ignored while focus is in a text field, and while Ctrl, Alt or Meta is held. The number and letter keys of `match_pairs` and `order_words` only act while focus is inside the exercise.
- Announcements. The feedback of a renderer is a `role="alert"` and is announced once when the result arrives. A reordered word and the replay counter are announced from polite status regions. An audio error is a `role="alert"`.
- Audio alternatives. `ListenAnswerExercise` offers the transcript and `DictationExercise` shows the spoken text once there is a result, never before. A browser that can play nothing says so in words.
- Focus is never lost. A word that moves between the bank and the line passes focus to its neighbour. Showing the answer of a flashcard moves focus to the answer.
- Reading order. `LevelMap` is an ordered list with one heading per level. The evidence is a real table with a caption, column headers and a row header per descriptor.

## Owns tables

None. This box owns no database tables.

## Emits and listens

None. This box neither emits nor subscribes.

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/ui-kit/`. If `contracts` must change, do that in its own commit first.
3. A new token goes into `src/tokens.ts` and `src/styles.css` together. A new component gets a file in `src/components/`, an export in `src/index.ts`, classes in `src/styles.css` that read only the variables, a test file, and a place in `tests/gallery.test.tsx`. A component file that uses a hook, state, an effect, a portal or a browser event starts with `'use client';` on its first line. `tests/client-directives.test.ts` fails if it does not. An exercise renderer goes into `src/exercises/` with the same steps, plus an entry in `RENDERABLE_TYPES`, in the maps of `src/exercises/types.ts`, `guards.ts` and `values.ts`, and in `ExerciseRenderer.tsx`.
4. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(ui-kit): message`.

## How to test it

```
pnpm --filter @stufen/ui-kit test
```

The run prints one line per test file. `tests/gallery.test.tsx` is the acceptance check: all ten components render in light and in dark. `tests/feedback-fab.test.tsx` holds the check for row P0-21: the fab opens a sheet with kind, message and rating fields. The same file holds the checks for row P1-41: a parent opens the sheet without a click on the fab, controlled mode stays open until the parent sets `open` to false, and `onOpenChange` reports each change. `tests/client-directives.test.ts` checks the `'use client'` directive file by file. `tests/exercises-real-content.test.tsx` holds the check for row P1-18: every exercise of the eight deterministic types in lessons 1 and 2 of A1 unit 1 renders through `ExerciseRenderer` and shows its prompt. The second gallery in `tests/gallery.test.tsx` renders every renderer and the four new components in light and in dark.

## Status

See the `ui-kit` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
