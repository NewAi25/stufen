# @stufen/web

## Purpose

The Next.js app. Routes, pages, server actions and the wiring that composes every box.
It is the only place that imports more than `contracts`. Boxes never import it.

Kind: `surface`. May import: every box. Version 0.1.0 was the scaffold: layout, app shell, ui-kit wired, composition root and dev session. Version 0.2.0 added onboarding, settings and a home page that reads the profile. Version 0.3.0 added the feedback button on every page and `/feedback`. Version 0.4.0 puts the container on real stores, wires the learning boxes and adds sign in with a magic link. Version 0.5.0 adds the lesson player, the review screen, the daily loop on home, the progress page and the `f` shortcut for feedback, and it fixes the evidence rule.

## Run it

All commands run from the repo root. No `.env` file is needed for local work: without `DATABASE_URL` the app runs on in memory stores with the German pack loaded from `content/de`.

```
pnpm install
pnpm --filter @stufen/web dev      # http://localhost:3000, hot reload
pnpm --filter @stufen/web build    # production build into apps/web/.next
pnpm --filter @stufen/web start    # serves the production build
```

To use another port, set `PORT`, for example `PORT=3100 pnpm --filter @stufen/web start`. Outside production the sign in links follow `PORT`.

If every page of the dev server reloads without end in the browser, the Turbopack cache of the dev server is stale. Stop the server, delete the folder `apps/web/.next/dev` and start it again. The folder is generated and is rebuilt on the next start.

To run on a database, apply the migrations, install the pack and pass `DATABASE_URL`:

```
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm db:migrate
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm pack:install de
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/web dev
```

`start` runs with `NODE_ENV=production`, so it needs the production values from the Environment table: `APP_URL`, `STORAGE_SIGNING_SECRET` and `MAIL_DRIVER=smtp` with `SMTP_URL` and `MAIL_FROM`. For a local check `APP_URL=http://localhost:3000` is accepted.

The build uses `output: 'standalone'`, so `next start` prints a warning that names `server.js`. It still serves the app and is fine for a local check. The Docker image (row P1-39) will run `apps/web/.next/standalone/apps/web/server.js` instead.

The German pack is read from disk when the container is built, in both store modes, because the graders need its rules. `next.config.ts` copies `content/de` into the standalone output as `standalone/content/de`, and `src/server/content-dir.ts` finds it by walking up from the working directory. Set `STUFEN_CONTENT_DIR` when the folder lives somewhere else.

## Store modes

The container runs on one of two sets of stores. It never mixes them.

| Mode | When | What it means |
|------|------|---------------|
| `postgres` | `DATABASE_URL` is set | `createDb` is called once per process and every box gets its Postgres store. Sign in is real. The content pack must be installed with `pnpm pack:install de` |
| `memory` | `DATABASE_URL` is not set, or `STUFEN_STORE=memory` | Every box gets its in memory store. The German pack is installed from disk when the container is built. Data is gone when the process stops |

In Postgres mode the database needs every migration applied (`pnpm db:migrate`), and the user in `DATABASE_URL` must own the tables and be allowed to switch to the role `stufen_app`. See `packages/db/README.md`. Learner data is read and written inside `withUser`, so row level security applies. Sign in, pack installation and entitlement changes are owner work.

## Environment

Read once in `src/server/config.ts`. Nothing else in the app reads `process.env` for these values.

