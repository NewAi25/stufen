# @stufen/core-analytics

## Purpose

Event sink. Subscribes to every event on the bus and writes an events row.
Sampled on free tiers. Never read by other boxes.

Kind: `core`. May import: `contracts`, `db`.

## Public API

Everything is built by one factory. There are no module level singletons, so `apps/web` creates one analytics object and passes it where it is needed.

```ts
createAnalytics(options: AnalyticsOptions): Analytics

interface AnalyticsOptions {
  store: EventStore;                 // where rows go
  now?: () => Date;                  // clock for createdAt, default system clock
  newId?: () => string;              // row id, default crypto.randomUUID()
  sampleRate?: number;               // 0 to 1, default 1 (keep everything)
  random?: () => number;             // 0 up to 1, default Math.random
  onError?: (error: unknown, eventName: string) => void;   // default console.error
}

interface Analytics {
  attach(bus: EventBus): () => void;                        // subscribes onAny, returns the unsubscribe
  track(userId: string | null, name: string, props?: Record<string, unknown>): Promise<void>;
}

interface AnalyticsEvent {
  id: string;
  userId: string | null;
  name: string;
  props: Record<string, unknown>;
  createdAt: string;                 // ISO 8601
}

interface EventStore {               // the storage port
  insert(event: AnalyticsEvent): Promise<void>;
  list(filter?: { name?: string; userId?: string | null; since?: string }): Promise<AnalyticsEvent[]>;
  count(name?: string): Promise<number>;
}

createInMemoryEventStore(): EventStore             // adapter for unit tests
createPostgresEventStore(db: Database): EventStore // adapter for the events table, Database from @stufen/db
```

Example wiring:

```ts
const db = createDb(process.env.DATABASE_URL);
const analytics = createAnalytics({ store: createPostgresEventStore(db) });
const detach = analytics.attach(bus);
await analytics.track(userId, 'page.viewed', { page: '/learn' });
```

Behaviour:

- `attach` writes one row for every event on the bus. `userId` is `payload.userId` when that is a string, otherwise null. The rest of the payload is stored as `props`, without the `userId` key. A payload that is not an object is stored as `{ value: payload }`.
- `attach` never throws into the bus. If the store fails, the error goes to `onError` and `emit` carries on. Call `attach` once per bus. Calling it twice writes every event twice.
- `track` checks the name first. It must be 1 to 100 characters, made of lowercase letters, digits, dot and underscore. A bad name rejects and nothing is stored. A store failure in `track` also rejects, so the caller decides what to do with it.
- `sampleRate` applies to both paths. An event is kept when `random()` returns a number below the rate. Rate 1 keeps everything and rate 0 keeps nothing. A rate outside 0 to 1 throws when the factory is called.
- `list` returns rows oldest first by `createdAt`. `userId: null` in the filter matches rows without a user. `since` keeps rows created at or after that time.

### The Postgres adapter

`createPostgresEventStore(db)` implements `EventStore` on the `events` table from migration `0001_init.sql`. It takes the `Database` that `createDb` from `@stufen/db` returns. It does not open or close the connection.

How an event maps to a row:

| `AnalyticsEvent` | `events` column | Note |
|------------------|-----------------|------|
| `id` | `id` (uuid) | Written as given. The default `newId` makes a UUID. An id that is not a uuid is rejected by Postgres |
| `userId` | `user_id` (uuid, nullable) | See the unknown user rule below |
| `name` | `name` | |
| `props` | `props` (jsonb) | Sent as JSON text and read back as an object |
| `createdAt` | `created_at` (timestamptz) | Written as given, read back as an ISO 8601 string in UTC |

### Access model

| Call | Runs as | Why |
|------|---------|-----|
| `insert` | `stufen_app`, inside `withUser(db, event.userId ?? null, ...)` | The port's `insert` has only the event, so the acting user is the event's own `userId`. The `events_insert` policy (migration 0003) lets a row in when its user id is null or equals the acting user. The database itself refuses an event that carries someone else's user id |
| `list`, `count` | owner, on `db` directly | The app role can never read `events`. These two serve tests and a later admin view. Do not call them from learner facing code |

Each insert is its own transaction. A failed insert rejects, and `attach` and `track` treat that as described above.

### An event for a user id without a profile

`events.user_id` references `profiles(id)` with `on delete set null`. So an event for a user id that has no profile cannot be stored as it is. That happens when the id never existed, or when the account was deleted between the request and the write. The adapter does not lose such an event:

1. The insert fails on the foreign key (Postgres code 23503) and its transaction rolls back.
2. The adapter retries once, with `user_id` null, acting as nobody.
3. The id it was given is kept in `props.original_user_id`.

A user id that is not a uuid can never be a profile, so it goes straight to step 2. Any other failure is passed on unchanged and nothing is retried. When a user is deleted later, Postgres sets `user_id` to null on the rows already stored and their props stay as they were.

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

## Owns tables

| Table |
|-------|
| `events` |

Columns and policies are in `docs/03-data-schema.md` and `packages/db/migrations/`.

## Emits and listens

| Direction | Event |
|-----------|-------|
| listens | `* (onAny, every event)` |

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-analytics/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-analytics): message`.

## How to test it

```
pnpm --filter @stufen/core-analytics test
```

That runs the unit tests. They need no database. The integration test is skipped.

| File | What it checks |
|------|----------------|
| `tests/analytics.test.ts` | `attach`, `track`, sampling and the in memory store. 30 checks |
| `tests/store-contract.ts` | Not a test file. `runEventStoreContract(name, makeStore, makeUserId)` holds the 10 checks both adapters must pass |
| `tests/in-memory-store.test.ts` | The contract, run for the in memory store |
| `tests/postgres-store.integration.test.ts` | The contract, run for the Postgres adapter, plus 10 checks of its own. Skipped unless `DATABASE_URL` is set |

Expected totals: 40 passed without `DATABASE_URL`, 60 passed with it.

### The integration test

It needs a PostgreSQL 16 or later with the migrations applied, and a `DATABASE_URL` for the user that ran them. That user must own the tables or be a superuser, because the test creates users and reads `events` outside `withUser`. How to start such a database is in `packages/db/README.md`.

```
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm db:migrate
DATABASE_URL=postgres://stufen:stufen@localhost:5432/stufen pnpm --filter @stufen/core-analytics test
```

In PowerShell set the variable first with `$env:DATABASE_URL = '...'`.

The database may be shared. The test creates its own users (a `users` row, then `select ensure_profile(id)`), uses event names that carry a random id for the run, remembers the id of every event it inserts, and at the end deletes exactly those events and users. It never truncates or deletes anything else.

What it shows beyond the contract:

| Check | Expected |
|-------|----------|
| `createAnalytics` attached to a real bus, `user.signed_up` for a real user | one row with that user id |
| The same facade, `feedback.submitted` with nobody signed in | one row with `user_id` null |
| `track` for a real user | one row, counted once |
| An unknown user id | stored with `user_id` null and `props.original_user_id` |
| A user id that is not a uuid | stored the same way |
| A user deleted after the event | the row stays, `user_id` becomes null |
| Props with text, numbers, null, arrays and nested objects | come back equal, and `jsonb_typeof` says object |
| Empty props | stored as `{}` |
| Inside `withUser(A)`, an insert that carries user B | refused by Postgres (42501) |
| Inside `withUser(A)`, a select on `events` | no rows or refused |

## Status

See the `core-analytics` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
