// The progress service: turns `attempt.recorded` events and graded samples
// into mastery rows, keeps the streak, and answers the level questions. Built
// by a factory so the store, the bus, the descriptor list and the clock are
// all injected. No module level state. This box never grades anything itself.
import { CEFR_LEVELS, LANGUAGE_CODES } from '@stufen/contracts';
import type {
  Cando,
  CandoMastery,
  CefrLevel,
  CheckpointStatus,
  EventBus,
  EventMap,
  LanguageCode,
  LevelEstimate,
  LevelEstimateMethod,
  LevelMap,
  LevelMapLevel,
  Streak,
  Unsubscribe,
} from '@stufen/contracts';
import { RECENT_WINDOW, isMastered, levelConditions, levelStatus, recentAccuracy } from './rule';
import type { LevelStatus } from './rule';
import type { MasteryStore } from './store';

/**
 * The descriptors of a language, optionally of one level. The composition
 * root passes core-curriculum's function; this box never imports that box.
 */
export type ListCandos = (language: LanguageCode, level?: CefrLevel) => Promise<Cando[]>;

/** Where a failure inside a bus handler happened. */
export interface ProgressErrorContext {
  event: 'attempt.recorded';
  userId: string;
  candoId?: string;
}

export interface CreateProgressOptions {
  store: MasteryStore;
  bus: EventBus;
  listCandos: ListCandos;
  /** Clock for timestamps and for the streak day. Default: the system clock. */
  now?: () => Date;
  /** Receives failures from bus handlers, which never throw into the bus. */
  onError?: (error: unknown, context: ProgressErrorContext) => void;
}

/** One descriptor of a level with the user's row, or null without evidence. */
export interface LevelMapDescriptor {
  cando: Cando;
  mastery: CandoMastery | null;
}

/** LevelMapLevel from contracts plus what the level map screen needs. */
export interface ProgressLevelMapLevel extends LevelMapLevel {
  status: LevelStatus;
  descriptors: LevelMapDescriptor[];
}

export interface ProgressLevelMap extends LevelMap {
  levels: ProgressLevelMapLevel[];
}

/** The input a ProgressValidationError is about. */
export type ProgressField = 'score' | 'level' | 'confidence' | 'method' | 'candoId';

/** Thrown by recordProductionScore and recordEstimate. Nothing is stored. */
export class ProgressValidationError extends Error {
  readonly field: ProgressField;

  constructor(field: ProgressField, message: string) {
    super(message);
    this.name = 'ProgressValidationError';
    this.field = field;
  }
}

export interface ProgressService {
  /** Subscribes to `attempt.recorded`. Default: the injected bus. Call the result to detach. */
  attach(bus?: EventBus): Unsubscribe;
  /** Credits a graded sample, 0 to 5. Keeps the best score. May emit `cando.mastered`. */
  recordProductionScore(userId: string, candoId: string, score: number): Promise<void>;
  /** The user's rows for the descriptors of the language, optionally of one level. */
  masteryFor(userId: string, language: LanguageCode, level?: CefrLevel): Promise<CandoMastery[]>;
  /** Highest reached level, else the latest recorded estimate, else null. */
  levelEstimate(userId: string, language: LanguageCode): Promise<LevelEstimate | null>;
  /** Appends an estimate. Emits `level.reached` only when the level rises. */
  recordEstimate(
    userId: string,
    language: LanguageCode,
    level: CefrLevel,
    confidence: number,
    method: LevelEstimateMethod,
  ): Promise<void>;
  /** The streak row, or a zero streak when the user has no activity yet. */
  streak(userId: string, language: LanguageCode): Promise<Streak>;
  /** All six levels, A1 first. */
  levelMap(userId: string, language: LanguageCode): Promise<ProgressLevelMap>;
}

export const PRODUCTION_SCORE_MIN = 0;
export const PRODUCTION_SCORE_MAX = 5;

