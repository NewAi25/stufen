// Postgres adapter for the EntitlementStore port (P1-33).
//
// Access model, the same as docs/03-data-schema.md:
//   * A learner reads the own entitlement row and the own usage inside
//     withUser, as role stufen_app, so row level security applies.
//   * Feature flags are content. Anyone reads them inside withUser.
//   * Writing an entitlement or a flag is owner work and uses `db` directly.
//
// Usage is never counted here. The view `daily_usage` counts the rows that
// record the real thing, so `recordUse` does nothing.
import type { Entitlement, LimitKey } from '@stufen/contracts';
import { sql, withUser } from '@stufen/db';
import type { DailyUsageView, Database, NewRow, Row, Views } from '@stufen/db';
import type { EntitlementStore, FeatureFlag, FlagRules } from './store';

/** The `daily_usage` column that counts each limit. */
const USAGE_COLUMN = {
  tutor_messages_per_day: 'tutor_messages',
  writing_grades_per_day: 'writing_grades',
  speech_minutes_per_day: 'speech_minutes',
} as const satisfies Record<LimitKey, keyof DailyUsageView>;

/** A jsonb value as a plain object. Anything else, such as an array or null, reads as empty. */
function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return { ...value };
}

/** The one place where an `entitlements` row becomes the contracts shape. */
function toEntitlement(row: Row<'entitlements'>): Entitlement {
  return {
    userId: row.user_id,
    plan: row.plan,
    features: asObject(row.features) as Entitlement['features'],
    limits: asObject(row.limits) as Entitlement['limits'],
    source: row.source,
    expiresAt: row.expires_at === null ? null : row.expires_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * The one place where the contracts shape becomes the values of an
 * `entitlements` row. The key, `user_id`, is left out so the same values serve
 * the insert and the update.
 */
function toValues(entitlement: Entitlement): Omit<NewRow<'entitlements'>, 'user_id'> {
  return {
    plan: entitlement.plan,
    features: { ...entitlement.features },
    limits: { ...entitlement.limits },
    source: entitlement.source,
    expires_at: entitlement.expiresAt,
    updated_at: entitlement.updatedAt,
  };
}

function toFlag(row: Row<'feature_flags'>): FeatureFlag {
  return { key: row.key, enabled: row.enabled, rules: asObject(row.rules) as FlagRules };
}

export function createPostgresEntitlementStore(db: Database): EntitlementStore {
  return {
    async getEntitlement(userId) {
      const row = await withUser(db, userId, (trx) =>
        trx.selectFrom('entitlements').selectAll().where('user_id', '=', userId).executeTakeFirst(),
      );
      return row ? toEntitlement(row) : null;
    },

    async upsertEntitlement(entitlement) {
      // Owner work. ensure_profile has usually made the row already at sign
      // up, so this is an insert that turns into an update on conflict.
      const values = toValues(entitlement);
      const row = await db
        .insertInto('entitlements')
        .values({ user_id: entitlement.userId, ...values })
        .onConflict((conflict) => conflict.column('user_id').doUpdateSet(values))
        .returningAll()
        .executeTakeFirstOrThrow();
      return toEntitlement(row);
    },

    async getFlag(key) {
      const row = await withUser(db, null, (trx) =>
        trx.selectFrom('feature_flags').selectAll().where('key', '=', key).executeTakeFirst(),
      );
      return row ? toFlag(row) : null;
    },

    async setFlag(flag) {
      const values = { enabled: flag.enabled, rules: { ...flag.rules } };
      await db
        .insertInto('feature_flags')
        .values({ key: flag.key, ...values })
        .onConflict((conflict) => conflict.column('key').doUpdateSet(values))
        .execute();
    },

    async usedToday(userId, limit, dayKey) {
      const column = USAGE_COLUMN[limit];
      const row = await withUser(db, userId, (trx) =>
        trx
          .withTables<Views>()
          .selectFrom('daily_usage')
          .select(column)
          .where('user_id', '=', userId)
          .where('day', '=', dayKey)
          .executeTakeFirst(),
      );
      return row?.[column] ?? 0;
    },

    async recordUse() {
      // Nothing to do. The route that called `consume` writes the tutor
      // message, the writing submission or the recording, and the view counts it.
    },
  };
}

/**
 * Builds the `dayKeyFor` option of `createEntitlements` for the Postgres
 * store. It asks Postgres for the user's current local day, `YYYY-MM-DD`, in
 * `profiles.timezone`. That is the same day the view `daily_usage` files a row
 * under, so "today" in the service and "today" in the view agree.
 *
 * The day comes from the database clock, because the rows the view counts are
 * stamped by that clock. The `now` argument is used only when the user has no
 * profile row, where the answer falls back to the UTC date.
 */
export function postgresDayKeyFor(db: Database): (userId: string, now: Date) => Promise<string> {
  return async (userId, now) => {
    const result = await withUser(db, userId, (trx) =>
      sql<{ day: string }>`
        select to_char(local_day(now(), p.timezone), 'YYYY-MM-DD') as day
        from profiles p
        where p.id = ${userId}::uuid
      `.execute(trx),
    );
    return result.rows[0]?.day ?? now.toISOString().slice(0, 10);
  };
}
