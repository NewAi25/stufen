// Storage port for core-feedback and its in memory adapter. The port lists
// the reads and writes this box needs from the `feedback` table in
// docs/03-data-schema.md. The Postgres adapter (P1-35) implements the same
// interface.
import type { FeedbackItem, FeedbackKind, FeedbackStatus } from '@stufen/contracts';

/** Narrows listAll. Omitted keys do not filter. */
export interface FeedbackListFilter {
  status?: FeedbackStatus;
  kind?: FeedbackKind;
}

/**
 * "Newest first" means `createdAt` descending. Rows with the same `createdAt`
 * come back with the later insert first.
 */
export interface FeedbackStore {
  /** Adds one row. Rejects when a row with the same id already exists. */
  insert(item: FeedbackItem): Promise<void>;
  /** Rows whose `userId` equals the argument, newest first. Never anonymous rows. */
  listByUser(userId: string): Promise<FeedbackItem[]>;
  /** Every row, anonymous ones included, newest first. For a later admin view. */
  listAll(filter?: FeedbackListFilter): Promise<FeedbackItem[]>;
  /** Sets the status. Resolves to the updated row, or null when the id is unknown. */
  updateStatus(id: string, status: FeedbackStatus): Promise<FeedbackItem | null>;
}

/**
 * Keeps rows in an array for unit tests and local runs. Rows are copied on
 * the way in and on the way out, so callers cannot change stored data by
 * mutating what they hold.
 */
export function createInMemoryFeedbackStore(): FeedbackStore {
  // Insertion order. The index breaks ties between equal timestamps.
  const rows: FeedbackItem[] = [];

  function newestFirst(match: (row: FeedbackItem) => boolean): FeedbackItem[] {
    return rows
      .map((row, index) => ({ row, index, time: Date.parse(row.createdAt) }))
      .filter((entry) => match(entry.row))
      .sort((a, b) => b.time - a.time || b.index - a.index)
      .map((entry) => structuredClone(entry.row));
  }

  return {
    async insert(item: FeedbackItem): Promise<void> {
      if (rows.some((row) => row.id === item.id)) {
        throw new Error(`feedback ${item.id} already exists`);
      }
      rows.push(structuredClone(item));
    },

    async listByUser(userId: string): Promise<FeedbackItem[]> {
      return newestFirst((row) => row.userId !== null && row.userId === userId);
    },

    async listAll(filter: FeedbackListFilter = {}): Promise<FeedbackItem[]> {
      return newestFirst(
        (row) =>
          (filter.status === undefined || row.status === filter.status) &&
          (filter.kind === undefined || row.kind === filter.kind),
      );
    },

    async updateStatus(id: string, status: FeedbackStatus): Promise<FeedbackItem | null> {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) return null;
      row.status = status;
      return structuredClone(row);
    },
  };
}
