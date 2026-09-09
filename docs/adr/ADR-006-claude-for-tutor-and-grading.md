# ADR-006: Claude for tutor and grading

Status: Accepted
Date: 2026-09-09

## Context

Four features need a language model: the conversation tutor with inline corrections, writing grading against a rubric, on demand grammar and vocabulary explanations, and grading of open exercise types (`translate`, `write_free`, `speak_prompt`) that rules cannot score. Grades feed the CEFR evidence rule, so they must be structured, not prose, and must be logged with the model that produced them.

Model ids change every few months. Cost per call matters on free tiers. The API key must never reach a browser.

## Decision

The Claude API is used through the `@anthropic-ai/sdk` package, and only from `core-ai-tutor`. No other box and no page imports the SDK. All calls are server side.

Model ids are configuration, read from the environment: `STUFEN_TUTOR_MODEL`, `STUFEN_GRADER_MODEL`, `STUFEN_CLASSIFIER_MODEL`. `.env.example` sets the defaults. Swapping to a cheaper model for classification is an env change, not a code change.

The tutor streams. `sendTurn` returns an `AsyncIterable<TutorChunk>` and the final chunk carries the corrections. Adaptive thinking is on for the tutor and grader.

Grades are structured outputs. `gradeWriting` and `aiGrade` ask for a JSON object that matches a schema defined in `core-ai-tutor` and mapped to `WritingGrade` (rubric scores `task`, `coherence`, `vocabulary`, `grammar`, `overall`, each 0 to 5, plus `estimatedLevel`) or `GradeResult` (`correct`, `score`, `feedback`, `errorTypes`). A response that fails schema validation is retried once, then the attempt is recorded as ungraded and surfaced to the learner as such. The grader never silently returns a made up score.

Every call logs `model`, `input_tokens` and `output_tokens` on `tutor_messages` or `writing_submissions`. Daily call limits per user come from `core-entitlements` (`tutor_messages_per_day`, `writing_grades_per_day`), and `core-ai-tutor` calls `consume` before each request.

Prompts and rubrics live in `docs/10-ai-tutor.md` and in `core-ai-tutor/src/prompts/`. Language specific rules reach the grader through `GradeContext.languageRules`, supplied by the `lang-*` pack, so prompts stay language neutral.

## Consequences

One box to audit for cost, safety and prompt changes. Model upgrades are a config diff plus a rerun of the grading fixtures in `core-ai-tutor/tests/`.

Structured outputs make grades checkable. A test can assert that a known B1 text grades within a range. Drift between model versions shows up in that test.

We depend on one provider. The interface (`startConversation`, `sendTurn`, `gradeWriting`, `explain`, `aiGrade`) is provider neutral, so a second adapter is possible later without touching callers.

Latency and cost are real. Streaming hides the first, entitlements bound the second.

## Alternatives considered

A multi provider abstraction from day one. Rejected: speculative, and the box boundary already gives one swap point.

Calling the SDK directly from server actions in `apps/web`. Rejected: prompts and model ids would scatter, and nothing would enforce the entitlement check.

Rule based grading only. Rejected: fine for cloze and multiple choice, useless for free writing and speaking, which is where C1 and C2 evidence comes from.

Self hosting an open weight model. Rejected for beta: infrastructure cost and no operator.
