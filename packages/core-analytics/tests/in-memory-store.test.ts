// The shared EventStore contract, run against the in memory adapter. One store
// lives for the whole file, the way one events table does, so the contract's
// isolation by unique event names is exercised here too.
import { randomUUID } from 'node:crypto';
import { createInMemoryEventStore } from '../src/index';
import { runEventStoreContract } from './store-contract';

const store = createInMemoryEventStore();

runEventStoreContract(
  'in memory',
  () => store,
  () => randomUUID(),
);
