# Changelog

## [Unreleased]

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