| Variable | Default outside production | In production |
|----------|----------------------------|---------------|
| `DATABASE_URL` | not set, which means memory mode | optional. Set it for Postgres mode |
| `STUFEN_STORE` | not set | `memory` forces memory mode even with `DATABASE_URL`. `postgres` insists on `DATABASE_URL` |
| `APP_URL` | `http://localhost:<PORT>`, with port 3000 when `PORT` is not set | required, and it must be `https` unless the host is `localhost`. The public base URL, for example `https://stufen.example.org`. Mail links are built from it, and an `https` URL makes the session cookie `Secure` |
| `MAIL_DRIVER` | `console` | must be `smtp`. `core-mail` refuses the console adapter in production |
| `SMTP_URL`, `MAIL_FROM` | not needed for `console` | required with `MAIL_DRIVER=smtp` |
| `MAIL_REPLY_TO` | not set | optional |
| `STORAGE_FS_ROOT` | `./.data/storage` | same default |
| `STORAGE_SIGNING_SECRET` | none, file URLs are unsigned | required |
| `STUFEN_CONTENT_DIR` | found automatically | the folder that holds the language folders, when `content/` is not next to the app |
| `STUFEN_DEV_SESSION_EMAIL` | `dev@stufen.local`, memory mode only | ignored |

A missing required value throws a `ConfigError` that names the variable. A value that cannot be used, such as an `APP_URL` without `https://` or `http://`, throws a `ConfigValueError`. Neither message repeats the value. The mail variables are checked by `createMailFromEnv` in `core-mail`, which throws a `MailConfigError`.

## Sign in

Sign in is by magic link through `core-auth` (ADR-009). There is no password.

1. `/sign-in` shows one email field and one button. The form posts to the server action `requestLink`, and it also works before any script has loaded.
2. The action calls `requestSignInLink` in `src/server/sign-in.ts`. An entry that is not an email address gets a field error. Every other request gets the same answer: "If that address can sign in, a link is on its way." That holds for an address with an account, an address without one, a request over the rate limit and a mail server that failed. The form never tells who has an account.
3. The mail link is `<APP_URL>/auth/callback?next=<path>&token=<token>`. `core-auth` creates the token, stores only its hash on Postgres, and sends the mail through `core-mail`. The link works once and for 15 minutes.
4. `GET /auth/callback` calls `auth.consumeMagicLink`. On success it sets the cookie `stufen_session` and redirects to `next`. A token that is unknown, expired or already used redirects to `/sign-in?error=link`, which shows a calm note above the form.
5. `POST /auth/sign-out` calls `auth.signOut`, clears the cookie and redirects to `/sign-in`. The Sign out button is on `/settings`.

Rules that keep it safe:

| Topic | Rule |
|-------|------|
| Cookie | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `APP_URL` is https, `Max-Age` equal to what is left of the session, which starts at 30 days |
| `next` | Only a path on this site: it starts with one slash and has no backslash and no control character. An absolute URL, `//host`, `/sign-in` and `/auth/...` become `/`. It is checked when the link is built and again in the callback |
| Redirects | Every redirect of the two route handlers has a relative `Location`. The host of the request is never used |
| Rate limit | 5 requests in 15 minutes per email and 5 per client address, in memory, per process. A refused request gets the neutral answer and sends no mail. The client address is the last entry of `X-Forwarded-For` |
| Token | Never written to a log by the app. The dev server's request log leaves out `/auth/callback`. The callback answers with `Cache-Control: no-store` and `Referrer-Policy: no-referrer` |
| Sign out | POST only. A request whose `Origin` is another site gets 403, so another site cannot sign a learner out |

`getSession()` in `src/server/session.ts` reads the cookie through `auth.getSession`. `requireSession(path)` redirects to `/sign-in?next=<path>` when there is no session. `/`, `/onboarding`, `/settings`, `/feedback`, `/lesson/[id]`, `/review` and `/progress` use it. The last three and `/` go through `requireLearner(path)` in `src/server/learner.ts`, which also redirects to `/onboarding` while no language is chosen.

### Local development

With the console mail adapter the mail is printed in the terminal that runs the dev server. The sign in page also shows the link below the form, labelled "Development only". That display needs `NODE_ENV` not to be `production` and the console adapter, which `core-mail` refuses in production.

