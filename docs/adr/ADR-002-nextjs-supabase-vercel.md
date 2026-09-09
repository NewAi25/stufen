# ADR-002: Next.js, Supabase and Vercel

Status: Accepted
Date: 2026-09-09

## Context

Beta must run at zero hosting cost. The app needs authentication, a relational database with per user access control, file storage for learner audio, server side code that can hold the Anthropic API key, and preview deployments so the reviewer can click through a change before it merges.

The development environment already has Supabase MCP tooling connected, so schema inspection, migration application and row queries can be done from the same session that writes the code. That is a real productivity gain for a one person team.

## Decision

Web: Next.js with the App Router, TypeScript and Tailwind. Server actions carry every call from a page into a box, so browsers never talk to boxes or to Supabase tables directly except through row level security.

Data: Supabase Postgres. Every table has row level security. Migrations live in `supabase/migrations/` as numbered SQL files and are never edited once applied. The service role key is used only inside server code, for `installPack` and for analytics writes.

Auth: Supabase Auth with email magic link and Google. No passwords stored by us.

Files: Supabase Storage for speech recordings.

Hosting: Vercel, with a preview deployment per branch. Environment variables follow `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and the `STUFEN_*` model and plan settings.

Monorepo: pnpm workspaces, `packages/*` and `apps/*`. No extra build orchestrator.

## Consequences

Everything is on free tiers during beta. Free tier limits (database size, bandwidth, serverless execution time) are a real constraint, so analytics events are sampled and Claude calls are capped per user per day by `core-entitlements`.

Row level security is the security model. Each core box owns its tables and writes the policies for them in the migration that creates them. A missing policy is a bug, not a default.

We are tied to two vendors. Postgres itself is portable and the Supabase client is wrapped inside each box, so a move would touch every core box once but not the contracts or the web app.

Next.js server actions make the request flow in `docs/02-architecture.md` natural: page calls action, action calls one box, box emits, subscribers run in the same request.

## Alternatives considered

Remix or SvelteKit on Fly.io with a managed Postgres. Rejected: no free tier that includes auth and storage, and no MCP tooling already wired up.

Firebase. Rejected: document model fits the CEFR spine and mastery tables badly, and security rules are harder to review than SQL policies.

Self hosted Postgres and a VPS. Rejected: costs money and needs an operator.

Separate API server (Express or Hono) plus a static front end. Rejected: two deployables for no gain when server actions already give a server boundary.
