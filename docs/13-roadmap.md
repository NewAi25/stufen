# 13. Roadmap

Planning assumptions: one owner working part time, about 10 hours a week, with AI assistance for code and content generation. Content generation is the slow part from Phase 4 on. Dates are targets, not promises. The build sequence in `docs/07` is the plan; this document puts calendar time against it.

## Timeline

| Phase | Scope | Start | End | Weeks | Tag | Main risk to the date |
|-------|-------|-------|-----|-------|-----|------------------------|
| 0 | Foundation: tooling, contracts, auth, feedback, entitlements, analytics | 2026-09-09 | 2026-09-22 | 2 | `v0.1.0` | Docker and auth library setup friction |
| 1 | German A1 vertical slice: curriculum, content install, lesson engine, SRS, progress, A1 pack | 2026-09-23 | 2026-10-27 | 5 | `v0.2.0` | A1 content authoring, about 60 lessons |
| 2 | AI tutor, writing studio, AI graded exercises, review sheet | 2026-10-28 | 2026-11-17 | 3 | `v0.3.0` | Correction accuracy below 90 percent on the hand check |
| 3 | Speech, A2 pack, placement, immersion ramp | 2026-11-18 | 2026-12-15 | 4 | `v0.4.0` | Web Speech API quality in non Chrome browsers |
| 4 | B1 and B2 packs, checkpoints, level reached rule, beta measures | 2026-12-16 | 2027-02-09 | 8, includes a two week holiday gap | `v0.5.0` | About 190 lessons of content plus B level rules |
| 5a | C1 and C2 packs, exam simulation, PWA, accessibility, RLS audit | 2027-02-10 | 2027-04-06 | 8 | `v0.9.0` | C level content volume; C2 shape decision |
| 5b | Public beta hardening, fixes from feedback | 2027-04-07 | 2027-05-04 | 4 | `v1.0.0` | Feedback volume larger than fix capacity |
| 6 | Dutch pack | 2027-05-05 | 2027-06-08 | 5 | `v1.1.0` | Dutch rule coverage in `lang-nl`; source access for NT2 formats |
| 7 | French pack | 2027-06-09 | 2027-07-13 | 5 | `v1.2.0` | French agreement rules in `classifyError` |
| 8 | Entitlements and payments on | 2027-07-14 | 2027-08-03 | 3 | `v1.3.0` | Stripe account and tax setup outside code |

Notes on realism:

- Phases 0 to 3 are mostly code. Ten hours a week with AI assistance is enough if every task stays inside one box.
- Phases 4 and 5a are mostly content. Each lesson needs 8 to 14 exercises with citations. Generation is fast, review is not. The plan assumes a generation script inside `scripts/` from Phase 4 and a sample review of 10 percent of lessons per level. If review reveals a higher error rate, each of those phases stretches by two to four weeks.
- Phase 5a may be split: ship `v0.9.0` with C1 only and add C2 during 5b if the C2 ADR chooses the "C1 plus register work" shape.
- Phases 6 and 7 are shorter than the German build because the code exists. They are content plus one thin box each.

## Language expansion

| Order | Language | Box | Pack | Exam formats | Rules the `lang-` box must supply | Sources for descriptors and word lists |
|-------|----------|-----|------|--------------|-----------------------------------|----------------------------------------|
| 1 | German | `lang-de` | `content/de` | Goethe Zertifikat A1 to C2, telc Deutsch A1 to C1 | Article and case tables, noun gender, conjugation with irregulars, `normalize` for ß and umlauts, `classifyError` | CEFR Companion Volume, Goethe level syllabi, Profile deutsch, Tschirner and Jones frequency dictionary |
| 2 | Dutch | `lang-nl` | `content/nl` | CNaVT, Staatsexamen NT2 programme I and II | `de` and `het` gender, plural patterns, `t kofschip` past tense, separable verbs, word order with inversion, `classifyError` | CEFR Companion Volume, Referentiekader NT2, Basiswoordenlijst NT2, frequency lists from the Corpus Gesproken Nederlands |
| 3 | French | `lang-fr` | `content/fr` | DELF A1 to B2, DALF C1 and C2 | Gender and agreement, verb groups and irregulars, `normalize` for accents and elision, `classifyError` with agreement and tense types | CEFR Companion Volume, Référentiel pour le français (Beacco), Niveaux pour le français, Lonsdale and Le Bras frequency dictionary |
| 4 | Spanish | `lang-es` | `content/es` | DELE A1 to C2, SIELE | Gender and agreement, ser and estar, subjunctive triggers, pronoun placement, `classifyError` | CEFR Companion Volume, Plan curricular del Instituto Cervantes, Davies frequency dictionary |
| 5 | Italian | `lang-it` | `content/it` | CILS, CELI A1 to C2 | Gender and agreement, article forms, auxiliary choice, subjunctive, `classifyError` | CEFR Companion Volume, Profilo della lingua italiana, Lessico di frequenza dell'italiano parlato |

