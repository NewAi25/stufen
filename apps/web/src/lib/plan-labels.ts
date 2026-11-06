// Words for plans and daily limits. Shared by server and client code.

import type { LimitKey, PlanId } from '@stufen/contracts';

export const PLAN_LABELS: Record<PlanId, string> = {
  free_beta: 'Free beta',
  free: 'Free',
  plus: 'Plus',
  pro: 'Pro',
};

export const LIMIT_LABELS: Record<LimitKey, string> = {
  tutor_messages_per_day: 'Tutor messages',
  writing_grades_per_day: 'Writing grades',
  speech_minutes_per_day: 'Speech minutes',
};
