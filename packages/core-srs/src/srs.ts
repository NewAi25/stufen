// The review scheduler: introduces items, serves the due queue, applies a
// rating through ts-fsrs, logs the review and emits `item.reviewed`. Built by
// a factory so the store, the bus and the clock are injected. No module level
// state. See ADR-005.
import { createEmptyCard, fsrs, generatorParameters } from 'ts-fsrs';
import type {
  EventBus,
  EventMap,
  LanguageCode,
  ReviewRating,
  Unsubscribe,
} from '@stufen/contracts';
import { fromFsrsCard, toFsrsCard, toFsrsGrade } from './mapping';
import type { CardStore, StoredReviewCard } from './store';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A correct attempt at or above this score counts as "good", below it as "hard". */
export const GOOD_SCORE_THRESHOLD = 0.9;

/** Thrown by review when the item was never introduced for this user. Nothing is stored. */
export class CardNotFoundError extends Error {
  readonly userId: string;
  readonly itemId: string;

  constructor(userId: string, itemId: string) {
    super(`no review card for user ${userId} and item ${itemId}`);
    this.name = 'CardNotFoundError';
    this.userId = userId;
    this.itemId = itemId;
  }
}

/** Where a failure inside the `attempt.recorded` handler happened. */
export interface SrsHandlerErrorContext {
  userId: string;
  attemptId: string;
  itemId: string;
}

export interface CreateSrsOptions {
  store: CardStore;
  bus: EventBus;
  /** Clock for reviews and due checks. Default: the system clock. */
  now?: () => Date;
  /** Target probability of recall at the moment a card comes due. Default 0.9. */
  requestRetention?: number;
  /** Longest interval the scheduler may set, in days. Default 365. */
  maximumInterval?: number;
  /** Spreads due dates by a small random amount. Default false, so results repeat. */
  enableFuzz?: boolean;
  /**
   * Receives each failure inside the `attempt.recorded` handler. The handler
   * never throws into the bus. Default: console.error.
   */
  onError?: (error: unknown, context: SrsHandlerErrorContext) => void;
}

export interface SrsStats {
  /** Cards due now, in any state. */
  due: number;
  /** Cards in state `learning` or `relearning`. */
  learning: number;
  /** Cards in state `review` with stability of at least 21 days. */
  mature: number;
}

export interface SrsService {
  /** Due cards of one language, oldest due date first. At most `limit`, default 20. */
  dueQueue(userId: string, language: LanguageCode, limit?: number): Promise<StoredReviewCard[]>;
  /**
   * Applies a rating (1 again, 2 hard, 3 good, 4 easy) at the current time,
   * saves the card, appends a review log and emits `item.reviewed`.
   * Throws CardNotFoundError when the item was never introduced.
   */
  review(userId: string, itemId: string, rating: ReviewRating): Promise<StoredReviewCard>;
  /** Creates a new card, due now, for each item that has none. Safe to repeat. */
  introduceItems(userId: string, language: LanguageCode, itemIds: string[]): Promise<void>;
  stats(userId: string, language: LanguageCode): Promise<SrsStats>;
  /**
   * Subscribes to `attempt.recorded` on the given bus (default: the injected
   * one) and returns the unsubscribe function.
   */
  attach(bus?: EventBus): Unsubscribe;
}

/**
 * Rating for an attempt made outside the review screen: correct with a score
 * of at least 0.9 is good (3), correct below that is hard (2), incorrect is
 * again (1). An attempt never rates easy (4).
 */
export function ratingForAttempt(correct: boolean, score: number): ReviewRating {
  if (!correct) return 1;
  return score >= GOOD_SCORE_THRESHOLD ? 3 : 2;
}

function isRating(value: unknown): value is ReviewRating {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

const defaultOnError = (error: unknown, context: SrsHandlerErrorContext): void => {
  console.error(
    `[core-srs] attempt.recorded handler failed for item ${context.itemId} of attempt ${context.attemptId}`,
    error,
  );
};

export function createSrs(options: CreateSrsOptions): SrsService {
  const { store, bus } = options;
  const now = options.now ?? (() => new Date());
  const onError = options.onError ?? defaultOnError;
  // Default FSRS weights. Retention, the interval cap and fuzz are config values.
  const scheduler = fsrs(
    generatorParameters({
      request_retention: options.requestRetention ?? 0.9,
      maximum_interval: options.maximumInterval ?? 365,
      enable_fuzz: options.enableFuzz ?? false,
    }),
  );

  /** Creates the card when the item has none. Resolves to the card either way. */
  async function ensureCard(
    userId: string,
    language: LanguageCode,
    itemId: string,
    at: Date,
  ): Promise<StoredReviewCard> {
    const existing = await store.getCard(userId, itemId);
    if (existing) return existing;
    const card = fromFsrsCard(createEmptyCard(at), { userId, itemId, language });
    await store.upsertCard(card);
    return card;
  }

  /** The one path that changes a card: schedule, save, log, emit. */
  async function applyRating(
    card: StoredReviewCard,
    rating: ReviewRating,
    at: Date,
  ): Promise<StoredReviewCard> {
    const result = scheduler.next(toFsrsCard(card), at, toFsrsGrade(rating));
    const updated = fromFsrsCard(result.card, {
      userId: card.userId,
      itemId: card.itemId,
      language: card.language,
    });
    const elapsedMs = card.lastReview === null ? 0 : at.getTime() - Date.parse(card.lastReview);

    await store.upsertCard(updated);
    await store.insertLog({
      userId: card.userId,
      itemId: card.itemId,
      rating,
      reviewedAt: at.toISOString(),
      elapsedDays: Math.max(0, elapsedMs) / MS_PER_DAY,
      scheduledDays: card.scheduledDays,
      stateBefore: card.state,
    });
    await bus.emit('item.reviewed', { userId: card.userId, itemId: card.itemId, rating });
    return updated;
  }

  function report(error: unknown, context: SrsHandlerErrorContext): void {
    try {
      onError(error, context);
    } catch {
      // A broken reporter must not break the bus either.
    }
  }

  async function onAttemptRecorded(event: EventMap['attempt.recorded']): Promise<void> {
    // A flashcard attempt comes from the review screen, where review() has
    // already rated the card. Rating it again here would count it twice.
    const fromReviewScreen = event.exerciseType === 'flashcard';
    // One attempt rates an item once, even if the id is listed twice.
    for (const itemId of new Set(event.itemIds)) {
      try {
        const card = await ensureCard(event.userId, event.language, itemId, now());
        if (fromReviewScreen) continue;
        await applyRating(card, ratingForAttempt(event.correct, event.score), now());
      } catch (error) {
        report(error, { userId: event.userId, attemptId: event.attemptId, itemId });
      }
    }
  }

  return {
    async dueQueue(userId, language, limit = 20) {
      return store.listDue(userId, language, now(), limit);
    },

    async review(userId, itemId, rating) {
      if (!isRating(rating)) throw new RangeError('rating must be 1, 2, 3 or 4');
      const card = await store.getCard(userId, itemId);
      if (!card) throw new CardNotFoundError(userId, itemId);
      return applyRating(card, rating, now());
    },

    async introduceItems(userId, language, itemIds) {
      const at = now();
      for (const itemId of new Set(itemIds)) {
        await ensureCard(userId, language, itemId, at);
      }
    },

    async stats(userId, language) {
      const counts = await store.countByState(userId, language, now());
      return {
        due: counts.due,
        learning: counts.byState.learning + counts.byState.relearning,
        mature: counts.mature,
      };
    },

    attach(target = bus) {
      return target.on('attempt.recorded', onAttemptRecorded);
    },
  };
}