Each language needs, in order: the `contracts` `LanguageCode` literal if not already present, the `lang-` box with rules and exam formats, then the pack level by level with sources cited per item, then one registration line in `apps/web`. If a core box needs a change to support a language, that change lands first in its own commit and is a sign the core was too German shaped.

Spanish and Italian are candidates, not commitments. They start only after v1.3.0 and only if Dutch and French shipped with zero core changes, which proves the pack model.

## Monetisation path

Now: free beta. Every user is on `free_beta` with all features and generous daily limits. No payment code exists.

After v1.0.0 and when `docs/01` beta measures are met: `docs/12` plans go live in Phase 8. `free` keeps A1 to B1 and limited tutor use, `plus` unlocks all levels and higher tutor limits, `pro` adds exam simulation volume and writing grades. Prices are set in the Phase 8 ADR, not before.

No beta user loses a feature on the day plans switch on. They are migrated to a named plan that matches what they had, for a stated period.

## Feedback loop for beta testers

Feedback enters through the in app fab and lands in the `feedback` table with `kind`, `page`, `message`, `rating`, `context` and `status`. This is how a feedback row becomes a build sequence row.

| Step | Who | What happens | Where recorded |
|------|-----|--------------|----------------|
| 1 Capture | Tester | Submits in under 30 seconds. Anonymous allowed | `feedback` row, `status: new` |
| 2 Triage, weekly | Owner | Reads new rows. Sets `seen`. Merges duplicates by noting the earlier row id in `context` | `feedback.status` |
| 3 Decide | Owner | Each row becomes one of: `planned` (will do), `wontfix` (with a one line reason), or stays `seen` (needs more reports) | `feedback.status` |
| 4 Box it | Owner | For each `planned` row, name the single box it belongs to. If it spans two boxes, split into two rows | New row in `docs/07` with the feedback id in the work item text |
| 5 Sequence | Owner | The new row gets the next free ID in the current phase, dependencies, an acceptance check that restates the tester's complaint as a pass condition, and status `planned` or `next` | `docs/07` main table |
| 6 Ship | Owner | Commit `fix(<box>): <feedback id> short title` or `feat(...)`. Row goes to `done`. Sequence log row added | `docs/07`, box `CHANGELOG.md` |
| 7 Close | Owner | `feedback.status` set to `done`. If the tester left an email, one line reply | `feedback.status` |

Rules: a feedback row is never worked on without a `docs/07` row. Three separate reports of the same thing make it `planned` automatically. A rating of 1 or 2 on a page is triaged the same week. The beta report script (P4-13) prints counts per status so the loop is visible.

## Risks and what would change the plan

| Risk | Signal | Change to the plan |
|------|--------|--------------------|
| Content review finds a high error rate in generated lessons | More than 20 percent of sampled lessons need an edit | Stop generating. Add a review step per unit in `docs/07`. Phases 4 and 5a stretch. Consider `core-admin` unparked for a review UI |
| AI correction accuracy stays under 90 percent | Phase 2 hand check fails twice | Hold v0.3.0. Rework prompts and rubric anchors in `docs/10`. Try a stronger model as a config change before any code change |
| Web Speech API is unusable outside Chrome | Speaking exercises fail for more than a third of testers | Unpark the hosted speech provider. It is one adapter file in `core-speech`. Add it as a Phase 3 row |
| Hosted Postgres or web host free tier limits hit | Events or Claude calls throttled | Event sampling (P4-12) moves earlier. Daily limits in `core-entitlements` are lowered as a config change |
| Owner time drops below 10 hours a week | Two consecutive phases slip by more than half | Cut scope, not quality. Ship v1.0.0 with A1 to B2 and gate C levels behind a checkpoint. C levels move to 1.x |
| Testers do not reach A1 completion | Fewer than 3 zero start testers complete A1 by v0.5.0 | Pause new content. Spend one phase on the daily loop, retention and the level map. Consider unparking `core-notifications` |
| C2 shape is unclear | The C2 ADR cannot be decided with the data available | Ship v0.9.0 with C1. C2 becomes register and mediation work on C1 content until real C1 learners exist |
| A core box needs a change for Dutch | Any `core-*` commit appears in Phase 6 | Stop. Write an ADR on why the core was German shaped. Fix the core before continuing the pack. Phase 6 stretches by that amount |
| Name and domain | Stufen is a working title | No effect on code. The name is a string in `apps/web` and `ui-kit` tokens. Decide before v0.9.0 public beta |
