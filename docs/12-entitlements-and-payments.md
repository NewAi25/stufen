# 12. Entitlements and payments

Owner: Manisha Sarkar. Box: `core-entitlements`. Status: entitlements accepted for beta; payments are a proposal and are not active.

## Purpose

`core-entitlements` answers two questions and nothing else: may this user do X, and how much of Y is left today. Every route that costs money or unlocks something asks this box first.

In beta every user is on the plan `free_beta`. Every feature is true. Limits are generous. No payment code runs. There is no Stripe key in any environment. The `PaymentProvider` interface exists so the slot is there, and the slot is empty.

The box owns two tables from `docs/03`: `entitlements` (one row per user) and `feature_flags`. It reads nothing else. Level gates get the level from the caller.

Public API, from `docs/04`:

```ts
can(userId, feature: FeatureKey): Promise<boolean>
remaining(userId, limit: LimitKey): Promise<number>     // resets at the user's midnight
consume(userId, limit: LimitKey, amount?): Promise<void> // throws LimitExhausted
plan(userId): Promise<Entitlement>
flag(key: string, userId?, ctx?: { level?: CefrLevel }): Promise<boolean>
setPaymentProvider(p: PaymentProvider): void
```

The optional `ctx` on `flag` is the one addition to `docs/04`. It lands in `docs/04` in the same commit that implements it.

`FeatureKey` in beta: `tutor`, `writing_studio`, `speech`, `exam_sim`, `levels_above_b1`. `LimitKey`: `tutor_messages_per_day`, `writing_grades_per_day`, `speech_minutes_per_day`.

### How a user gets a row

On `user.signed_up` the box inserts an `entitlements` row with `plan` from `STUFEN_DEFAULT_PLAN` (`free_beta`), `source: default`, empty `features` and `limits` overrides, `expires_at: null`. If a user has no row (a sign up that raced the event), `can()` and `remaining()` treat them as the default plan and insert the row on first call.

### How a daily count works

Counts are not stored in `entitlements`. `remaining()` counts today's rows in the table that records the thing: `tutor_messages` where `role = user` for tutor messages, `writing_submissions` for grades, `speech_recordings` duration for minutes. "Today" is the user's local day from `profiles.timezone`. This means the count is always right, survives a crash between check and write, and needs no reset job. The box reads those tables through a single database view `daily_usage(user_id, day)` that it owns, so no box internal is crossed.

`consume()` is then a check, not a write: it recomputes remaining and throws `LimitExhausted` if the amount is not available. The calling route writes the real row afterward. The name stays `consume` so the intent in the route reads clearly.

## Plans

Proposal. Not active. Only `free_beta` exists in the database during beta. Prices are placeholders to make the shape concrete and will be set later.

| Plan | Price (placeholder) | tutor | writing_studio | speech | exam_sim | levels_above_b1 | tutor messages per day | writing grades per day | speech minutes per day |
|------|---------------------|-------|----------------|--------|----------|-----------------|------------------------|------------------------|------------------------|
| `free_beta` | free, invited | yes | yes | yes | yes | yes | 200 | 20 | 60 |
| `free` | free | yes | yes | yes | no | no | 10 | 1 | 5 |
| `plus` | about 9 EUR a month | yes | yes | yes | yes | yes | 100 | 10 | 30 |
| `pro` | about 19 EUR a month | yes | yes | yes | yes | yes | 400 | 40 | 120 |

Why these shapes: `free` is enough to feel the product and reach A2. `plus` covers a daily learner comfortably at a cost that is well under the price, see the cost table in `docs/10`. `pro` is for exam candidates doing long writing every day. `free_beta` sits above `plus` so no tester ever feels a wall.

Plan definitions are a constant in the box, `src/plans.ts`. The `entitlements.features` and `entitlements.limits` columns hold per user overrides only, applied on top of the plan. An empty object means "the plan as defined".

## PaymentProvider interface

The slot in `contracts`:

