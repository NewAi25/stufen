// Postgres adapter for the EventStore port, on the events table from
// packages/db/migrations/0001_init.sql.
//
// Access model (docs/03-data-schema.md, row level security summary):
//   insert       runs inside withUser as the restricted role stufen_app. The
//                acting user is the event's own userId, so the events_insert
//                policy (migration 0003) is what lets the row in: a null user
//                id or the own user id, nothing else.
//   list, count  owner work on `db` directly. The app role can never read
//                events. Only tests and a later admin view call these.
import { withUser } from '@stufen/db';
import type { Database, NewRow, Row } from '@stufen/db';
import type { AnalyticsEvent, EventFilter, EventStore } from './store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres foreign_key_violation. */
const FOREIGN_KEY_VIOLATION = '23503';

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The values for one events row. props goes in as JSON text, so nested arrays
 * and anything else JSON can hold reach the jsonb column unchanged.
 */
function toRow(
  event: AnalyticsEvent,
  userId: string | null,
  props: Record<string, unknown>,
): NewRow<'events'> {
  return {
    id: event.id,
    user_id: userId,
    name: event.name,
    props: JSON.stringify(props),
    created_at: event.createdAt,
  };
}

function toEvent(row: Row<'events'>): AnalyticsEvent {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    props: isRecord(row.props) ? row.props : { value: row.props },
    createdAt: row.created_at.toISOString(),
  };
}

export function createPostgresEventStore(db: Database): EventStore {
  /** One insert as the restricted role, acting as `userId`. */
  async function insertAs(
    event: AnalyticsEvent,
    userId: string | null,
    props: Record<string, unknown>,
  ): Promise<void> {
    await withUser(db, userId, async (trx) => {
      await trx
        .insertInto('events')
        .values(toRow(event, userId, props))
        .execute();
    });
  }

  /** The same event without a user. The id it came with is kept in props. */
  function insertAnonymous(event: AnalyticsEvent): Promise<void> {
    return insertAs(event, null, { ...event.props, original_user_id: event.userId });
  }

  return {
    async insert(event: AnalyticsEvent): Promise<void> {
      const userId = event.userId;
      if (userId === null) return insertAs(event, null, event.props);
      // user_id is a uuid column. An id of any other shape can never be a
      // profile, so it takes the same road as an unknown user.
      if (!UUID.test(userId)) return insertAnonymous(event);
      try {
        await insertAs(event, userId, event.props);
      } catch (error) {
        // events.user_id references profiles(id). An id without a profile
        // (never existed, or deleted between the request and this write)
        // fails here. The transaction is rolled back, so retry once.
        if (errorCode(error) !== FOREIGN_KEY_VIOLATION) throw error;
        await insertAnonymous(event);
      }
    },

    async list(filter: EventFilter = {}): Promise<AnalyticsEvent[]> {
      let query = db.selectFrom('events').selectAll();
      if (filter.name !== undefined) query = query.where('name', '=', filter.name);
      if (filter.userId === null) query = query.where('user_id', 'is', null);
      else if (filter.userId !== undefined) query = query.where('user_id', '=', filter.userId);
      if (filter.since !== undefined) {
        // A since that is not a date filters nothing, as in the in memory store.
        const since = new Date(filter.since);
        if (!Number.isNaN(since.getTime())) query = query.where('created_at', '>=', since);
      }
      const rows = await query.orderBy('created_at', 'asc').orderBy('id', 'asc').execute();
      return rows.map(toEvent);
    },

    async count(name?: string): Promise<number> {
      let query = db.selectFrom('events').select((eb) => eb.fn.countAll<string>().as('n'));
      if (name !== undefined) query = query.where('name', '=', name);
      const row = await query.executeTakeFirstOrThrow();
      return Number(row.n);
    },
  };
}
