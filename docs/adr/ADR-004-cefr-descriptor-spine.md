# ADR-004: CEFR descriptor spine

Status: Accepted
Date: 2026-09-09

## Context

Stufen promises to take a learner from zero to C1 or C2. That promise needs a progress model a learner can trust and an examiner would recognise. The team is engineers, not applied linguists. Inventing a pedagogy, a skill tree or a points system would produce something nobody can check.

The CEFR Companion Volume (Council of Europe, 2020) publishes can do descriptors per level and skill. The Goethe Institut, Profile deutsch and telc publish level content and exam formats for German. These are public, citable and stable.

## Decision

The progress model is the set of CEFR can do descriptors. Six levels, A1 to C2. Skills: reading, listening, spoken production, spoken interaction, writing, mediation. Each descriptor has a stable code `LEVEL.SKILL.NN`, for example `A1.LIS.03`, a text taken from the Companion Volume, and a `source` citation. Grammar and vocabulary are not CEFR skills. They are added as scaffolding descriptors (`GRA`, `VOC`) whose source is the language inventory (Profile deutsch for German), never the Companion Volume, and they are marked as scaffolding in the data.

Every descriptor carries a written evidence rule. The default rule in `core-progress` is: at least 6 evidence attempts, correct in at least 2 distinct exercise types, recent accuracy over the last 10 attempts at least 0.8, and for writing and spoken skills a best production score of at least 3 of 5. A descriptor may override the default in `cando_descriptors.mastery_rule`. A level counts as reached when 80 percent of its descriptors are mastered and the checkpoint assessment for that level scores at least 0.7.

No invented pedagogy. Level targets, descriptor texts and the German grammar sequence come from the cited sources. If a source is missing the item is `source: "unverified"` and shows up in the content validation report.

## Consequences

Progress is explainable. The level map shows which descriptors are mastered and which evidence is missing. A learner who reaches B1 in Stufen can read the same descriptors on the Goethe site.

Every language shares the spine. Only the grammar sequence, vocabulary and exam formats differ, and those live in the content pack.

The evidence rule is a number of attempts, not a judgement. It can be tuned in one place and the tuning is visible in a diff. It is not validated against real exam outcomes and should not be presented as such.

Descriptor mapping is work. Every exercise must name the descriptors it evidences, and content review has to check that mapping.

## Alternatives considered

Points, XP and streak levels as the progress model. Rejected: motivating but meaningless as a claim about ability.

A custom skill tree designed in house. Rejected: nobody on the team can defend it, and it does not map to any exam.

Vocabulary count as the level measure. Rejected: one dimension of many, and a poor proxy for production skills.

AI estimated level from conversation alone. Rejected as the primary model: useful as one evidence source through `writing.graded` and assessments, not as the spine.
