// The analytics sink. Built by a factory so apps/web decides which store, clock
// and id source it gets. Nothing here is a module level singleton.
import type { EventBus, Unsubscribe } from '@stufen/contracts';
import type { AnalyticsEvent, EventStore } from './store';

/** Called once per event that could not be stored from the bus. Should not throw. */
export type AnalyticsErrorHandler = (error: unknown, eventName: string) => void;

export interface AnalyticsOptions {
  store: EventStore;
  /** Clock for `createdAt`. Default: the system clock. */
  now?: () => Date;
  /** Id source for new rows. Default: `crypto.randomUUID()`. */
  newId?: () => string;
  /** Share of events kept, from 0 to 1. Default 1, which keeps everything. */
  sampleRate?: number;
  /** Returns a number from 0 up to but not including 1. Default: `Math.random`. */
  random?: () => number;
  /** Receives store failures from the bus subscriber. Default: `console.error`. */
  onError?: AnalyticsErrorHandler;
}

export interface Analytics {
  /** Subscribes with `onAny` and writes one row per event. Returns the unsubscribe. */
  attach(bus: EventBus): Unsubscribe;
  /** Writes one row. Rejects when the name is invalid or the store fails. */
  track(userId: string | null, name: string, props?: Record<string, unknown>): Promise<void>;
}

const MAX_NAME_LENGTH = 100;
const NAME_PATTERN = /^[a-z0-9._]+$/;

const defaultOnError: AnalyticsErrorHandler = (error, eventName) => {
  console.error(`[core-analytics] could not store ${eventName}`, error);
};

function assertValidName(name: string): void {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Invalid event name: it must be a non empty string.');
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Invalid event name: it is longer than ${MAX_NAME_LENGTH} characters.`);
  }
  if (!NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid event name "${name}": use lowercase letters, digits, dot and underscore only.`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Splits a bus payload into the user id column and the props column. */
function splitPayload(payload: unknown): {
  userId: string | null;
  props: Record<string, unknown>;
} {
  if (payload === undefined || payload === null) return { userId: null, props: {} };
  if (!isRecord(payload)) return { userId: null, props: { value: payload } };
  const { userId, ...props } = payload;
  return { userId: typeof userId === 'string' ? userId : null, props };
}

export function createAnalytics(options: AnalyticsOptions): Analytics {
  const { store } = options;
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? (() => globalThis.crypto.randomUUID());
  const random = options.random ?? Math.random;
  const onError = options.onError ?? defaultOnError;
  const sampleRate = options.sampleRate ?? 1;
  if (!(sampleRate >= 0 && sampleRate <= 1)) {
    throw new RangeError(`sampleRate must be between 0 and 1, got ${String(sampleRate)}.`);
  }

  // One draw per event. A rate of 1 keeps everything and a rate of 0 keeps
  // nothing, whatever `random` returns.
  function sampledIn(): boolean {
    if (sampleRate >= 1) return true;
    if (sampleRate <= 0) return false;
    return random() < sampleRate;
  }

  function row(
    userId: string | null,
    name: string,
    props: Record<string, unknown>,
  ): AnalyticsEvent {
    return { id: newId(), userId, name, props, createdAt: now().toISOString() };
  }

  function report(error: unknown, eventName: string): void {
    try {
      onError(error, eventName);
    } catch {
      // A failing reporter must not reach the bus either.
    }
  }

  return {
    attach(bus: EventBus): Unsubscribe {
      return bus.onAny(async (name, payload) => {
        try {
          if (!sampledIn()) return;
          const { userId, props } = splitPayload(payload);
          await store.insert(row(userId, name, props));
        } catch (error) {
          report(error, name);
        }
      });
    },

    async track(
      userId: string | null,
      name: string,
      props: Record<string, unknown> = {},
    ): Promise<void> {
      assertValidName(name);
      if (!sampledIn()) return;
      await store.insert(row(userId, name, { ...props }));
    },
  };
}
