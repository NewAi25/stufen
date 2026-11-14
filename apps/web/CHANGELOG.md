# Changelog

## [Unreleased]

## [0.5.1] - 2026-11-14

### Changed
- A flashcard inside a lesson is rated by the learner, so it no longer names any descriptor when it reaches the lesson engine. Its words still enter review. A self rating is never mastery evidence.

## [0.5.0] - 2026-11-12

### Fixed

- The evidence rule. `translate`, `write_free` and `speak_prompt` have no grader yet and get a provisional result. Those attempts counted as evidence for mastery and rated review cards, which inflated progress. `container.getLesson` now hands an exercise whose type has no registered grader to the lesson engine with no `candoIds` and no `itemIds`. Its `attempt.recorded` event carries none, so `core-progress` records no evidence and `core-srs` rates no card. The attempt is still stored with the response and `provisional: true` in its feedback, for the tutor to grade later.

### Added

- `/lesson/[id]`, the lesson player (row P1-19). It starts or resumes the learner's session and shows one exercise at a time with a progress bar, the instruction line, the ui-kit `ExerciseRenderer` for the eight checked types, and one primary button: Check, then Continue, and Finish on the last exercise. Enter presses it. A new exercise gets the focus on its first control, so its keys work at once. Exit goes home and keeps the session. The navigation is hidden on this screen.
- `SelfCheckExercise` for `translate`, `write_free` and `speak_prompt`: the task, a text area (optional for a spoken task), a button that shows the sample answer and locks the text, and one sentence saying that the tutor grades these in a later version and that they do not count towards the level yet. The response is stored.
- The lesson summary: the score of the checked exercises as a sentence, the number of self checks, how many new words went into review, a primary link to the next lesson and a link home.
- `/review` (row P1-20): one due card at a time in the ui-kit `FlashcardExercise`. Space shows the answer, keys 1 to 4 rate it through `srs.review`. A counter of cards left, an empty state, and a done state that sums up the ratings and says when a rated card comes back.
- `/` is the daily loop (row P1-22): reviews due, the next lesson with unit, title and minutes, a quiet streak number and the line "Working towards A1". One filled button: Start reviews when cards are due, otherwise Open lesson. Below it the units and lessons of the current level with a done mark. The Tutor card says it arrives in the next version.
- `/progress` (row P1-23): the ui-kit `LevelMap` with status, mastered count and the evidence per descriptor. Each level card shows the CEFR global scale paragraph from `docs/14-levels-in-real-life.md` (kept in `src/lib/level-descriptions.ts`) and a line that the estimate is not a certificate. The checkpoint button is shown as not open yet. A level without descriptors says its content is not written yet.
- The `f` shortcut for feedback (row P1-42). `FeedbackWidget` owns the open state of `FeedbackFab`. The key is ignored in a text field, a select and editable text, and it is off on `/lesson` and `/review`, where exercises use letter keys.
- Pure functions behind the pages: `openLesson`, `submitLessonAnswer`, `completeLesson`, `loadReviewQueue`, `rateReviewCard`, `loadHome`, `loadProgress`. `requireLearner` and `getLearner` in `src/server/learner.ts`. `container.getItems`.
- Tests: `tests/lesson-flow.test.ts`, `tests/review-flow.test.ts`, `tests/home.test.ts`, `tests/progress.test.ts`, `tests/feedback-shortcut.test.ts`, and two more flows in `tests/container.postgres.integration.test.ts`.

### Changed

- Home, Review, Progress and Settings in the navigation link to real pages. Tutor and Write stay on the coming soon page.
- Server components import ui-kit components from `@stufen/ui-kit` directly, because the kit's interactive components now carry the client directive.
- The feedback button defaults to the kind "Confusing" on lesson and review screens and steps back to 60 percent opacity there.

### Removed

- `src/components/kit.tsx`, the client boundary wrapper for the ui-kit. Nothing needs it any more.

### Not in this version

