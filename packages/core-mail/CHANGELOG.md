# Changelog

## [Unreleased]

## [0.1.0] - 2026-11-05

### Added
- `src/console-mail.ts`: `createConsoleMail(options?)`, the console adapter for `MailPort`. `send` validates the message, prints a readable block (a separator line, `To:`, `Subject:`, `Message id:`, a blank line, the text, a separator line) and returns `{ messageId }`. It keeps the most recent messages in memory as `sent`, with `last()` and `clear()`, for tests and for the local magic link flow. Options: `log` (default `console.log`), `newId` (default `console-<counter>-<random hex>`), `now`, `keep` (default 50, the oldest message is dropped first).
- `src/validate.ts`: `validateMessage(message)` throws `MailValidationError` with a `field` of `to`, `subject` or `text`. It rejects a `to` that is not one plausible email address, a subject that is empty, longer than `MAX_SUBJECT_LENGTH` (200) characters or contains a line break (header injection guard), and an empty text.
- `src/index.ts` exports `createConsoleMail`, `validateMessage`, `MailValidationError`, `MAX_SUBJECT_LENGTH`, the types `SentMail`, `ConsoleMail`, `ConsoleMailOptions` and `MailField`, and re exports the `MailPort` and `MailMessage` types from `contracts`.
- `tests/console-mail.test.ts`: the console adapter prints the to, subject and body of one message and returns a message id; `sent` and `last()`; the keep limit drops the oldest; `clear`; every validation rule; two sends produce different ids; an invalid message prints nothing and is not kept.
