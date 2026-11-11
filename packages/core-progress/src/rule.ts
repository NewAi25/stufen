// Pure rules of core-progress: when one descriptor is mastered and when a
// level is reached. No storage, no clock, no bus. Sources:
// docs/04-module-contracts.md (core-progress) and docs/05-curriculum-spine.md
// (Evidence rule).
import type { Cando, CandoMastery, MasteryRule, Skill } from '@stufen/contracts';
import type { AttemptOutcome } from './store';

/** The default mastery rule from docs/04. A descriptor may override any field. */
export const DEFAULT_MASTERY_RULE: Readonly<Required<MasteryRule>> = {
  evidenceCount: 6,
  distinctExerciseTypes: 2,
  recentAccuracy: 0.8,
  bestProductionScore: 3,
};

/** Recent accuracy looks at this many of the latest attempts. */
export const RECENT_WINDOW = 10;

/** Condition 1 of "Level L is reached": this percentage of the descriptors is mastered. */
export const LEVEL_MASTERY_PERCENT = 80;

/** Skills whose descriptors need a graded sample (`SPI`, `SPP`, `WRI`). */
export const PRODUCTION_SKILLS: readonly Skill[] = [
  'spoken_interaction',
  'spoken_production',
  'writing',
];

export type LevelStatus = 'reached' | 'working_towards' | 'not_started';

export function isProductionSkill(skill: Skill): boolean {
  return PRODUCTION_SKILLS.includes(skill);
}

/** The default rule with the descriptor's own numbers laid over it, field by field. */
export function effectiveRule(cando: Pick<Cando, 'masteryRule'>): Required<MasteryRule> {
  const own = cando.masteryRule;
  return {
    evidenceCount: own?.evidenceCount ?? DEFAULT_MASTERY_RULE.evidenceCount,
    distinctExerciseTypes: own?.distinctExerciseTypes ?? DEFAULT_MASTERY_RULE.distinctExerciseTypes,
    recentAccuracy: own?.recentAccuracy ?? DEFAULT_MASTERY_RULE.recentAccuracy,
    bestProductionScore: own?.bestProductionScore ?? DEFAULT_MASTERY_RULE.bestProductionScore,
  };
}

/**
 * Share of correct attempts among the last RECENT_WINDOW of `outcomes`
 * (oldest first). Null when there are no attempts.
 */
export function recentAccuracy(
  outcomes: readonly Pick<AttemptOutcome, 'correct'>[],
): number | null {
  const window = outcomes.slice(-RECENT_WINDOW);
  if (window.length === 0) return null;
  return window.filter((outcome) => outcome.correct).length / window.length;
}

/**
 * True when the row satisfies the mastery rule of the descriptor.
 *
 * `row.exerciseTypesSeen` must hold the exercise types with at least one
 * correct attempt. `recent` is the attempt history, oldest first; when it is
 * omitted the accuracy stored on the row is used.
 */
export function isMastered(
  row: CandoMastery,
  cando: Pick<Cando, 'skill' | 'masteryRule'>,
  recent?: readonly Pick<AttemptOutcome, 'correct'>[],
): boolean {
  const rule = effectiveRule(cando);
  if (row.evidenceCount < rule.evidenceCount) return false;
  if (new Set(row.exerciseTypesSeen).size < rule.distinctExerciseTypes) return false;
  const accuracy = recent === undefined ? row.recentAccuracy : recentAccuracy(recent);
  if (accuracy === null || accuracy < rule.recentAccuracy) return false;
  if (isProductionSkill(cando.skill)) {
    if (row.bestProductionScore === null) return false;
    if (row.bestProductionScore < rule.bestProductionScore) return false;
  }
  return true;
}

/** The four conditions of "Level L is reached" in docs/04, each as a boolean. */
export interface LevelConditions {
  /** 1. At least 80 percent of the level's descriptors are mastered. */
  ratioMet: boolean;
  /** 2. Every production descriptor of the level is mastered. */
  productionMastered: boolean;
  /** 3. The checkpoint for the level is passed. */
  checkpointPassed: boolean;
  /** 4. At least one mastered production descriptor carries a graded sample. */
  productionEvidence: boolean;
  masteredCount: number;
  totalCount: number;
  /** True when any descriptor of the level has an attempt or a graded sample. */
  anyEvidence: boolean;
}

/**
 * Checks the four conditions for one level. `candosOfLevel` are the level's
 * descriptors; `masteryRows` are one user's rows (rows for other descriptors
 * are ignored). A descriptor counts as mastered when its row has `masteredAt`.
 */
export function levelConditions(
  candosOfLevel: readonly Pick<Cando, 'id' | 'skill'>[],
  masteryRows: readonly CandoMastery[],
  checkpointPassed: boolean,
): LevelConditions {
  const rowById = new Map(masteryRows.map((row) => [row.candoId, row]));
  // A descriptor listed twice counts once.
  const candos = [...new Map(candosOfLevel.map((cando) => [cando.id, cando])).values()];
  const mastered = (cando: Pick<Cando, 'id'>): boolean =>
    (rowById.get(cando.id)?.masteredAt ?? null) !== null;

  const production = candos.filter((cando) => isProductionSkill(cando.skill));
  const masteredCount = candos.filter(mastered).length;
  const totalCount = candos.length;

  return {
    // Whole numbers on both sides, so 80 percent is exact: 36 of 45 passes.
    ratioMet: totalCount > 0 && masteredCount * 100 >= totalCount * LEVEL_MASTERY_PERCENT,
    productionMastered: production.every(mastered),
    checkpointPassed,
    productionEvidence: production.some(
      (cando) => mastered(cando) && (rowById.get(cando.id)?.bestProductionScore ?? null) !== null,
    ),
    masteredCount,
    totalCount,
    anyEvidence: candos.some((cando) => {
      const row = rowById.get(cando.id);
      return row !== undefined && (row.evidenceCount > 0 || row.bestProductionScore !== null);
    }),
  };
}

/**
 * 'reached' when all four conditions hold. 'not_started' when the level has no
 * evidence at all and no passed checkpoint. Everything in between is
 * 'working_towards', including a level whose receptive and scaffolding
 * descriptors are all mastered while production evidence is missing.
 */
export function levelStatus(
  candosOfLevel: readonly Pick<Cando, 'id' | 'skill'>[],
  masteryRows: readonly CandoMastery[],
  checkpointPassed: boolean,
): LevelStatus {
  const c = levelConditions(candosOfLevel, masteryRows, checkpointPassed);
  if (c.ratioMet && c.productionMastered && c.checkpointPassed && c.productionEvidence) {
    return 'reached';
  }
  return c.anyEvidence || c.checkpointPassed ? 'working_towards' : 'not_started';
}
