# @stufen/core-feedback

## Purpose

In app feedback capture.
Small on purpose. One table, one factory, three functions.

Kind: `core`. May import: `contracts`.

## Public API

`src/index.ts` exports four things: `createFeedback`, the `FeedbackStore` type, `createInMemoryFeedbackStore` and `FeedbackValidationError`. Nothing is a singleton. `apps/web` builds one service and passes in the store and the bus.

```ts
import { createEventBus } from '@stufen/contracts';
import { createFeedback, createInMemoryFeedbackStore } from '@stufen/core-feedback';

const feedback = createFeedback({
  store: createInMemoryFeedbackStore(), // any FeedbackStore
  bus: createEventBus(), // the app's EventBus
  now: () => new Date(), // optional clock, used for createdAt
  newId: () => crypto.randomUUID(), // optional id source
});

feedback.submit(input): Promise<void>                        // emits feedback.submitted
feedback.listMine(userId): Promise<FeedbackItem[]>
feedback.setStatus(id, status): Promise<FeedbackItem | null>
```

### submit

```ts
submit(input: {
  userId?: string | null; // omit, or pass null, for anonymous feedback
  kind: FeedbackKind; // 'bug' | 'idea' | 'confusing' | 'rating' | 'other'
  page?: string;
  message: string;
  rating?: number;
  context?: Record<string, unknown>;
}): Promise<void>
```

It checks the input, inserts one row with status `new`, then emits `feedback.submitted` with `{ feedbackId, kind }`. A signed out user can submit. The row is stored with `userId` null.

If a rule is broken, `submit` rejects with a `FeedbackValidationError`. Its `field` property names the input at fault. Nothing is stored and nothing is emitted.

| Field | Rule |
|-------|------|
| `kind` | One of the five `FeedbackKind` values |
| `message` | A string. Trimmed, then 1 to 4000 characters. May be empty only when `kind` is `rating` |
| `rating` | A whole number from 1 to 5 when given. Required when `kind` is `rating` |
| `page` | At most 300 characters after trimming. Stored as an empty string when omitted |
| `context` | A plain object that `JSON.stringify` turns into at most 8000 characters. The stored value is the JSON round trip |
| `userId` | A non empty string when given |

### listMine

`listMine(userId)` returns the rows that user submitted, newest first. Anonymous rows are never returned, to anyone. A blank or missing `userId` returns an empty list.

### setStatus

`setStatus(id, status)` sets a row to `new`, `seen`, `planned`, `done` or `wontfix` and returns the updated row. An unknown id returns null. An unknown status rejects with a `FeedbackValidationError` whose `field` is `status`. It is here for a later admin view; no screen calls it yet.

### FeedbackStore

The storage port. The Postgres adapter planned as P1-35 implements the same four methods.

```ts
interface FeedbackStore {
  insert(item: FeedbackItem): Promise<void>; // rejects a duplicate id
  listByUser(userId: string): Promise<FeedbackItem[]>; // newest first, never anonymous rows
  listAll(filter?: { status?: FeedbackStatus; kind?: FeedbackKind }): Promise<FeedbackItem[]>; // newest first
  updateStatus(id: string, status: FeedbackStatus): Promise<FeedbackItem | null>; // null when the id is unknown
}
```

Newest first means `createdAt` descending. Two rows with the same `createdAt` come back with the later insert first. `createInMemoryFeedbackStore()` keeps rows in an array and hands out copies. It is what the unit tests use.

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `feedback` |

Columns and policies are in `docs/03-data-schema.md` and `packages/db/migrations/`.

## Emits and listens

| Direction | Event |
|-----------|-------|
| emits | `feedback.submitted` |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-feedback/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-feedback): message`.

## How to test it

```
pnpm --filter @stufen/core-feedback test
```

## Status

See the `core-feedback` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
