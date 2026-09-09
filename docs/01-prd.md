# 01. Product requirements

Version 0.1. Owner: Manisha Sarkar. Status: accepted for Phase 0 to 5.

## One line

Stufen takes a person who knows no German at all to C1 or C2, with a checkable record of what they can do at every step, in a single web app.

## Problem

Popular apps get people to A2 and stall. Textbooks and courses get people to B2 with a teacher. Almost nothing carries a self learner to C1 or C2, and nothing shows the learner, in CEFR terms, exactly what they have proven they can do. Learners who need German for work or a residence permit need the exam level, not a streak.

## Who it is for

| Persona | Need | What success looks like |
|---------|------|-------------------------|
| Complete beginner | Wants to start today with zero words, in English UI | Speaks and writes simple sentences within two weeks, reaches A1 in the app within 8 to 12 weeks of daily use |
| Restarter | Did school German, forgot most, wants B1 or B2 for a move | Placement test lands them at the right level in 15 minutes, no repeated beginner content |
| Exam candidate | Needs Goethe or telc B2, C1 or C2 | Exam simulation with the real format and honest scores before booking |
| Beta tester (now) | Friends and community trying it for free | Can reach and use every feature, leaves feedback inside the app in under 30 seconds |

## Goals for beta (v1.0)

1. A learner with zero German can complete the A1 path end to end: reading, listening, writing and speaking.
2. Every level A1 to C2 has a content path, a checkpoint test and a mastery record per can do statement.
3. An AI tutor corrects writing and holds spoken or typed conversation at the learner's level.
4. Feedback from testers is captured in the app and lands in one table.
5. Adding Dutch or French is a content pack plus one thin language box, with no core changes.
6. Payments are designed but switched off. Every user is on `free_beta`.

## Not in scope for beta

- Native mobile apps. The web app is responsive and installable as a PWA.
- Human tutors, community or social features.
- Certification. The app reports an estimated level, never an official one.
- Offline mode.
- Any language other than German content. Dutch and French packs come after v1.0.

## Core experience

**Daily loop.** Open the app. See three things: reviews due, the next lesson, and the tutor. Finish in 15 to 25 minutes. See what moved on the level map.

**Lesson.** 8 to 14 exercises mixing the four skills, ending with one production task (a sentence to write or say). New words and grammar chunks from the lesson enter the spaced repetition queue.

**Review.** Spaced repetition on vocabulary and grammar chunks using FSRS, with sentences rather than isolated words wherever possible.

**Tutor.** Text or voice conversation at the learner's level. Corrections are shown after each learner turn, marked by category (article, case, word order, spelling, register). Writing studio takes longer texts and grades them on a CEFR rubric with line by line feedback.

**Level map.** The A1 to C2 ladder. Each level lists its can do statements. Each statement shows evidence: how many correct attempts, in which exercise types, and the best production score. Mastery is computed from rules that are written down, not from a feeling.

**Assessment.** Placement test at start. Checkpoint test at the end of each level. Exam simulation at B1 and above matching Goethe and telc formats.

## Pedagogical spine

The CEFR Companion Volume (Council of Europe, 2020) gives the can do descriptors per level and skill. German level content follows the Goethe Institut level syllabi and Profile deutsch inventories. Grammar order is the one used in mainstream German coursebooks and the Goethe descriptions. Sources are cited inside the content pack. See `docs/05-curriculum-spine.md`.

The app does not invent pedagogy. It sequences published descriptors, generates practice against them, and records evidence.

## Immersion ramp

The interface language starts in English at A1 with German everywhere the learner can cope. By B1 instructions are in German with English on hover. By C1 the interface is fully German. This is a per level setting in the content pack, not hard coded.

## Success measures for beta

| Measure | Target | Where measured |
|---------|--------|----------------|
| Testers who complete first lesson | 80 percent of sign ups | `events` table |
| Day 7 return | 40 percent | `events` table |
| Feedback items per active tester | at least 1 | `feedback` table |
| A1 completion by a zero start tester | at least 3 testers | `level_estimates` table |
| Tutor correction accuracy (sample of 50, hand checked) | 90 percent | manual review sheet |
| Writing grade agreement with a human rater (sample of 30) | Spearman r above 0.7 | manual review sheet |

## Moat

Most language apps are gamified vocabulary. Stufen's difference is structural and checkable: a CEFR descriptor spine with evidence per descriptor, AI graded production at every level, exam format simulation, and a content pack format that makes new languages data rather than rewrites. The moat is the spine plus the grading, not any single lesson.

## Risks

| Risk | Mitigation |
|------|------------|
| Content volume for C1 and C2 is huge | Content forge pipeline: generate from descriptors with Claude, validate against schema, human review sample. Ship A1 to B1 first and gate higher levels behind checkpoint |
| AI grading is wrong or inconsistent | Rubric with anchors, low effort deterministic settings, sampled human check, learner can flag a grade |
| Speech recognition quality in browser varies | Web Speech API first, adapter interface for a hosted provider later |
| Free tier limits on Supabase and Vercel | Event sampling, small audio, Claude calls capped per user per day via entitlements |
| Learners game mastery | Mastery needs evidence across two or more exercise types and one production sample |

## Open questions

- Name. Stufen is a working title.
- Whether C2 gets its own content or is C1 content plus harder production tasks and register work. Decide after B2 ships.
- Which speech provider to adopt after beta.
