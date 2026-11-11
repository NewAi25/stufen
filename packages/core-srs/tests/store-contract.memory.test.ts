// Runs the CardStore contract against the in memory adapter. No database.
import { randomUUID } from 'node:crypto';
import { createInMemoryCardStore } from '../src/index';
import { runCardStoreContract } from './store-contract';

runCardStoreContract('in memory', () => ({
  store: createInMemoryCardStore(),
  newUserId: async () => randomUUID(),
  newItemId: async () => randomUUID(),
}));
