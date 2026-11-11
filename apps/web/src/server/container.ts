import 'server-only';

// The composition root. This is the only file in the repo that builds boxes
// and connects them. Pages, server actions and route handlers call
// getContainer() and use the public API of the boxes it returns.

import { createEventBus } from '@stufen/contracts';
import type {
  CefrLevel,
  Exercise,
  InProcessEventBus,
  InstallReport,
  LanguageCode,
  LanguagePack,
  MailPort,
  StoragePort,
} from '@stufen/contracts';
import {
  createAnalytics,
  createInMemoryEventStore,
  createPostgresEventStore,
} from '@stufen/core-analytics';
import type { Analytics, EventStore } from '@stufen/core-analytics';
import { createAuth, createInMemoryAuthStore, createPostgresAuthStore } from '@stufen/core-auth';
import type { Auth, AuthStore } from '@stufen/core-auth';
import {
  createContent,
  createInMemoryContentStore,
  createPostgresContentStore,
} from '@stufen/core-content';
import type { Content, ContentStore } from '@stufen/core-content';
import {
  createCurriculum,
  createInMemoryCurriculumStore,
  createPostgresCurriculumStore,
  CurriculumNotFoundError,
} from '@stufen/core-curriculum';
import type { CurriculumService, CurriculumStore, CurriculumWriter } from '@stufen/core-curriculum';
import {
  createEntitlements,
  createInMemoryEntitlementStore,
  createPostgresEntitlementStore,
  postgresDayKeyFor,
} from '@stufen/core-entitlements';
import type { Entitlements, EntitlementStore } from '@stufen/core-entitlements';
import {
  createExerciseTypeRegistry,
  registerDeterministicTypes,
} from '@stufen/core-exercise-types';
import type { ExerciseTypeRegistry } from '@stufen/core-exercise-types';
import {
  createFeedback,
  createInMemoryFeedbackStore,
  createPostgresFeedbackStore,
} from '@stufen/core-feedback';
import type { FeedbackStore } from '@stufen/core-feedback';
import {
  createIdentity,
  createInMemoryProfileStore,
  createPostgresProfileStore,
} from '@stufen/core-identity';
import type { Identity, ProfileStore } from '@stufen/core-identity';
import {
  createInMemorySessionStore,
  createLessonEngine,
  createPostgresSessionStore,
} from '@stufen/core-lesson-engine';
import type { LessonEngine, LessonWithLanguage, SessionStore } from '@stufen/core-lesson-engine';
import { createMailFromEnv } from '@stufen/core-mail';
import type { ConsoleMail } from '@stufen/core-mail';
import {
  createInMemoryMasteryStore,
  createPostgresMasteryStore,
  createProgress,
} from '@stufen/core-progress';
import type { MasteryStore, ProgressService } from '@stufen/core-progress';
import { createInMemoryCardStore, createPostgresCardStore, createSrs } from '@stufen/core-srs';
import type { CardStore, SrsService } from '@stufen/core-srs';
import { createFsStorage } from '@stufen/core-storage';
import { createDb } from '@stufen/db';
import type { Database } from '@stufen/db';
import { createGermanPack, defaultContentDir } from '@stufen/lang-de';
import { LINK_LIFETIME_MINUTES } from '../lib/sign-in-state';
import { readConfig } from './config';
import type { AppConfig, StoreMode } from './config';
import { resolvePackDir } from './content-dir';
import { createGrade } from './grading';
import type { GradeFunction } from './grading';
import { createRateLimiter } from './rate-limit';
import type { RateLimiter } from './rate-limit';
import { SIGN_IN_LIMIT, SIGN_IN_WINDOW_MS } from './sign-in';

/** The stores behind the boxes. In memory or Postgres, never a mix. */
export interface Stores {
  auth: AuthStore;
  profiles: ProfileStore;
  entitlements: EntitlementStore;
  events: EventStore;
  feedback: FeedbackStore;
  curriculum: CurriculumStore & CurriculumWriter;
  content: ContentStore;
  sessions: SessionStore;
  cards: CardStore;
  mastery: MasteryStore;
}

