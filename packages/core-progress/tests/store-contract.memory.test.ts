// Runs the shared MasteryStore contract against the in memory adapter. The
// same contract runs against Postgres in postgres-store.integration.test.ts.
import { randomUUID } from 'node:crypto';
import { createInMemoryMasteryStore } from '../src/index';
import { runMasteryStoreContract } from './store-contract';

runMasteryStoreContract('in memory', () => ({
  store: createInMemoryMasteryStore(),
  newUserId: async () => randomUUID(),
  newCandoId: async () => randomUUID(),
}));
