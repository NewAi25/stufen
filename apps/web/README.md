# @stufen/web

## Purpose

The Next.js app. Routes, pages, server actions and the wiring that composes every box.
It is the only place that imports more than `contracts`. Boxes never import it.

Kind: `surface`. May import: every box. Version 0.1.0 is the scaffold: layout, app shell, ui-kit wired, composition root and dev session. No learner features yet.

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
| `/` | Welcome card with a ui-kit `Button` |
| `/kit` | Gallery of ui-kit components, with the theme toggle and a toast trigger |
| `/coming-soon` | Target of every navigation entry whose route is not built yet |
| `/api/health` | JSON `{ ok: true, version }` |
| anything else | Custom not found page, status 404 |

Navigation follows `docs/06-ui-ux.md` section 2. Wide screens get a left rail: Home, Review, Tutor, Write, Progress, Settings. Narrow screens get a bottom bar: Home, Review, Tutor, Progress, More. The entries live in `src/components/nav.ts`. When a route lands, change its `href` there.

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
| `tests/config.test.ts` | Safe defaults locally; production throws without `STORAGE_SIGNING_SECRET`; no dev session in production |

Under Vitest the `server-only` package is replaced by `tests/stubs/server-only.ts` through an alias in the root `vitest.config.ts`.

Flow tests with Playwright are described in `docs/11-testing-and-quality.md`.

## Status

See the `apps/web` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
