// Postgres adapter for the FeedbackStore port (P1-35). Reads and writes the
// `feedback` table from packages/db/migrations/0001_init.sql.
//
// Access model:
//   insert, listByUser  inside withUser, as the restricted role stufen_app, so
//                       the row level security policies decide.
//   listAll, updateStatus  owner work for a later admin view. They use `db`
//                       directly and are not subject to row level security.
import type { FeedbackItem, FeedbackStatus } from '@stufen/contracts';
import { withUser } from '@stufen/db';
import type { Database, NewRow, Row } from '@stufen/db';
import type { FeedbackListFilter, FeedbackStore } from './store';

type FeedbackRow = Row<'feedback'>;
type NewFeedbackRow = NewRow<'feedback'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRating(value: number): value is 1 | 2 | 3 | 4 | 5 {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

// ---------------------------------------------------------------
// The one place where a table row and a FeedbackItem are translated.
// ---------------------------------------------------------------

/**
 * Row to FeedbackItem.
 *   page     null in the table reads as ''.
 *   context  the table has no null: "no context" is the column default '{}'.
 *            An empty object therefore reads as null, the way the in memory
 *            store returns a row that was submitted without context.
 *   created_at  a Date from the driver, handed out as an ISO string.
 */
function toItem(row: FeedbackRow): FeedbackItem {
  const context = isRecord(row.context) && Object.keys(row.context).length > 0 ? row.context : null;
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    page: row.page ?? '',
    message: row.message,
    rating: row.rating,
    context,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

/** FeedbackItem to the values of an insert. Throws a TypeError for a value the table cannot hold. */
function toNewRow(item: FeedbackItem): NewFeedbackRow {
  if (!isUuid(item.id)) {
    throw new TypeError('feedback id must be a uuid for the Postgres store');
  }
  if (item.rating !== null && !isRating(item.rating)) {
    throw new TypeError('feedback rating must be a whole number from 1 to 5, or null');
  }
  return {
    id: item.id,
    user_id: item.userId,
    kind: item.kind,
    page: item.page,
    message: item.message,
    rating: item.rating,
    // A string that is already JSON: the driver passes it through unchanged.
    context: JSON.stringify(item.context ?? {}),
    status: item.status,
    created_at: item.createdAt,
  };
}

// ---------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------

/**
 * A FeedbackStore over the `feedback` table.
 *
 * "Newest first" is `created_at` descending. The table has no insert counter,
 * so rows with the same `created_at` come back in descending `id` order: a
 * stable order, but not the "later insert first" of the in memory store.
 *
 * Ids are uuids here. `insert` throws a TypeError for an id that is not a
 * uuid, and for a `userId` that is neither null nor a uuid. `listByUser` and
 * `updateStatus` treat a non uuid as unknown: an empty list and null.
 */
export function createPostgresFeedbackStore(db: Database): FeedbackStore {
  return {
    async insert(item: FeedbackItem): Promise<void> {
      const values = toNewRow(item);
      try {
        // As the learner, or as nobody for anonymous feedback. The policy
        // feedback_insert lets a signed in user insert only an own row. No
        // `returning`: a signed out user may insert but may not read back.
        await withUser(db, item.userId, async (trx) => {
          await trx.insertInto('feedback').values(values).execute();
        });
      } catch (error) {
        // 23505 unique_violation: the primary key is the only unique constraint.
        if (errorCode(error) === '23505') {
          throw new Error(`feedback ${item.id} already exists`, { cause: error });
        }
        throw error;
      }
    },

    async listByUser(userId: string): Promise<FeedbackItem[]> {
      // No row can belong to a user id the uuid column cannot hold.
      if (!isUuid(userId)) return [];
      // As that learner. The policy feedback_own_select already limits the
      // rows to the own ones; the where clause says the same thing in the box.
      const rows = await withUser(db, userId, (trx) =>
        trx
          .selectFrom('feedback')
          .selectAll()
          .where('user_id', '=', userId)
          .orderBy('created_at', 'desc')
          .orderBy('id', 'desc')
          .execute(),
      );
      return rows.map(toItem);
    },

    async listAll(filter: FeedbackListFilter = {}): Promise<FeedbackItem[]> {
      // Owner work: reads every row, anonymous ones included.
      let query = db.selectFrom('feedback').selectAll();
      if (filter.status !== undefined) query = query.where('status', '=', filter.status);
      if (filter.kind !== undefined) query = query.where('kind', '=', filter.kind);
      const rows = await query.orderBy('created_at', 'desc').orderBy('id', 'desc').execute();
      return rows.map(toItem);
    },

    async updateStatus(id: string, status: FeedbackStatus): Promise<FeedbackItem | null> {
      if (!isUuid(id)) return null;
      // Owner work: stufen_app has no update policy on feedback.
      const row = await db
        .updateTable('feedback')
        .set({ status })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
      return row ? toItem(row) : null;
    },
  };
}