export interface Container {
  config: AppConfig;
  storeMode: StoreMode;
  /** The Postgres handle. Null in memory mode. Boxes get it here and nowhere else. */
  db: Database | null;
  bus: InProcessEventBus;
  mail: MailPort;
  /** The console mail adapter when it is the one in use, for the local link display. */
  consoleMail: ConsoleMail | null;
  auth: Auth;
  /** Counts sign in requests per email and per client address. In memory, per process. */
  signInLimiter: RateLimiter;
  identity: Identity;
  entitlements: Entitlements;
  analytics: Analytics;
  feedback: ReturnType<typeof createFeedback>;
  storage: StoragePort;
  packs: { de: LanguagePack };
  curriculum: CurriculumService;
  content: Content;
  exerciseTypes: ExerciseTypeRegistry;
  /** Looks up the exercise type and grades with the pack rules and the lesson level. */
  grade: GradeFunction;
  /** A lesson with the language of its unit, or null for an unknown id. */
  getLesson: (lessonId: string) => Promise<LessonWithLanguage | null>;
  lessonEngine: LessonEngine;
  srs: SrsService;
  progress: ProgressService;
  /**
   * Resolves when the container can serve lessons. In memory mode that is
   * after the German pack was installed into the in memory stores; the value
   * is the install report, or null when the install failed (the reason is
   * logged). In Postgres mode it resolves to null at once, because the pack
   * is installed by `pnpm pack:install`, never at request time.
   */
  ready: Promise<InstallReport | null>;
  /** Ends the Postgres pool. For scripts and tests. Does nothing in memory mode. */
  close: () => Promise<void>;
  /** The stores behind the boxes. For tests and local inspection. */
  stores: Stores;
}

function memoryStores(): Stores {
  return {
    auth: createInMemoryAuthStore(),
    profiles: createInMemoryProfileStore(),
    entitlements: createInMemoryEntitlementStore(),
    events: createInMemoryEventStore(),
    feedback: createInMemoryFeedbackStore(),
    curriculum: createInMemoryCurriculumStore(),
    content: createInMemoryContentStore(),
    sessions: createInMemorySessionStore(),
    cards: createInMemoryCardStore(),
    mastery: createInMemoryMasteryStore(),
  };
}

function postgresStores(db: Database): Stores {
  return {
    auth: createPostgresAuthStore(db),
    profiles: createPostgresProfileStore(db),
    entitlements: createPostgresEntitlementStore(db),
    events: createPostgresEventStore(db),
    feedback: createPostgresFeedbackStore(db),
    curriculum: createPostgresCurriculumStore(db),
    content: createPostgresContentStore(db),
    sessions: createPostgresSessionStore(db),
    cards: createPostgresCardStore(db),
    mastery: createPostgresMasteryStore(db),
  };
}

function isConsoleMail(mail: MailPort): mail is ConsoleMail {
  return typeof (mail as Partial<ConsoleMail>).last === 'function';
}

/** The level of the unit a lesson sits in. A1 when the lesson is not stored. */
const FALLBACK_LEVEL: CefrLevel = 'A1';

