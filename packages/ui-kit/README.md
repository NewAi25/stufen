# @stufen/ui-kit

## Purpose

Design tokens and presentational components.
Knows contracts types for props. Never calls a box or touches data.

Kind: `surface`. May import: `contracts`.

## Public API

```ts
// Components: Button, Card, Progress, LevelBadge, Choice, TextInput, AudioButton,
// RecordButton, CorrectionInline, RubricBars, LevelMap, FeedbackFab, Toast, Sheet.
// Tokens in packages/ui-kit/src/tokens.ts. See docs/06-ui-ux.md.
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

None. This box owns no database tables.

## Emits and listens

None. This box neither emits nor subscribes.

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/ui-kit/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(ui-kit): message`.

## How to test it

```
pnpm --filter @stufen/ui-kit test
```

## Status

See the `ui-kit` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
