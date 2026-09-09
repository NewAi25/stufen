# 05. Curriculum spine

The spine is the same for every language: six CEFR levels, each with a set of can do descriptors per skill, each descriptor with an evidence rule. What differs per language is the grammar sequence, the vocabulary and the exam formats. Those live in the content pack.

Sources. Descriptors: Council of Europe, CEFR Companion Volume (2020). German level content: Goethe Institut level descriptions and exam specifications for Goethe Zertifikat A1 to C2, Profile deutsch (Glaboniat et al.) inventories, and the telc Deutsch exam handbooks. Vocabulary sizes: the ranges commonly cited for the Goethe word lists and Profile deutsch. All figures below are approximate targets for planning. The content pack cites the exact source per item.

## Level targets

| Level | Learner can (summary) | Active vocabulary target | Guided hours (Goethe guidance, approximate) | Stufen path length |
|-------|-----------------------|--------------------------|---------------------------------------------|--------------------|
| A1 | Introduce self, ask and answer simple personal questions, understand slow clear speech on familiar matters | 600 to 700 | 80 to 200 | 8 units, about 60 lessons |
| A2 | Handle routine exchanges, describe background, immediate environment and needs | 1300 | 200 to 350 | 8 units, about 70 lessons |
| B1 | Deal with most travel situations, describe experiences and plans, give reasons and explanations | 2400 | 350 to 650 | 10 units, about 90 lessons |
| B2 | Understand complex texts on concrete and abstract topics, interact fluently, produce detailed text and argue a view | 4000 | 600 to 800 | 10 units, about 100 lessons |
| C1 | Understand demanding long texts and implicit meaning, express fluently and spontaneously, use language flexibly for academic and professional purposes | 6000 to 8000 | 800 to 1000 | 10 units, about 100 lessons |
| C2 | Understand virtually everything, summarise from different sources, express with precision and nuance in complex situations | 10000 plus | 1000 plus | 8 units, about 80 lessons plus register and style work |

## Skills and descriptor codes

Every descriptor has a stable code `LEVEL.SKILL.NN`, for example `A1.LIS.03`. Skill codes: `REA` reading, `LIS` listening, `SPP` spoken production, `SPI` spoken interaction, `WRI` writing, `MED` mediation, `GRA` grammar, `VOC` vocabulary. Grammar and vocabulary are not CEFR skills. They are added as scaffolding descriptors so evidence can be tracked at the level of "uses the dative after these prepositions". Their source is the language specific inventory, not the Companion Volume.

Descriptor counts per level in the German pack, planned:

| Level | REA | LIS | SPP | SPI | WRI | MED | GRA | VOC | Total |
|-------|-----|-----|-----|-----|-----|-----|-----|-----|-------|
| A1 | 5 | 5 | 4 | 5 | 4 | 2 | 12 | 8 | 45 |
| A2 | 6 | 6 | 5 | 6 | 5 | 3 | 14 | 8 | 53 |
| B1 | 7 | 7 | 6 | 7 | 6 | 4 | 14 | 10 | 61 |
| B2 | 7 | 7 | 6 | 7 | 6 | 5 | 12 | 10 | 60 |
| C1 | 7 | 7 | 6 | 7 | 6 | 5 | 10 | 10 | 58 |
| C2 | 6 | 6 | 5 | 6 | 6 | 5 | 6 | 8 | 48 |

## Evidence rule

Default rule, from `docs/04-module-contracts.md`: six or more attempts, correct in at least two exercise types, at least 80 percent accuracy over the last ten attempts, and for production skills a best AI graded sample scoring 3 or more out of 5. A descriptor may override this in its `mastery_rule` field, for example C2 writing descriptors require 4 of 5.

Level reached when 80 percent of the level's descriptors are mastered and the checkpoint scores at least 70 percent. This is the app's estimate. It is not a certificate.

## German grammar sequence

The order below follows the common coursebook and Goethe progression. Each row becomes one or more `GRA` descriptors in the pack.

### A1

1. Personal pronouns, `sein` and `haben` present tense
2. Regular verb present tense, verbs with stem change (`sprechen`, `fahren`)
3. Statement, yes or no question and W question word order, verb second
4. Nouns with gender, definite and indefinite article, nominative
5. Plural forms (main patterns)
6. Accusative of articles and pronouns, `es gibt`
7. Negation with `nicht` and `kein`
8. Possessive articles nominative and accusative
9. Modal verbs `können`, `möchten`, `müssen`, `wollen`, sentence bracket
10. Separable verbs
11. Perfect tense with `haben` and `sein`, common participles
12. Prepositions with accusative and with dative (fixed lists), time expressions, numbers, dates, clock

### A2

1. Dative of articles, pronouns and possessives, verbs with dative
2. Two way prepositions (`Wechselpräpositionen`)
3. `Präteritum` of `sein`, `haben` and modal verbs
4. Comparative and superlative
5. Subordinate clauses with `weil`, `dass`, `wenn`, `ob`; verb final
6. Reflexive verbs with accusative and dative
7. Imperative
8. Adjective endings after definite and indefinite articles (nominative, accusative, dative)
9. `Konjunktiv II` with `würde`, `hätte`, `wäre`, `könnte` for polite requests and wishes
10. Conjunctions `denn`, `aber`, `oder`, `sondern`, `deshalb`, `trotzdem`
11. Verbs with prepositions (first set)
12. Indefinite pronouns, `man`, `jemand`, `niemand`, `etwas`, `nichts`
13. Ordinal numbers, dates in full
14. Future with present tense plus time marker

### B1

