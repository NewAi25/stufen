# ADR-005: FSRS for spaced repetition

Status: Accepted
Date: 2026-09-09

## Context

Review is a core loop. Vocabulary and grammar chunks introduced in lessons need to come back at the right interval, and the queue must stay manageable when a learner is working through thousands of items on the way to C1. The scheduler lives in `core-srs` and stores its state in `review_cards` (`stability`, `difficulty`, `due`, `last_review`, `reps`, `lapses`, `state`) and its history in `review_logs`.

The classic option is SM-2, the algorithm Anki used for years. FSRS (Free Spaced Repetition Scheduler) is the newer model built on a large review dataset. It predicts recall probability from stability and difficulty and schedules to a target retention. Anki adopted it as an option in 2023. `ts-fsrs` is a maintained TypeScript implementation under the MIT licence.

## Decision

`core-srs` uses `ts-fsrs`. The library is the only place the scheduling maths lives, and it is wrapped so that nothing outside `core-srs` sees its types. The public API stays as in `docs/04-module-contracts.md`: `dueQueue`, `review`, `introduceItems`, `stats`.

Ratings are the four FSRS grades, 1 to 4 (again, hard, good, easy), carried on the `item.reviewed` event. Default FSRS parameters and a target retention of 0.9 to start. Parameters are a config value in `core-srs`, not a code change. Per learner parameter optimisation is out of scope for beta and would be added inside `core-srs` later using `review_logs`.

Items introduced by a lesson enter the queue through `introduceItems`. `core-srs` also listens to `attempt.recorded` so that a lesson attempt on an item counts as a review without the learner rating it by hand.

## Consequences

Better calibrated intervals than SM-2 for the same number of reviews, which matters most at B2 and above where the item count is large.

The `review_cards` schema is shaped by FSRS state. Changing scheduler later means a migration of that table, contained in `core-srs`.

A dependency on a third party library that the team does not control. Mitigated by the wrapper and by the fact that FSRS is a published algorithm with several implementations.

`review_logs` gives us the data to optimise parameters later and to check whether the scheduler is actually working, which a non expert can read as a retention number.

## Alternatives considered

SM-2. Rejected: simple to write but known to over schedule easy items and under schedule hard ones. No retention target.

A custom Leitner box scheme. Rejected: easy to explain, poor at scale, no per item difficulty.

Writing FSRS by hand from the paper. Rejected: reimplementing published maths to save a small dependency is where bugs come from.

Anki style plugin model with swappable schedulers. Rejected for beta: the wrapper already gives us one swap point and we do not need two schedulers.
