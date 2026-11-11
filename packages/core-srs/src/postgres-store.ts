// Postgres adapter for the CardStore port (P1-30).
//
// Access model: every method opens withUser(db, userId, fn) for the user the
// call acts for, so the statement runs as the restricted role stufen_app with
// row level security on and can only see and change that user's rows.
//
// Language: review_cards has no language column. A card's language is the
// language of its item (items.language_code), read by a join. On a write the
// `language` of the card is therefore not stored; the item decides.
//
// Precision: stability, difficulty, scheduled_days and the two day counts of a
// log are `double precision` since migration 0006, the same 8 byte float a
// JavaScript number is, so every number comes back exactly as it was written.
// Timestamps are `timestamptz` and keep the millisecond.
import { LANGUAGE_CODES } from '@stufen/contracts';
import type { LanguageCode, ReviewState } from '@stufen/contracts';
import { withUser } from '@stufen/db';
import type { Database, DatabaseTransaction, NewRow, Row } from '@stufen/db';
import { MATURE_STABILITY_DAYS } from './store';
import type { CardCounts, CardStore, ReviewLogEntry, StoredReviewCard } from './store';

// ---------- mapping: the one place that knows the column names ----------

const REVIEW_STATES: readonly ReviewState[] = ['new', 'learning', 'review', 'relearning'];

function toLanguageCode(value: string): LanguageCode {
  const found = LANGUAGE_CODES.find((code) => code === value);
  if (!found) throw new Error(`Language code "${value}" in the database is not in LANGUAGE_CODES`);
  return found;
}

function toReviewState(value: string | null): ReviewState {
  const found = REVIEW_STATES.find((state) => state === value);
  if (!found) throw new Error(`Review state "${String(value)}" in the database is not known`);
  return found;
}

/** A `review_cards` row together with the language code of its item. */
export type ReviewCardRow = Row<'review_cards'> & { language_code: string };

/** Row to stored card. Timestamps become ISO strings, as the port uses them. */
export function cardFromRow(row: ReviewCardRow): StoredReviewCard {
  return {
    userId: row.user_id,
    itemId: row.item_id,
    language: toLanguageCode(row.language_code),
    stability: row.stability,
    difficulty: row.difficulty,
    due: row.due.toISOString(),
    lastReview: row.last_review === null ? null : row.last_review.toISOString(),
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    scheduledDays: row.scheduled_days,
    learningSteps: row.learning_steps,
  };
}

/**
 * Stored card to the columns of an insert. `language` has no column and
 * `updated_at` is left to the database (default on insert, trigger on update).
 */
export function cardToRow(card: StoredReviewCard): NewRow<'review_cards'> {
  return {
    user_id: card.userId,
    item_id: card.itemId,
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due,
    last_review: card.lastReview,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
  };
}

/** A null day count (a row some other writer left incomplete) reads as 0. */
export function logFromRow(row: Row<'review_logs'>): ReviewLogEntry {
  return {
    userId: row.user_id,
    itemId: row.item_id,
    rating: row.rating,
    reviewedAt: row.reviewed_at.toISOString(),
    elapsedDays: row.elapsed_days ?? 0,
    scheduledDays: row.scheduled_days ?? 0,
    stateBefore: toReviewState(row.state_before),
  };
}

export function logToRow(log: ReviewLogEntry): NewRow<'review_logs'> {
  return {
    user_id: log.userId,
    item_id: log.itemId,
    rating: log.rating,
    reviewed_at: log.reviewedAt,
    elapsed_days: log.elapsedDays,
    scheduled_days: log.scheduledDays,
    state_before: log.stateBefore,
  };
}

// ---------- statements: each runs inside a withUser transaction ----------
// Exported for the integration test, which runs them as one user against
// another user's rows. They are not part of the public surface in index.ts.

/** Cards of one user joined to their items, so every row carries its language. */
function cardsWithLanguage(trx: DatabaseTransaction, userId: string) {
  return trx
    .selectFrom('review_cards')
    .innerJoin('items', 'items.id', 'review_cards.item_id')
    .where('review_cards.user_id', '=', userId);
}

/** The card of this user and item, if the user of the transaction may see it. */
export async function selectCard(
  trx: DatabaseTransaction,
  userId: string,
  itemId: string,
): Promise<StoredReviewCard | null> {
  const row = await cardsWithLanguage(trx, userId)
    .selectAll('review_cards')
    .select('items.language_code')
    .where('review_cards.item_id', '=', itemId)
    .executeTakeFirst();
  return row ? cardFromRow(row) : null;
}

