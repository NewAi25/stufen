# @stufen/core-mail

## Purpose

Outbound email behind one small port. Sign in links from `core-auth`, and any later digest, go through it. The port, `MailPort`, lives in `contracts`. This box ships the adapters. No other box knows which adapter is in use.

There are two adapters. The console adapter is for development and tests. It prints each message to the terminal instead of sending it. The SMTP adapter is for production. It sends through any SMTP server given as a URL. `createMailFromEnv` picks one of the two from the environment.

**Never use the console adapter in production.** It prints sign in links, so anyone who can read the logs could sign in as the recipient. `createMailFromEnv` refuses to return it when `NODE_ENV` is `production`.

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

// SMTP adapter, for production.
createSmtpMail(options: {
  url: string;        // smtp://user:pass@host:587 or smtps://host:465
  from: string;       // no-reply@example.org or "Stufen <no-reply@example.org>"
  replyTo?: string;   // same two forms; default no Reply-To header
  timeoutMs?: number; // default 10000
  transport?: SmtpTransport; // a nodemailer transport, for tests
}): MailPort & {
  verify(): Promise<void>; // connect and sign in without sending
  close(): Promise<void>;
}
class MailDeliveryError extends Error {
  retryable: boolean;                // true: sending again later may work
  responseCode: number | undefined;  // the SMTP reply code, for example 550
  code: string | undefined;          // the transport code, for example ECONNECTION
}

// Factory: the adapter the environment asks for.
createMailFromEnv(
  env: Record<string, string | undefined>, // pass process.env
  options?: {
    console?: ConsoleMailOptions;
    smtp?: { timeoutMs?: number; transport?: SmtpTransport };
  },
): MailPort // throws MailConfigError
class MailConfigError extends Error {}

// Validation, shared by every adapter.
validateMessage(message: MailMessage): void // throws MailValidationError
class MailValidationError extends Error {
  field: 'to' | 'subject' | 'text';
}
MAX_SUBJECT_LENGTH // 200
```

Also exported as types: `ConsoleMail` (the return type of `createConsoleMail`), `ConsoleMailOptions`, `SmtpMail` (the return type of `createSmtpMail`), `SmtpMailOptions`, `SmtpTransport` (the three nodemailer methods the adapter uses: `sendMail`, `verify`, `close`), `CreateMailOptions`, `MailDeliveryErrorOptions` and `MailField`.

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

### What `send` does on the SMTP adapter

1. Validates the message, by the same rules as the console adapter. A bad message rejects with `MailValidationError` and nothing is sent to the server.
2. Sends one message through nodemailer: `from`, `to`, `subject`, the text, the html as an alternative part when there is one, and `Reply-To` when `replyTo` was given.
3. Returns `{ messageId }`, the message id the transport reports.

When the server cannot be reached or refuses the message, `send` rejects with `MailDeliveryError`. `verify` fails the same way.

| What happened | `retryable` |
|---------------|-------------|
| Connection refused, closed or timed out | `true` |
| The server replied 4xx, for example 451 | `true` |
| The server replied 5xx, for example 550 unknown recipient or 535 wrong password | `false` |
| The settings are wrong and no reply came back (transport codes `ECONFIG`, `ENOAUTH`, `EENVELOPE`, `EOAUTH2`) | `false` |

The error message never contains the password from the SMTP URL, and the original nodemailer error is not attached as a cause. A caller may log a `MailDeliveryError` as it is.

`createSmtpMail` itself throws `MailConfigError` when `url` is not an `smtp://` or `smtps://` URL, when `from` or `replyTo` is not one address, or when `timeoutMs` is not above 0. It does not connect until `send` or `verify` is called.

### Environment variables

`createMailFromEnv(process.env)` reads these. Values are trimmed, and a blank value counts as not set.

| Variable | Meaning |
|----------|---------|
| `MAIL_DRIVER` | `console` or `smtp`. When it is not set, the console adapter is used outside production. |
| `SMTP_URL` | Needed for `smtp`. For example `smtp://user:pass@host:587` or `smtps://host:465`. Percent encode special characters in the user name and password. |
| `MAIL_FROM` | Needed for `smtp`. The sender, for example `Stufen <no-reply@example.org>`. |
| `MAIL_REPLY_TO` | Optional, for `smtp`. Where replies go. |
| `NODE_ENV` | When it is `production`, the console adapter is refused. |

| `MAIL_DRIVER` | `NODE_ENV` | Result |
|---------------|------------|--------|
| not set or `console` | not `production` | Console adapter |
| not set or `console` | `production` | `MailConfigError` |
| `smtp` | any | SMTP adapter, or `MailConfigError` when `SMTP_URL` or `MAIL_FROM` is missing or not valid |
| anything else | any | `MailConfigError` |

Error messages name the variable to fix and never repeat its value.

### Choosing an SMTP provider

Any provider that gives you an SMTP host, a port, a user name and a password works. Put them into `SMTP_URL` and nothing in the code changes (ADR-008). Use `smtps://` for a port with TLS from the first byte, usually 465. Use `smtp://` for a port that upgrades with STARTTLS, usually 587. Set `MAIL_FROM` to an address on a domain the provider has verified for you, or the provider will refuse the message or mail will land in spam. For local development, a catch all mail server in Docker such as Mailpit works the same way: `SMTP_URL=smtp://localhost:1025`.

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

A new adapter goes in its own file under `src/`, calls `validateMessage` first, is exported from `src/index.ts` and gets its own `MAIL_DRIVER` value in `src/create-mail.ts`.

## How to test it

```
pnpm --filter @stufen/core-mail test
```

| Test file | What it proves |
|-----------|----------------|
| `tests/console-mail.test.ts` | The console adapter, with an injected `log`, and every validation rule. |
| `tests/smtp-mail.test.ts` | The SMTP adapter against a real SMTP server that the test starts on this machine (`tests/stub-smtp.ts`, built on the `smtp-server` package, loopback only, an ephemeral port, no TLS). Delivery, the html part, validation, 550, 451, a closed port, a refused sign in, and that no error contains the password. |
| `tests/create-mail.test.ts` | Every branch of `createMailFromEnv`. |

No test touches a live mail server or an account. Nothing leaves the machine.

## Status

See the `core-mail` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
