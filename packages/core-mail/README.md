# @stufen/core-mail

## Purpose

Outbound email behind one small port. Verification and password reset mail from `core-auth`, and any later digest, go through it. Two adapters: console for development and tests, and SMTP for production. No other box knows which one is in use.

Kind: `core`. May import: `contracts`.

## Public API

```ts
interface MailPort {
  send(message: { to: string; subject: string; text: string; html?: string }): Promise<void>
}

consoleMail(): MailPort
smtpMail(config: { host: string; port: number; user: string; password: string; from: string }): MailPort
```

Source of truth: `docs/04-module-contracts.md`. If a signature is not there, it is not public. The `docs/04` entry for this box is still to be written.

## Owns tables

None.

## Emits and listens

None.

## How to change it

1. Read this README and the box section of `docs/04-module-contracts.md`. State the public interface after the change before writing code.
2. Change only files under `packages/core-mail/`. If `contracts` must change, do that in its own commit first.
3. Add or update tests in `tests/`, update `CHANGELOG.md`, run `node scripts/check-boundaries.mjs`, and update this box's row in `docs/07-build-sequence.md` in the same commit. Commit as `type(core-mail): message`.

## How to test it

```
pnpm --filter @stufen/core-mail test
```

Tests use the console adapter and assert on what would have been sent. The SMTP adapter is tested with a stubbed transport, never a live server.

## Status

See the `core-mail` row in [docs/07-build-sequence.md](../../docs/07-build-sequence.md).