1. Genitive case and genitive prepositions
2. Relative clauses in all cases with and without prepositions
3. Passive voice present and `Präteritum`, passive with modals
4. `Konjunktiv II` full forms for common verbs, unreal conditions
5. `Plusquamperfekt` and `nachdem`, `bevor`, `während`, `seit`, `bis`
6. `Präteritum` of regular and common irregular verbs for narration
7. Infinitive clauses with `zu`, `um zu`, `ohne zu`, `anstatt zu`
8. Indirect questions
9. Adjective declension complete, adjectives as nouns
10. `Futur I` for prediction and intention
11. N declension (`der Junge`, `der Student`)
12. Two part connectors `nicht nur sondern auch`, `entweder oder`, `weder noch`, `sowohl als auch`, `je desto`
13. Verbs with prepositions (second set) and prepositional adverbs `darauf`, `worauf`
14. Word order with two objects and with `nicht`

### B2

1. `Konjunktiv I` and indirect speech
2. Passive in all tenses, `Zustandspassiv`, passive alternatives (`lassen sich`, `sein zu`, `-bar`)
3. Participle constructions as attributes, extended attributes (`Partizipialattribute`)
4. Nominalisation and verbalisation (`Nominalstil` to `Verbalstil`)
5. `Futur II` and modal verbs for assumption (`Er muss krank sein`, `Sie dürfte recht haben`)
6. Subjective use of modals in the past
7. Connectors for concession, cause, purpose, condition, in both conjunction and preposition form (`obwohl` and `trotz`, `weil` and `wegen`)
8. Relative clauses with `wer`, `was`, `wo`
9. `Konjunktiv II` past, hypothetical comparison with `als ob`
10. Functional verb constructions (`Funktionsverbgefüge`), first set
11. Word formation: prefixes, suffixes, compound nouns
12. Register: formal letters, reports, complaints

### C1

1. Complex sentence architecture: multiple subordination, fronting for emphasis, `Ausklammerung`
2. Full `Funktionsverbgefüge` inventory for academic and business German
3. Nominal style in academic and legal texts, reading and producing
4. Modal particles (`doch`, `ja`, `mal`, `eben`, `halt`, `schon`) in spoken register
5. Discourse markers and cohesion across paragraphs
6. Idioms and collocations, first thousand
7. Reported speech in extended texts with tense and mood shifts
8. Precision in prepositions and verb valency for low frequency verbs
9. Text types: essay, summary, commentary, presentation, formal negotiation
10. Regional and stylistic variation awareness (Austrian and Swiss standard)

### C2

1. Style shifting on demand: literary, journalistic, bureaucratic, colloquial
2. Rhetorical devices, irony, understatement
3. Rare morphology and archaic forms met in literature and law
4. Dialect and sociolect recognition (not production)
5. Full mediation: summarising and reformulating across registers and from other languages
6. Near native error patterns: article and gender slips in rare nouns, aspect like nuance with `Perfekt` versus `Präteritum` in writing

## Vocabulary sources per level

| Level | Source for the word list | Selection rule |
|-------|--------------------------|----------------|
| A1 to B1 | Goethe Zertifikat word lists, Profile deutsch | Take the published list, order by frequency, group by unit theme |
| B2 to C1 | Frequency dictionaries (for example Tschirner and Jones, A Frequency Dictionary of German) plus topic lists from exam specifications | Fill from frequency rank up to the target, weight by exam topic areas |
| C2 | Corpus derived (DWDS, DeReKo frequency classes), literature and press | Low frequency, high register value words and collocations |

## Unit structure per level

A unit has a theme (for example "Im Restaurant"), 6 to 10 lessons, and ends with a production lesson and a review lesson. Themes across levels follow the Goethe topic areas: personal identification, home, daily life, free time, travel, relationships, health, education, shopping, food, services, places, language, weather, and at B2 and above: work, media, politics and society, science, culture, environment, economy.

Lesson pattern:

1. Warm up: 2 review exercises from due items
2. Input: a short text or audio at level, 1 to 2 comprehension exercises
3. Focus: the new grammar or vocabulary, 3 to 5 controlled exercises
4. Use: 2 to 3 freer exercises, translation or ordering
5. Produce: 1 writing or speaking task, AI graded
6. Items introduced are pushed to the review queue

## Exam alignment

| Level | Goethe format | telc format | Sections simulated |
|-------|---------------|-------------|--------------------|
| A1 | Goethe Zertifikat A1 Start Deutsch 1 | telc Deutsch A1 | Hören, Lesen, Schreiben, Sprechen |
| A2 | Goethe Zertifikat A2 | telc Deutsch A2 | same |
| B1 | Goethe Zertifikat B1 | telc Deutsch B1 | same, modular scoring |
| B2 | Goethe Zertifikat B2 | telc Deutsch B2 | same |
| C1 | Goethe Zertifikat C1 | telc Deutsch C1 Hochschule | same plus Sprachbausteine |
| C2 | Goethe Zertifikat C2 GDS | none | four modules |

Exam formats are described in `lang-de` as data: section list, task count per section, time limit, scoring rule. `core-assessment` runs any format it is given.

## Immersion ramp (German pack defaults)

| Level | Instructions | Feedback | Tutor language |
|-------|--------------|----------|----------------|
| A1 | English | English with German examples | German, English explanations on request |
| A2 | English, German on toggle | Mixed | German, English on request |
| B1 | German with English hover | German | German only, explanations in simple German |
| B2 and above | German | German | German |

## What Dutch and French reuse

Everything above the German grammar sequence. They supply their own grammar sequence, word lists, exam formats (CNaVT and Staatsexamen NT2 for Dutch, DELF and DALF for French) and immersion defaults. Descriptor codes are shared, so a learner's progress view looks the same across languages.
