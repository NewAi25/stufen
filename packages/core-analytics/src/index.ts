// @stufen/core-analytics
// Event sink. Subscribes to every event on the bus and writes an events row.
// This file is the only public surface of the box. Everything exported here
// is listed in docs/04-module-contracts.md. Nothing else in src/ is public.
// Status: in progress. See docs/07-build-sequence.md.
export { createAnalytics } from './analytics';
export type { Analytics, AnalyticsErrorHandler, AnalyticsOptions } from './analytics';
export { createInMemoryEventStore } from './store';
export type { AnalyticsEvent, EventFilter, EventStore } from './store';