The automatic dev session still exists for quick local work, but only when all three hold: `NODE_ENV` is not `production`, the store mode is `memory`, and no `stufen_session` cookie was sent. It signs in `STUFEN_DEV_SESSION_EMAIL` through `auth.createDevSession`. In Postgres mode there is no dev session.

## Installing the content pack

In memory mode nothing is needed. In Postgres mode the pack is installed by a script, never at request time:

```
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm pack:install de
pnpm pack:install de --dry-run        # validate and build the snapshot, write nothing
pnpm pack:install de --all-warnings   # list every warning, not the first 20
```

`scripts/install-pack.ts` validates the pack and prints the issues as a table. With any error it writes nothing and exits with code 1. Otherwise it installs, prints the counts, a digest of every id and the active version. Ids are derived from the pack keys, so running it again reports the same digest and updates rows in place. Learner rows that point at lessons and items survive a reinstall.

## Routes in this version

| Route | Needs a session | What it does |
|-------|-----------------|--------------|
| `/` | yes | The daily loop. With no active language: redirects to `/onboarding`. Otherwise three cards: Reviews (the due count), Next lesson (unit, title, minutes) and Tutor (a line that it arrives in the next version). Then a quiet streak number and the units and lessons of the current level, each lesson a link with a done mark. The level line reads "Working towards A1". One filled button: Start reviews when cards are due, otherwise Open lesson |
| `/lesson/[id]` | yes | The lesson player. Starts the learner's session for the lesson or resumes the unfinished one. One exercise at a time, Check then Continue, a summary at the end. An id that is not a lesson gives the not found page. The navigation is hidden here |
| `/review` | yes | The due queue, one card at a time. Space shows the answer, keys 1 to 4 rate it. With nothing due it says so and links to the next lesson |
| `/progress` | yes | The level map: per level the status in words, mastered count of total and the evidence per descriptor. Each level card shows the official description of the level and says that the estimate is not a certificate. The checkpoint button is shown as not open yet |
| `/sign-in` | no | The sign in form. `?next=<path>` is where to go afterwards. `?error=link` shows a note that the link did not work. With a valid session cookie it redirects to `next` |
| `/auth/callback` | no | `GET` trades `token` for the session cookie, then 303 to `next` or `/`. A bad token: 303 to `/sign-in?error=link`. `HEAD` answers 200 and leaves the token alone, so a mail scanner that probes the link does not use it up |
| `/auth/sign-out` | no | `POST` only. Ends the session, clears the cookie, 303 to `/sign-in`. 403 for a post from another site |
| `/onboarding` | yes | Step 1 language (German; Dutch and French listed as coming soon and disabled). Step 2 target level with a one line meaning per level. "Start from zero" saves and goes to `/`. "Take the placement test" is disabled until it exists |
| `/settings` | yes | Display name, timezone, daily goal (5 to 120 minutes), theme toggle, interface language fixed to English, a read only "Your plan" card with the three daily limits, and the Sign out button |
| `/feedback` | yes | An invitation to send feedback and your own feedback, newest first, with kind, message, rating, date and status |
| `/kit` | no | Gallery of ui-kit components, with the theme toggle and a toast trigger |
| `/coming-soon` | no | Target of every navigation entry whose route is not built yet |
| `/api/health` | no | JSON `{ ok: true, version }` |
| anything else | no | Custom not found page, status 404 |

A page that needs a session redirects to `/sign-in?next=<path>` when nobody is signed in. The feedback button on every page works signed out.

Navigation follows `docs/06-ui-ux.md` section 2. Wide screens get a left rail: Home, Review, Tutor, Write, Progress, Settings. Narrow screens get a bottom bar: Home, Review, Tutor, Progress, and a More button that opens a ui-kit `Sheet` with Write, Settings and Feedback. The entries live in `src/components/nav.ts` as `RAIL_ITEMS`, `BAR_ITEMS` and `MORE_ITEMS`. Home, Review, Progress, Settings and Feedback link to their pages. Tutor and Write point at `/coming-soon`. When a route lands, change its `href` there. On `/lesson/[id]` the shell renders no navigation, only the page with its own Exit link.

