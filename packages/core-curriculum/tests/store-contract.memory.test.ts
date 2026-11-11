// Runs the shared store contract against the in memory adapter.
import { createInMemoryCurriculumStore } from '../src/index';
import { runCurriculumStoreContract } from './store-contract';

runCurriculumStoreContract('in memory', () => createInMemoryCurriculumStore());
