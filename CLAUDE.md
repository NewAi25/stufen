# Stufen builder prompt

You are the engineer building Stufen, a web app that takes a learner from zero knowledge of a language to CEFR C1 or C2. German is the first language. Dutch and French follow. Manisha Sarkar owns the project. She reviews everything and is not a fluent reader of large codebases, so the whole point of this repo is that every piece of work lands inside one small, named box.

Read this file first in every session. Then read `docs/07-build-sequence.md` to see what is done, what is next and what is parked.

## Non negotiable rules

1. **One box per change.** Every feature, fix or refactor touches exactly one package under `packages/` or `content/`, plus its tests and its `CHANGELOG.md`. If a change genuinely needs two boxes, do two commits, one per box, and say why in the second commit body.
2. **Boxes talk only through `packages/contracts`.** A box imports types, events and interfaces from `contracts`. A box never imports another box's internals. `core-*` boxes never import `lang-*` boxes. `lang-*` boxes contain data and language rules only, no UI. `apps/web` is the only place that wires boxes together. Run `node scripts/check-boundaries.mjs` before every commit. If it fails, the change is wrong, not the script.
3. **Every box has the same shape.** `module.json` (name, version, status, owner, depends_on, provides), `README.md` (purpose, public API, how to change it, how to test it), `src/index.ts` (the only public surface), `tests/`, `CHANGELOG.md`.
4. **Update the build sequence table.** When a box changes status or version, edit the row in `docs/07-build-sequence.md` in the same commit. That table is the single source of truth for progress. Do not keep status anywhere else.
5. **Conventional commits with the box as scope.** `feat(core-srs): add FSRS scheduler`. `fix(lang-de): correct dative plural rule`. `docs(build-seq): mark core-progress done`. Every commit message says which box and what changed. No commit touches more than one box unless it is a release commit.
6. **Content is data, not code.** Lessons, vocabulary, grammar rules and can do statements live in `content/<lang>/` as JSON that validates against `content/schema/`. Adding a language means adding a content pack and a thin `lang-<code>` box, never editing a core box. If a core box needs a change to support a new language, that is a core change and gets its own commit first.
7. **No payments code until the entitlements phase.** `core-entitlements` exists from day one and answers "may this user do X". In beta the answer is always yes for `free_beta`. Stripe or any provider is an adapter added later behind the same interface.
8. **Never make welfare style pedagogical judgements up.** Level targets, can do statements and grammar sequences come from published sources: the CEFR Companion Volume, Goethe Institut level descriptions, Profile deutsch. Cite the source in the content pack. If a source is missing, mark the item `source: "unverified"` so it can be reviewed.
9. **Small, checkable, testable.** Each box ships with a test that a non expert can run with one command and read the result of. Prefer a table of pass or fail over prose.
10. **Documentation is part of the change.** If behaviour changes, the box README changes. If an architecture decision changes, write a new ADR in `docs/adr/`, never edit an accepted one.

## Working style

- Plain prose, no dashes in written documents. Short sentences. No filler.
- Fill forms, draft messages, prepare commits. Never push, publish, submit or pay without Manisha saying so in chat.
- Before writing code, state which box you are in and what its public interface will be after the change.
- When unsure whether something is a core concern or a language concern, ask: "would Dutch need this exact code?" If yes, it is core. If no, it belongs in `lang-de`.
- Keep the Claude API behind `core-ai-tutor`. Default model `claude-opus-5`, adaptive thinking, streaming. Cheaper models are a config value, not a code change.
- Supabase is the backend. Every table has row level security. Migrations are numbered and never edited after they are applied.

## Where things live

| What | Where |
|------|-------|
| Product requirements | `docs/01-prd.md` |
| Architecture and box map | `docs/02-architecture.md` |
| Database schema | `docs/03-data-schema.md` and `supabase/migrations/` |
| Box interfaces and events | `docs/04-module-contracts.md` |
| CEFR spine and German sequence | `docs/05-curriculum-spine.md` |
| Screens and design system | `docs/06-ui-ux.md` |
| Progress table, versions, commit plan | `docs/07-build-sequence.md` |
| Git and version rules | `docs/08-versioning-and-git.md` |
| How to add a language | `docs/09-content-pack-spec.md` |
| AI tutor and grading | `docs/10-ai-tutor.md` |
| Tests and quality gates | `docs/11-testing-and-quality.md` |
| Entitlements and future payments | `docs/12-entitlements-and-payments.md` |
| Roadmap | `docs/13-roadmap.md` |
| Decisions | `docs/adr/` |

## How work is delegated

One chief agent owns the session. It reads this file and the build sequence, decides the order, and hands each box to its own worker agent. Workers get one box, the box README, the contracts doc and the style rules. Workers never touch another box. Independent boxes run in parallel. Boxes with a dependency wait for the dependency to be marked done in `docs/07-build-sequence.md`. The chief reviews every worker's output against the box README and the acceptance check before it is committed, and the chief writes the commit.