## Server actions and route handlers

Each form has two layers. The logic is a plain function with no Next import, so tests call it with a real container. The `'use server'` action or the route handler only reads the request, calls that function and answers.

| Plain function | Where | What it does |
|----------------|-------|--------------|
| `requestSignInLink`, `completeSignIn`, `signOutSession`, `safeNextPath`, `sessionCookieOptions`, `devLinkFor`, `clientAddressFrom`, `isSameOriginPost` | `src/server/sign-in.ts` | Everything behind `/sign-in`, `/auth/callback` and `/auth/sign-out`. See "Sign in" |
| `createRateLimiter` | `src/server/rate-limit.ts` | A sliding window counter in memory with a bound on remembered keys |
| `submitFeedbackFor`, `listMyFeedback` | `src/server/actions/feedback-actions.ts` | A `null` session stores the row without a user id. A `FeedbackValidationError` comes back as `{ ok: false, field, message }` |
| `completeOnboarding`, `saveSettings` | `src/server/actions/identity-actions.ts` | Validate, call `core-identity`, return `{ ok: true }` or `{ ok: false, field?, message }` |
| `startLesson`, `answerExercise`, `finishLesson` | `src/server/actions/lesson-actions.ts` | The lesson flow on `core-lesson-engine`. `finishLesson` also hands the items the lesson introduces to `core-srs` |
| `openLesson`, `submitLessonAnswer`, `completeLesson` | `src/server/actions/lesson-actions.ts` | The same flow for the screen, answering with plain data. `openLesson` starts or resumes and returns the current exercise and its position, a summary when every exercise is answered, or `null` for an unknown lesson. `submitLessonAnswer` returns the grade and the next exercise. `completeLesson` returns the summary. A mistake of the learner or a foreign session id comes back as `{ ok: false, message }` |
| `loadReviewQueue`, `rateReviewCard` | `src/server/actions/review-actions.ts` | The due cards with lemma, meaning, one example sentence, and gender and plural for nouns. A rating from 1 to 4 goes to `srs.review` and answers with the cards still due and the time the card comes back |
| `loadHome` | `src/server/actions/home-actions.ts` | Due count, next lesson, streak, the level worked towards, which card carries the primary button, and the units and lessons of the current level with done marks |
| `loadProgress` | `src/server/actions/progress-actions.ts` | The level map of `core-progress` in the shape the ui-kit `LevelMap` takes, with the level descriptions |

| Thin layer | Where |
|------------|-------|
| `requestLink` | `src/app/sign-in/actions.ts` |
| `GET` | `src/app/auth/callback/route.ts` |
| `POST` | `src/app/auth/sign-out/route.ts` |
| `submitOnboarding`, `submitSettings`, `submitFeedback` | `src/app/onboarding/actions.ts`, `src/app/settings/actions.ts`, `src/app/feedback/actions.ts` |
| `submitAnswer`, `finishSession` | `src/app/lesson/[id]/actions.ts` |
| `rateCard`, `loadMoreCards` | `src/app/review/actions.ts` |

Onboarding and settings return a "not signed in" result when the session is `null`. Onboarding redirects to `/` on success. Feedback accepts a `null` session. The lesson and review actions take the user id from the session and never from the browser, so a session id or an item id of another learner is refused by the box behind them.

Only German can be chosen today. `completeOnboarding` rejects Dutch and French on the server, not only in the form. A display name of only spaces is saved as no name. Code that both server and client need (the result types, the view types of the lesson, review, home and progress screens, the sentences they show, the language and level options, the plan labels) lives in `src/lib`, which has no `server-only` import.

## The feedback flow

