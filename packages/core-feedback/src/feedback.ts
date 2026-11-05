// The feedback service: validates input, writes through the FeedbackStore
// port and emits `feedback.submitted`. Built by a factory so the store, the
// bus, the clock and the id source are all injected. No module level state.
import type { EventBus, FeedbackItem, FeedbackKind, FeedbackStatus } from '@stufen/contracts';
import type { FeedbackStore } from './store';

export const MESSAGE_MAX_LENGTH = 4000;
export const PAGE_MAX_LENGTH = 300;
export const CONTEXT_MAX_LENGTH = 8000;
export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** The input field a FeedbackValidationError is about. */
export type FeedbackField =
  'userId' | 'kind' | 'page' | 'message' | 'rating' | 'context' | 'status';

/** Thrown by submit and setStatus when an input breaks a rule. Nothing is stored. */
export class FeedbackValidationError extends Error {
  readonly field: FeedbackField;

  constructor(field: FeedbackField, message: string) {
    super(message);
    this.name = 'FeedbackValidationError';
    this.field = field;
  }
}

export interface SubmitFeedbackInput {
  /** Omitted, undefined or null means anonymous. */
  userId?: string | null | undefined;
  kind: FeedbackKind;
  /** Route the feedback was sent from. Stored as '' when omitted. */
  page?: string | null | undefined;
  /** May be empty only when kind is 'rating'. */
  message: string;
  /** Integer 1 to 5. Required when kind is 'rating'. */
  rating?: number | null | undefined;
  /** Must survive JSON.stringify. Stored as its JSON round trip. */
  context?: Record<string, unknown> | null | undefined;
}

export interface CreateFeedbackOptions {
  store: FeedbackStore;
  bus: EventBus;
  /** Clock for `createdAt`. Default: the system clock. */
  now?: () => Date;
  /** Id source for new rows. Default: `crypto.randomUUID()`. */
  newId?: () => string;
}

export interface FeedbackService {
  /** Validates, inserts one row with status 'new', then emits `feedback.submitted`. */
  submit(input: SubmitFeedbackInput): Promise<void>;
  /** The user's own rows, newest first. Never anonymous rows. */
  listMine(userId: string): Promise<FeedbackItem[]>;
  /** Resolves to the updated row, or null when the id is unknown. */
  setStatus(id: string, status: FeedbackStatus): Promise<FeedbackItem | null>;
}

// Records keyed by the contracts unions, so the compiler rejects a missing or
// an extra member if FeedbackKind or FeedbackStatus ever changes.
const KINDS: Record<FeedbackKind, true> = {
  bug: true,
  idea: true,
  confusing: true,
  rating: true,
  other: true,
};
const STATUSES: Record<FeedbackStatus, true> = {
  new: true,
  seen: true,
  planned: true,
  done: true,
  wontfix: true,
};

function isKind(value: unknown): value is FeedbackKind {
  return typeof value === 'string' && Object.hasOwn(KINDS, value);
}

function isStatus(value: unknown): value is FeedbackStatus {
  return typeof value === 'string' && Object.hasOwn(STATUSES, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The checks below take `unknown` on purpose. Input arrives from a browser,
// so the TypeScript types are a promise, not a guarantee.

function checkKind(value: unknown): FeedbackKind {
  if (!isKind(value)) {
    throw new FeedbackValidationError(
      'kind',
      `kind must be one of: ${Object.keys(KINDS).join(', ')}`,
    );
  }
  return value;
}

function checkMessage(value: unknown, kind: FeedbackKind): string {
  if (typeof value !== 'string') {
    throw new FeedbackValidationError('message', 'message must be a string');
  }
  const message = value.trim();
  // docs/06-ui-ux.md section 8: the message is required except when kind is 'rating'.
  if (message.length === 0 && kind !== 'rating') {
    throw new FeedbackValidationError('message', 'message must not be empty');
  }
  if (message.length > MESSAGE_MAX_LENGTH) {
    throw new FeedbackValidationError(
      'message',
      `message must be at most ${MESSAGE_MAX_LENGTH} characters`,
    );
  }
  return message;
}

function checkRating(value: unknown, kind: FeedbackKind): number | null {
  if (value === undefined || value === null) {
    if (kind === 'rating') {
      throw new FeedbackValidationError('rating', "rating is required when kind is 'rating'");
    }
    return null;
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < RATING_MIN ||
    value > RATING_MAX
  ) {
    throw new FeedbackValidationError(
      'rating',
      `rating must be a whole number from ${RATING_MIN} to ${RATING_MAX}`,
    );
  }
  return value;
}

function checkPage(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new FeedbackValidationError('page', 'page must be a string');
  }
  const page = value.trim();
  if (page.length > PAGE_MAX_LENGTH) {
    throw new FeedbackValidationError('page', `page must be at most ${PAGE_MAX_LENGTH} characters`);
  }
  return page;
}

function checkContext(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    throw new FeedbackValidationError('context', 'context must be a plain object');
  }
  let serialised: string | undefined;
  try {
    // Returns undefined at runtime when a toJSON method returns undefined.
    serialised = JSON.stringify(value) as string | undefined;
  } catch {
    throw new FeedbackValidationError('context', 'context cannot be serialised to JSON');
  }
  if (typeof serialised !== 'string') {
    throw new FeedbackValidationError('context', 'context cannot be serialised to JSON');
  }
  if (serialised.length > CONTEXT_MAX_LENGTH) {
    throw new FeedbackValidationError(
      'context',
      `context must serialise to at most ${CONTEXT_MAX_LENGTH} characters`,
    );
  }
  // Store the round trip: it is what a jsonb column would hold, and it is a
  // copy the caller cannot mutate afterwards.
  const stored: unknown = JSON.parse(serialised);
  if (!isRecord(stored)) {
    throw new FeedbackValidationError('context', 'context must be a plain object');
  }
  return stored;
}

function checkUserId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FeedbackValidationError(
      'userId',
      'userId must be a non empty string, or omitted for anonymous feedback',
    );
  }
  return value;
}

export function createFeedback(options: CreateFeedbackOptions): FeedbackService {
  const { store, bus } = options;
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? (() => crypto.randomUUID());

  return {
    async submit(input: SubmitFeedbackInput): Promise<void> {
      // Every rule runs before the id and the timestamp are taken, so a
      // rejected submit stores nothing and emits nothing.
      const kind = checkKind(input.kind);
      const message = checkMessage(input.message, kind);
      const rating = checkRating(input.rating, kind);
      const page = checkPage(input.page);
      const context = checkContext(input.context);
      const userId = checkUserId(input.userId);

      const item: FeedbackItem = {
        id: newId(),
        userId,
        kind,
        page,
        message,
        rating,
        context,
        status: 'new',
        createdAt: now().toISOString(),
      };

      await store.insert(item);
      await bus.emit('feedback.submitted', { feedbackId: item.id, kind: item.kind });
    },

    async listMine(userId: string): Promise<FeedbackItem[]> {
      // An anonymous caller has no list. This also keeps a null or blank id
      // from ever matching the anonymous rows.
      if (typeof userId !== 'string' || userId.trim().length === 0) return [];
      const rows = await store.listByUser(userId);
      return rows.filter((row) => row.userId === userId);
    },

    async setStatus(id: string, status: FeedbackStatus): Promise<FeedbackItem | null> {
      if (!isStatus(status)) {
        throw new FeedbackValidationError(
          'status',
          `status must be one of: ${Object.keys(STATUSES).join(', ')}`,
        );
      }
      return store.updateStatus(id, status);
    },
  };
}
