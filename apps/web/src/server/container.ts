import 'server-only';

// The composition root. This is the only file in the repo that builds boxes
// and connects them. Pages, server actions and route handlers call
// getContainer() and use the public API of the boxes it returns.

import { createEventBus } from '@stufen/contracts';
import type { InProcessEventBus, StoragePort } from '@stufen/contracts';
import { createAnalytics, createInMemoryEventStore } from '@stufen/core-analytics';
import type { Analytics, EventStore } from '@stufen/core-analytics';
import { createInMemoryAuth, createInMemoryAuthStore } from '@stufen/core-auth';
import type { AuthStore, InMemoryAuth } from '@stufen/core-auth';
import { createEntitlements, createInMemoryEntitlementStore } from '@stufen/core-entitlements';
import type { Entitlements, EntitlementStore } from '@stufen/core-entitlements';
import { createFeedback, createInMemoryFeedbackStore } from '@stufen/core-feedback';
import type { FeedbackStore } from '@stufen/core-feedback';
import { createIdentity, createInMemoryProfileStore } from '@stufen/core-identity';
import type { Identity, ProfileStore } from '@stufen/core-identity';
import { createConsoleMail } from '@stufen/core-mail';
import type { ConsoleMail } from '@stufen/core-mail';
import { createFsStorage } from '@stufen/core-storage';
import { readConfig } from './config';
import type { AppConfig } from './config';

export interface Container {
  config: AppConfig;
  bus: InProcessEventBus;
  mail: ConsoleMail;
  auth: InMemoryAuth;
  identity: Identity;
  entitlements: Entitlements;
  analytics: Analytics;
  feedback: ReturnType<typeof createFeedback>;
  storage: StoragePort;
  /** The in memory stores behind the boxes. For tests and local inspection. */
  stores: {
    auth: AuthStore;
    profiles: ProfileStore;
    entitlements: EntitlementStore;
    events: EventStore;
    feedback: FeedbackStore;
  };
}

/** Builds a fresh set of boxes. Use getContainer() everywhere outside tests. */
export function createContainer(config: AppConfig = readConfig()): Container {
  const bus = createEventBus();
  const mail = createConsoleMail();

  const stores = {
    auth: createInMemoryAuthStore(),
    profiles: createInMemoryProfileStore(),
    entitlements: createInMemoryEntitlementStore(),
    events: createInMemoryEventStore(),
    feedback: createInMemoryFeedbackStore(),
  };

  const auth = createInMemoryAuth({ mail, bus, store: stores.auth });
  const identity = createIdentity({ store: stores.profiles, bus });
  const entitlements = createEntitlements({ store: stores.entitlements, bus });
  const analytics = createAnalytics({ store: stores.events });
  const feedback = createFeedback({ store: stores.feedback, bus });
  const storage = createFsStorage({
    root: config.storageFsRoot,
    ...(config.storageSigningSecret ? { secret: config.storageSigningSecret } : {}),
  });

  // Analytics listens to every event. Attached once, here.
  analytics.attach(bus);

  // Cross box reaction: a new user gets a profile and the default plan.
  bus.on('user.signed_up', async ({ userId }) => {
    await identity.ensureProfile(userId);
    await entitlements.plan(userId);
  });

  return { config, bus, mail, auth, identity, entitlements, analytics, feedback, storage, stores };
}

// One container per process. It lives on globalThis because dev hot reload
// evaluates this module again, and a module level variable would be lost.
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
