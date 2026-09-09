# ADR-001: Modular monolith with boxes

Status: Accepted
Date: 2026-09-09

## Context

Stufen is built by one engineer with a reviewer, Manisha Sarkar, who owns the product but does not read large codebases fluently. Every change has to be reviewable as one small unit with a clear name. The product has thirteen distinct concerns (identity, curriculum, content, lesson engine, exercise types, SRS, progress, assessment, AI tutor, speech, feedback, analytics, entitlements) plus per language rules and a UI layer. Those concerns talk to each other often inside a single request: one submitted answer touches grading, attempts, review cards and mastery.

Hosting is free tier Vercel and Supabase. There is no budget for an orchestrator, a queue or several deployables, and no operations person to watch them.

## Decision

Stufen is a modular monolith. One deployable Next.js app, one Postgres database, and many boxes under `packages/`. A box is a pnpm workspace package with `module.json`, `README.md`, `CHANGELOG.md`, `src/index.ts` as its only public surface, and `tests/`.

Boxes share types, event names and interfaces only through `packages/contracts`. A box never imports another box. Boxes react to each other through an in process typed event bus defined in `contracts`. `apps/web` is the only place that composes boxes and subscribes handlers to the bus.

The rule is mechanical. `scripts/check-boundaries.mjs` reads every `module.json`, derives the allowed import set from `depends_on` and the structural rules (`contracts` imports nothing, `core-*` and `lang-*` and `ui-kit` import only `contracts`, surfaces import anything), and fails the build on any cross box import or any deep import past a box's index. CI runs it on every push.

## Consequences

A change lands in one box. Fixing review scheduling touches `core-srs` and its changelog and nothing else. Adding Dutch adds `content/nl` and `lang-nl` and nothing else. Reviewing a commit means reading one directory.

Boxes are testable in isolation with Vitest because their only inputs are `contracts` types and a Supabase client. Events are fire and forget inside one request, so there is no queue to run in beta. If durability is ever needed the bus gets a Supabase backed adapter and no box changes.

The cost is discipline. Nothing stops a developer from copying code between boxes except the boundary check and review. There is no independent scaling of a hot box, which does not matter at beta scale. Cross box refactors take two commits, one per box, by rule.

## Alternatives considered

Microservices. One service per concern with HTTP or a queue between them. Rejected: thirteen deployables on free tiers is not viable, a single answer submission would cross four network hops, and the operational load falls on one person.

A single flat app. Everything under `apps/web/lib`. Rejected: this is how small apps become unreviewable. Nothing enforces which file may call which, and the reviewer cannot find the edge of a change.

Generic shared libraries in a Turborepo or Nx workspace without the contracts rule. Rejected: the tooling is fine but the value is in the rule, not the tool. pnpm workspaces plus one script is enough and adds no build system to learn.
