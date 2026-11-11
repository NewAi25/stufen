// Runs the ProfileStore contract against the in memory adapter. No database.
import { randomUUID } from 'node:crypto';
import { createInMemoryProfileStore } from '../src/index';
import { runProfileStoreContract } from './store-contract';

runProfileStoreContract('in memory', () => ({
  store: createInMemoryProfileStore(),
  newUserId: async () => randomUUID(),
}));