// A record keyed by the contracts union, so the compiler rejects a missing or
// an extra member if LevelEstimateMethod ever changes.
const METHODS: Record<LevelEstimateMethod, true> = {
  placement: true,
  checkpoint: true,
  mastery_ratio: true,
  manual: true,
};

/** The UTC calendar day of a date, as YYYY-MM-DD. */
function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Whole days from one YYYY-MM-DD day to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function levelIndex(level: CefrLevel): number {
  return CEFR_LEVELS.indexOf(level);
}

export function createProgress(options: CreateProgressOptions): ProgressService {
  const { store, bus, listCandos } = options;
  const now = options.now ?? (() => new Date());

  function report(error: unknown, context: ProgressErrorContext): void {
    try {
      if (options.onError) options.onError(error, context);
      else console.error(`[core-progress] ${context.event} handler failed`, error, context);
    } catch (reportError) {
      console.error('[core-progress] onError threw', reportError);
    }
  }

  // Writes run one after another. Two events for the same descriptor can then
  // never interleave their read and write, which is what keeps `cando.mastered`
  // to one emit. Events are emitted after the turn, never inside it, so a
  // listener that calls back into this service cannot block the queue.
  let tail: Promise<void> = Promise.resolve();
  function inTurn<T>(work: () => Promise<T>): Promise<T> {
    const run = tail.then(work);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function emptyRow(userId: string, candoId: string, at: string): CandoMastery {
    return {
      userId,
      candoId,
      evidenceCount: 0,
      correctCount: 0,
      exerciseTypesSeen: [],
      bestProductionScore: null,
      recentAccuracy: null,
      masteredAt: null,
      updatedAt: at,
    };
  }

  /**
   * Refreshes recent accuracy, sets `masteredAt` the first time the rule is
   * true and writes the row. Resolves to true only for that first time.
   * Mastery is never taken away again. Without the descriptor the evidence is
   * kept and the rule is not evaluated.
   */
  async function settle(row: CandoMastery, cando: Cando | undefined, at: string): Promise<boolean> {
    const recent = await store.recentOutcomes(row.userId, row.candoId, RECENT_WINDOW);
    row.recentAccuracy = recentAccuracy(recent);
    row.updatedAt = at;
    const newly = row.masteredAt === null && cando !== undefined && isMastered(row, cando, recent);
    if (newly) row.masteredAt = at;
    await store.upsertMastery(row);
    return newly;
  }

  async function addAttempt(
    payload: EventMap['attempt.recorded'],
    candoId: string,
    cando: Cando | undefined,
    at: string,
  ): Promise<boolean> {
    const { userId, correct, exerciseType } = payload;
    await store.appendAttemptOutcome(userId, candoId, { correct, exerciseType, at });
    const row = (await store.getMastery(userId, candoId)) ?? emptyRow(userId, candoId, at);
    row.evidenceCount += 1;
    if (correct) {
      row.correctCount += 1;
      // The rule asks for correct attempts in distinct types, so a type is
      // listed the first time an attempt of that type is correct.
      if (!row.exerciseTypesSeen.includes(exerciseType)) row.exerciseTypesSeen.push(exerciseType);
    }
    return settle(row, cando, at);
  }

  /** One active UTC day extends the streak, a gap restarts it at 1. */
  async function bumpStreak(userId: string, language: LanguageCode, date: Date): Promise<void> {
    const today = utcDay(date);
    const current = await store.getStreak(userId, language);
    const last = current?.lastActiveDate ?? null;
    // Same day again, or a clock that went backwards: nothing changes.
    if (last !== null && daysBetween(last, today) <= 0) return;
    const continues = current !== null && last !== null && daysBetween(last, today) === 1;
    const currentDays = continues ? current.currentDays + 1 : 1;
    await store.upsertStreak({
      userId,
      languageCode: language,
      currentDays,
      longestDays: Math.max(current?.longestDays ?? 0, currentDays),
      lastActiveDate: today,
    });
  }

  async function emitMastered(events: EventMap['cando.mastered'][]): Promise<void> {
    for (const event of events) await bus.emit('cando.mastered', event);
  }

  /** Handler for `attempt.recorded`. Never rejects: every failure goes to `report`. */
  async function onAttempt(payload: EventMap['attempt.recorded']): Promise<void> {
    const context: ProgressErrorContext = { event: 'attempt.recorded', userId: payload.userId };
    try {
      const date = now();
      const at = date.toISOString();
      const mastered = await inTurn(async () => {
        const newly: EventMap['cando.mastered'][] = [];
        try {
          await bumpStreak(payload.userId, payload.language, date);
        } catch (error) {
          report(error, context);
        }
        // Without the descriptor list the evidence is still recorded. The rule
        // is evaluated on the next attempt that finds the descriptor.
        let candos: Cando[] | null = null;
        try {
          candos = await listCandos(payload.language);
        } catch (error) {
          report(error, context);
        }
        for (const candoId of new Set(payload.candoIds)) {
          try {
            const cando = candos?.find((candidate) => candidate.id === candoId);
            if (candos !== null && cando === undefined) {
              const message = `descriptor ${candoId} is not in the ${payload.language} list; evidence kept, mastery not evaluated`;
              report(new Error(message), { ...context, candoId });
            }
            if ((await addAttempt(payload, candoId, cando, at)) && cando !== undefined) {
              newly.push({ userId: payload.userId, candoId, level: cando.level });
            }
          } catch (error) {
            report(error, { ...context, candoId });
          }
        }
        return newly;
      });
      await emitMastered(mastered);
    } catch (error) {
      report(error, context);
    }
  }

  /** Looks the descriptor up in every language, because the caller has no language. */
  async function findCando(candoId: string): Promise<Cando | undefined> {
    for (const language of LANGUAGE_CODES) {
      const cando = (await listCandos(language)).find((candidate) => candidate.id === candoId);
      if (cando) return cando;
    }
    return undefined;
  }

  function isCheckpointPassed(estimates: readonly LevelEstimate[], level: CefrLevel): boolean {
    // Until core-assessment exists, a checkpoint counts as passed only when an
    // estimate with method 'checkpoint' was recorded for exactly that level.
    return estimates.some((row) => row.method === 'checkpoint' && row.level === level);
  }

  /** The level map rows, A1 first. Shared by levelMap and levelEstimate. */
  async function levelRows(
    userId: string,
    language: LanguageCode,
  ): Promise<ProgressLevelMapLevel[]> {
    const [candos, rows, estimates] = await Promise.all([
      listCandos(language),
      store.listMastery(userId),
      store.listEstimates(userId, language),
    ]);
    const rowById = new Map(rows.map((row) => [row.candoId, row]));
    return CEFR_LEVELS.map((level) => {
      const ofLevel = candos.filter((cando) => cando.level === level);
      const passed = isCheckpointPassed(estimates, level);
      const conditions = levelConditions(ofLevel, rows, passed);
      // docs/06 section 5.4: the checkpoint opens at 80 percent mastered.
      // 'failed' needs core-assessment and is never returned yet.
      const checkpoint: CheckpointStatus = passed
        ? 'passed'
        : conditions.ratioMet
          ? 'available'
          : 'locked';
      const descriptors = ofLevel.map((cando) => ({
        cando,
        mastery: rowById.get(cando.id) ?? null,
      }));
      return {
        level,
        candos: descriptors.flatMap((entry) => (entry.mastery ? [entry.mastery] : [])),
        masteredCount: conditions.masteredCount,
        totalCount: conditions.totalCount,
        checkpoint,
        status: levelStatus(ofLevel, rows, passed),
        descriptors,
      };
    });
  }

  /** Highest reached level wins, then the latest recorded estimate, then null. */
  async function estimateFrom(
    levels: readonly ProgressLevelMapLevel[],
    userId: string,
    language: LanguageCode,
  ): Promise<LevelEstimate | null> {
    const reached = levels.filter((row) => row.status === 'reached').at(-1);
    if (reached) {
      // A reached level always has a checkpoint estimate. Its confidence and
      // method are the ones reported.
      const checkpoint = (await store.listEstimates(userId, language))
        .filter((row) => row.method === 'checkpoint' && row.level === reached.level)
        .at(-1);
      if (checkpoint) return checkpoint;
    }
    return store.latestEstimate(userId, language);
  }

  return {
    attach(target: EventBus = bus): Unsubscribe {
      // `writing.graded` is not subscribed: its payload has no descriptor ids,
      // so a score cannot be credited from it. See recordProductionScore.
      return target.on('attempt.recorded', onAttempt);
    },

    async recordProductionScore(userId, candoId, score) {
      if (
        typeof score !== 'number' ||
        !Number.isFinite(score) ||
        score < PRODUCTION_SCORE_MIN ||
        score > PRODUCTION_SCORE_MAX
      ) {
        throw new ProgressValidationError(
          'score',
          `score must be a number from ${PRODUCTION_SCORE_MIN} to ${PRODUCTION_SCORE_MAX}`,
        );
      }
      const cando = await findCando(candoId);
      if (!cando) {
        throw new ProgressValidationError('candoId', `unknown descriptor ${candoId}`);
      }
      const at = now().toISOString();
      const newly = await inTurn(async () => {
        const row = (await store.getMastery(userId, candoId)) ?? emptyRow(userId, candoId, at);
        row.bestProductionScore = Math.max(row.bestProductionScore ?? score, score);
        return settle(row, cando, at);
      });
      if (newly) await emitMastered([{ userId, candoId, level: cando.level }]);
    },

    async masteryFor(userId, language, level) {
      const candos = (await listCandos(language, level)).filter(
        (cando) => level === undefined || cando.level === level,
      );
      const rowById = new Map((await store.listMastery(userId)).map((row) => [row.candoId, row]));
      // Descriptor order. Descriptors without evidence have no row.
      return candos.flatMap((cando) => {
        const row = rowById.get(cando.id);
        return row ? [row] : [];
      });
    },

    async levelEstimate(userId, language) {
      return estimateFrom(await levelRows(userId, language), userId, language);
    },

    async recordEstimate(userId, language, level, confidence, method) {
      if (!CEFR_LEVELS.includes(level)) {
        throw new ProgressValidationError(
          'level',
          `level must be one of: ${CEFR_LEVELS.join(', ')}`,
        );
      }
      if (typeof confidence !== 'number' || !(confidence >= 0 && confidence <= 1)) {
        throw new ProgressValidationError('confidence', 'confidence must be a number from 0 to 1');
      }
      if (typeof method !== 'string' || !Object.hasOwn(METHODS, method)) {
        throw new ProgressValidationError(
          'method',
          `method must be one of: ${Object.keys(METHODS).join(', ')}`,
        );
      }
      const createdAt = now().toISOString();
      const rose = await inTurn(async () => {
        const previous = await store.latestEstimate(userId, language);
        await store.insertEstimate({
          userId,
          languageCode: language,
          level,
          confidence,
          method,
          createdAt,
        });
        // The first estimate of a learner counts as a rise.
        return previous === null || levelIndex(level) > levelIndex(previous.level);
      });
      if (rose) await bus.emit('level.reached', { userId, language, level, method });
    },

    async streak(userId, language) {
      const row = await store.getStreak(userId, language);
      if (!row) {
        return {
          userId,
          languageCode: language,
          currentDays: 0,
          longestDays: 0,
          lastActiveDate: null,
        };
      }
      // A streak whose last active day is before yesterday is over, even
      // though the stored row only changes with the next attempt.
      const over =
        row.lastActiveDate !== null && daysBetween(row.lastActiveDate, utcDay(now())) > 1;
      return over ? { ...row, currentDays: 0 } : row;
    },

    async levelMap(userId, language) {
      const levels = await levelRows(userId, language);
      return {
        userId,
        languageCode: language,
        estimate: await estimateFrom(levels, userId, language),
        levels,
      };
    },
  };
}
