# Changelog

## [Unreleased]

## [0.1.0] - 2026-11-05

### Added
- `src/store.ts`: the `AuthStore` storage port for users, sessions and link tokens (`createUserIfAbsent`, `findUserById`, `markEmailVerified`, `insertSession`, `findSession`, `deleteSession`, `insertLinkToken`, `findLinkToken`, `markLinkTokenUsed`), the record types `AuthUser`, `AuthSessionRecord` and `AuthLinkToken`, and `createInMemoryAuthStore()`. The Postgres and better-auth adapter implements the same port in Phase 1.
- `src/auth.ts`: `createInMemoryAuth(options)`, an in memory implementation of `AuthPort` from `contracts` with no auth library. `requestMagicLink` stores a one time token and sends one mail through the injected `MailPort`. `consumeMagicLink` returns null for unknown, expired or used tokens, otherwise finds or creates the user, marks the email verified and returns a session. `getSession` returns null for missing, unknown or expired tokens. `signOut` is safe to call twice. `signInWithGoogle` returns a placeholder URL until better-auth arrives. Extra for development: `createDevSession(email, name?)`.
- `AuthError` with codes `invalid_email` and `invalid_redirect`. Emails are trimmed and lower cased. `redirectTo` must be a path starting with `/` or an absolute `http` or `https` URL.
- Emits `user.signed_up` once per new user when an `EventBus` is passed in.
- Injectable clock, token generator, id generator, session lifetime (default 30 days), link lifetime (default 15 minutes) and app name. No module level state.
- `tests/auth.test.ts`: the P0-25 acceptance check plus mail content, one time tokens, link and session expiry, sign out, email normalisation, `user.signed_up` exactly once per new user, invalid email and invalid redirect, and `createDevSession`.
