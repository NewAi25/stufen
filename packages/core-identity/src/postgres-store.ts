// Postgres adapter for the ProfileStore port (P1-32).
//
// Access model: every read and write runs inside withUser(db, userId, fn), as
// the restricted role stufen_app with row level security on, so a statement
// can only see and change the rows of the user it runs for. The profiles row
// itself is created by the database function ensure_profile(uuid), which is
// security definer and also creates the entitlement. It needs the row in
// `users` to exist, which core-auth creates at sign up. The owner connection
// is never used for learner data here.
import { CEFR_LEVELS, LANGUAGE_CODES } from '@stufen/contracts';
import type { CefrLevel, LanguageCode, LearnerLanguage, Profile } from '@stufen/contracts';
import { sql, withUser } from '@stufen/db';
import type { Database, DatabaseTransaction, Row, RowPatch } from '@stufen/db';
import type { LearnerLanguageUpsert, ProfileStore, ProfileStorePatch } from './store';

// ---------- mapping: the one place that knows the column names ----------

function toLanguageCode(value: string): LanguageCode {
  const found = LANGUAGE_CODES.find((code) => code === value);
  if (!found) throw new Error(`Language code "${value}" in the database is not in LANGUAGE_CODES`);
  return found;
}

function toCefrLevel(value: string): CefrLevel {
  const found = CEFR_LEVELS.find((level) => level === value);
  if (!found) throw new Error(`CEFR level "${value}" in the database is not in CEFR_LEVELS`);
  return found;
}

/** A `profiles` row as the contracts Profile. Timestamps become ISO strings. */
export function profileFromRow(row: Row<'profiles'>): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    uiLocale: row.ui_locale,
    timezone: row.timezone,
    dailyGoalMinutes: row.daily_goal_minutes,
    activeLanguage: row.active_language === null ? null : toLanguageCode(row.active_language),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** A `learner_languages` row as the contracts LearnerLanguage. */
export function learnerLanguageFromRow(row: Row<'learner_languages'>): LearnerLanguage {
  return {
    userId: row.user_id,
    languageCode: toLanguageCode(row.language_code),
    targetLevel: toCefrLevel(row.target_level),
    currentLevelEstimate:
      row.current_level_estimate === null ? null : toCefrLevel(row.current_level_estimate),
    startedAt: row.started_at.toISOString(),
  };
}

/**
 * The columns a patch sets. Built field by field from the known keys, so an
 * extra key on the object at run time (an `id`, say) never reaches the query.
 * `updated_at` is always sent; the profiles_updated trigger then replaces it
 * with the database clock.
 */
export function profilePatchToColumns(patch: ProfileStorePatch): RowPatch<'profiles'> {
  const columns: RowPatch<'profiles'> = { updated_at: patch.updatedAt };
  if (patch.displayName !== undefined) columns.display_name = patch.displayName;
  if (patch.uiLocale !== undefined) columns.ui_locale = patch.uiLocale;
  if (patch.timezone !== undefined) columns.timezone = patch.timezone;
  if (patch.dailyGoalMinutes !== undefined) columns.daily_goal_minutes = patch.dailyGoalMinutes;
  if (patch.activeLanguage !== undefined) columns.active_language = patch.activeLanguage;
  return columns;
}

// ---------- statements: each runs inside a withUser transaction ----------
// Exported for the integration test, which runs them as one user against
// another user's rows. They are not part of the public surface in index.ts.

/** The profile with this id, if the user of the transaction may see it. */
export async function selectProfile(
  trx: DatabaseTransaction,
  userId: string,
): Promise<Profile | null> {
  const row = await trx
    .selectFrom('profiles')
    .selectAll()
    .where('id', '=', userId)
    .executeTakeFirst();
  return row ? profileFromRow(row) : null;
}

/** Applies the patch to the profile with this id. Null when no row was changed. */
export async function patchProfile(
  trx: DatabaseTransaction,
  userId: string,
  patch: ProfileStorePatch,
): Promise<Profile | null> {
  const row = await trx
    .updateTable('profiles')
    .set(profilePatchToColumns(patch))
    .where('id', '=', userId)
    .returningAll()
    .executeTakeFirst();
  return row ? profileFromRow(row) : null;
}

