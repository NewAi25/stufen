# ADR-003: Content as data packs

Status: Accepted
Date: 2026-09-09

## Context

German is first. Dutch and French follow. Reaching C2 needs thousands of items, hundreds of lessons and six levels of can do descriptors per language. Most of that will be generated offline by a pipeline, reviewed by a person, and revised many times. If lessons were code, every content fix would be a code change and every new language would fork the app.

At the same time, some things about a language are logic, not data: German article and case tables, verb conjugation for regular and listed irregular verbs, lenient normalisation of ß and umlauts, and error classification for cloze feedback. Dutch does not need that exact code.

## Decision

Content is data. Every language lives in `content/<code>/` as JSON: manifest, can do descriptors, items, units with lessons with exercises. Every file validates against the schemas in `content/schema/`. `scripts/validate-content.mjs` runs the schema and referential checks and CI runs it on every push. Every descriptor, grammar point and vocabulary item carries a `source` field. If the source is missing the value is `"unverified"` and the item is flagged for review.

Each language also gets one thin box, `lang-<code>`, that implements the `LanguagePack` interface from `contracts`: `code`, `version`, `loadManifest`, `loadCandos`, `loadItems`, `loadUnits`, `rules`, `immersionRamp`, `examFormats` and `tts`. The `rules` object holds the language logic the graders need. A `lang-*` box has no UI and imports only `contracts`.

`core-content` never imports a `lang-*` box. `apps/web` calls `registerPack(pack)` once at start. `core-content` knows the pack interface, validates it, and installs it into the curriculum tables with `installPack`, recording the version in `content_pack_versions` and emitting `content.pack_installed`.

## Consequences

Adding a language touches `content/<code>/` and `packages/lang-<code>/` and nothing else. If a core box needs a change to support a language, that is a core change with its own commit first.

Content can be regenerated, diffed and reviewed like any data. A content fix is a JSON change plus a pack version bump, not a deploy of new logic.

The schema becomes a contract with the offline generation pipeline (`tools-content-forge`, later). Schema changes are core changes and need care.

The `LanguagePack` interface will grow. Each growth is a `contracts` change, then a change to every `lang-*` box, in separate commits.

## Alternatives considered

Content as TypeScript modules. Rejected: type checking is nice but every content edit becomes a code review, and non engineers cannot touch it.

Content only in the database, edited through an admin UI. Rejected for beta: no history, no diff, no offline validation, and a CMS to build before the first lesson exists. The pack install path leaves room for this later without changing the pack format.

One repo per language, forking the app. Rejected: three copies of every core bug.
