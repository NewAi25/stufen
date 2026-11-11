// @stufen/core-entitlements
// Answers "may this user do X". Plans, daily limits and feature flags.
// This file is the only public surface of the box. Nothing else in src/ is public.
// Status: see docs/07-build-sequence.md. No payment code in this version.

export { createEntitlements, LimitExceededError } from './entitlements';
export type { Entitlements, EntitlementsDeps, FlagContext } from './entitlements';
export { createInMemoryEntitlementStore } from './store';
export type { EntitlementStore, FeatureFlag, FlagRules } from './store';
export { createPostgresEntitlementStore, postgresDayKeyFor } from './postgres-store';
export { DEFAULT_PLAN, PLANS } from './plans';
export type { PlanDefinition } from './plans';
