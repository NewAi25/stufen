# @stufen/core-identity

## Purpose

Sign in, profile, settings and the learner's active target language.
Wraps Supabase Auth. Knows nothing about lessons or content.

Kind: `core`. May import: `contracts`.

## Public API

```ts
getProfile(userId): Promise<Profile>
updateProfile(userId, patch: Partial<ProfileEditable>): Promise<Profile>
setActiveLanguage(userId, language, targetLevel): Promise<void>     // emits user.language_set
listLearnerLanguages(userId): Promise<LearnerLanguage[]>
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `profiles` |
| `learner_languages` |

Columns and policies are in `docs/03-data-schema.md` and `supabase/migrations/`.

## Emits and listens

| Direction | Event |
|-----------|-------|
| emits | `user.signed_up` |
| emits | `user.language_set` |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-identity/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-identity): message`.

## How to test it

```
pnpm --filter @stufen/core-identity test
```

## Status

See the `core-identity` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
