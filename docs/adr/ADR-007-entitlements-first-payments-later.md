# ADR-007: Entitlements first, payments later

Status: Accepted
Date: 2026-09-09

## Context

Beta is free. There is no payment provider, no pricing page and no checkout. But several things already need a yes or no answer per user: may this user open the tutor, may they grade another piece of writing today, may they take an exam simulation, may they see levels above B1. Free tier costs on Claude and Supabase depend on those answers being enforced from the first day.

If gating is added later, every page and box that needs it has to be found and changed, and the payment work becomes a cross cutting change instead of one box.

## Decision

`core-entitlements` exists from day one and is the only box that answers "may this user do X". Its API: `can(userId, feature)`, `remaining(userId, limit)`, `consume(userId, limit, amount?)`, `plan(userId)`, `flag(key, userId?)`.

Every user gets a row in `entitlements` with `plan = free_beta`, set from `STUFEN_DEFAULT_PLAN`. Feature keys in beta: `tutor`, `writing_studio`, `speech`, `exam_sim`, `levels_above_b1`. All true for `free_beta`. Limits (`tutor_messages_per_day`, `writing_grades_per_day`, `speech_minutes_per_day`) are stored as jsonb on the row and reset at the user's midnight. `consume` throws when a limit is exhausted, and callers show the learner a plain message.

Payments are an adapter slot. `contracts` defines `PaymentProvider` with `createCheckout` and `handleWebhook`. `core-entitlements` exposes `setPaymentProvider` and does nothing with it in beta. No Stripe package, no webhook route, no price ids anywhere in the repo until the entitlements phase in `docs/07-build-sequence.md`. The `source` column on `entitlements` (`default`, `manual`, `stripe`) already exists so a manual plan grant and a future paid plan write the same row.

Feature flags live in `feature_flags` and are read through the same box so rollout gating and plan gating look identical to callers.

## Consequences

Pages and boxes call `can` and `consume` now. When payments arrive, nothing outside `core-entitlements` changes except a checkout page in `apps/web`.

Cost control is enforced, not hoped for. The daily caps are the free tier protection named in `docs/01-prd.md`.

A plan can be granted by hand (`source = manual`) for testers without any billing code.

The cost is one more call on hot paths. `can` is a single row read per request and can be cached per request in `apps/web`.

Nobody is paid anything until the adapter lands, which is the intent.

## Alternatives considered

No gating until payments exist. Rejected: unbounded Claude spend during beta and a large retrofit later.

Stripe now with a free plan. Rejected: webhook handling, customer records and tax settings for zero revenue, and a dependency the reviewer would have to understand before the product works.

A third party entitlement service. Rejected: one more account and one more vendor for a table with two columns.

Feature flags only, no plans. Rejected: flags answer "is this on", not "how many today for this user".
