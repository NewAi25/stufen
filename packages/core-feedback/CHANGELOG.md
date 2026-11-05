# Changelog

## [Unreleased]

## [0.1.0] - 2026-11-05

### Added
- `src/store.ts`: the `FeedbackStore` port (`insert`, `listByUser`, `listAll(filter?)`, `updateStatus`) and `createInMemoryFeedbackStore()`. Lists come back newest first by `createdAt`; rows with the same timestamp come back with the later insert first. The in memory adapter copies rows on the way in and out and rejects a duplicate id.
- `src/feedback.ts`: `createFeedback({ store, bus, now?, newId? })` returning `submit`, `listMine` and `setStatus`. Everything is injected; there is no module level state.
- `submit` accepts anonymous feedback (`userId` omitted, undefined or null), stores the row with status `new` and emits `feedback.submitted` with `feedbackId` and `kind`. A rejected submit stores nothing and emits nothing.
- `FeedbackValidationError` with a `field` name. Rules: `kind` is a `FeedbackKind`; `message` is trimmed and 1 to 4000 characters, and may be empty only when `kind` is `rating`; `rating` is a whole number 1 to 5 and required when `kind` is `rating`; `page` is at most 300 characters; `context` is a plain object that serialises to at most 8000 characters; `userId` is a non empty string when given.
- `listMine(userId)` returns that user's rows newest first and never returns anonymous rows.
- `setStatus(id, status)` for a later admin view. Returns the updated row, or null for an unknown id.
- `tests/feedback.test.ts`: the acceptance check (anonymous `submit` inserts a row and emits `feedback.submitted`), signed in rows in `listMine`, anonymous rows in nobody's `listMine`, every validation rule with its boundary values, ordering with an injected clock, `setStatus`, and the in memory store.
