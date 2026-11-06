# @stufen/web

## Purpose

The Next.js app. Routes, pages, server actions and the wiring that composes every box.
It is the only place that imports more than `contracts`. Boxes never import it.

Kind: `surface`. May import: every box. Version 0.1.0 was the scaffold: layout, app shell, ui-kit wired, composition root and dev session. Version 0.2.0 added onboarding, settings and a home page that reads the profile. Version 0.3.0 adds the feedback button on every page and `/feedback`.

## Run it

All commands run from the repo root. No `.env` file is needed for local work.

```
pnpm install
pnpm --filter @stufen/web dev      # http://localhost:3000, hot reload
pnpm --filter @stufen/web build    # production build into apps/web/.next
pnpm --filter @stufen/web start    # serves the production build
```

To use another port, set `PORT`, for example `PORT=3100 pnpm --filter @stufen/web start`.

The build uses `output: 'standalone'`, so `next start` prints a warning that names `server.js`. It still serves the app and is fine for a local check. The Docker image (row P1-39) will run `apps/web/.next/standalone/apps/web/server.js` instead.

## Environment

Read once in `src/server/config.ts`. Nothing else in the app reads `process.env` for these values.

| Variable | Default outside production | In production |
|----------|----------------------------|---------------|
| `STORAGE_FS_ROOT` | `./.data/storage` | same default |
| `STORAGE_SIGNING_SECRET` | none, file URLs are unsigned | required, the app throws a `ConfigError` that names it |
| `STUFEN_DEV_SESSION_EMAIL` | `dev@stufen.local` | ignored |

## The dev session

Real sign in arrives in row P1-38. Until then `getSession()` in `src/server/session.ts` works like this:

1. If the request has a `stufen_session` cookie, `core-auth` decides. An unknown or expired token gives `null`.
2. If there is no cookie and `NODE_ENV` is not `production`, it creates a session for `STUFEN_DEV_SESSION_EMAIL` through `auth.createDevSession` and reuses it for the life of the process.
3. In production there is no dev session. No cookie means `null`.

Creating the dev user emits `user.signed_up`, so the dev user gets a profile and the `free_beta` plan like any real user. All stores are in memory in this version, so data resets when the process restarts.

## Routes in this version

| Route | What it shows |
|-------|---------------|
| `/` | Signed in with no active language: redirects to `/onboarding`. Otherwise a welcome with the display name or email, the active language and target level, and a card saying lessons arrive in the next phase |
| `/onboarding` | Step 1 language (German; Dutch and French listed as coming soon and disabled). Step 2 target level with a one line meaning per level. "Start from zero" saves and goes to `/`. "Take the placement test" is disabled until it exists |
| `/settings` | Display name, timezone, daily goal (5 to 120 minutes), theme toggle, interface language fixed to English, and a read only "Your plan" card with the three daily limits |
| `/feedback` | An invitation to send feedback. Signed in: your own feedback, newest first, with kind, message, rating, date and status. Signed out: the invitation only |
| `/kit` | Gallery of ui-kit components, with the theme toggle and a toast trigger |
| `/coming-soon` | Target of every navigation entry whose route is not built yet |
| `/api/health` | JSON `{ ok: true, version }` |
| anything else | Custom not found page, status 404 |

When `getSession()` returns `null`, which is always the case in production until sign in ships, `/`, `/onboarding` and `/settings` render a short card saying sign in arrives in the next phase. `/feedback` and the feedback button still work signed out.

Navigation follows `docs/06-ui-ux.md` section 2. Wide screens get a left rail: Home, Review, Tutor, Write, Progress, Settings. Narrow screens get a bottom bar: Home, Review, Tutor, Progress, and a More button that opens a ui-kit `Sheet` with Write, Settings and Feedback. The entries live in `src/components/nav.ts` as `RAIL_ITEMS`, `BAR_ITEMS` and `MORE_ITEMS`. When a route lands, change its `href` there.

## Server actions

Each form has two layers.

| Layer | Where | What it does |
|-------|-------|--------------|
| Pure function | `src/server/actions/feedback-actions.ts` | `submitFeedbackFor(container, session, input)` and `listMyFeedback(container, userId)`. A `null` session stores the row without a user id. A `FeedbackValidationError` comes back as `{ ok: false, field, message }` |
| Pure function | `src/server/actions/identity-actions.ts` | `completeOnboarding(container, userId, input)` and `saveSettings(container, userId, input)`. Validate, call `core-identity`, return `{ ok: true }` or `{ ok: false, field?, message }`. No Next imports, so tests call them with a real container |
| `'use server'` action | `src/app/onboarding/actions.ts`, `src/app/settings/actions.ts`, `src/app/feedback/actions.ts` | Calls `getSession()`, calls the pure function, then revalidates. Onboarding and settings return a "not signed in" result when the session is `null`. Onboarding redirects to `/` on success. Feedback accepts a `null` session |

Only German can be chosen today. `completeOnboarding` rejects Dutch and French on the server, not only in the form. A display name of only spaces is saved as no name. Code that both server and client need (the result type, the language and level options, the plan labels) lives in `src/lib`, which has no `server-only` import.

## The feedback flow

1. `src/components/FeedbackWidget.tsx` renders the ui-kit `FeedbackFab` once, in the root layout, so the round button is on every page.
2. On send it calls the `submitFeedback` server action with the form values, `page` set to the current route, and a context of `theme`, `viewportWidth`, `viewportHeight` and `language` (the browser language).
3. The action calls `core-feedback.submit` through `submitFeedbackFor`. Signed in, the row carries the user id. Signed out, it carries none.
4. Success closes the sheet and shows the toast "Sent. Thank you." A rejected submit throws the reason inside the widget, so the sheet stays open, shows it and keeps the text.
5. `/feedback` lists the signed in user's rows from `core-feedback.listMine`.

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

What the container holds, one instance per process (kept on `globalThis` so dev hot reload does not build a second set): the event bus, console mail, in memory auth, identity, entitlements, analytics, feedback and fs storage, each with its in memory store.

Wiring done there today:

1. `analytics.attach(bus)` once, so every event is recorded.
2. On `user.signed_up`: `identity.ensureProfile(userId)` then `entitlements.plan(userId)`.

Wiring that joins later, in the same file: `core-srs` and `core-progress` on `attempt.recorded`, `core-content.registerPack` per installed `lang-*` pack, `core-exercise-types.registerType`, `core-speech.setProvider`, and the map from `rendererKey` to a ui-kit component.

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
| `tests/identity-actions.test.ts` | Onboarding sets the active language and emits `user.language_set`; Dutch, an unknown language and an unknown level are rejected; settings save valid values and reject a daily goal of 3, an unknown timezone and another interface language; a name of only spaces is stored as no name |
| `tests/feedback-actions.test.ts` | A signed in submit appears in `listMyFeedback`; a signed out submit succeeds and appears in nobody's list; an empty message for kind `bug` returns `ok: false` with field `message`; a rating with no message succeeds for kind `rating`; the list is newest first |
| `tests/config.test.ts` | Safe defaults locally; production throws without `STORAGE_SIGNING_SECRET`; no dev session in production |

Under Vitest the `server-only` package is replaced by `tests/stubs/server-only.ts` through an alias in the root `vitest.config.ts`.

Flow tests with Playwright are described in `docs/11-testing-and-quality.md`.

## Status

See the `apps/web` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
