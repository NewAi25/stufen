# @stufen/web

## Purpose

The Next.js app. Routes, pages, server actions and the wiring that composes every box.
It is the only place that imports more than `contracts`. Boxes never import it.

Kind: `surface`. May import: every box. Version 0.1.0 was the scaffold: layout, app shell, ui-kit wired, composition root and dev session. Version 0.2.0 added onboarding, settings and a home page that reads the profile. Version 0.3.0 added the feedback button on every page and `/feedback`. Version 0.4.0 puts the container on real stores, wires the learning boxes and adds sign in with a magic link.

## Run it

All commands run from the repo root. No `.env` file is needed for local work: without `DATABASE_URL` the app runs on in memory stores with the German pack loaded from `content/de`.

```
pnpm install
pnpm --filter @stufen/web dev      # http://localhost:3000, hot reload
pnpm --filter @stufen/web build    # production build into apps/web/.next
pnpm --filter @stufen/web start    # serves the production build
```

To use another port, set `PORT`, for example `PORT=3100 pnpm --filter @stufen/web start`. Outside production the sign in links follow `PORT`.

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

`getSession()` in `src/server/session.ts` reads the cookie through `auth.getSession`. `requireSession(path)` redirects to `/sign-in?next=<path>` when there is no session. `/`, `/onboarding`, `/settings` and `/feedback` use it.

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
| `/` | yes | With no active language: redirects to `/onboarding`. Otherwise a welcome with the display name or email, the active language and target level, and a card saying lessons arrive in the next phase |
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

Navigation follows `docs/06-ui-ux.md` section 2. Wide screens get a left rail: Home, Review, Tutor, Write, Progress, Settings. Narrow screens get a bottom bar: Home, Review, Tutor, Progress, and a More button that opens a ui-kit `Sheet` with Write, Settings and Feedback. The entries live in `src/components/nav.ts` as `RAIL_ITEMS`, `BAR_ITEMS` and `MORE_ITEMS`. When a route lands, change its `href` there.

## Server actions and route handlers

Each form has two layers. The logic is a plain function with no Next import, so tests call it with a real container. The `'use server'` action or the route handler only reads the request, calls that function and answers.

| Plain function | Where | What it does |
|----------------|-------|--------------|
| `requestSignInLink`, `completeSignIn`, `signOutSession`, `safeNextPath`, `sessionCookieOptions`, `devLinkFor`, `clientAddressFrom`, `isSameOriginPost` | `src/server/sign-in.ts` | Everything behind `/sign-in`, `/auth/callback` and `/auth/sign-out`. See "Sign in" |
| `createRateLimiter` | `src/server/rate-limit.ts` | A sliding window counter in memory with a bound on remembered keys |
| `submitFeedbackFor`, `listMyFeedback` | `src/server/actions/feedback-actions.ts` | A `null` session stores the row without a user id. A `FeedbackValidationError` comes back as `{ ok: false, field, message }` |
| `completeOnboarding`, `saveSettings` | `src/server/actions/identity-actions.ts` | Validate, call `core-identity`, return `{ ok: true }` or `{ ok: false, field?, message }` |
| `startLesson`, `answerExercise`, `finishLesson` | `src/server/actions/lesson-actions.ts` | The lesson flow on `core-lesson-engine`. `finishLesson` also hands the items the lesson introduces to `core-srs`. No page calls them yet; the lesson route is row P1-19 |

| Thin layer | Where |
|------------|-------|
| `requestLink` | `src/app/sign-in/actions.ts` |
| `GET` | `src/app/auth/callback/route.ts` |
| `POST` | `src/app/auth/sign-out/route.ts` |
| `submitOnboarding`, `submitSettings`, `submitFeedback` | `src/app/onboarding/actions.ts`, `src/app/settings/actions.ts`, `src/app/feedback/actions.ts` |

Onboarding and settings return a "not signed in" result when the session is `null`. Onboarding redirects to `/` on success. Feedback accepts a `null` session.

Only German can be chosen today. `completeOnboarding` rejects Dutch and French on the server, not only in the form. A display name of only spaces is saved as no name. Code that both server and client need (the result types, the language and level options, the plan labels) lives in `src/lib`, which has no `server-only` import.

## The feedback flow

1. `src/components/FeedbackWidget.tsx` renders the ui-kit `FeedbackFab` once, in the root layout, so the round button is on every page.
2. On send it calls the `submitFeedback` server action with the form values, `page` set to the current route, and a context of `theme`, `viewportWidth`, `viewportHeight` and `language` (the browser language).
3. The action calls `core-feedback.submit` through `submitFeedbackFor`. Signed in, the row carries the user id. Signed out, it carries none.
4. Success closes the sheet and shows the toast "Sent. Thank you." A rejected submit throws the reason inside the widget, so the sheet stays open, shows it and keeps the text.
5. `/feedback` lists the signed in user's rows from `core-feedback.listMine`. Signed out, the page redirects to `/sign-in`.

