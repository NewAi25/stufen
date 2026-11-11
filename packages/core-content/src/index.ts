// @stufen/core-content
// Loads and validates language packs, installs them into the curriculum tables and tracks pack versions.
// This file is the only public surface of the box. Everything exported here
// is listed in docs/04-module-contracts.md. Nothing else in src/ is public.
// Status: see the core-content rows in docs/07-build-sequence.md.

export { stableId } from './ids';
export { validatePackData } from './validate';
export type { IssueSeverity, PackIssue, PackValidationReport } from './validate';
export { buildSnapshot } from './snapshot';
export { createInMemoryContentStore } from './store';
export type {
  ContentStore,
  PackVersionRecord,
  PackVersionStatus,
  RecordVersionInput,
} from './store';
export { createPostgresContentStore } from './postgres-store';
export { createContent, PackInvalidError, PackNotRegisteredError } from './content';
export type { Content, ContentDeps } from './content';
