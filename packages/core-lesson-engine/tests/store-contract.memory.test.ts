// Runs the SessionStore contract against the in memory adapter. No database.
import { randomUUID } from 'node:crypto';
import { createInMemorySessionStore } from '../src/index';
import { runSessionStoreContract } from './store-contract';

runSessionStoreContract('in memory', () => ({
  store: createInMemorySessionStore(),
  newUserId: async () => randomUUID(),
  language: 'nl',
  lessonId: randomUUID(),
  exerciseIds: [randomUUID(), randomUUID(), randomUUID(), randomUUID()],
  secondLessonId: randomUUID(),
}));