1. `src/components/FeedbackWidget.tsx` renders the ui-kit `FeedbackFab` once, in the root layout, so the round button is on every page. The widget owns the open state through the `open` and `onOpenChange` props of the fab.
2. On send it calls the `submitFeedback` server action with the form values, `page` set to the current route, and a context of `theme`, `viewportWidth`, `viewportHeight` and `language` (the browser language).
3. The action calls `core-feedback.submit` through `submitFeedbackFor`. Signed in, the row carries the user id. Signed out, it carries none.
4. Success closes the sheet and shows the toast "Sent. Thank you." A rejected submit throws the reason inside the widget, so the sheet stays open, shows it and keeps the text.
5. `/feedback` lists the signed in user's rows from `core-feedback.listMine`. Signed out, the page redirects to `/sign-in`.

The `f` shortcut from `docs/06-ui-ux.md` section 8 opens the sheet. The rules are plain functions in `src/lib/feedback-shortcut.ts`:

| Rule | Detail |
|------|--------|
| The key | A plain `f`. Not with Ctrl, Alt or Meta, not while the key is held down |
| Typing | Ignored while focus is in an `input`, a `textarea`, a `select` or editable text |
| Dialogs | Ignored while focus is inside an open dialog, the feedback sheet included |
| Exercise screens | Off on `/lesson/...` and `/review`. Exercises use letter keys there (`match_pairs` picks right hand items with a to z), so the button is the way in. On those screens the button sits at 60 percent opacity until hovered or focused, and the form starts on the kind "Confusing" |

## The lesson, review, home and progress screens

Each screen is a server page that loads plain data through one function in `src/server/actions`, and where it needs state a client component next to it.

| Screen | Files | How it works |
|--------|-------|--------------|
| Lesson | `src/app/lesson/[id]/page.tsx`, `LessonPlayer.tsx`, `LessonSummary.tsx`, `actions.ts` | The page calls `openLesson` and hands the current exercise to `LessonPlayer`. The player keeps the answer as the controlled `value` of the ui-kit `ExerciseRenderer`. Check is enabled by the kit's `isComplete`. After Check the renderer shows the result, and the feedback is printed nowhere else. Continue shows the next exercise, which the answer already returned. After the last one, Finish calls `completeLesson` and the summary appears |
| Self check | `src/components/SelfCheckExercise.tsx`, `src/lib/self-check.ts` | For `translate`, `write_free` and `speak_prompt`. The prompt, a text area, "Show sample answer" and Continue. Showing the sample locks the text, so what is stored is the learner's own answer. A spoken task needs no text |
| Review | `src/app/review/page.tsx`, `ReviewPlayer.tsx`, `actions.ts` | The page loads the first 20 due cards. Each card is a ui-kit `FlashcardExercise`: the German side, Show answer, then the meaning with gender, plural and an example, then Again, Hard, Good and Easy. A rating calls `rateCard`. When the batch is through, the player asks for the next one |
| Home | `src/app/page.tsx` | Renders what `loadHome` returns. No client code of its own |
| Progress | `src/app/progress/page.tsx`, `src/lib/level-descriptions.ts` | Renders the ui-kit `LevelMap` from `loadProgress`. The six level texts are the global scale paragraphs of `docs/14-levels-in-real-life.md`, and a test compares them with that file |

Keys on the lesson screen. Enter presses the primary button from anywhere on the page, as soon as the button can be pressed. On a button or a link Enter keeps its own meaning. In a text area Enter is a new line and Ctrl plus Enter presses the button. The keys inside an exercise belong to the ui-kit renderers. Some of them, such as the numbers and letters of `match_pairs` and `order_words`, only act while the focus is inside the exercise. So when Continue brings a new exercise, the focus moves to its first control: the first gap, the first word, the play button or the text area. After Check the focus goes to the primary button, so a second Enter continues.

Leaving a lesson keeps it. The session and every answer are stored when they are given, so Exit needs no confirmation and the lesson opens again at the first unanswered exercise. A lesson that is already finished starts a fresh session when it is opened again.