- Grading of `translate`, `write_free` and `speak_prompt`. Until the tutor is wired no production descriptor can be mastered and no level can be reached.
- Skip, the hint sheet, the exit confirmation and the shortcut overlay of the lesson screen.
- Checkpoints, the "Moved recently" strip on home and the per descriptor detail sheet on progress.
- The time of the next review on a fresh visit to `/review`. `core-srs` has no read for it yet.

## [0.4.0] - 2026-11-12

### Added

- Two store modes in `src/server/container.ts`. With `DATABASE_URL` the container calls `createDb` once and gives every box its Postgres store. Without it, or with `STUFEN_STORE=memory`, every box gets its in memory store.
- The learning boxes are wired: the German pack from `lang-de`, `core-curriculum`, `core-content`, the exercise type registry with the eight deterministic types, `core-lesson-engine`, `core-srs` and `core-progress`. `core-srs` and `core-progress` listen to `attempt.recorded`.
- `container.grade(exercise, response, language)` in `src/server/grading.ts`. It looks up the exercise type and grades with the rules of the German pack and the level of the lesson's unit. `translate`, `write_free` and `speak_prompt` have no grader yet. They get a self check result, `correct: true` and `score: 1`, with a message that the tutor reviews the task in a later version, and the stored feedback carries `provisional: true`.
- `src/server/actions/lesson-actions.ts`: `startLesson`, `answerExercise` and `finishLesson`. `finishLesson` closes the session and hands the items the lesson introduces to `core-srs`. The lesson page of row P1-19 will call these.
- In memory mode the German pack is installed once when the container is built, so lessons exist without a database. `container.ready` resolves when that is done.
- Sign in with a magic link (row P1-38). `/sign-in` has one email field and one button. The answer is always "If that address can sign in, a link is on its way." A rate limit of 5 requests in 15 minutes applies per email and per client address.
- `GET /auth/callback` trades the token for the `stufen_session` cookie and redirects to `next` when that is a path on this site, otherwise to `/`. A link that does not work goes to `/sign-in?error=link`.
- `POST /auth/sign-out` ends the session, clears the cookie and goes to `/sign-in`. It refuses a post from another site. The settings page has a Sign out button.
- `requireSession(path)` in `src/server/session.ts`. `/`, `/onboarding`, `/settings` and `/feedback` redirect to `/sign-in?next=<path>` when nobody is signed in.
- In local development with the console mail adapter, the sign in page shows the link below the form with a "Development only" label.
- Settings in `src/server/config.ts`: `DATABASE_URL`, `STUFEN_STORE`, `APP_URL`, `STUFEN_CONTENT_DIR` and the mail variables, which go to `createMailFromEnv` unchanged. `APP_URL` is required in production. A value that cannot be used throws `ConfigValueError`, which names the variable and never repeats the value.
- `next.config.ts`: the content folder is copied into the standalone output, and the dev request log leaves out `/auth/callback`, because its query string holds the token.
- Tests: `tests/container.memory.test.ts`, `tests/sign-in.test.ts` and `tests/container.postgres.integration.test.ts`. The last one is skipped without `DATABASE_URL`.

### Changed

- The automatic dev session exists only when `NODE_ENV` is not `production` and the store mode is memory. On Postgres sign in is always real.
- `container.auth` is built with `createAuth` on the chosen store. `container.mail` comes from `createMailFromEnv`, so `MAIL_DRIVER=smtp` works. `container.consoleMail` is set only when the console adapter is in use.
- `/feedback` now needs a session, because the list is personal. The feedback button on every page still works signed out.
- The "not signed in" message of the server actions no longer says that sign in is coming.

### Removed

- `src/components/SignInSoonCard.tsx` and the "sign in arrives in the next phase" card on `/`, `/onboarding` and `/settings`.

### Not in this version

- Google sign in. It is its own row, P1-46.
- A lesson page. The engine is wired and tested, the route is row P1-19.
- A shared rate limit. The counter lives in one process.

## [0.3.0] - 2026-11-06

### Added