```ts
interface PaymentProvider {
  createCheckout(input: { userId: string; plan: 'plus' | 'pro'; successUrl: string; cancelUrl: string })
    : Promise<{ url: string }>;
  createPortalSession(input: { userId: string; returnUrl: string })
    : Promise<{ url: string }>;
  handleWebhook(rawBody: string, signature: string)
    : Promise<{ eventId: string; handled: boolean; change?: EntitlementChange }>;
}
```

`EntitlementChange` is `{ userId, plan, expiresAt: Date | null }`. The box applies it and emits `entitlement.changed`. The provider never writes to the database. It translates the outside world into one small object and the box does the rest.

In beta `setPaymentProvider` is never called and `createCheckout` on the null provider throws `PaymentsDisabled`. The `/api/webhooks/payments` route does not exist until the adapter ships.

### Stripe adapter plan (later)

Lives in `packages/core-entitlements/src/providers/stripe.ts`. Nothing outside the box knows Stripe exists.

| Piece | Plan |
|-------|------|
| Products | one Stripe product per paid plan, one price each, monthly. Price ids in env: `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO` |
| Customer link | Stripe customer id stored in `entitlements.provider_customer_id`, a nullable column added by a later migration. Metadata on the Stripe customer holds our `user_id` so the webhook can map back |
| Checkout | Stripe Checkout in subscription mode. We never see card data |
| Portal | Stripe Customer Portal for cancel, upgrade, card change. We build no billing screens |
| Webhook | one endpoint, signature verified with `STRIPE_WEBHOOK_SECRET` before the body is parsed |

Webhook events that change entitlements:

| Stripe event | What the box does |
|--------------|-------------------|
| `checkout.session.completed` | set `plan` to the purchased plan, `source: stripe`, `expires_at` to the period end |
| `customer.subscription.updated` | apply the new plan or the new period end; a cancel at period end keeps the plan and sets `expires_at` |
| `customer.subscription.deleted` | set `plan: free`, `source: stripe`, `expires_at: null` |
| `invoice.paid` | extend `expires_at` to the new period end |
| `invoice.payment_failed` | no entitlement change on the first failure; log it. Stripe retries. The subscription events above carry the final outcome |

All other events are acknowledged with 200 and ignored.

Idempotency. Stripe delivers events at least once and out of order. The box keeps a table `payment_events(event_id text primary key, type, received_at, applied boolean)`, added by the same later migration. The handler inserts the event id first; a duplicate key means the event was already seen, so the handler returns 200 and does nothing. For ordering, every subscription event carries the subscription's current state, and the handler applies that whole state rather than a delta, so a late arriving older event cannot regress a newer one because the handler also compares the event `created` timestamp with `entitlements.updated_at` and skips older ones.

The hand editing rule. Rows with `source = stripe` are never edited by hand, not in a database client, not by a script. The next webhook would overwrite the edit and the user would lose whatever was granted. To change a paying user's plan, change it in Stripe and let the webhook do it. To give someone a free upgrade that Stripe does not know about, set `source = manual` and the plan you want; the webhook handler skips rows with `source = manual` and logs them for review. The database test suite has a test that a `manual` row survives a subscription event.

## Feature flags

`feature_flags` has `key`, `enabled`, `rules` jsonb. `flag(key, userId?, ctx?)` evaluates in this order and stops at the first decision:

| Order | Rule | Result |
|-------|------|--------|
| 1 | `enabled` is false | false |
| 2 | `rules.deny` contains the user id | false |
| 3 | `rules.allow` contains the user id | true |
| 4 | `rules.plans` is set and the user's plan is not in it | false |
| 5 | `rules.min_level` is set and `ctx.level` is below it or missing | false |
| 6 | `rules.percent` is set and `hash(key + userId) mod 100 >= percent` | false |
| 7 | nothing above decided | true |

The hash is a stable 32 bit hash of the string, so a user is either in or out of a rollout and stays that way when the percent grows. With no `userId` only steps 1 and 7 apply, which is what a public page needs.

Examples:

