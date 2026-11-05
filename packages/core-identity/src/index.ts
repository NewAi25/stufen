// @stufen/core-identity
// Profile, settings and the learner's active target language. Sign in lives
// in core-auth.
// This file is the only public surface of the box. Everything exported here
// is listed in docs/04-module-contracts.md. Nothing else in src/ is public.
// Status: see docs/07-build-sequence.md.

export { createIdentity, ProfileNotFoundError } from './identity';
export type { Identity, IdentityOptions } from './identity';
export { createInMemoryProfileStore } from './store';
export type { ProfileStore, ProfileStorePatch, LearnerLanguageUpsert } from './store';
