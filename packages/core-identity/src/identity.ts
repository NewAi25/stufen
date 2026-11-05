// Profile, settings and the learner's active target language.
// Built by a factory so apps/web (or a test) decides which store and which bus
// to use. No module level state. Sign in is not here: core-auth owns it.
import { CEFR_LEVELS, LANGUAGE_CODES } from '@stufen/contracts';
import type {
  CefrLevel,
  EventBus,
  LanguageCode,
  LearnerLanguage,
  Profile,
  ProfileEditable,
} from '@stufen/contracts';
import type { ProfileStore, ProfileStorePatch } from './store';

export const DEFAULT_UI_LOCALE = 'en';
export const DEFAULT_TIMEZONE = 'UTC';
export const DEFAULT_DAILY_GOAL_MINUTES = 15;
export const MIN_DAILY_GOAL_MINUTES = 5;
export const MAX_DAILY_GOAL_MINUTES = 120;

/** Thrown when a user id has no `profiles` row. */
export class ProfileNotFoundError extends Error {
  readonly userId: string;

  constructor(userId: string) {
    super(`No profile for user ${userId}`);
    this.name = 'ProfileNotFoundError';
    this.userId = userId;
  }
}

export interface IdentityOptions {
  store: ProfileStore;
  bus: EventBus;
  /** Clock, replaceable in tests. Default: the system clock. */
  now?: () => Date;
}

export interface Identity {
  /** Creates the default profile if the user has none. Safe to call again. */
  ensureProfile(userId: string, displayName?: string | null): Promise<Profile>;
  /** Throws ProfileNotFoundError for an unknown user. */
  getProfile(userId: string): Promise<Profile>;
  /** Accepts only ProfileEditable fields. Throws RangeError on a bad value or an unknown field. */
  updateProfile(userId: string, patch: Partial<ProfileEditable>): Promise<Profile>;
  /** Writes learner_languages, sets the active language, emits user.language_set. */
  setActiveLanguage(userId: string, language: LanguageCode, targetLevel: CefrLevel): Promise<void>;
  listLearnerLanguages(userId: string): Promise<LearnerLanguage[]>;
}

const EDITABLE_FIELDS: readonly (keyof ProfileEditable)[] = [
  'displayName',
  'uiLocale',
  'timezone',
  'dailyGoalMinutes',
];

function isEditableField(key: string): key is keyof ProfileEditable {
  return (EDITABLE_FIELDS as readonly string[]).includes(key);
}

function isLanguageCode(value: unknown): value is LanguageCode {
  return (LANGUAGE_CODES as readonly unknown[]).includes(value);
}

function isCefrLevel(value: unknown): value is CefrLevel {
  return (CEFR_LEVELS as readonly unknown[]).includes(value);
}

function requireNonEmptyString(field: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RangeError(`${field} must be a non empty string`);
  }
  return value.trim();
}

/**
 * Checks a patch at run time, because it arrives from a form. Returns only the
 * fields that were present. Fields set to undefined count as absent.
 */
function validatePatch(patch: Partial<ProfileEditable>): Partial<ProfileEditable> {
  const clean: Partial<ProfileEditable> = {};
  const input: Record<string, unknown> = { ...patch };

  for (const [key, value] of Object.entries(input)) {
    if (!isEditableField(key)) {
      throw new RangeError(`${key} is not an editable profile field`);
    }
    if (value === undefined) continue;

    switch (key) {
      case 'displayName':
        if (value !== null && typeof value !== 'string') {
          throw new RangeError('displayName must be a string or null');
        }
        clean.displayName = value;
        break;
      case 'uiLocale':
        clean.uiLocale = requireNonEmptyString('uiLocale', value);
        break;
      case 'timezone':
        clean.timezone = requireNonEmptyString('timezone', value);
        break;
      case 'dailyGoalMinutes':
        if (
          typeof value !== 'number' ||
          !Number.isInteger(value) ||
          value < MIN_DAILY_GOAL_MINUTES ||
          value > MAX_DAILY_GOAL_MINUTES
        ) {
          throw new RangeError(
            `dailyGoalMinutes must be a whole number from ${MIN_DAILY_GOAL_MINUTES} to ${MAX_DAILY_GOAL_MINUTES}`,
          );
        }
        clean.dailyGoalMinutes = value;
        break;
    }
  }
  return clean;
}

export function createIdentity(options: IdentityOptions): Identity {
  const { store, bus } = options;
  const now = options.now ?? (() => new Date());
  const timestamp = (): string => now().toISOString();

  async function getProfile(userId: string): Promise<Profile> {
    const profile = await store.getProfile(userId);
    if (!profile) throw new ProfileNotFoundError(userId);
    return profile;
  }

  return {
    async ensureProfile(userId, displayName) {
      const existing = await store.getProfile(userId);
      if (existing) return existing;
      const createdAt = timestamp();
      // insertProfile keeps an existing row, so two calls racing each other
      // still end with one profile.
      return store.insertProfile({
        id: userId,
        displayName: displayName ?? null,
        uiLocale: DEFAULT_UI_LOCALE,
        timezone: DEFAULT_TIMEZONE,
        dailyGoalMinutes: DEFAULT_DAILY_GOAL_MINUTES,
        activeLanguage: null,
        createdAt,
        updatedAt: createdAt,
      });
    },

    getProfile,

    async updateProfile(userId, patch) {
      const clean = validatePatch(patch);
      if (Object.keys(clean).length === 0) return getProfile(userId);
      const storePatch: ProfileStorePatch = { ...clean, updatedAt: timestamp() };
      const updated = await store.updateProfile(userId, storePatch);
      if (!updated) throw new ProfileNotFoundError(userId);
      return updated;
    },

    async setActiveLanguage(userId, language, targetLevel) {
      if (!isLanguageCode(language)) {
        throw new RangeError(`Unknown language code: ${String(language)}`);
      }
      if (!isCefrLevel(targetLevel)) {
        throw new RangeError(`Unknown CEFR level: ${String(targetLevel)}`);
      }
      // learner_languages.user_id references profiles, so the profile comes first.
      await getProfile(userId);

      const at = timestamp();
      await store.upsertLearnerLanguage({
        userId,
        languageCode: language,
        targetLevel,
        startedAt: at,
      });
      const updated = await store.updateProfile(userId, {
        activeLanguage: language,
        updatedAt: at,
      });
      if (!updated) throw new ProfileNotFoundError(userId);

      await bus.emit('user.language_set', { userId, language, targetLevel });
    },

    async listLearnerLanguages(userId) {
      return store.listLearnerLanguages(userId);
    },
  };
}