/** Oldest first by started_at, then by language code. */
export async function selectLearnerLanguages(
  trx: DatabaseTransaction,
  userId: string,
): Promise<LearnerLanguage[]> {
  const rows = await trx
    .selectFrom('learner_languages')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('started_at', 'asc')
    .orderBy('language_code', 'asc')
    .execute();
  return rows.map(learnerLanguageFromRow);
}

/**
 * Inserts the row with no level estimate. On a repeat for the same user and
 * language only target_level changes; started_at and the estimate are kept.
 */
export async function upsertLearnerLanguageRow(
  trx: DatabaseTransaction,
  input: LearnerLanguageUpsert,
): Promise<LearnerLanguage> {
  const row = await trx
    .insertInto('learner_languages')
    .values({
      user_id: input.userId,
      language_code: input.languageCode,
      target_level: input.targetLevel,
      current_level_estimate: null,
      started_at: input.startedAt,
    })
    .onConflict((conflict) =>
      conflict
        .columns(['user_id', 'language_code'])
        .doUpdateSet({ target_level: input.targetLevel }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
  return learnerLanguageFromRow(row);
}

/**
 * Creates the profile through ensure_profile if the user has none, then sets
 * the fields of `profile` that differ from what the database gave the new row.
 * An existing row is returned untouched.
 *
 * Left to the database: `created_at` and `updated_at` (its own clock), and the
 * display name when `profile.displayName` is null (ensure_profile copies
 * users.name, or stores an empty string when the user has no name).
 */
export async function insertProfileRow(
  trx: DatabaseTransaction,
  profile: Profile,
): Promise<Profile> {
  // Two calls racing for the same user queue up here until the first commits,
  // so the second one finds the row and leaves it alone.
  const lockKey = `core-identity.profile:${profile.id}`;
  await sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`.execute(trx);

  const existing = await selectProfile(trx, profile.id);
  if (existing) return existing;

  const noUser = `Cannot create a profile for user ${profile.id}: there is no row in users for that id. core-auth creates it at sign up.`;
  try {
    await sql`select ensure_profile(${profile.id}::uuid)`.execute(trx);
  } catch (error) {
    // 23503 foreign_key_violation: with no users row ensure_profile inserts no
    // profile, and its entitlement insert then has nothing to point at.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23503') {
      throw new Error(noUser, { cause: error });
    }
    throw error;
  }
  const created = await selectProfile(trx, profile.id);
  if (!created) throw new Error(noUser);

  const patch: ProfileStorePatch = { updatedAt: created.updatedAt };
  let differs = false;
  if (profile.displayName !== null && profile.displayName !== created.displayName) {
    patch.displayName = profile.displayName;
    differs = true;
  }
  if (profile.uiLocale !== created.uiLocale) {
    patch.uiLocale = profile.uiLocale;
    differs = true;
  }
  if (profile.timezone !== created.timezone) {
    patch.timezone = profile.timezone;
    differs = true;
  }
  if (profile.dailyGoalMinutes !== created.dailyGoalMinutes) {
    patch.dailyGoalMinutes = profile.dailyGoalMinutes;
    differs = true;
  }
  if (profile.activeLanguage !== created.activeLanguage) {
    patch.activeLanguage = profile.activeLanguage;
    differs = true;
  }
  if (!differs) return created;
  return (await patchProfile(trx, profile.id, patch)) ?? created;
}

// ---------- the adapter ----------

/**
 * ProfileStore on PostgreSQL. `db` is the handle from createDb. Each method
 * opens its own withUser transaction for the user id it is given.
 */
export function createPostgresProfileStore(db: Database): ProfileStore {
  return {
    getProfile: (userId) => withUser(db, userId, (trx) => selectProfile(trx, userId)),
    insertProfile: (profile) => withUser(db, profile.id, (trx) => insertProfileRow(trx, profile)),
    updateProfile: (userId, patch) =>
      withUser(db, userId, (trx) => patchProfile(trx, userId, patch)),
    listLearnerLanguages: (userId) =>
      withUser(db, userId, (trx) => selectLearnerLanguages(trx, userId)),
    upsertLearnerLanguage: (input) =>
      withUser(db, input.userId, (trx) => upsertLearnerLanguageRow(trx, input)),
  };
}
