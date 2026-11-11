// Storage port for core-entitlements: the reads and writes the box needs and
// nothing more. The in memory adapter below is what unit tests use.
//
// The Postgres adapter in postgres-store.ts reads usage from the `daily_usage`
// view, which counts today's rows in the tables that record the real thing,
// and its `recordUse` is a no op because the calling route writes that row. See
// docs/12-entitlements-and-payments.md, "How a daily count works".
import type { CefrLevel, Entitlement, LimitKey, PlanId } from '@stufen/contracts';

/**
 * The `feature_flags.rules` jsonb. Keys are the ones stored in the database,
 * which is why `min_level` is snake_case.
 */
export interface FlagRules {
  /** User ids that never get the flag. */
  deny?: string[];
  /** User ids that always get the flag, unless denied. */
  allow?: string[];
  /** When set, only users on one of these plans get the flag. */
  plans?: PlanId[];
  /** When set, the caller must pass a level at or above this one. */
  min_level?: CefrLevel;
  /** 0 to 100. The share of users that get the flag. */
  percent?: number;
}

/** One `feature_flags` row, without the timestamp the box never reads. */
export interface FeatureFlag {
  key: string;
  enabled: boolean;
  rules: FlagRules;
}

export interface EntitlementStore {
  /** The user's row, or null when there is none yet. */
  getEntitlement(userId: string): Promise<Entitlement | null>;
  /** Inserts or replaces the row for `entitlement.userId` and returns what was stored. */
  upsertEntitlement(entitlement: Entitlement): Promise<Entitlement>;
  /** The flag row, or null when the key is unknown. */
  getFlag(key: string): Promise<FeatureFlag | null>;
  /** Inserts or replaces the flag row for `flag.key`. */
  setFlag(flag: FeatureFlag): Promise<void>;
  /** How much of `limit` the user has used on the day named by `dayKey`. */
  usedToday(userId: string, limit: LimitKey, dayKey: string): Promise<number>;
  /** Adds `amount` to the user's use of `limit` on the day named by `dayKey`. */
  recordUse(userId: string, limit: LimitKey, amount: number, dayKey: string): Promise<void>;
}

/** Keeps everything in Maps. Values are copied in and out so callers cannot alias the store. */
export function createInMemoryEntitlementStore(): EntitlementStore {
  const entitlements = new Map<string, Entitlement>();
  const flags = new Map<string, FeatureFlag>();
  const usage = new Map<string, number>();

  const usageKey = (userId: string, limit: LimitKey, dayKey: string): string =>
    JSON.stringify([userId, limit, dayKey]);

  return {
    async getEntitlement(userId) {
      const row = entitlements.get(userId);
      return row ? structuredClone(row) : null;
    },

    async upsertEntitlement(entitlement) {
      entitlements.set(entitlement.userId, structuredClone(entitlement));
      return structuredClone(entitlement);
    },

    async getFlag(key) {
      const row = flags.get(key);
      return row ? structuredClone(row) : null;
    },

    async setFlag(flag) {
      flags.set(flag.key, structuredClone(flag));
    },

    async usedToday(userId, limit, dayKey) {
      return usage.get(usageKey(userId, limit, dayKey)) ?? 0;
    },

    async recordUse(userId, limit, amount, dayKey) {
      const key = usageKey(userId, limit, dayKey);
      usage.set(key, (usage.get(key) ?? 0) + amount);
    },
  };
}
