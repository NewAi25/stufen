// In process event bus. Implements EventBus from ./events. No queue and no
// persistence: emit runs every matching handler inside the same request and
// waits for all of them. Readable description: docs/02-architecture.md, Events.
import type {
  AnyEventHandler,
  EventBus,
  EventHandler,
  EventMap,
  EventName,
  Unsubscribe,
} from './events';

/** Called once per failed handler. Should not throw; the bus swallows it if it does. */
export type EventBusErrorHandler = (name: EventName, error: unknown, handlerLabel: string) => void;

export interface EventBusOptions {
  /** Receives each handler failure. Default: console.error with the event name. */
  onError?: EventBusErrorHandler;
}

/** The in process bus. `listenerCount` is an extra for tests and debugging. */
export interface InProcessEventBus extends EventBus {
  /** Live subscriptions for one event, or for every event plus onAny when name is omitted. */
  listenerCount(name?: EventName): number;
}

interface Subscription<K extends EventName> {
  label: string;
  handler: EventHandler<K>;
}
interface AnySubscription {
  label: string;
  handler: AnyEventHandler;
}
interface Job {
  label: string;
  run: () => Promise<void>;
}

const defaultOnError: EventBusErrorHandler = (name, error, handlerLabel) => {
  console.error(`[event bus] ${handlerLabel} failed on ${name}`, error);
};

export function createEventBus(options: EventBusOptions = {}): InProcessEventBus {
  const onError = options.onError ?? defaultOnError;
  const buckets = new Map<EventName, Set<Subscription<EventName>>>();
  const anySubs = new Set<AnySubscription>();
  let nextId = 0;

  // The only cast in this file. Each Set holds handlers for exactly one event
  // name, and on() is the only writer, so narrowing to that name is sound.
  function bucket<K extends EventName>(name: K): Set<Subscription<K>> {
    let set = buckets.get(name);
    if (!set) {
      set = new Set();
      buckets.set(name, set);
    }
    return set as unknown as Set<Subscription<K>>;
  }

  function report(name: EventName, error: unknown, label: string): void {
    try {
      onError(name, error, label);
    } catch (reportError) {
      console.error(`[event bus] onError threw while handling ${name}`, reportError);
    }
  }

  return {
    async emit<K extends EventName>(name: K, payload: EventMap[K]): Promise<void> {
      // Snapshot first: handlers subscribed during this emit do not see it.
      // Each run is an async wrapper so a synchronous throw becomes a rejection.
      const jobs: Job[] = [
        ...[...bucket(name)].map((sub) => ({
          label: sub.label,
          run: async () => sub.handler(payload),
        })),
        ...[...anySubs].map((sub) => ({
          label: sub.label,
          run: async () => sub.handler(name, payload),
        })),
      ];
      const results = await Promise.allSettled(jobs.map((job) => job.run()));
      results.forEach((result, i) => {
        if (result.status === 'rejected') report(name, result.reason, jobs[i]?.label ?? 'unknown');
      });
    },

    on<K extends EventName>(name: K, handler: EventHandler<K>): Unsubscribe {
      const set = bucket(name);
      const sub: Subscription<K> = { label: `on(${name})#${++nextId}`, handler };
      set.add(sub);
      return () => {
        set.delete(sub);
      };
    },

    onAny(handler: AnyEventHandler): Unsubscribe {
      const sub: AnySubscription = { label: `onAny#${++nextId}`, handler };
      anySubs.add(sub);
      return () => {
        anySubs.delete(sub);
      };
    },

    listenerCount(name?: EventName): number {
      if (name !== undefined) return buckets.get(name)?.size ?? 0;
      let total = anySubs.size;
      for (const set of buckets.values()) total += set.size;
      return total;
    },
  };
}
