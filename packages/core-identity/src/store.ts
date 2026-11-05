// Storage port for core-identity and its in memory adapter.
// The port lists the only reads and writes this box needs on `profiles` and
// `learner_languages` (docs/03-data-schema.md). The Postgres adapter built on
// `db` is a later row (P1-32) and will implement the same interface.
import type { CefrLevel, LanguageCode, LearnerLanguage, Profile } from '@stufen/contracts';

/** Columns of `profiles` that may change after the row is created. */
export interface ProfileStorePatch {
  displayName?: string | null;
  uiLocale?: string;
  timezone?: string;
  dailyGoalMinutes?: number;
  activeLanguage?: LanguageCode | null;
  /** Always set by the caller, so the store never reads a clock. */
  updatedAt: string;
}

/** What the caller supplies when a learner picks a language. */
export interface LearnerLanguageUpsert {
  userId: string;
  languageCode: LanguageCode;
  targetLevel: CefrLevel;
  /** Used only when the row is new. An existing row keeps its own value. */
  startedAt: string;
}

export interface ProfileStore {
  /** Null when there is no row for this user. */
  getProfile(userId: string): Promise<Profile | null>;
  /**
   * Inserts the row if the user has none and returns the stored row. If a row
   * already exists it is left untouched and returned (on conflict do nothing).
   */
  insertProfile(profile: Profile): Promise<Profile>;
  /** Applies the given columns and returns the new row. Null when there is no row. */
  updateProfile(userId: string, patch: ProfileStorePatch): Promise<Profile | null>;
  /** Oldest first by `startedAt`, then by language code. */
  listLearnerLanguages(userId: string): Promise<LearnerLanguage[]>;
  /**
   * Inserts a row for (userId, languageCode) with no level estimate. If the row
   * exists, only `targetLevel` changes: `startedAt` and `currentLevelEstimate`
   * are kept. Returns the stored row.
   */
  upsertLearnerLanguage(input: LearnerLanguageUpsert): Promise<LearnerLanguage>;
}

/** Adapter for unit tests and local wiring. Holds everything in two maps. */
export function createInMemoryProfileStore(): ProfileStore {
  const profiles = new Map<string, Profile>();
  // user id -> language code -> row
  const learnerLanguages = new Map<string, Map<LanguageCode, LearnerLanguage>>();

  return {
    async getProfile(userId) {
      const row = profiles.get(userId);
      return row ? { ...row } : null;
    },

    async insertProfile(profile) {
      const existing = profiles.get(profile.id);
      if (existing) return { ...existing };
      profiles.set(profile.id, { ...profile });
      return { ...profile };
    },

    async updateProfile(userId, patch) {
      const existing = profiles.get(userId);
      if (!existing) return null;
      const next: Profile = { ...existing, updatedAt: patch.updatedAt };
      if (patch.displayName !== undefined) next.displayName = patch.displayName;
      if (patch.uiLocale !== undefined) next.uiLocale = patch.uiLocale;
      if (patch.timezone !== undefined) next.timezone = patch.timezone;
      if (patch.dailyGoalMinutes !== undefined) next.dailyGoalMinutes = patch.dailyGoalMinutes;
      if (patch.activeLanguage !== undefined) next.activeLanguage = patch.activeLanguage;
      profiles.set(userId, next);
      return { ...next };
    },

    async listLearnerLanguages(userId) {
      const rows = learnerLanguages.get(userId);
      if (!rows) return [];
      return [...rows.values()]
        .map((row) => ({ ...row }))
        .sort(
          (a, b) =>
            a.startedAt.localeCompare(b.startedAt) || a.languageCode.localeCompare(b.languageCode),
        );
    },

    async upsertLearnerLanguage(input) {
      let rows = learnerLanguages.get(input.userId);
      if (!rows) {
        rows = new Map();
        learnerLanguages.set(input.userId, rows);
      }
      const existing = rows.get(input.languageCode);
      const next: LearnerLanguage = existing
        ? { ...existing, targetLevel: input.targetLevel }
        : {
            userId: input.userId,
            languageCode: input.languageCode,
            targetLevel: input.targetLevel,
            currentLevelEstimate: null,
            startedAt: input.startedAt,
          };
      rows.set(input.languageCode, next);
      return { ...next };
    },
  };
}
