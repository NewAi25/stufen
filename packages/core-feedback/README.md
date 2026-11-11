# @stufen/core-feedback

## Purpose

In app feedback capture.
Small on purpose. One table, one factory, three functions, two storage adapters.

Kind: `core`. May import: `contracts`, `db`.

## Public API

`src/index.ts` exports five things: `createFeedback`, the `FeedbackStore` type, `createInMemoryFeedbackStore`, `createPostgresFeedbackStore` and `FeedbackValidationError`. Nothing is a singleton. `apps/web` builds one service and passes in the store and the bus.

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

The storage port. Both adapters implement the same four methods.

```ts
interface FeedbackStore {
  insert(item: FeedbackItem): Promise<void>; // rejects a duplicate id
  listByUser(userId: string): Promise<FeedbackItem[]>; // newest first, never anonymous rows
  listAll(filter?: { status?: FeedbackStatus; kind?: FeedbackKind }): Promise<FeedbackItem[]>; // newest first
  updateStatus(id: string, status: FeedbackStatus): Promise<FeedbackItem | null>; // null when the id is unknown
}
```

Newest first means `createdAt` descending. The order of rows with the same `createdAt` is up to the adapter and is stable.

`createInMemoryFeedbackStore()` keeps rows in an array and hands out copies. Rows with the same `createdAt` come back with the later insert first. It is what the unit tests use.

### createPostgresFeedbackStore

```ts
import { createDb } from '@stufen/db';
import { createFeedback, createPostgresFeedbackStore } from '@stufen/core-feedback';

const db = createDb(process.env.DATABASE_URL);
const feedback = createFeedback({ store: createPostgresFeedbackStore(db), bus });
```

`createPostgresFeedbackStore(db: Database): FeedbackStore` reads and writes the `feedback` table. It takes the connection that `createDb` returns and keeps no state of its own.

**Access model.** Two methods act for a learner and two act for the owner.

| Method | Runs as | Who decides |
|--------|---------|-------------|
| `insert(item)` | `withUser(db, item.userId)`, or `withUser(db, null)` for anonymous feedback | Policy `feedback_insert`: anyone may insert, signed out too. A signed in user may insert only in the own name |
| `listByUser(userId)` | `withUser(db, userId)` | Policy `feedback_own_select`: a learner reads only own rows. Anonymous rows match nobody |
| `listAll(filter?)` | the connection itself, as owner | Nothing in the database. The caller must be the admin view |
| `updateStatus(id, status)` | the connection itself, as owner | Nothing in the database. The role `stufen_app` has no update policy on `feedback` |

Inside `withUser` the role is `stufen_app` and row level security applies, so a mistake in this box still cannot show one learner the rows of another. `listAll` and `updateStatus` skip row level security. They exist for a later admin view, and whatever calls them must check that the caller is an admin first. `apps/web` must not call them on behalf of a learner.

**Mapping.** One function in `src/postgres-store.ts` turns a row into a `FeedbackItem` and one turns it back.

| `FeedbackItem` | Column | Note |
|----------------|--------|------|
| `id` | `id` | Must be a uuid. The default `newId` of `createFeedback` gives one |
| `userId` | `user_id` | A uuid, or null for anonymous. Must have a row in `profiles` |
| `page` | `page` | A null in the table reads as `''` |
| `context` | `context` | A plain object. The column has no null, so `null` is written as `{}` and `{}` reads as `null` |
| `createdAt` | `created_at` | ISO string in UTC, to the millisecond |
| `kind`, `message`, `rating`, `status` | same names | Unchanged |

**Where it differs from the in memory store.**

| Case | Postgres store |
|------|----------------|
| `insert` with an id or a `userId` that is not a uuid, or a rating outside 1 to 5 | Rejects with a `TypeError` before any query |
| `insert` with a `userId` that has no profile | Rejects with the Postgres foreign key error, code `23503` |
| `insert` with an id that exists | Rejects with `feedback <id> already exists`, the same message as in memory |
| `listByUser` or `updateStatus` with a value that is not a uuid | Empty list, or null. No such row can exist |
| Rows with the same `createdAt` | Descending id. The table has no insert counter, so "later insert first" cannot be kept |
| A context of `{}` | Reads back as `null` |

**When a user is deleted.** `feedback.user_id` references `profiles(id)` with `on delete set null`, and `profiles.id` references `users(id)` with `on delete cascade`. Deleting the `users` row therefore removes the profile and keeps every feedback row that user wrote, with `user_id` set to null. The text of the message, the page and the context stay. The row becomes anonymous: it is in nobody's `listMine` and still in `listAll`. If account deletion must also erase what the user wrote, it has to delete the feedback rows before it deletes the user. This box does not do that today.

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

That runs the unit tests. They need no database, and the integration test reports as skipped.

| File | What it checks |
|------|----------------|
| `tests/feedback.test.ts` | `submit`, `listMine`, `setStatus`, every validation rule and the in memory store. Also runs the store contract for the in memory store |
| `tests/store-contract.ts` | Not a test file. `runFeedbackStoreContract(name, makeStore, makeUserId)` holds the checks both adapters must pass |
| `tests/postgres-store.integration.test.ts` | The Postgres adapter on a real PostgreSQL. Skipped unless `DATABASE_URL` is set |

### The integration test

It needs a PostgreSQL 16 or later with the migrations applied, and a `DATABASE_URL` for the user that ran them. That user must own the tables or be a superuser, because the test creates users outside `withUser` and deletes them at the end. `packages/db/README.md` says how to start such a database with or without Docker.

```
pnpm db:up
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm db:migrate
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/core-feedback test
```

In PowerShell set the variable first with `$env:DATABASE_URL = '...'`.

The test creates its own users (a `users` row, then `select ensure_profile(id)`) and its own feedback rows, and deletes exactly those in `afterAll`. It never counts or deletes rows it did not create, so it can share a database with other tests.

What it shows:

| Check | Expected |
|-------|----------|
| The store contract, the same eleven checks the in memory store passes | pass |
| Inside `withUser(A)`, a select on `feedback` with no where clause | only A's rows |
| Inside `withUser(A)`, asking for B's row by id or by user id | no rows |
| Signed out, a select on `feedback` | no rows, not even anonymous ones |
| Signed out, an insert through the store | stored with `user_id` null |
| Inside `withUser(A)`, an insert with B's user id | refused by Postgres, code `42501` |
| Inside `withUser(A)`, update or delete of the own row | nothing changed |
| `createFeedback` on the Postgres store: anonymous `submit` | one row in the table, `feedback.submitted` emitted once |
| `createFeedback` on the Postgres store: `listMine` | only the caller's rows, newest first |
| `createFeedback` on the Postgres store: a rejected `submit` | no row, no event |
| Deleting a user | the feedback row stays with `user_id` null |

### The store contract

`runFeedbackStoreContract` is the list of things a `FeedbackStore` must do whatever is behind it: insert then `listByUser` returns the row unchanged and newest first, one user never gets another user's rows, anonymous rows are never listed for a user, `listAll` returns everything and filters by kind and status, `updateStatus` returns the row or null, and a duplicate id is rejected. A new adapter passes the contract before it is used.

## Status

See the `core-feedback` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
