// @stufen/core-progress
// Mastery per can do descriptor, level estimate and streaks.
// This file is the only public surface of the box. Everything exported here
// is listed in docs/04-module-contracts.md. Nothing else in src/ is public.
// Status: see the core-progress rows in docs/07-build-sequence.md.

export { OUTCOME_HISTORY_LIMIT, createInMemoryMasteryStore } from './store';
export type { AttemptOutcome, MasteryStore } from './store';
export { createPostgresMasteryStore } from './postgres-store';
export {
  ADVANCED_LEVELS,
  ADVANCED_PRODUCTION_SCORE,
  DEFAULT_MASTERY_RULE,
  LEVEL_MASTERY_PERCENT,
  PRODUCTION_SKILLS,
  RECENT_WINDOW,
  defaultProductionScore,
  effectiveRule,
  isMastered,
  isProductionSkill,
  levelConditions,
  levelStatus,
  recentAccuracy,
} from './rule';
export type { LevelConditions, LevelStatus } from './rule';
export {
  PRODUCTION_SCORE_MAX,
  PRODUCTION_SCORE_MIN,
  ProgressValidationError,
  createProgress,
} from './progress';
export type {
  CreateProgressOptions,
  LevelMapDescriptor,
  ListCandos,
  ProgressErrorContext,
  ProgressField,
  ProgressLevelMap,
  ProgressLevelMapLevel,
  ProgressService,
} from './progress';
