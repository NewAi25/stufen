# @stufen/web

## Purpose

The Next.js app. Routes, pages, server actions and the wiring that composes every box.
It is the only place that imports more than `contracts`. Boxes never import it.

Kind: `surface`. May import: every box.

## Route to box mapping

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

## Wiring done here and nowhere else

1. Create the event bus from `contracts` and subscribe handlers: `core-srs` and `core-progress` on `attempt.recorded`, `core-analytics` on everything via `attach(bus)`.
2. Call `core-content.registerPack(pack)` once at start for each installed `lang-*` pack.
3. Call `core-exercise-types.registerType` for every exercise type.
4. Call `core-speech.setProvider` with the browser provider.
5. Map each exercise `rendererKey` to a component from `ui-kit`.

## How to change it

1. Find the route in the table above and the boxes it may use. If the change needs a box API that does not exist, change the box first in its own commit.
2. Change only files under `apps/web/`. Never import a path inside a box other than its package root.
3. Run `node scripts/check-boundaries.mjs`, update `CHANGELOG.md`, and update the `apps/web` row in `docs/07-build-sequence.md`. Commit as `type(web): message`.

## How to test it

```
pnpm --filter @stufen/web test
```

Flow tests with Playwright are described in `docs/11-testing-and-quality.md`.

## Status

See the `apps/web` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