The lesson page sends the whole exercise payload to the browser, answer keys included, because the renderers use them to mark each gap and option after the result. Grading still happens on the server.

What the summary counts. "Checked" exercises are the ones with a grader. Self checks are named in their own sentence and are not part of the score. The review number is the number of items the lesson introduces.

When the next review is due. `core-srs` has no read for the time of the next due card. The review screen knows it only for cards rated in the same visit, from the answer of `srs.review`, and says "A card you rated comes back at ...". On a fresh visit with nothing due it says "Nothing due right now." and no time.

## Planned route to box mapping

From `docs/04-module-contracts.md`. A route may use only the public API of the boxes in its row.

| Route | Boxes used |
|-------|------------|
| `/` | identity, progress, srs, curriculum |
| `/onboarding` | identity, assessment, entitlements |
| `/lesson/[id]` | lesson-engine, exercise-types, speech, ai-tutor (via graders) |
| `/review` | srs, exercise-types |
| `/tutor` | ai-tutor, speech, entitlements |
| `/write` | ai-tutor, entitlements |
| `/progress` | progress, curriculum |
| `/assess/[kind]` | assessment |
| `/settings` | identity |
| `/feedback` | feedback |
| `/api/*` | server actions, never called by boxes |

## The rule: boxes are wired only in the composition root

`src/server/container.ts` is the one file that builds boxes and connects them. Pages, server actions and route handlers call `getContainer()` and use what it returns. They never call a `create...` factory themselves.

What the container holds, one instance per process (kept on `globalThis` so dev hot reload does not build a second set, and in Postgres mode not a second connection pool):

| Part | Built from |
|------|------------|
| `bus` | `createEventBus` |
| `db` | `createDb(DATABASE_URL)` in Postgres mode, `null` in memory mode |
| `mail`, `consoleMail` | `createMailFromEnv`. `consoleMail` is set only when the console adapter is in use |
| `auth` | `createAuth` on the auth store of the mode |
| `signInLimiter` | `createRateLimiter`, 5 hits in 15 minutes per key |
| `identity`, `entitlements`, `analytics`, `feedback` | Their factories on the stores of the mode. In Postgres mode `entitlements` gets `postgresDayKeyFor(db)` |
| `storage` | `createFsStorage` |
| `packs.de` | `createGermanPack`, with the content folder found by `src/server/content-dir.ts` |
| `curriculum` | `createCurriculum` on the curriculum store, with `completedLessonIds` from the lesson engine |
| `content` | `createContent` on the content store, writing through the curriculum store, with the German pack registered |
| `exerciseTypes` | `createExerciseTypeRegistry` plus `registerDeterministicTypes` |
| `grade` | `createGrade` in `src/server/grading.ts`: the registry, the rules of the pack and the level of the lesson's unit |
| `getLesson` | The lesson from `curriculum` plus the language of its unit. Exercises of a type without a grader lose their `candoIds` and `itemIds` here. See "The evidence rule" |
| `getItems` | Items of the installed pack by id, from the read port of the curriculum store. The curriculum service has no item read yet |
| `lessonEngine` | `createLessonEngine` with `getLesson` and `grade` |
| `srs`, `progress` | `createSrs` and `createProgress`. `progress` gets `listCandos` from `curriculum` |
| `ready` | In memory mode: the promise of the pack install at build time. In Postgres mode: already resolved |
| `stores` | The store objects, for tests and local inspection |

Wiring done there:

1. `analytics.attach(bus)` once, so every event is recorded.
2. `srs.attach()` and `progress.attach()` once each, so both hear `attempt.recorded`.
3. On `user.signed_up`: `identity.ensureProfile(userId)` then `entitlements.plan(userId)`.
4. In memory mode only: `content.installPack('de')` once. If the pack on disk has errors, the reason is logged in one line, `ready` resolves to `null` and the rest of the app still works.

