// Storage port for the events table (docs/03-data-schema.md, core-analytics)
// and the in memory adapter used by unit tests. The Postgres adapter in
// postgres-store.ts implements the same interface on top of `db`.

/** One row of the events table. `createdAt` is an ISO 8601 timestamp. */
export interface AnalyticsEvent {
  id: string;
  userId: string | null;
  name: string;
  props: Record<string, unknown>;
  createdAt: string;
}

/** Every field is optional and they combine with AND. */
export interface EventFilter {
  /** Exact event name. */
  name?: string;
  /** Exact user id. Pass null to match rows without a user. */
  userId?: string | null;
  /** ISO 8601 timestamp. Keeps rows created at or after it. */
  since?: string;
}

/** The reads and writes this box needs. `list` and `count` serve tests and admin. */
export interface EventStore {
  insert(event: AnalyticsEvent): Promise<void>;
  /** Matching rows, oldest first. */
  list(filter?: EventFilter): Promise<AnalyticsEvent[]>;
  /** Number of rows, or number of rows with that name. */
  count(name?: string): Promise<number>;
}

function copy(event: AnalyticsEvent): AnalyticsEvent {
  return { ...event, props: { ...event.props } };
}

function matches(event: AnalyticsEvent, filter: EventFilter): boolean {
  if (filter.name !== undefined && event.name !== filter.name) return false;
  if (filter.userId !== undefined && event.userId !== filter.userId) return false;
  if (filter.since !== undefined && Date.parse(event.createdAt) < Date.parse(filter.since)) {
    return false;
  }
  return true;
}

/** Keeps rows in an array owned by the returned store. Rows are copied in and out. */
export function createInMemoryEventStore(): EventStore {
  const rows: AnalyticsEvent[] = [];

  return {
    async insert(event: AnalyticsEvent): Promise<void> {
      rows.push(copy(event));
    },

    async list(filter: EventFilter = {}): Promise<AnalyticsEvent[]> {
      // Oldest first by createdAt. The sort is stable, so rows with the same
      // time stay in insert order.
      return rows
        .filter((row) => matches(row, filter))
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
        .map(copy);
    },

    async count(name?: string): Promise<number> {
      if (name === undefined) return rows.length;
      return rows.filter((row) => row.name === name).length;
    },
  };
}