| Key | Rules | Meaning |
|-----|-------|---------|
| `voice_tutor` | `{ "percent": 20 }` | on for a fixed fifth of users |
| `content_b2` | `{ "allow": ["7f1c...", "a9e3..."] }` | on for two testers only |
| `exam_sim_c1` | `{ "min_level": "B2" }` | on when the caller passes a level of B2 or above |
| `new_review_screen` | `{ "percent": 50, "deny": ["7f1c..."] }` | half of users, but never this one |
| `payments_enabled` | `{}` with `enabled: false` | the master switch for the paid phase, see below |
| `dutch_pack` | `{ "plans": ["pro"], "percent": 100 }` | pro users only |

Flags are for rollout and kill switches. They are not for plan features; those are in the plan table. A flag that stays at 100 percent for a month is removed and the code path becomes the only path.

## Enforcement points

The rule: `apps/web` calls the box in the route or server action, before any box that does the work. Core boxes never call `core-entitlements` themselves.

| Route or action | `can()` | `remaining()` before | `consume()` after success | Flag |
|-----------------|---------|----------------------|---------------------------|------|
| `/tutor` page load | `tutor` | `tutor_messages_per_day` shown in the header | | |
| `sendTurn` action | `tutor` | `tutor_messages_per_day` | `tutor_messages_per_day`, 1 | |
| `explain` action | `tutor` | `tutor_messages_per_day` | `tutor_messages_per_day`, 1 | |
| `/write` page load and `gradeWriting` action | `writing_studio` | `writing_grades_per_day` | `writing_grades_per_day`, 1 | |
| `speak_prompt` exercise and tutor voice input | `speech` | `speech_minutes_per_day` | `speech_minutes_per_day`, recording length rounded up | `voice_tutor` for the tutor case |
| `/assess/exam_sim` | `exam_sim` | | | `exam_sim_c1` with level |
| `/lesson/[id]` for a B2 or higher lesson, level map beyond B1 | `levels_above_b1` | | | |
| `/onboarding` | none; shows `plan()` so the tester sees they are on `free_beta` | | | |
| `/settings` | none; shows `plan()` and today's remaining counts | | | |

`aiGrade` inside a lesson is not limited. It is bounded by the number of exercises in a lesson and is cheap, see `docs/10`.

### What the learner sees

When `can()` is false the page renders a short card instead of the feature. In beta this should never happen; if it does it is a bug and the card says so and shows the feedback button.

When `remaining()` is zero the action button is disabled and the card below it shows, in the language the immersion ramp gives for the level:

| Case | German | English (A1 and A2 also see this) |
|------|--------|-----------------------------------|
| Tutor limit | Du hast heute {{n}} Nachrichten mit dem Tutor geschrieben. Morgen ab {{time}} geht es weiter. | You have sent {{n}} tutor messages today. It resets tomorrow at {{time}}. |
| Writing limit | Du hast heute {{n}} Texte bewerten lassen. Morgen ab {{time}} geht es weiter. | You have had {{n}} texts graded today. It resets tomorrow at {{time}}. |
| Speech limit | Deine Sprechzeit für heute ist aufgebraucht. Du kannst weiter tippen. | Your speaking time for today is used up. You can keep typing. |

`{{time}}` is the user's local midnight. During beta a second line reads "Beta: if you hit this limit, tell us with the feedback button. We want to know." There is no upgrade button in beta. Nothing in the beta UI mentions plans or prices.

When `consume()` throws because a race let two requests through, the route returns the same card and the request that lost does nothing.

## Migration from beta to paid

The switch is one flag and one table. Nothing else in the schema or the code changes on the day.

Before the day:

1. Stripe adapter merged behind `payments_enabled: false`. Webhook route deployed but ignoring events until the flag is on. Migration adding `provider_customer_id` and `payment_events` applied.
2. Plan table reviewed and prices set. Terms and a privacy update published on the site.
3. Every `free_beta` user gets an email 14 days before: what changes, the grace period, and the founding offer if there is one.
4. A banner in the app from the same day shows the date and a link to the plans page, which is read only until the switch.

On the day:

