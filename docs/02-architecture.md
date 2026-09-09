# 02. Architecture

## The box model

Stufen is a modular monolith. One deployable web app, one database, many boxes. A box is a package with a single job, a public interface, its own tests and its own changelog. Boxes never reach into each other. They share types and events through one package called `contracts`. The web app is the only place that composes boxes.

This is what makes a change small. Fixing a bug in review scheduling touches `core-srs` and nothing else. Adding a new exercise type touches `core-exercise-types` and nothing else. Adding Dutch adds `content/nl` and `lang-nl` and nothing else.

## Three kinds of box

| Kind | Prefix | Knows about | Never knows about |
|------|--------|-------------|-------------------|
| Core | `core-` | contracts, Supabase, its own tables | any language, any UI |
| Language | `lang-` | contracts, its content pack | UI, other languages, core internals |
| Surface | `apps/web`, `ui-kit` | contracts, every box's public API | box internals, database tables |

## Dependency rules

```
apps/web  ->  core-*, lang-*, ui-kit, contracts
core-*    ->  contracts, supabase client
lang-*    ->  contracts
ui-kit    ->  contracts
contracts ->  nothing
```

Enforced by `scripts/check-boundaries.mjs`, which reads every `module.json` and fails if an import crosses a line. Run it before every commit. CI runs it on every push.

## Box map

```mermaid
flowchart TB
  subgraph Surface
    WEB[apps/web]
    UI[ui-kit]
  end
  subgraph Core
    ID[core-identity]
    CUR[core-curriculum]
    CON[core-content]
    LES[core-lesson-engine]
    EX[core-exercise-types]
    SRS[core-srs]
    PRO[core-progress]
    ASS[core-assessment]
    AI[core-ai-tutor]
    SP[core-speech]
    FB[core-feedback]
    AN[core-analytics]
    ENT[core-entitlements]
  end
  subgraph Language
    DE[lang-de]
    NL[lang-nl]
    FR[lang-fr]
  end
  CT[contracts]
  DB[(Supabase)]
  LLM[Claude API]

  WEB --> UI
  WEB --> ID
  WEB --> LES
  WEB --> AI
  WEB --> ENT
  Core --> CT
  Language --> CT
  UI --> CT
  CON --> DE
  CON --> NL
  CON --> FR
  Core --> DB
  AI --> LLM
```

One exception to "core never knows a language": `core-content` loads language packs through a registry. It knows the pack interface, not any pack's contents.

## What each box does

| Box | Job | Owns tables | Emits events |
|-----|-----|-------------|--------------|
| `contracts` | Types, event names, interfaces. No logic | none | none |
| `core-identity` | Sign in, profile, settings, target language | `profiles`, `learner_languages` | `user.signed_up`, `user.language_set` |
| `core-curriculum` | The CEFR spine. Levels, can do descriptors, units, lessons as a graph | `cefr_levels`, `cando_descriptors`, `units`, `lessons` | none |
| `core-content` | Loads and validates content packs, installs them into the curriculum tables, tracks pack versions | `content_pack_versions`, `exercises`, `items` | `content.pack_installed` |
| `core-lesson-engine` | Runs a lesson session, orders exercises, records attempts | `lesson_sessions`, `attempts` | `attempt.recorded`, `lesson.completed` |
| `core-exercise-types` | Registry of exercise types. Each type has a renderer contract, a grader and a schema | none | none |
| `core-srs` | FSRS scheduling for items, review queue, review logging | `review_cards`, `review_logs` | `item.reviewed` |
| `core-progress` | Mastery per can do, level estimate, streaks | `cando_mastery`, `level_estimates`, `streaks` | `cando.mastered`, `level.reached` |
| `core-assessment` | Placement, checkpoints, exam simulation | `assessments` | `assessment.completed` |
| `core-ai-tutor` | Claude adapter: conversation, correction, writing rubric, explanations | `tutor_conversations`, `tutor_messages`, `writing_submissions` | `writing.graded`, `tutor.turn` |
| `core-speech` | Speech to text and text to speech behind one interface | `speech_recordings` | `speech.transcribed` |
| `core-feedback` | In app feedback capture | `feedback` | `feedback.submitted` |
| `core-analytics` | Event sink, subscribes to every event, writes `events` | `events` | none |
| `core-entitlements` | May this user do X. Plans, limits, feature flags. Payment adapter slot | `entitlements`, `feature_flags` | `entitlement.changed` |
| `lang-de` | German rules: article and case tables, verb conjugation helpers, tokenizer config, exam formats, TTS voice, immersion ramp | none | none |
| `ui-kit` | Design tokens and components | none | none |
| `apps/web` | Routes, pages, wiring, server actions | none | none |