/** Insert, or on the same (user_id, item_id) replace every scheduler column. */
export async function upsertCardRow(
  trx: DatabaseTransaction,
  card: StoredReviewCard,
): Promise<void> {
  const { user_id, item_id, ...scheduling } = cardToRow(card);
  await trx
    .insertInto('review_cards')
    .values({ user_id, item_id, ...scheduling })
    .onConflict((conflict) => conflict.columns(['user_id', 'item_id']).doUpdateSet(scheduling))
    .execute();
}

/** Due at or before `now` in one language, oldest due first, then by item id. */
export async function selectDueCards(
  trx: DatabaseTransaction,
  userId: string,
  language: LanguageCode,
  now: Date,
  limit: number,
): Promise<StoredReviewCard[]> {
  // Same reading of odd limits as the in memory adapter: a fraction is cut
  // off, zero, a negative number and NaN give nothing, Infinity gives all.
  const rowLimit = Math.floor(limit);
  if (!(rowLimit > 0)) return [];
  const due = cardsWithLanguage(trx, userId)
    .selectAll('review_cards')
    .select('items.language_code')
    .where('items.language_code', '=', language)
    .where('review_cards.due', '<=', now)
    .orderBy('review_cards.due', 'asc')
    .orderBy('review_cards.item_id', 'asc');
  const rows = await (Number.isFinite(rowLimit) ? due.limit(rowLimit) : due).execute();
  return rows.map(cardFromRow);
}

/** One grouped query: per state the total, how many are due and how many are mature. */
export async function countCards(
  trx: DatabaseTransaction,
  userId: string,
  language: LanguageCode,
  now: Date,
): Promise<CardCounts> {
  const rows = await cardsWithLanguage(trx, userId)
    .where('items.language_code', '=', language)
    .select((eb) => [
      'review_cards.state',
      // count() is a bigint, which the driver hands over as a string.
      eb.fn.countAll<string>().as('total'),
      eb.fn.countAll<string>().filterWhere('review_cards.due', '<=', now).as('due'),
      eb.fn
        .countAll<string>()
        .filterWhere('review_cards.stability', '>=', MATURE_STABILITY_DAYS)
        .as('mature'),
    ])
    .groupBy('review_cards.state')
    .execute();

  const counts: CardCounts = {
    due: 0,
    byState: { new: 0, learning: 0, review: 0, relearning: 0 },
    mature: 0,
  };
  for (const row of rows) {
    counts.byState[row.state] = Number(row.total);
    counts.due += Number(row.due);
    // Mature needs both conditions: enough stability and the state `review`.
    if (row.state === 'review') counts.mature = Number(row.mature);
  }
  return counts;
}

export async function insertLogRow(trx: DatabaseTransaction, log: ReviewLogEntry): Promise<void> {
  await trx.insertInto('review_logs').values(logToRow(log)).execute();
}

/**
 * Oldest first by reviewed_at. The table has no insertion counter, so two
 * logs of one card with the same reviewed_at come back in id order, which is
 * stable but not the order they were written in.
 */
export async function selectLogs(
  trx: DatabaseTransaction,
  userId: string,
  itemId: string,
): Promise<ReviewLogEntry[]> {
  const rows = await trx
    .selectFrom('review_logs')
    .selectAll()
    .where('user_id', '=', userId)
    .where('item_id', '=', itemId)
    .orderBy('reviewed_at', 'asc')
    .orderBy('id', 'asc')
    .execute();
  return rows.map(logFromRow);
}

// ---------- the adapter ----------

/**
 * CardStore on PostgreSQL. `db` is the handle from createDb. Each method opens
 * its own withUser transaction for the user id it is given, or for the user
 * id on the card or log it is given.
 */
export function createPostgresCardStore(db: Database): CardStore {
  return {
    getCard: (userId, itemId) => withUser(db, userId, (trx) => selectCard(trx, userId, itemId)),
    upsertCard: (card) => withUser(db, card.userId, (trx) => upsertCardRow(trx, card)),
    listDue: (userId, language, now, limit) =>
      withUser(db, userId, (trx) => selectDueCards(trx, userId, language, now, limit)),
    countByState: (userId, language, now) =>
      withUser(db, userId, (trx) => countCards(trx, userId, language, now)),
    insertLog: (log) => withUser(db, log.userId, (trx) => insertLogRow(trx, log)),
    listLogs: (userId, itemId) => withUser(db, userId, (trx) => selectLogs(trx, userId, itemId)),
  };
}