/** Builds a fresh set of boxes. Use getContainer() everywhere outside tests. */
export function createContainer(config: AppConfig = readConfig()): Container {
  const db = config.databaseUrl === null ? null : createDb(config.databaseUrl);
  const stores = db === null ? memoryStores() : postgresStores(db);

  const bus = createEventBus();
  const mail = createMailFromEnv(config.mailEnv);

  const auth = createAuth({
    store: stores.auth,
    mail,
    bus,
    linkTtlMs: LINK_LIFETIME_MINUTES * 60 * 1000,
  });
  const signInLimiter = createRateLimiter({ limit: SIGN_IN_LIMIT, windowMs: SIGN_IN_WINDOW_MS });
  const identity = createIdentity({ store: stores.profiles, bus });
  const entitlements = createEntitlements({
    store: stores.entitlements,
    bus,
    // The usage view files rows under the learner's local day, so the day
    // key has to come from the same database function.
    ...(db === null ? {} : { dayKeyFor: postgresDayKeyFor(db) }),
  });
  const analytics = createAnalytics({ store: stores.events });
  const feedback = createFeedback({ store: stores.feedback, bus });
  const storage = createFsStorage({
    root: config.storageFsRoot,
    ...(config.storageSigningSecret ? { secret: config.storageSigningSecret } : {}),
  });

  // Content: the German pack, read from disk, and the curriculum it fills.
  const germanPack = createGermanPack({
    contentDir: resolvePackDir('de', {
      configuredRoot: config.contentRoot,
      packDefault: defaultContentDir(),
    }),
  });
  const packs = { de: germanPack };
  const curriculum = createCurriculum({
    store: stores.curriculum,
    // The engine is built further down; this runs only when a page asks.
    completedLessonIds: (userId) => lessonEngine.completedLessonIds(userId),
  });
  const content = createContent({ store: stores.content, writer: stores.curriculum, bus });
  content.registerPack(germanPack);

  // Exercises: the registry, and one grade function for the lesson engine.
  const exerciseTypes = createExerciseTypeRegistry();
  registerDeterministicTypes(exerciseTypes);
  const grade = createGrade({
    registry: exerciseTypes,
    rulesFor: (language: LanguageCode) => {
      if (language === germanPack.code) return germanPack.rules;
      throw new Error(`No language pack is registered for "${language}".`);
    },
    levelOf: async (exercise: Exercise) =>
      (await stores.curriculum.findLessonUnit(exercise.lessonId))?.level ?? FALLBACK_LEVEL,
  });

  async function getLesson(lessonId: string): Promise<LessonWithLanguage | null> {
    const unit = await stores.curriculum.findLessonUnit(lessonId);
    if (unit === null) return null;
    try {
      return { lesson: await curriculum.getLesson(lessonId), language: unit.languageCode };
    } catch (error) {
      if (error instanceof CurriculumNotFoundError) return null;
      throw error;
    }
  }

  const lessonEngine = createLessonEngine({ store: stores.sessions, bus, getLesson, grade });
  const srs = createSrs({ store: stores.cards, bus });
  const progress = createProgress({
    store: stores.mastery,
    bus,
    listCandos: (language, level) => curriculum.listCandos(language, level),
  });

  // Listeners, each attached once.
  analytics.attach(bus);
  srs.attach();
  progress.attach();

  // Cross box reaction: a new user gets a profile and the default plan.
  bus.on('user.signed_up', async ({ userId }) => {
    await identity.ensureProfile(userId);
    await entitlements.plan(userId);
  });

  // Without a database the lessons come straight from the pack on disk.
  const ready: Promise<InstallReport | null> =
    db === null
      ? content.installPack(germanPack.code).catch((error: unknown) => {
          // One line. The full report is what `pnpm check:content` prints.
          const reason = error instanceof Error ? error.message : String(error);
          console.error(`The German pack could not be installed in memory: ${reason}`);
          return null;
        })
      : Promise.resolve(null);

  return {
    config,
    storeMode: config.storeMode,
    db,
    bus,
    mail,
    consoleMail: isConsoleMail(mail) ? mail : null,
    auth,
    signInLimiter,
    identity,
    entitlements,
    analytics,
    feedback,
    storage,
    packs,
    curriculum,
    content,
    exerciseTypes,
    grade,
    getLesson,
    lessonEngine,
    srs,
    progress,
    ready,
    close: async () => {
      if (db !== null) await db.destroy();
    },
    stores,
  };
}

// One container per process. It lives on globalThis because dev hot reload
// evaluates this module again, and a module level variable would be lost.
// In Postgres mode that also keeps one connection pool per process.
const CONTAINER_KEY = Symbol.for('stufen.web.container');

type GlobalWithContainer = typeof globalThis & { [CONTAINER_KEY]?: Container };

export function getContainer(): Container {
  const scope = globalThis as GlobalWithContainer;
  const existing = scope[CONTAINER_KEY];
  if (existing) return existing;
  const created = createContainer();
  scope[CONTAINER_KEY] = created;
  return created;
}
