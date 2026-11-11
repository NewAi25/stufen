# Changelog

## [Unreleased]

## [0.4.0] - 2026-11-11

### Added
- Exercise renderers for the eight deterministic types, one file each under `src/exercises/`: `MultipleChoiceExercise`, `ClozeExercise`, `MatchPairsExercise`, `OrderWordsExercise`, `FlashcardExercise`, `ReadAnswerExercise`, `ListenAnswerExercise` and `DictationExercise`. Every renderer is controlled and takes the same props: `payload`, `value`, `onChange`, `disabled`, `result`, `labels`, `lang`, `promptLang`, `instruction` and `className`. `value` is the response the grader of that type expects. A renderer never grades.
- `ExerciseRenderer`: takes `type` and the common props and renders the matching renderer. A type without a renderer, or a payload that does not fit its type, shows a calm message and never throws. `RENDERABLE_TYPES` lists the eight type ids.
- `emptyValue(type, payload)` and `isComplete(type, payload, value)`, so the host can hold a response in state and knows when the Check button may be enabled.
- `MultipleChoiceExercise`: the question, the options through `Choice` with number keys, and after a result the words "Correct" and "Not quite" on the options.
- `ClozeExercise`: the sentence with one inline input per `___` gap, each named "Blank 1 of N", with the hint of the blank under it. After a result each gap says "Correct", or "Not quite" with the expected answer.
- `MatchPairsExercise`: two columns of buttons. Pick one item on each side to pair them, in either order. Arrow keys move within and between the columns, a number then a letter picks a pair, picking a paired item or pressing Backspace undoes a pair. The right column is shuffled the same way on the server and in the browser. After a result every pair is listed with its mark and the right partner.
- `OrderWordsExercise`: a word bank and an answer line. A click or Enter moves a word to the line and back, the left and right arrow keys reorder the focused word in the line, number keys append a word and Backspace takes the last one back. After a wrong answer the correct sentence is shown with the first differing word underlined.
- `FlashcardExercise`: the front, a "Show answer" button (Space), then the back, the hint, an audio button and four rating buttons with keys 1 to 4.
- `ReadAnswerExercise`: the passage with `lang`, then the questions. `ListenAnswerExercise`: an audio button, the questions, and the transcript behind a "Show transcript" button once there is a result. A question with options is a `Choice`, a question without is a short `TextInput`.
- `DictationExercise`: an audio button, a text area with `lang` and a replay counter. The number of replays goes into the value as `replays`. The text that was spoken is shown after a result.
- `AudioButton`: plays `src` through an audio element, or speaks `text` with `window.speechSynthesis` when there is no `src` or the file fails. States `idle`, `playing` and `error` on `data-state`, an accessible name that changes between "Play audio" and "Stop audio", `rate` for slow playback, `shortcut` for Space on the page and Ctrl plus Space in a text field, and a visible message when neither a file nor speech synthesis can play.
- `CorrectionInline`: a learner text with corrections `{ span, errorType, correction, note? }` marked in place. Each mark shows the original, the error category in words and the corrected form, is a tab stop, and is named with the category and the correction. Notes and corrections whose span is not in the text are listed under it.
- `LevelBadge`: a small badge for a CEFR level with the accessible name "Level B1". Markup only, no directive.
- `LevelMap`: the ladder A1 to C2. Each level is a button with `aria-expanded` that opens the official descriptor text beside an evidence table per descriptor (state, attempts, exercise types, best production score). The status is in words: "Reached", "Working towards B1", "Not started". The checkpoint button is enabled only when the checkpoint is `available`.
- Local types for the payloads and responses of the eight types, because the kit may not import `core-exercise-types`: `ExercisePayloadMap`, `ExerciseValueMap`, `ExerciseResult`, `ExerciseRendererProps` and one payload and one value type per exercise type.
- `src/styles.css`: classes for `st-level-badge`, `st-audio`, `st-correction`, `st-exercise`, `st-cloze`, `st-match`, `st-order`, `st-flashcard`, `st-passage`, `st-questions`, `st-transcript`, `st-dictation` and `st-level-map`, all from the existing variables. Every new control is at least 44 px, joins the shared focus ring and drops its transition under reduced motion.
- Tests: one file per new component and per renderer, `tests/exercise-values.test.ts`, `tests/exercise-renderer.test.tsx`, and `tests/exercises-real-content.test.tsx`, which loads lessons 1 and 2 of A1 unit 1 and renders every exercise of the eight types through `ExerciseRenderer`. `tests/gallery.test.tsx` gains a second gallery with every renderer and the four new components in light and in dark. `tests/tokens.test.ts` checks the new classes, touch targets and colour pairs. `tests/client-directives.test.ts` now also reads `src/exercises`.