Later boxes, already named so their slot exists: `core-notifications` (reminders), `core-admin` (content preview and review), `tools-content-forge` (generation pipeline, runs offline, not part of the app).

## Events

Boxes decouple through an in process typed event bus defined in `contracts`. A box emits. Any box may subscribe. Nobody calls another box's function to tell it something happened.

Example chain when a learner answers an exercise:

```
core-lesson-engine  emits  attempt.recorded {user, exercise, correct, score, cando_ids, item_ids}
core-srs            hears  attempt.recorded  and updates review_cards for item_ids
core-progress       hears  attempt.recorded  and updates cando_mastery, may emit cando.mastered
core-analytics      hears  everything        and writes an events row
```

Events are fire and forget inside one request. If a subscriber needs durability it writes its own table. There is no queue in beta. If one is needed later, the bus gets a Supabase backed adapter and no box changes.

## Request flow

```mermaid
sequenceDiagram
  participant B as Browser
  participant W as apps/web (server)
  participant L as core-lesson-engine
  participant X as core-exercise-types
  participant S as core-srs
  participant P as core-progress
  participant DB as Supabase

  B->>W: submit answer
  W->>L: recordAttempt(sessionId, exerciseId, response)
  L->>X: grade(exercise, response)
  X-->>L: correct, score, feedback
  L->>DB: insert attempts
  L-->>W: emit attempt.recorded
  W->>S: on attempt.recorded
  S->>DB: upsert review_cards
  W->>P: on attempt.recorded
  P->>DB: upsert cando_mastery
  W-->>B: result and next exercise
```

## Runtime

| Layer | Choice | Why |
|-------|--------|-----|
| Web | Next.js (App Router), TypeScript, Tailwind | One codebase, server actions, easy Vercel deploy |
| Data | Supabase Postgres with row level security | Free tier, auth included, MCP tooling already connected |
| Auth | Supabase Auth, email magic link plus Google | No passwords to manage |
| Files | Supabase Storage for audio | Same platform |
| AI | Claude API via `@anthropic-ai/sdk`, server side only | Tutor, grading, content generation |
| SRS | `ts-fsrs` | Maintained FSRS implementation |
| Speech | Web Speech API now, adapter for a provider later | Zero cost to start |
| Tests | Vitest for boxes, Playwright for flows | Fast, standard |
| Monorepo | pnpm workspaces | Simple, no extra build tool needed |
| Hosting | Vercel | Free tier, previews per branch |

## Repository layout

```
packages/
  contracts/
  core-identity/
  core-curriculum/
  core-content/
  core-lesson-engine/
  core-exercise-types/
  core-srs/
  core-progress/
  core-assessment/
  core-ai-tutor/
  core-speech/
  core-feedback/
  core-analytics/
  core-entitlements/
  lang-de/
  ui-kit/
apps/
  web/
content/
  schema/
  de/
supabase/
  migrations/
scripts/
docs/
```

Every box has this shape:

```
packages/<box>/
  module.json      name, version, status, owner, depends_on, provides
  README.md        purpose, public API, how to change, how to test
  CHANGELOG.md
  src/index.ts     the only public surface
  src/...
  tests/
```

## How a change happens

1. Find the box in `docs/07-build-sequence.md`.
2. Read its README. Note the public API.
3. Change the box. Keep the public API unless the change is the API. If the API changes, bump the box minor version and update every caller in `apps/web` in a separate commit.
4. Run the box tests and `check-boundaries`.
5. Update the box CHANGELOG and the build sequence row.
6. Commit with `type(box): message`.

## What stays common across languages

Everything under `core-`, `ui-kit`, `contracts` and `apps/web`. A language adds only a content pack and a `lang-` box. The `lang-` box is small: rules the grader needs (for example German noun gender and case endings for cloze feedback), exam formats, voice configuration, and the immersion ramp settings.
