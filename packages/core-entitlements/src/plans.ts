// Plan definitions as data. Readable copy: docs/12-entitlements-and-payments.md, Plans.
// The entitlements row holds per user overrides only; these are the defaults
// the overrides sit on top of. No prices and no payment code live here.
import type { FeatureKey, LimitKey, PlanId } from '@stufen/contracts';

export interface PlanDefinition {
  id: PlanId;
  /**
   * False means the plan is a proposal: it is defined so the shape is fixed,
   * but nothing hands it out yet. During beta only `free_beta` is active.
   */
  active: boolean;
  features: Record<FeatureKey, boolean>;
  /** Per day. */
  limits: Record<LimitKey, number>;
}

/** The plan a user without a row gets, and the plan an expired row falls back to during beta. */
export const DEFAULT_PLAN: PlanId = 'free_beta';

export const PLANS: Readonly<Record<PlanId, PlanDefinition>> = {
  // Limits match the column default in packages/db/migrations/0001_init.sql.
  free_beta: {
    id: 'free_beta',
    active: true,
    features: {
      tutor: true,
      writing_studio: true,
      speech: true,
      exam_sim: true,
      levels_above_b1: true,
    },
    limits: {
      tutor_messages_per_day: 200,
      writing_grades_per_day: 20,
      speech_minutes_per_day: 30,
    },
  },
  free: {
    id: 'free',
    active: false,
    features: {
      tutor: true,
      writing_studio: true,
      speech: true,
      exam_sim: false,
      levels_above_b1: false,
    },
    limits: {
      tutor_messages_per_day: 10,
      writing_grades_per_day: 1,
      speech_minutes_per_day: 5,
    },
  },
  plus: {
    id: 'plus',
    active: false,
    features: {
      tutor: true,
      writing_studio: true,
      speech: true,
      exam_sim: true,
      levels_above_b1: true,
    },
    limits: {
      tutor_messages_per_day: 100,
      writing_grades_per_day: 10,
      speech_minutes_per_day: 30,
    },
  },
  pro: {
    id: 'pro',
    active: false,
    features: {
      tutor: true,
      writing_studio: true,
      speech: true,
      exam_sim: true,
      levels_above_b1: true,
    },
    limits: {
      tutor_messages_per_day: 400,
      writing_grades_per_day: 40,
      speech_minutes_per_day: 120,
    },
  },
};