### Not changed
- No existing component changed its props or its markup.

## [0.3.0] - 2026-11-06

### Added
- `FeedbackFab`: optional props `open` and `onOpenChange`. With `open` the host controls the sheet: it shows exactly when `open` is true, and Cancel, Escape, the close button, the backdrop, a successful submit and a click on the fab only call `onOpenChange` with the value they ask for. Without `open` the fab keeps its own state as before. `onOpenChange` is called on every open and close in both modes, and on a successful submit it is called before `onSubmitted`. This lets a host open feedback from a keyboard shortcut.
- The `'use client'` directive is the first line of `Choice`, `FeedbackFab`, `RatingInput`, `Sheet`, `TextArea`, `TextInput` and `Toast`. A React Server Component in Next.js can now import these from `@stufen/ui-kit` directly, without a wrapper file in the host.
- Tests: `tests/client-directives.test.ts` reads every file under `src/components` and fails if one imports a React hook or `createPortal` without starting with the directive, or if `src/index.ts` or `src/tokens.ts` carries it. `tests/feedback-fab.test.tsx` gains a block for the open state in both modes.

### Changed
- `FeedbackFab`: every open and close goes through one function. The field errors are now dropped when the sheet is seen to close, which also covers a host that sets `open` to false itself. The draft is kept as before.

### Not changed
- `Button`, `Card` and `Progress` stay without the directive. They are markup only, with no hook, state, effect, portal or browser event of their own, so they still render on the server with no script. `src/tokens.ts` and `src/index.ts` stay without it so the tokens can be read on the server.

## [0.2.0] - 2026-11-05

### Added
- `Sheet`: a modal dialog on the bottom or right edge. `role="dialog"` with `aria-modal`, named by its `title`, optional `description`. Renders nothing while closed. Rendered through a portal on `document.body` and copies `data-theme` and `data-motion` from where it was placed. Moves focus in on open (first focusable element, or `initialFocusRef`), keeps Tab and Shift Tab inside, closes on Escape, on a backdrop click and on a close button with an accessible name, returns focus on close, and locks body scroll while open.
- `TextArea`: the multiline partner of `TextInput` with the same `label`, `hint`, `error` and `aria-describedby` wiring. With `maxLength` it shows a character count such as `12 / 4000` and announces the characters left in a polite region once the text is within 10 percent of the limit. `remainingLabel` translates that announcement.
- `RatingInput`: a radiogroup of 1 to `max` (default 5, clamped to 2 to 9) named by a visible `label`. Arrow keys move and select and wrap at the ends, Home and End jump, number keys pick a value while focus is in the group. Each option has an accessible name such as "1 of 5" from `optionLabel`. Optional `lowLabel` and `highLabel`, `hint`, `error`, `required`, `disabled`. With `allowClear`, picking the selected value again, Backspace, Delete or 0 clears it and `onChange` receives `null`.
- `FeedbackFab`: a floating button fixed bottom right with an accessible name (`label`, default "Give feedback") that opens a `Sheet` titled "Feedback". The form has kind (a `Choice` over the five `FeedbackKind` values from `@stufen/contracts`, words from `kindLabels`), message (`TextArea`, at most 4000 characters, required unless kind is `rating`), rating (`RatingInput`, required when kind is `rating`), a submit button and a cancel button. `onSubmit` receives `{ kind, message, rating? }` with the message trimmed. While it is pending the submit button is loading and a second submit is ignored. Success closes the sheet, resets the form and calls `onSubmitted`. A rejection keeps the sheet open with the text intact and shows the error message in a `role="alert"` region. `labels` overrides every visible string, `defaultKind` sets the first kind, `side` picks the sheet edge and `hidden` renders nothing.
- Types `SheetProps`, `SheetSide`, `TextAreaProps`, `RatingInputProps`, `FeedbackFabProps`, `FeedbackFabInput`, `FeedbackFabLabels`.
- `src/styles.css`: classes for `st-sheet`, `st-textarea`, `st-rating`, `st-feedback-fab`, `st-feedback` and `st-visually-hidden`, all from the existing variables. The fab is 48 px and never under the 44 px touch target. The new focusable parts join the shared focus ring and the reduced motion rules.
- Tests: `tests/sheet.test.tsx`, `tests/text-area.test.tsx`, `tests/rating-input.test.tsx` and `tests/feedback-fab.test.tsx`. `tests/gallery.test.tsx` now renders all ten components in light and in dark. `tests/tokens.test.ts` checks the new classes, the touch target of the fab, the sheet close button and the rating options, and the contrast of the character count warning colour.

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
