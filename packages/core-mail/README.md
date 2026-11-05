# @stufen/core-mail

## Purpose

Outbound email behind one small port. Sign in links from `core-auth`, and any later digest, go through it. The port, `MailPort`, lives in `contracts`. This box ships the adapters. No other box knows which adapter is in use.

Today there is one adapter: the console adapter, for development and tests. It prints each message to the terminal instead of sending it. The SMTP adapter for production is a Phase 1 row (P1-36) and is not built yet.

**Never use the console adapter in production.** It prints sign in links, so anyone who can read the logs could sign in as the recipient.

Kind: `core`. May import: `contracts`.

## Public API

```ts
// The port lives in contracts (src/ports.ts) and is re exported here.
interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}
interface MailPort {
  send(message: MailMessage): Promise<{ messageId: string }>;
}

// Console adapter, for development and tests.
interface SentMail extends MailMessage {
  messageId: string;
  sentAt: string; // ISO 8601
}
createConsoleMail(options?: {
  log?: (line: string) => void; // default console.log, one line per call
  newId?: () => string;         // default console-<counter>-<random hex>
  now?: () => Date;             // default the system clock
  keep?: number;                // default 50
}): MailPort & {
  readonly sent: readonly SentMail[]; // most recent messages, oldest first
  last(): SentMail | undefined;
  clear(): void;
}

// Validation, shared by every adapter.
validateMessage(message: MailMessage): void // throws MailValidationError
class MailValidationError extends Error {
  field: 'to' | 'subject' | 'text';
}
MAX_SUBJECT_LENGTH // 200
```

Also exported as types: `ConsoleMail` (the return type of `createConsoleMail`), `ConsoleMailOptions` and `MailField`.

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public.

### What `send` does on the console adapter

1. Validates the message. A bad message rejects with `MailValidationError`, prints nothing and is not kept.
2. Prints one block, one line per `log` call:

```
------------------------------------------------------------
To: lerner@example.com
Subject: Dein Anmeldelink
Message id: console-1-9f3a61c2
(a blank line)
(the text, one log call per line)
------------------------------------------------------------
```

3. Keeps the message in `sent` with its `messageId` and `sentAt`. Only the last `keep` messages stay. The oldest is dropped first. `keep: 0` remembers nothing.
4. Returns `{ messageId }`.

The `html` part is kept in `sent` but not printed.

### Validation rules

| Field | Rejected when |
|-------|---------------|
| `to` | Not one plausible email address. Lists, display names such as `Name <a@b.de>`, spaces, line breaks and anything longer than 254 characters are rejected. |
| `subject` | Empty or only white space, longer than 200 characters, or contains a line break. The line break rule stops a caller from adding extra mail headers. |
| `text` | Empty or only white space. |

## Owns tables

None.

## Emits and listens

None.

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-mail/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-mail): message`.

A new adapter, such as SMTP, goes in its own file under `src/`, calls `validateMessage` first and is exported from `src/index.ts`.

## How to test it

```
pnpm --filter @stufen/core-mail test
```

Tests use the console adapter with an injected `log` and assert on the printed lines and on `sent`. They never touch a network. When the SMTP adapter arrives it is tested against a local stub, never a live server.

## Status

See the `core-mail` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
