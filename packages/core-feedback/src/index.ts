// @stufen/core-feedback
// In app feedback capture.
// This file is the only public surface of the box. Everything exported here
// is listed in docs/04-module-contracts.md. Nothing else in src/ is public.
// Status: see the core-feedback row in docs/07-build-sequence.md.

export { createFeedback, FeedbackValidationError } from './feedback';
export { createInMemoryFeedbackStore } from './store';
export type { FeedbackStore } from './store';
export { createPostgresFeedbackStore } from './postgres-store';