The `f` shortcut from `docs/06-ui-ux.md` section 8 is not wired. `FeedbackFab` keeps its open state inside and has no prop or handle to open it from outside, so the shortcut waits for a ui-kit change.

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
| `getLesson` | The lesson from `curriculum` plus the language of its unit |
| `lessonEngine` | `createLessonEngine` with `getLesson` and `grade` |
| `srs`, `progress` | `createSrs` and `createProgress`. `progress` gets `listCandos` from `curriculum` |
| `ready` | In memory mode: the promise of the pack install at build time. In Postgres mode: already resolved |
| `stores` | The store objects, for tests and local inspection |

Wiring done there:

1. `analytics.attach(bus)` once, so every event is recorded.
2. `srs.attach()` and `progress.attach()` once each, so both hear `attempt.recorded`.
3. On `user.signed_up`: `identity.ensureProfile(userId)` then `entitlements.plan(userId)`.
4. In memory mode only: `content.installPack('de')` once. If the pack on disk has errors, the reason is logged in one line, `ready` resolves to `null` and the rest of the app still works.

### Tasks without a grader

`translate`, `write_free` and `speak_prompt` need the AI tutor, which is not wired yet. `grade` does not throw for them. It returns `{ correct: true, score: 1 }` with the message "Saved as a self check. This task will be reviewed by the tutor in a later version." and `feedback.provisional: true`. The lesson engine stores the feedback as it is, so these attempts can be found later with `isProvisionalFeedback` and graded again. Until then they count as correct evidence for `core-srs` and `core-progress`.

Wiring that joins later, in the same file: the AI grader for those three types, `core-speech.setProvider`, `core-assessment`, and the map from `rendererKey` to a ui-kit component.

Two more rules that keep the build honest:

- Files under `src/server/` start with `import 'server-only'`. Never import them from a file marked `'use client'`.
- The ui-kit has no `'use client'` line of its own. Server components import kit pieces from `src/components/kit.tsx`, which is the client boundary. Client components import `@stufen/ui-kit` directly.

The ui-kit stylesheet is imported once, in `src/app/globals.css`, next to Tailwind.

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
| `tests/container.memory.test.ts` | Memory mode: the German pack is installed once when the container is built and the curriculum lists units and lessons; `grade` answers the three types without a grader with a labelled self check; a whole session of the first lesson, every exercise answered correctly from its payload, fires `attempt.recorded` per exercise, creates review cards after `finishLesson` and leaves mastery evidence and a streak |
| `tests/sign-in.test.ts` | The same neutral answer for a known and an unknown email; the link is built on `APP_URL`; the rate limit per email and per client address; the callback sets a session for a valid token and rejects a reused, missing or unknown one; an absolute or protocol relative `next` becomes `/`; the cookie flags; sign out removes the session; the same origin check; the development link |
| `tests/container.postgres.integration.test.ts` | Postgres mode, skipped without `DATABASE_URL`: installs the pack through `installPackInto` from `scripts/install-pack.ts`, twice with the same ids; signs a new user in through `requestSignInLink` and `completeSignIn`; runs onboarding, settings, feedback and one lesson; checks the rows; deletes the user it created |
| `tests/identity-actions.test.ts` | Onboarding sets the active language and emits `user.language_set`; Dutch, an unknown language and an unknown level are rejected; settings save valid values and reject a daily goal of 3, an unknown timezone and another interface language; a name of only spaces is stored as no name |
| `tests/feedback-actions.test.ts` | A signed in submit appears in `listMyFeedback`; a signed out submit succeeds and appears in nobody's list; an empty message for kind `bug` returns `ok: false` with field `message`; a rating with no message succeeds for kind `rating`; the list is newest first |
| `tests/config.test.ts` | Safe defaults locally; production throws without `STORAGE_SIGNING_SECRET` or `APP_URL`; the store mode; no dev session in production or in Postgres mode; `APP_URL` checks; no refused value in an error message |

The memory tests read `content/de`. They count nothing by hand, so adding lessons does not break them. Set `STUFEN_CONTENT_DIR` to run them against another copy of the content folder.

To run the Postgres test, point `DATABASE_URL` at a PostgreSQL 17 database with every migration applied. Its content tables are installed into.

```
DATABASE_URL=postgres://stufen@localhost:5497/stufen_web pnpm --filter @stufen/web test
```

Under Vitest the `server-only` package is replaced by `tests/stubs/server-only.ts` through an alias in the root `vitest.config.ts`.

Flow tests with Playwright are described in `docs/11-testing-and-quality.md`.

## Status

See the `apps/web` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
