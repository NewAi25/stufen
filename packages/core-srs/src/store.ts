// Storage port for core-srs and its in memory adapter. The port lists the
// reads and writes this box needs from `review_cards` and `review_logs` in
// docs/03-data-schema.md. The Postgres adapter (P1-30) implements the same
// interface.
import type { LanguageCode, ReviewCard, ReviewRating, ReviewState } from '@stufen/contracts';

/**
 * A card as this box stores it. It extends the contracts `ReviewCard` with
 * three fields the contract does not carry:
 * `language`, so the queue and the stats can be per language;
 * `scheduledDays` and `learningSteps`, which ts-fsrs needs back on the next
 * review to schedule correctly. Callers that only want a `ReviewCard` can
 * ignore the extras.
 */
export interface StoredReviewCard extends ReviewCard {
  language: LanguageCode;
  /** The interval in days set by the last review. 0 while the card is in short steps. */
  scheduledDays: number;
  /** Position in the short learning or relearning steps. 0 when not in steps. */
  learningSteps: number;
}

/** One row of review history. Append only. */
export interface ReviewLogEntry {
  userId: string;
  itemId: string;
  rating: ReviewRating;
  /** ISO timestamp of the review. */
  reviewedAt: string;
  /** Days between the previous review and this one. 0 for a first review. */
  elapsedDays: number;
  /** The interval in days the card carried into this review. */
  scheduledDays: number;
  /** The card's state just before this review. */
  stateBefore: ReviewState;
}

/** A card is mature when it is in state `review` with at least this much stability, in days. */
export const MATURE_STABILITY_DAYS = 21;

/** Counts for one user and one language at one moment. */
export interface CardCounts {
  /** Cards whose `due` is at or before `now`, in any state. */
  due: number;
  /** Cards per state, due or not. */
  byState: Record<ReviewState, number>;
  /** Cards in state `review` with stability of at least MATURE_STABILITY_DAYS. */
  mature: number;
}

export interface CardStore {
  /** The card for this user and item, or null when the item was never introduced. */
  getCard(userId: string, itemId: string): Promise<StoredReviewCard | null>;
  /** Inserts the card, or replaces the one with the same `userId` and `itemId`. */
  upsertCard(card: StoredReviewCard): Promise<void>;
  /**
   * Cards of this user and language with `due` at or before `now`, oldest
   * `due` first. Cards with the same `due` come back in `itemId` order. At
   * most `limit` cards.
   */
  listDue(
    userId: string,
    language: LanguageCode,
    now: Date,
    limit: number,
  ): Promise<StoredReviewCard[]>;
  countByState(userId: string, language: LanguageCode, now: Date): Promise<CardCounts>;
  /** Appends one row of review history. */
  insertLog(log: ReviewLogEntry): Promise<void>;
  /** History of one card, oldest first. Used by tests and later by parameter tuning. */
  listLogs(userId: string, itemId: string): Promise<ReviewLogEntry[]>;
}

/**
 * Keeps cards in a map and logs in an array, for unit tests and local runs.
 * Rows are copied on the way in and on the way out, so callers cannot change
 * stored data by mutating what they hold.
 */
export function createInMemoryCardStore(): CardStore {
  const cards = new Map<string, StoredReviewCard>();
  const logs: ReviewLogEntry[] = [];

  // JSON.stringify of the pair, so no separator inside an id can collide.
  const keyOf = (userId: string, itemId: string): string => JSON.stringify([userId, itemId]);

  function cardsOf(userId: string, language: LanguageCode): StoredReviewCard[] {
    return [...cards.values()].filter(
      (card) => card.userId === userId && card.language === language,
    );
  }

  return {
    async getCard(userId, itemId) {
      const card = cards.get(keyOf(userId, itemId));
      return card ? structuredClone(card) : null;
    },

    async upsertCard(card) {
      cards.set(keyOf(card.userId, card.itemId), structuredClone(card));
    },

    async listDue(userId, language, now, limit) {
      const cutoff = now.getTime();
      return cardsOf(userId, language)
        .map((card) => ({ card, due: Date.parse(card.due) }))
        .filter((entry) => entry.due <= cutoff)
        .sort((a, b) => a.due - b.due || compareIds(a.card.itemId, b.card.itemId))
        .slice(0, Math.max(0, limit))
        .map((entry) => structuredClone(entry.card));
    },

    async countByState(userId, language, now) {
      const cutoff = now.getTime();
      const counts: CardCounts = {
        due: 0,
        byState: { new: 0, learning: 0, review: 0, relearning: 0 },
        mature: 0,
      };
      for (const card of cardsOf(userId, language)) {
        if (Date.parse(card.due) <= cutoff) counts.due += 1;
        counts.byState[card.state] += 1;
        if (card.state === 'review' && card.stability >= MATURE_STABILITY_DAYS) counts.mature += 1;
      }
      return counts;
    },

    async insertLog(log) {
      logs.push(structuredClone(log));
    },

    async listLogs(userId, itemId) {
      return logs
        .filter((log) => log.userId === userId && log.itemId === itemId)
        .map((log) => structuredClone(log));
    },
  };
}

/** Plain code unit order, the same on every machine. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