### The evidence rule

A level in Stufen rests on checked work. An attempt that nobody checked is never evidence.

`translate`, `write_free` and `speak_prompt` need the AI tutor, which is not wired yet. Until it is, they are self checks, and this is what happens to them:

| Step | What happens |
|------|--------------|
| Composition | `getLesson` in the container hands an exercise whose type has no registered grader to the lesson engine with empty `candoIds` and empty `itemIds` |
| Grading | `grade` does not throw. It returns `{ correct: true, score: 1 }` with the message "Saved as a self check. This task will be reviewed by the tutor in a later version." and `feedback.provisional: true`, so the lesson can go on |
| Storing | The attempt is stored with the learner's response and that feedback. `isProvisionalFeedback` finds it again, so the tutor can grade it in a later version |
| Event | `attempt.recorded` fires with no descriptor and no item |
| `core-progress` | Records no mastery evidence for it. It still counts as activity for the streak |
| `core-srs` | Rates no card for it. Items the lesson introduces still get their cards when the lesson is finished, unrated |
| Screen | `SelfCheckExercise` says once that the tutor grades these later and that they do not count towards the level yet. The lesson summary counts self checks apart from the score |

What follows from it: a production descriptor (speaking and writing) cannot be mastered before the tutor grades, because mastery needs a graded sample, and so no level can be reached. `tests/container.memory.test.ts` checks all of this after a full lesson.

Wiring that joins later, in the same file: the AI grader for those three types, `core-speech.setProvider`, `core-assessment`, and the map from `rendererKey` to a ui-kit component.

Two more rules that keep the build honest:

- Files under `src/server/` start with `import 'server-only'`. Never import them from a file marked `'use client'`.
- Server and client components import `@stufen/ui-kit` directly. The kit's interactive components carry the `'use client'` directive, so the wrapper `src/components/kit.tsx` is gone. A server component may pass only plain data to them: `/progress` gives the `LevelMap` strings and leaves its function labels at their defaults. A link that should look like a kit button is `src/components/LinkButton.tsx`, which reuses the kit's `st-button` class names.

The ui-kit stylesheet is imported once, in `src/app/globals.css`, next to Tailwind.

The same holds for a self rated flashcard in a lesson: it keeps its words for review but names no descriptor, because nobody checked the answer.

## How to change it

1. Find the route in the table above and the boxes it may use. If the change needs a box API that does not exist, change the box first in its own commit.
2. Change only files under `apps/web/`. Never import a path inside a box other than its package root. A new box goes into `package.json`, `module.json` `depends_on` and the container.
3. Run `node scripts/check-boundaries.mjs`, update `CHANGELOG.md`, and update the `apps/web` row in `docs/07-build-sequence.md`. Commit as `type(web): message`.

## How to test it

```
pnpm --filter @stufen/web test
```

