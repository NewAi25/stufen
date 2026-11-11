# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-06

### Added
- `src/smtp-mail.ts`: `createSmtpMail({ url, from, replyTo?, timeoutMs = 10000, transport? })`, the SMTP adapter for `MailPort` (P1-36), built on nodemailer. `url` is a standard SMTP URL such as `smtp://user:pass@host:587` or `smtps://host:465`. `from` and `replyTo` are one address, plain or with a display name such as `Stufen <no-reply@example.org>`. `send` validates the message with `validateMessage`, sends the text and the optional html as an alternative part, and returns the message id the transport reports. The adapter also has `verify()` (connect and sign in without sending) and `close()`. `transport` lets a test inject a nodemailer transport.
- `src/errors.ts`: `MailDeliveryError` with `retryable`, `responseCode` and `code`. Connection problems, timeouts and 4xx replies are retryable. 5xx replies and wrong settings are not. The message never contains the password from the SMTP URL, and the original error is not attached as a cause. `MailConfigError` for settings that are missing, unknown or not allowed.
- `src/create-mail.ts`: `createMailFromEnv(env, options?)` picks the adapter from `MAIL_DRIVER`. `console`, or no value outside production, gives the console adapter. `smtp` needs `SMTP_URL` and `MAIL_FROM`, takes an optional `MAIL_REPLY_TO`, and gives the SMTP adapter. Any other value, and the console adapter when `NODE_ENV` is `production`, throws `MailConfigError`. Error messages name the variable to fix and never repeat its value.
- `src/smtp-config.ts` (internal): parsing of the sender and the SMTP URL, and redaction of the password.
- `src/index.ts` exports `createSmtpMail`, `createMailFromEnv`, `MailDeliveryError`, `MailConfigError` and the types `SmtpMail`, `SmtpMailOptions`, `SmtpTransport`, `CreateMailOptions` and `MailDeliveryErrorOptions`.
- `tests/smtp-mail.test.ts` with `tests/stub-smtp.ts`: a real SMTP server from the `smtp-server` package on a loopback ephemeral port. One message arrives with the right envelope from, to, subject and body; html is sent as an alternative part; an invalid message never reaches the server; a 550 reply gives `retryable` false; a 451 reply and a closed port give `retryable` true; a refused sign in is not retryable; no error message contains the password.
- `tests/create-mail.test.ts`: every branch of the factory.

### Changed
- `src/validate.ts`: the address rule moved into an internal `isSingleAddress` helper so the SMTP adapter checks its sender by the same rule. `validateMessage` behaves as before.

## [0.1.0] - 2026-11-05

### Added
- `src/console-mail.ts`: `createConsoleMail(options?)`, the console adapter for `MailPort`. `send` validates the message, prints a readable block (a separator line, `To:`, `Subject:`, `Message id:`, a blank line, the text, a separator line) and returns `{ messageId }`. It keeps the most recent messages in memory as `sent`, with `last()` and `clear()`, for tests and for the local magic link flow. Options: `log` (default `console.log`), `newId` (default `console-<counter>-<random hex>`), `now`, `keep` (default 50, the oldest message is dropped first).
- `src/validate.ts`: `validateMessage(message)` throws `MailValidationError` with a `field` of `to`, `subject` or `text`. It rejects a `to` that is not one plausible email address, a subject that is empty, longer than `MAX_SUBJECT_LENGTH` (200) characters or contains a line break (header injection guard), and an empty text.
- `src/index.ts` exports `createConsoleMail`, `validateMessage`, `MailValidationError`, `MAX_SUBJECT_LENGTH`, the types `SentMail`, `ConsoleMail`, `ConsoleMailOptions` and `MailField`, and re exports the `MailPort` and `MailMessage` types from `contracts`.
- `tests/console-mail.test.ts`: the console adapter prints the to, subject and body of one message and returns a message id; `sent` and `last()`; the keep limit drops the oldest; `clear`; every validation rule; two sends produce different ids; an invalid message prints nothing and is not kept.
