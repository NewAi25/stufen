// The entitlements service: "may this user do X" and "how much of Y is left today".
// Built by a factory so every dependency is passed in. No module level state.
// Rules: docs/12-entitlements-and-payments.md. No payment code in this version.
import { CEFR_LEVELS } from '@stufen/contracts';
import type {
  CefrLevel,
  Entitlement,
  EntitlementSource,
  EventBus,
  FeatureKey,
  LimitKey,
  PlanId,
} from '@stufen/contracts';
import { DEFAULT_PLAN, PLANS } from './plans';
import type { EntitlementStore } from './store';

/** Thrown by `consume` when the amount asked for is more than what is left today. */
export class LimitExceededError extends Error {
  readonly limitKey: LimitKey;
  /** The user's daily limit, after overrides. */
  readonly limit: number;
  /** How much was already used today. */
  readonly used: number;
  /** The amount the failed call asked for. */
  readonly requested: number;

  constructor(limitKey: LimitKey, limit: number, used: number, requested: number) {
    super(`${limitKey} exceeded: ${used} of ${limit} used today, ${requested} requested`);
    this.name = 'LimitExceededError';
    this.limitKey = limitKey;
    this.limit = limit;
    this.used = used;
    this.requested = requested;
  }
}

/** Extra facts the caller hands to `flag`. The box reads no other box, so the level comes from here. */
export interface FlagContext {
  level?: CefrLevel | undefined;
}

export interface EntitlementsDeps {
  store: EntitlementStore;
  bus: EventBus;
  /** The clock. Default: the system clock. */
  now?: () => Date;
  /**
   * Names the day a use counts toward. Default: the UTC date, `YYYY-MM-DD`.
   * The app can pass a function that uses the user's timezone.
   */
  dayKeyFor?: (userId: string, now: Date) => string | Promise<string>;
}

export interface Entitlements {
  /** The user's row. Creates the `free_beta` default when there is none. */
  plan(userId: string): Promise<Entitlement>;
  can(userId: string, feature: FeatureKey): Promise<boolean>;
  /** What is left of a daily limit today. Never below zero. */
  remaining(userId: string, limit: LimitKey): Promise<number>;
  /** Uses `amount` (default 1) of a daily limit. Throws `LimitExceededError` when that much is not left. */
  consume(userId: string, limit: LimitKey, amount?: number): Promise<void>;
  /** Evaluates a feature flag. See the rule order in docs/12. */
  flag(key: string, userId?: string, ctx?: FlagContext): Promise<boolean>;
  /** Sets the user's plan, keeps their overrides, clears any expiry and emits `entitlement.changed`. */
  setPlan(userId: string, plan: PlanId, source: EntitlementSource): Promise<Entitlement>;
}

const utcDayKey = (_userId: string, now: Date): string => now.toISOString().slice(0, 10);

/** FNV-1a, 32 bit, over the UTF-8 bytes. Stable across runs and machines. */
function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const levelRank = (level: CefrLevel): number => CEFR_LEVELS.indexOf(level);

function isExpired(entitlement: Entitlement, now: Date): boolean {
  if (entitlement.expiresAt === null) return false;
  return Date.parse(entitlement.expiresAt) <= now.getTime();
}

export function createEntitlements(deps: EntitlementsDeps): Entitlements {
  const { store, bus } = deps;
  const now = deps.now ?? (() => new Date());
  const dayKeyFor = deps.dayKeyFor ?? utcDayKey;

  async function plan(userId: string): Promise<Entitlement> {
    const stored = await store.getEntitlement(userId);

    if (!stored) {
      // No row yet, for example a sign up that raced the event. Create the default.
      return store.upsertEntitlement({
        userId,
        plan: DEFAULT_PLAN,
        features: {},
        limits: {},
        source: 'default',
        expiresAt: null,
        updatedAt: now().toISOString(),
      });
    }

    if (isExpired(stored, now())) {
      // During beta an expired row falls back to free_beta. The row is rewritten
      // here, on read, so no nightly job is needed. Overrides are kept.
      const fallback = await store.upsertEntitlement({
        ...stored,
        plan: DEFAULT_PLAN,
        source: 'default',
        expiresAt: null,
        updatedAt: now().toISOString(),
      });
      await bus.emit('entitlement.changed', { userId, plan: fallback.plan });
      return fallback;
    }

    return stored;
  }

  async function can(userId: string, feature: FeatureKey): Promise<boolean> {
    const entitlement = await plan(userId);
    return entitlement.features[feature] ?? PLANS[entitlement.plan].features[feature];
  }

  /** The limit after overrides and what is used today, read together. */
  async function usage(
    userId: string,
    limit: LimitKey,
  ): Promise<{ max: number; used: number; dayKey: string }> {
    const entitlement = await plan(userId);
    const max = entitlement.limits[limit] ?? PLANS[entitlement.plan].limits[limit];
    const dayKey = await dayKeyFor(userId, now());
    const used = await store.usedToday(userId, limit, dayKey);
    return { max, used, dayKey };
  }

  async function remaining(userId: string, limit: LimitKey): Promise<number> {
    const { max, used } = await usage(userId, limit);
    return Math.max(0, max - used);
  }

  async function consume(userId: string, limit: LimitKey, amount = 1): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new RangeError(`consume amount must be a positive number, got ${amount}`);
    }
    const { max, used, dayKey } = await usage(userId, limit);
    if (amount > Math.max(0, max - used)) {
      throw new LimitExceededError(limit, max, used, amount);
    }
    await store.recordUse(userId, limit, amount, dayKey);
  }

  async function flag(key: string, userId?: string, ctx?: FlagContext): Promise<boolean> {
    const row = await store.getFlag(key);
    // An unknown key is off, the same as the column default for `enabled`.
    if (!row || !row.enabled) return false;
    // Without a user only the switch above applies. A public page needs exactly that.
    if (userId === undefined) return true;

    const { rules } = row;
    if (rules.deny?.includes(userId)) return false;
    if (rules.allow?.includes(userId)) return true;
    if (rules.plans !== undefined) {
      const entitlement = await plan(userId);
      if (!rules.plans.includes(entitlement.plan)) return false;
    }
    if (rules.min_level !== undefined) {
      const level = ctx?.level;
      if (level === undefined || levelRank(level) < levelRank(rules.min_level)) return false;
    }
    if (rules.percent !== undefined && hash32(key + userId) % 100 >= rules.percent) return false;
    return true;
  }

  async function setPlan(
    userId: string,
    planId: PlanId,
    source: EntitlementSource,
  ): Promise<Entitlement> {
    const existing = await store.getEntitlement(userId);
    const saved = await store.upsertEntitlement({
      userId,
      plan: planId,
      features: existing?.features ?? {},
      limits: existing?.limits ?? {},
      source,
      expiresAt: null,
      updatedAt: now().toISOString(),
    });
    await bus.emit('entitlement.changed', { userId, plan: saved.plan });
    return saved;
  }

  return { plan, can, remaining, consume, flag, setPlan };
}
