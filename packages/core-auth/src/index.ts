// @stufen/core-auth
// Sign in, sign out and session lookup behind AuthPort. This file is the only
// public surface of the box. Readable copy: docs/04-module-contracts.md.
export { AuthError, createAuth, createInMemoryAuth } from './auth';
export type { Auth, AuthErrorCode, AuthOptions, InMemoryAuth, InMemoryAuthOptions } from './auth';
export { createInMemoryAuthStore } from './store';
export { createPostgresAuthStore } from './postgres-store';
export type { PostgresAuthStore } from './postgres-store';
export type { AuthLinkToken, AuthSessionRecord, AuthStore, AuthUser } from './store';
export type { AuthPort, AuthSession } from '@stufen/contracts';