- The ui-kit `FeedbackFab` on every page, through `src/components/FeedbackWidget.tsx` in the root layout. It sends the kind, message and rating with the current route and a small context: theme, viewport width and height, and browser language. A toast says "Sent. Thank you." A rejected submit shows the reason in the sheet and keeps the text.
- `/feedback`: an invitation to send feedback and, when signed in, the learner's own feedback newest first with kind, message, rating, date and status. Signed out shows the invitation only.
- `src/server/actions/feedback-actions.ts`: `submitFeedbackFor(container, session, input)` and `listMyFeedback(container, userId)`. A signed out submit is stored without a user id. A `FeedbackValidationError` becomes `{ ok: false, field, message }`.
- Server action `submitFeedback` in `src/app/feedback/actions.ts`.
- The bottom bar More entry opens a ui-kit `Sheet` with Write, Settings and Feedback.
- `tests/feedback-actions.test.ts` against the real in memory container.

### Changed

- `src/components/nav.ts`: `BAR_ITEMS` holds the four bar links, and the new `MORE_ITEMS` holds the links inside the More sheet.
- On narrow screens the feedback button sits above the bottom bar.

### Not in this version

- The `f` shortcut from `docs/06-ui-ux.md` section 8. `FeedbackFab` keeps its open state inside and offers no way to open it from outside. It needs a ui-kit change first.

## [0.2.0] - 2026-11-06

### Added

- `/onboarding`: choose the language (German today, Dutch and French shown as coming soon) and the target level, each level with a one line meaning from `docs/14-levels-in-real-life.md`. "Start from zero" sets the active language and goes home. "Take the placement test" is shown disabled until the assessment box lands.
- `/settings`: display name, timezone, daily goal in minutes, the theme toggle, the interface language shown as fixed English, and a read only "Your plan" card with the plan and what is left of the three daily limits. Field errors show inline. A toast confirms a save.
- `src/server/actions/identity-actions.ts`: `completeOnboarding` and `saveSettings`. They take the container and a user id, validate the input, and return `{ ok: true }` or `{ ok: false, field?, message }`. They never throw for a user error.
- Server actions `submitOnboarding` and `submitSettings` that read the session, return a "not signed in" result when there is none, and revalidate.
- `src/lib`: the shared action result type, the language and level options, and the plan and limit labels.
- `tests/identity-actions.test.ts` against the real in memory container.

### Changed

- `/` now uses the profile. With no active language it redirects to `/onboarding`. Otherwise it greets the learner by display name or email, shows the language and target level, and says lessons arrive in the next phase.
- `/`, `/onboarding` and `/settings` show a short card saying sign in arrives in the next phase when nobody is signed in.
- Settings in the rail goes to `/settings`.

## [0.1.0] - 2026-11-05

### Added

- Next.js 16 App Router scaffold under `src/app` with React 19, Tailwind v4 through `@tailwindcss/postcss`, `output: 'standalone'` and `transpilePackages` for every workspace box.
- Root layout with a skip to content link, the ui-kit `ToastProvider`, a theme provider with a no flash inline script, and the app shell: left rail on wide screens, bottom bar on narrow screens.
- Pages: `/` (welcome card with a ui-kit `Button`), `/kit` (gallery of ui-kit components with the theme toggle), `/coming-soon`, and a custom not found page.
- `GET /api/health` returning `{ ok: true, version }`.
- Composition root in `src/server/container.ts`: one instance per process of the event bus, console mail, in memory auth, identity, entitlements, analytics, feedback and fs storage. On `user.signed_up` it creates the profile and the default plan.
- `src/server/config.ts`: typed read of the environment. Throws in production when `STORAGE_SIGNING_SECRET` is missing.
- `src/server/session.ts`: `getSession()` reads the `stufen_session` cookie. Outside production it falls back to a dev session.
- Tests for the container, the wiring and the config.

### Changed

- `module.json` and `package.json` list only the boxes this version imports. Later rows add boxes back as their routes land.
