// Runs the AuthStore contract against the in memory adapter. No database.
import { createInMemoryAuthStore } from '../src/index';
import { runAuthStoreContract } from './store-contract';

runAuthStoreContract('in memory', () => createInMemoryAuthStore());
