# @stufen/core-analytics

## Purpose

Event sink. Subscribes to every event on the bus and writes an events row.
Sampled on free tiers. Never read by other boxes.

Kind: `core`. May import: `contracts`.

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

createInMemoryEventStore(): EventStore   // adapter for unit tests
```

Example wiring:

```ts
const analytics = createAnalytics({ store: createInMemoryEventStore() });
const detach = analytics.attach(bus);
await analytics.track(userId, 'page.viewed', { page: '/learn' });
```

Behaviour:

- `attach` writes one row for every event on the bus. `userId` is `payload.userId` when that is a string, otherwise null. The rest of the payload is stored as `props`, without the `userId` key. A payload that is not an object is stored as `{ value: payload }`.
- `attach` never throws into the bus. If the store fails, the error goes to `onError` and `emit` carries on. Call `attach` once per bus. Calling it twice writes every event twice.
- `track` checks the name first. It must be 1 to 100 characters, made of lowercase letters, digits, dot and underscore. A bad name rejects and nothing is stored. A store failure in `track` also rejects, so the caller decides what to do with it.
- `sampleRate` applies to both paths. An event is kept when `random()` returns a number below the rate. Rate 1 keeps everything and rate 0 keeps nothing. A rate outside 0 to 1 throws when the factory is called.
- `list` returns rows oldest first. `userId: null` in the filter matches rows without a user. `since` keeps rows created at or after that time.

The Postgres adapter for `EventStore` is not in this version. The `events` table already exists in migration `0001_init.sql`, where `id` and `user_id` are uuid columns, so the default `newId` (a UUID) fits it.

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

## Status

See the `core-analytics` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