| Test file | What it proves |
|-----------|----------------|
| `tests/container.test.ts` | `getContainer()` returns one instance; `user.signed_up` creates a profile and a `free_beta` entitlement; analytics records the event |
| `tests/container.memory.test.ts` | Memory mode: the German pack is installed once when the container is built and the curriculum lists units and lessons; `grade` answers the three types without a grader with a labelled self check; a whole session of the first lesson, every exercise answered correctly from its payload, fires `attempt.recorded` per exercise, creates review cards after `finishLesson` and leaves mastery evidence and a streak. The evidence rule: the events of self checks name no descriptor and no item, every evidence count equals the number of checked exercises, no production descriptor is mastered, no level is reached, and a lesson of only self checks leaves no mastery row and an unrated card |
| `tests/lesson-flow.test.ts` | The functions behind `/lesson/[id]`: the first lesson opens at exercise 1; an unknown lesson id is `null` and creates no session; a correct answer and a wrong answer; a second answer to the same exercise and an unreadable response are refused with a message; another learner cannot answer in or finish a session; leaving and coming back resumes the same session at the right exercise; finishing is refused while exercises are open; the summary data after the whole lesson, with a wrong answer and the self checks kept out of the number that was right; the summary sentences |
| `tests/review-flow.test.ts` | The functions behind `/review`: an empty queue for a new learner; the items a finished lesson introduces are in the queue, each with its lemma and meaning; the limit; a rating moves the card out of the queue and writes a review log; a rating outside 1 to 4, an unknown item and another learner's card are refused; how an item becomes a card |
| `tests/home.test.ts` | The data behind `/`: a new learner gets the first lesson and nothing due; after a lesson the done mark is set, the next lesson moves on, the due count equals `srs.stats`, reviews carry the primary action and the streak is 1; after the reviews the primary action goes back to the lesson; another learner sees none of it; the level, due and streak lines |
| `tests/progress.test.ts` | The data behind `/progress`: six levels with every descriptor at zero for a new learner; after the first lesson the evidence per descriptor (attempts and exercise types) comes from the checked exercises only, nothing is reached and no checkpoint is open; a passed checkpoint is shown as passed; the six level texts equal the paragraphs in `docs/14-levels-in-real-life.md` |
| `tests/feedback-shortcut.test.ts` | The `f` shortcut: a plain `f` only; not in an input, a textarea, a select or editable text; off on `/lesson` and `/review`, on elsewhere. Navigation: Home, Review, Progress and Settings link to their own pages, Tutor and Write to `/coming-soon` |
| `tests/sign-in.test.ts` | The same neutral answer for a known and an unknown email; the link is built on `APP_URL`; the rate limit per email and per client address; the callback sets a session for a valid token and rejects a reused, missing or unknown one; an absolute or protocol relative `next` becomes `/`; the cookie flags; sign out removes the session; the same origin check; the development link |
| `tests/container.postgres.integration.test.ts` | Postgres mode, skipped without `DATABASE_URL`: installs the pack through `installPackInto` from `scripts/install-pack.ts`, twice with the same ids; signs a new user in through `requestSignInLink` and `completeSignIn`; runs onboarding, settings, feedback and one lesson; checks the rows; then reads home, the review queue and the progress view from those rows, rates a card, checks that the stored events of self checks name no descriptor and no item, and runs the next lesson through the page functions with a leave and a resume; deletes the user it created |
| `tests/identity-actions.test.ts` | Onboarding sets the active language and emits `user.language_set`; Dutch, an unknown language and an unknown level are rejected; settings save valid values and reject a daily goal of 3, an unknown timezone and another interface language; a name of only spaces is stored as no name |
| `tests/feedback-actions.test.ts` | A signed in submit appears in `listMyFeedback`; a signed out submit succeeds and appears in nobody's list; an empty message for kind `bug` returns `ok: false` with field `message`; a rating with no message succeeds for kind `rating`; the list is newest first |
| `tests/config.test.ts` | Safe defaults locally; production throws without `STORAGE_SIGNING_SECRET` or `APP_URL`; the store mode; no dev session in production or in Postgres mode; `APP_URL` checks; no refused value in an error message |

The memory tests read `content/de`. They count nothing by hand, so adding lessons does not break them. Set `STUFEN_CONTENT_DIR` to run them against another copy of the content folder.

To run the Postgres test, point `DATABASE_URL` at a PostgreSQL 17 database with every migration applied. Its content tables are installed into. The memory tests need no database and are what a run without `DATABASE_URL` executes.

```
DATABASE_URL=postgres://stufen@localhost:5497/stufen_web pnpm --filter @stufen/web test
```

Under Vitest the `server-only` package is replaced by `tests/stubs/server-only.ts` through an alias in the root `vitest.config.ts`.

Flow tests with Playwright are described in `docs/11-testing-and-quality.md`.

## Status

See the `apps/web` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