| Step | Action | Where |
|------|--------|-------|
| 1 | Set `payments_enabled` to `enabled: true` | `feature_flags` |
| 2 | One SQL update: every row with `plan = free_beta` and `source = default` gets `expires_at = switch day + 60 days` | `entitlements` |
| 3 | Plans page becomes live; checkout works | `apps/web`, reads the flag |
| 4 | Watch the webhook log for the first hour | app logs, `payment_events` |

After the day, existing `free_beta` users keep every feature and every limit for 60 days of grace. The banner shows days left. On expiry the read path handles it: when `plan()` finds `free_beta` with `expires_at` in the past it returns the `free` plan and writes the row as `plan: free, source: default, expires_at: null`, emitting `entitlement.changed`. No nightly job is needed. Anyone who subscribed during the grace period got a webhook that already set `source: stripe`, so the expiry rule never touches them.

Data that changes: rows in `entitlements` (the `expires_at` update and later plan changes), one row in `feature_flags`, and the new `payment_events` table filling up. No learner data, progress, content or attempt row changes. A learner who drops to `free` keeps everything they earned. They lose access to features, not to their history.

If the switch goes wrong, set `payments_enabled` back to false. Checkout stops. The webhook route ignores events again. Rows already written by Stripe stay as they are, since those users paid. The `expires_at` update is reversed by one SQL statement that is written and tested before the day.

## Privacy and data

### What personal data exists

| Data | Table or place | Why we have it |
|------|----------------|----------------|
| Email, auth identities, sessions | `users`, `accounts`, `sessions` (owned by `core-auth`) | sign in |
| Display name, timezone, UI locale | `profiles` | show a name, compute the local day |
| Everything the learner wrote to the tutor | `tutor_messages.content` | the conversation and its corrections |
| Writing submissions | `writing_submissions.text` | grading and history |
| Voice recordings and transcripts | `speech_recordings`, files behind `core-storage` | speaking exercises |
| Feedback messages | `feedback` | product improvement, may be anonymous |
| Attempts, reviews, mastery, level estimates | learner tables | the evidence record |
| Usage events | `events` | product metrics |
| Stripe customer id (later) | `entitlements.provider_customer_id` | link to billing |

What goes to the Claude API: the learner's first name, their level, and the text they wrote for the tutor or the writing studio. Never email, user id, surname, or anything from the `core-auth` tables. Anthropic's retention terms apply to what is sent. The privacy page says this in one sentence.

What goes to Stripe (later): email and the plan. Card data goes from the learner's browser to Stripe and never touches us.

### Deletion request

A learner asks in the app (`/settings`, "delete my account") or by email. The procedure, done within 30 days and in practice the same day:

1. Confirm the request came from the account holder: the in app button requires a fresh magic link; an email request gets a reply asking them to use the button, or, if they cannot sign in, a confirmation from the same email address.
2. Run `scripts/delete-user.mjs <user_id>`. It refuses to run without `--confirm` and prints the counts it is about to delete.
3. The script first lists `speech_recordings.storage_path` for the user and deletes those files through `core-storage`, because file storage has no foreign key.
4. The script sets `user_id` to null on `feedback` and `events` rows for the user. Feedback stays as anonymous product data; the message is kept, the link to the person is not.
5. The script deletes the row in `users`, the table owned by `core-auth`. Every learner table has `user_id references users(id) on delete cascade` (checked by an integration test), so profiles, sessions, accounts, entitlements, attempts, reviews, mastery, tutor conversations and messages, writing submissions, speech recordings and assessments all go in one statement.
6. Later, if a Stripe customer exists, the script cancels the subscription and calls the Stripe customer delete endpoint.
7. The script prints a table of table name and rows deleted. That table is the record of the deletion, stored in the owner's private log, not in the database.

Backups: whichever Postgres host is in use keeps the rows for its backup window. The privacy page says deleted data can persist in backups for up to 30 days, and the deployment must be configured so that is true.

### Export

A learner can ask for their data. `scripts/export-user.mjs <user_id>` writes one zip with a JSON file per table holding that user's rows, the audio files fetched through `core-storage`, and a `README.txt` that names each file in plain words. It is sent to the account email by the owner. In a later phase this becomes a button in `/settings` that produces the same zip.
