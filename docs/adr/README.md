# Architecture decision records

An ADR records one decision that shapes the codebase. Accepted ADRs are never edited. If a decision changes, write a new ADR that supersedes the old one and set the old status to Superseded with a link.

## Template

Every ADR uses this shape. Keep it between 30 and 60 lines. Be concrete: name the packages, tables, env vars and commands affected.

```markdown
# ADR-NNN: Title

Status: Proposed | Accepted | Superseded by ADR-NNN
Date: YYYY-MM-DD

## Context

What situation forces a decision. Facts, constraints, numbers.

## Decision

What we chose, in one or two sentences, then the specifics.

## Consequences

What gets easier. What gets harder. What we now have to do.

## Alternatives considered

Each alternative and the reason it lost.
```

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-001](ADR-001-modular-monolith-boxes.md) | Modular monolith with boxes | Accepted | 2026-09-09 |
| [ADR-002](ADR-002-nextjs-supabase-vercel.md) | Next.js, Supabase and Vercel | Accepted | 2026-09-09 |
| [ADR-003](ADR-003-content-as-data-packs.md) | Content as data packs | Accepted | 2026-09-09 |
| [ADR-004](ADR-004-cefr-descriptor-spine.md) | CEFR descriptor spine | Accepted | 2026-09-09 |
| [ADR-005](ADR-005-fsrs-for-spaced-repetition.md) | FSRS for spaced repetition | Accepted | 2026-09-09 |
| [ADR-006](ADR-006-claude-for-tutor-and-grading.md) | Claude for tutor and grading | Accepted | 2026-09-09 |
| [ADR-007](ADR-007-entitlements-first-payments-later.md) | Entitlements first, payments later | Accepted | 2026-09-09 |
| [ADR-008](ADR-008-provider-independence.md) | Provider independence | Accepted | 2026-09-09 |
| [ADR-009](ADR-009-own-magic-link-auth.md) | Own magic link sign in on the AuthStore port | Accepted | 2026-11-11 |

## Adding an ADR

1. Copy the template into `docs/adr/ADR-NNN-short-title.md` with the next free number.
2. Fill every section. Do not skip Alternatives considered.
3. Add a row to the index table above in the same commit.
4. Commit as `docs(adr): add ADR-NNN short title`.
