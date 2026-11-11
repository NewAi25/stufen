# ADR-009: Own magic link sign in on the AuthStore port

Status: Accepted
Date: 2026-11-11

Changes one part of ADR-008: the production sign in adapter. ADR-008 remains accepted for everything else.

## Context

ADR-008 named the better-auth library as the production adapter behind `AuthPort`, storing users and sessions in our own Postgres.

Phase 0 then built `core-auth` 0.1.0 without any library: a two step magic link flow with one time tokens, session expiry, redirect validation and exactly one `user.signed_up` event per new user, written against a small storage port called `AuthStore` and covered by 44 tests. The only thing that made it "not production" was that the store kept its data in memory.

Wiring better-auth now would mean replacing tested code with a library that brings its own schema naming, its own id generation, its own HTTP handler and cookie handling, all of which have to be bent to fit our tables and our port. The one thing it would add that we do not have is Google sign in.

The owner's goal behind ADR-008 is to depend on as little as possible that she does not control.

## Decision

- The production adapter for magic link sign in is our own code: `createAuth` with a Postgres implementation of `AuthStore` on the tables `users`, `sessions` and `verifications` from migrations 0001 and 0002.
- Session tokens and magic link tokens are stored as SHA-256 hashes. The raw token exists only in the cookie and in the email.
- `createInMemoryAuth` stays for development and tests. `createDevSession` is refused in production.
- The better-auth dependency is removed from `core-auth`.
- Google sign in is not built in phase 1. It becomes its own row. When that row is taken, the choice is between a small OAuth 2 code flow of our own on the same port, or better-auth for that one provider. The `accounts` table from migration 0002 is kept for it.

## Consequences

- One dependency less, and no library owns our session format. Moving hosts or changing the mail provider changes nothing in sign in.
- We own the security of the flow. It is small and the rules are tested: tokens are random 32 byte values, single use, short lived, hashed at rest, and redirects are validated.
- Learners can sign in with email only until the Google row is done.
- If a future need (passkeys, many providers, two factor) outgrows our own code, the `AuthPort` boundary still lets a library be put behind it without touching any other box.

## Alternatives considered

- **Wire better-auth now, as ADR-008 said.** Rejected for phase 1: more moving parts and more adaptation code than the feature it adds, and it would replace code that is already tested.
- **A hosted auth service.** Rejected by ADR-008.
- **Passwords.** Rejected: more to protect, and magic link plus a later Google option covers the beta audience.
