# 09. Content pack spec

A content pack is everything a language needs that is data: descriptors, items, units, lessons, exercises, exam formats and the immersion ramp. It lives in `content/<lang>/` as JSON. It has no code. `core-content` loads it, validates it against `content/schema/` and installs it into the curriculum tables. The thin `lang-<code>` box reads the same files and hands them to `core-content` through the `LanguagePack` interface in `docs/04-module-contracts.md`.

This document is the rule book for packs. The schemas are the machine readable version. When they disagree, the schema wins and this document gets fixed.

## Directory layout

```
content/
  schema/                     JSON schemas shared by every pack
  _template/                  empty but valid pack, copy it to start a language
  de/
    pack.json                 manifest
    ramp.json                 immersion ramp per level
    exam-formats.json         array of exam formats
    candos/
      A1.json                 array of descriptors for one level
      A2.json
      ...
    items/
      A1.jsonl                one item per line, one file per level
      ...
    units/
      A1/
        01-hallo/
          unit.json
          lesson-01.json
          lesson-02.json
        02-familie/
          ...
      A2/
    audio/                    optional recorded audio, referenced by relative path
```

| File | How many | Schema | Holds |
|------|----------|--------|-------|
| `pack.json` | one per pack | `pack.schema.json` | code, version, name, sources, checksum |
| `ramp.json` | one per pack | `ramp.schema.json` | instruction, feedback and tutor language per level |
| `exam-formats.json` | one per pack, JSON array | `exam-format.schema.json` per element | sections, task counts, time limits, pass mark |
| `candos/<LEVEL>.json` | one per level, JSON array | `cando.schema.json` per element | can do descriptors |
| `items/<LEVEL>.jsonl` | one per level, JSON lines | `item.schema.json` per line | vocab, grammar, chunks, phrases |
| `units/<LEVEL>/<nn>-<slug>/unit.json` | one per unit | `unit.schema.json` | theme, ordered lesson files |
| `units/<LEVEL>/<nn>-<slug>/lesson-<nn>.json` | one per lesson | `lesson.schema.json` | lesson metadata plus inline exercises |

Levels are `A1 A2 B1 B2 C1 C2`. File and directory names use the upper case level. Keys use the lower case level.

Items use JSON lines rather than a JSON array because item files get long and a one line diff per item is easier to review.

## The manifest

`pack.json` is the only file `core-content` reads before deciding whether to install anything.

| Field | Required | Meaning |
|-------|----------|---------|
| `code` | yes | Two letter language code. Must equal the directory name and the prefix of every key in the pack |
| `version` | yes | Semantic version of the pack, for example `0.1.0`. See Versioning below |
| `name` | yes | Language name in English |
| `name_native` | yes | Language name in the language |
| `description` | no | One or two sentences about what this version contains |
| `locale` | no | BCP 47 locale for speech, for example `de-DE` |
| `levels` | yes | Levels this version ships content for. The validator warns if a declared level has no descriptor file |
| `tts` | no | `locale` and `voiceHint` handed to `core-speech` |
| `sources` | yes | Every published source the pack cites. Each has an `id`, `title`, `publisher`, and optionally `author`, `year`, `url`, `note` |
| `checksum` | yes | `sha256:<hex>` over every file in the pack except `pack.json`, or the word `pending` while editing |
| `strictUnitEnding` | no | Default true. Set false only on a skeleton pack whose units are not finished |
| `reviewed` | no | True once a human has reviewed the whole version |
| `updated` | no | ISO date of the last content change |

The checksum is computed over the sorted list of relative file paths and their contents, with Windows line endings normalised to `\n` first, so the same files hash the same on every machine. `node scripts/validate-content.mjs <lang> --write-checksum` computes it and writes it into `pack.json`. `core-content` recomputes it at install time and refuses a pack whose files do not match its manifest. That is what makes `content_pack_versions.checksum` meaningful.

## Keys

Every record in a pack has a stable string key. Keys are the only identity a pack knows. `core-content` maps each key to a uuid when it installs the pack and keeps that map in the content tables (`cando_descriptors.code` plus `language_code`, `items.key`, and the unit, lesson and exercise slugs). When a new version of the pack installs, a key that already exists keeps its uuid. That is why learner attempts, review cards and mastery rows survive a content update.

| Record | Key pattern | Example |
|--------|-------------|---------|
| Descriptor | `<lang>:cando:<LEVEL>.<SKILL>.<NN>` | `de:cando:A1.LIS.03` |
| Item | `<lang>:<kind>:<slug>` | `de:vocab:haus`, `de:grammar:sein-praesens`, `de:chunk:ich-heisse`, `de:phrase:wie-gehts` |
| Unit | `<lang>:unit:<level>-<nn>-<slug>` | `de:unit:a1-01-hallo` |
| Lesson | `<lang>:lesson:<level>-<unit nn>-<lesson nn>` | `de:lesson:a1-01-01` |
| Exercise | `<lang>:exercise:<level>-<unit nn>-<lesson nn>-<exercise nn>` | `de:exercise:a1-01-01-04` |

Rules for keys:

1. ASCII only. Lower case. Umlauts become `ae`, `oe`, `ue`. Sharp s becomes `ss`. So `heißen` is `de:vocab:heissen` and `fünf` is `de:vocab:fuenf`.
2. A key is never renamed. If a word was wrong, add the correct key and drop the old one from every lesson. The old row stays in the database so old attempts still point at something.
3. Unit, lesson and exercise keys are derived from their position on disk. The validator checks that the key, the file name and the `ordinal` field all agree.
4. Descriptor codes (`A1.LIS.03`) are shared across languages. Two packs may both define `A1.LIS.03` and a learner's progress view treats them as the same skill. The key is still language prefixed because the text and the source differ.
5. Item slugs are the lemma. When two lemmas collide, add a distinguishing suffix: `de:vocab:sie-formal` for formal `Sie` beside `de:vocab:sie` for `sie`.

## Referential rules

The validator enforces all of these. A pack that breaks one does not install.

| Rule | Where checked |
|------|---------------|
| Every key starts with `<code>:` where `code` is the manifest code | all files |
| Keys are unique across the whole pack | all files |
| A descriptor's `level` equals the level in its file name, and its `key` equals `<code>:cando:<code field>` | `candos/` |
| An item's `level` equals the level in its file name, and its key prefix matches its `kind` | `items/` |
| A vocab item with `pos` `noun` has `gender` and `plural` | `items/` |
| Every `source` field is a source id from `pack.json` or the word `unverified` | everywhere |
| Unit key, `ordinal`, `slug` and `level` agree with the directory path | `units/` |
| Every file listed in `unit.lessons` exists, and every `lesson-NN.json` on disk is listed | `units/` |
| Lesson key, `ordinal` and `unit_key` agree with the file name and the unit | lessons |
| A lesson targets at least one descriptor, and every key in `cando_ids` exists | lessons |
| Every key in `introduces_item_ids` exists | lessons |
| Exercises are numbered 1 to n in file order and their keys follow the pattern | exercises |
| Every exercise has at least one `cando_ids` entry and every entry exists | exercises |
| Every `item_ids` entry exists. The array may be empty | exercises |
| A unit ends with a `production` lesson followed by a `review` lesson, unless `strictUnitEnding` is false | units |
| `cloze`: the count of `___` in `text` equals `blanks.length` | payloads |
| `multiple_choice`, `read_answer`, `listen_answer`: every `answer_index` is inside `options` | payloads |
| `order_words`: `answer` uses exactly the tokens in `words`, and so does every `accept` entry | payloads |
| `speak_prompt` with mode `read_aloud` has `target_text` | payloads |
| `write_free`: `max_words` is not below `min_words` | payloads |
| Manifest checksum equals the hash of the files, unless it is `pending` | manifest |

Warnings, which do not block install: a descriptor no lesson targets, an item no lesson uses, an exercise that targets a descriptor its lesson does not list, a `pending` checksum, an empty file.

## Descriptors

One object per can do statement. Descriptor codes and the counts per level are planned in `docs/05-curriculum-spine.md`.

| Field | Required | Meaning |
|-------|----------|---------|
| `key` | yes | `<lang>:cando:<code>` |
| `code` | yes | `LEVEL.SKILL.NN`, skill codes `REA LIS SPP SPI WRI MED GRA VOC` |
| `level` | yes | `A1` to `C2` |
| `skill` | yes | `reading`, `listening`, `spoken_production`, `spoken_interaction`, `writing`, `mediation`, `grammar`, `vocabulary` |
| `text_en` | yes | The descriptor in English |
| `text_native` | no | The descriptor in the target language |
| `source` | yes | Source id or `unverified` |
| `source_note` | no | Which scale and which row of the source |
| `sequence_ref` | no | For `GRA` and `VOC`: the row in the grammar sequence, for example `A1.3` |
| `mastery_rule` | no | Overrides for the default rule in `docs/04`: `evidence_count`, `distinct_exercise_types`, `recent_accuracy`, `best_production_score` |
| `reviewed` | no | True after human review |

```json
{
  "key": "de:cando:A1.SPI.02",
  "code": "A1.SPI.02",
  "level": "A1",
  "skill": "spoken_interaction",
  "text_en": "Can introduce themselves and use basic greeting and leave taking expressions.",
  "source": "cefr-cv-2020",
  "source_note": "Conversation, A1.",
  "reviewed": false
}
```

The six CEFR skills come from the Companion Volume. Paraphrase closely, do not invent. Grammar and vocabulary descriptors are scaffolding. They come from the language inventory (Profile deutsch for German) and from the grammar sequence in `docs/05`. They exist so the app can track evidence at the level of "uses the dative after these prepositions".

## Items

One item per line. Items are what the SRS schedules. The payload shape depends on `kind`.

Common fields: `key`, `kind` (`vocab`, `grammar`, `chunk`, `phrase`), `lemma`, `gloss_en`, `level`, `source`, `payload`. Optional: `frequency_rank`, `source_note`, `tags`, `reviewed`, `note`.

### vocab

Payload: `pos` (required), `gender` and `plural` (required for nouns), `forms` (map of label to form), `examples` (required, at least one, each with `text`, `gloss_en` and optional `audio`), `audio`, `note`.

```json
{
  "key": "de:vocab:stadt",
  "kind": "vocab",
  "lemma": "die Stadt",
  "gloss_en": "city, town",
  "level": "A1",
  "source": "goethe-a1-wortliste",
  "payload": {
    "pos": "noun",
    "gender": "f",
    "plural": "die Städte",
    "examples": [
      { "text": "Die Stadt heißt Hamburg.", "gloss_en": "The city is called Hamburg." }
    ]
  }
}
```

For verbs, `forms` carries the paradigm the grader needs: `1sg`, `2sg`, `3sg`, `1pl`, `2pl`, `3pl`, `past_participle`. The `lang-<code>` box knows what the labels mean. Adjectives may carry `comparative` and `superlative`. A noun with no plural writes `"plural": "none"`.

### grammar

Payload: `explanation_en` (required), `examples` (required), `explanation_native`, `pattern`, `table` (label to form), `sequence_ref`.

```json
{
  "key": "de:grammar:sein-praesens",
  "kind": "grammar",
  "lemma": "sein, present tense",
  "gloss_en": "forms of to be",
  "level": "A1",
  "source": "profile-deutsch",
  "payload": {
    "explanation_en": "sein is irregular. Learn the six forms as a set.",
    "pattern": "ich bin, du bist, er ist, wir sind, ihr seid, sie sind",
    "table": { "ich": "bin", "du": "bist", "er/sie/es": "ist", "wir": "sind", "ihr": "seid", "sie/Sie": "sind" },
    "examples": [ { "text": "Ich bin Anna.", "gloss_en": "I am Anna." } ],
    "sequence_ref": "A1.1"
  }
}
```

### chunk

A frame with one open slot. The lemma carries the frame with three dots for the slot. Payload: `slot` (required, what fills it, in English), `examples` (required), `audio`, `note`.

```json
{
  "key": "de:chunk:ich-komme-aus",
  "kind": "chunk",
  "lemma": "Ich komme aus ...",
  "gloss_en": "I come from ...",
  "level": "A1",
  "source": "goethe-a1-wortliste",
  "payload": {
    "slot": "a country or city",
    "examples": [ { "text": "Ich komme aus Indien.", "gloss_en": "I come from India." } ]
  }
}
```

### phrase

A complete fixed utterance. Payload: `register` (required, `formal`, `informal` or `neutral`), `examples` (required), `reply` (a typical answer), `audio`, `note`.

```json
{
  "key": "de:phrase:wie-heissen-sie",
  "kind": "phrase",
  "lemma": "Wie heißen Sie?",
  "gloss_en": "What is your name? (formal)",
  "level": "A1",
  "source": "goethe-a1-wortliste",
  "payload": {
    "register": "formal",
    "reply": "Ich heiße ...",
    "examples": [ { "text": "Guten Tag! Wie heißen Sie?", "gloss_en": "Good day! What is your name?" } ]
  }
}
```

Audio paths are optional everywhere. When absent, `core-speech` synthesises the text with the pack's `tts` settings. When present, the path is relative to `content/<lang>/audio/` and the file is uploaded through `core-storage` at install time.

## Units and lessons

A unit is a theme with 6 to 10 lessons. It ends with a production lesson and a review lesson. Themes follow the Goethe topic areas listed in `docs/05`.

`unit.json` fields: `key`, `level`, `ordinal`, `slug`, `title` (target language), `title_en`, `theme`, `lessons` (ordered file names). Optional `description`, `source`, `reviewed`.

`lesson-<nn>.json` fields: `key`, `unit_key`, `ordinal`, `slug`, `title`, `title_en`, `kind`, `estimated_minutes`, `cando_ids`, `exercises`. Optional `description`, `introduces_item_ids`, `source`, `reviewed`.

Lesson kinds:

| Kind | Purpose | Ends the unit |
|------|---------|---------------|
| `core` | Teaches new material. Follows the lesson pattern in `docs/05`: warm up, input, focus, use, produce | no |
| `production` | One or two `write_free` or `speak_prompt` tasks that combine the unit. AI graded | second last |
| `review` | Mixed exercises over the unit's items and descriptors, no new material | last |
| `checkpoint` | Level checkpoint. Only in the last unit of a level, before the review | no |

`introduces_item_ids` lists items met for the first time in this lesson. `core-lesson-engine` calls `core-srs.introduceItems` with them when the lesson completes. Every item should be introduced by exactly one lesson. Warm up exercises that reuse earlier items list them in `item_ids` on the exercise, not here.

## Exercises

Exercises live inline in the lesson file. Common fields: `key`, `ordinal`, `type`, `skill`, `cando_ids` (at least one), `item_ids` (may be empty), `payload`. Optional `instruction_en`, `instruction_native`, `source`, `reviewed`.

`skill` says which skill the attempt gives evidence for. One exercise, one skill. If a dictation is meant to evidence both listening and writing, put both descriptors in `cando_ids` and pick the skill that matches the learner's main effort.

| Type | Typical skill | Graded by | Needs AI |
|------|---------------|-----------|----------|
| `multiple_choice` | any | exact index | no |
| `cloze` | grammar, vocabulary | normalised string compare, `accept` list, error classification from `lang-<code>` | no |
| `match_pairs` | vocabulary | all pairs correct | no |
| `order_words` | grammar | token sequence compare | no |
| `translate` | writing, mediation | reference list first, then AI for equivalents | yes |
| `dictation` | listening | normalised string compare | no |
| `read_answer` | reading | per question index | no |
| `listen_answer` | listening | per question index | no |
| `write_free` | writing | AI rubric, 0 to 5 per criterion | yes |
| `speak_prompt` | spoken_production, spoken_interaction | transcript similarity for `read_aloud`, AI rubric for `free` | yes for `free` |
| `flashcard` | vocabulary | self rated 1 to 4, feeds the SRS directly | no |

### multiple_choice

`question`, `options` (2 or more), `answer_index` (zero based). Optional `explanation_en`, `audio`.

```json
{
  "key": "de:exercise:a1-01-01-02",
  "ordinal": 2,
  "type": "multiple_choice",
  "skill": "vocabulary",
  "cando_ids": ["de:cando:A1.VOC.01"],
  "item_ids": ["de:vocab:guten-abend", "de:vocab:gute-nacht"],
  "instruction_en": "Choose the right greeting.",
  "payload": {
    "question": "It is 7 pm and you arrive at a friend's house. What do you say?",
    "options": ["Guten Morgen", "Guten Tag", "Guten Abend", "Gute Nacht"],
    "answer_index": 2,
    "explanation_en": "Gute Nacht is only said when someone goes to bed."
  }
}
```

### cloze

`text` with one `___` per gap, `blanks` in order, each with `answer` and optional `accept` and `hint`. Optional `explanation_en`.

```json
{
  "type": "cloze",
  "skill": "grammar",
  "cando_ids": ["de:cando:A1.GRA.02"],
  "item_ids": ["de:vocab:heissen", "de:vocab:kommen"],
  "payload": {
    "text": "Ich ___ Tom und ich ___ aus England.",
    "blanks": [
      { "answer": "heiße", "accept": ["heisse"], "hint": "heißen" },
      { "answer": "komme", "hint": "kommen" }
    ]
  }
}
```

### match_pairs

`pairs`, each with `left` and `right`. At least two. The renderer shuffles the right column.

```json
{
  "type": "match_pairs",
  "skill": "vocabulary",
  "cando_ids": ["de:cando:A1.VOC.02"],
  "item_ids": ["de:vocab:eins", "de:vocab:drei", "de:vocab:fuenf"],
  "payload": {
    "pairs": [
      { "left": "eins", "right": "1" },
      { "left": "drei", "right": "3" },
      { "left": "fünf", "right": "5" }
    ]
  }
}
```

### order_words

`words` shuffled, punctuation attached to its token. `answer` is the tokens joined by single spaces. Optional `accept` for other valid orders.

```json
{
  "type": "order_words",
  "skill": "grammar",
  "cando_ids": ["de:cando:A1.GRA.03"],
  "item_ids": ["de:vocab:wo", "de:vocab:wohnen"],
  "payload": {
    "words": ["wohnst", "du?", "Wo"],
    "answer": "Wo wohnst du?"
  }
}
```

### translate

`source_text`, `direction` (`to_target` or `to_en`), `reference` (one or more accepted translations). Optional `notes_en`.

```json
{
  "type": "translate",
  "skill": "writing",
  "cando_ids": ["de:cando:A1.WRI.01", "de:cando:A1.GRA.02"],
  "item_ids": ["de:chunk:ich-wohne-in"],
  "payload": {
    "source_text": "I live in Munich.",
    "direction": "to_target",
    "reference": ["Ich wohne in München."],
    "notes_en": "Munich is München in German."
  }
}
```

### dictation

`text` is spoken and must be typed back. Optional `audio`, `accept`.

```json
{
  "type": "dictation",
  "skill": "listening",
  "cando_ids": ["de:cando:A1.LIS.01", "de:cando:A1.WRI.01"],
  "item_ids": ["de:vocab:guten-tag", "de:chunk:ich-heisse"],
  "payload": {
    "text": "Guten Tag, ich heiße Peter.",
    "accept": ["Guten Tag, ich heisse Peter."]
  }
}
```

### read_answer

`text` and `questions`, each with `question`, `options`, `answer_index`. Optional `title`.

```json
{
  "type": "read_answer",
  "skill": "reading",
  "cando_ids": ["de:cando:A1.REA.01"],
  "item_ids": ["de:vocab:kommen", "de:vocab:deutschland"],
  "payload": {
    "text": "Guten Tag! Ich heiße Lena Fischer. Ich komme aus Deutschland.",
    "questions": [
      { "question": "Woher kommt Lena?", "options": ["aus Österreich", "aus Deutschland"], "answer_index": 1 }
    ]
  }
}
```

### listen_answer

Same as `read_answer` but the text is `transcript`, spoken and never shown before the answer. Optional `audio`.

```json
{
  "type": "listen_answer",
  "skill": "listening",
  "cando_ids": ["de:cando:A1.LIS.03"],
  "item_ids": ["de:vocab:telefonnummer", "de:vocab:drei", "de:vocab:vier"],
  "payload": {
    "transcript": "Die Telefonnummer ist drei, vier, acht.",
    "questions": [
      { "question": "Wie ist die Telefonnummer?", "options": ["348", "384"], "answer_index": 0 }
    ]
  }
}
```

### write_free

`prompt_en`, `min_words`. Optional `prompt_native`, `max_words`, `sample_answer` (never shown before submission), `rubric_focus`.

```json
{
  "type": "write_free",
  "skill": "writing",
  "cando_ids": ["de:cando:A1.WRI.01"],
  "item_ids": ["de:chunk:ich-heisse", "de:chunk:ich-komme-aus"],
  "payload": {
    "prompt_en": "Write two or three short sentences. Greet the reader, give your name and say which country you come from.",
    "min_words": 6,
    "max_words": 30,
    "sample_answer": "Guten Tag! Ich heiße Manisha. Ich komme aus Indien.",
    "rubric_focus": ["greeting", "verb ending with ich"]
  }
}
```

### speak_prompt

`prompt_en`, `mode` (`read_aloud` compares the transcript with `target_text`, `free` goes to the AI rubric). Optional `prompt_native`, `target_text`, `sample_answer`, `rubric_focus`.

```json
{
  "type": "speak_prompt",
  "skill": "spoken_production",
  "cando_ids": ["de:cando:A1.SPP.02", "de:cando:A1.SPI.02"],
  "item_ids": ["de:chunk:ich-heisse", "de:chunk:ich-komme-aus"],
  "payload": {
    "prompt_en": "Introduce yourself in German. Say hello, your name and which country you come from.",
    "mode": "free",
    "sample_answer": "Hallo! Ich heiße Anna. Ich komme aus Indien.",
    "rubric_focus": ["greeting", "ich heiße", "ich komme aus"]
  }
}
```

### flashcard

`front`, `back`. Optional `hint`, `audio`. `item_ids` normally holds exactly the item on the card.

```json
{
  "type": "flashcard",
  "skill": "vocabulary",
  "cando_ids": ["de:cando:A1.VOC.01"],
  "item_ids": ["de:vocab:stadt"],
  "payload": {
    "front": "die Stadt",
    "back": "the city, the town",
    "hint": "Plural: die Städte"
  }
}
```

## Exam formats

`exam-formats.json` is an array. Each format has `id`, `name`, `level`, `provider`, `sections`, `pass_mark` (fraction of `max_points`), `source`. Optional `total_minutes`, `max_points`, `scoring_en`, `source_note`, `reviewed`.

Each section has `id`, `name` (as printed on the exam), `skill`, `task_count`, `minutes`, `source`. Optional `name_en`, `item_count`, `points`, `task_types_en`, `note`.

`core-assessment` runs any format it is given. Numbers you have not checked against the provider's current exam description get `"source": "unverified"` on that section and a `note` saying what is uncertain. The German pack's Goethe A1 entry is the worked example.

## Immersion ramp

`ramp.json` has one object per level with `instructions`, `feedback` and `tutor`, each `en`, `mixed` or `target`. Optional per level: `hover_gloss` (show English on hover) and `explain_on_request` (the tutor may switch to English when asked). The German defaults follow the table in `docs/05`. The `lang-<code>` box exposes the same data as `immersionRamp` in the `LanguagePack` interface.

## The source field

Rule 8 in `CLAUDE.md`: never make up level targets, descriptors or sequences. The `source` field is how a pack proves it did not.

1. Every descriptor, item, exercise, unit, lesson, exam format and exam section has a `source`.
2. `source` is either an `id` from `pack.json` `sources` or the exact string `unverified`.
3. A source entry in the manifest names the publication: title, author or publisher, year when known, a URL when public, and a `note` saying which part was used or what still needs checking.
4. Use `unverified` when the record was generated or written from memory and nobody has checked it against a publication yet. Exercises written for this app are normally `unverified` because they are original material. Descriptors and items should not stay `unverified` past review.
5. `source_note` on a record points inside the source: scale name, page, list section, sequence row.
6. `reviewed: true` means a human compared the record to its source and it is right. The validator does not check this flag. The content forge pipeline does.

## Adding a new language

Say the language is Dutch, code `nl`.

1. Copy the template: `cp -r content/_template content/nl`. Remove the README and the `.gitkeep` files as real files replace them.
2. Fill `content/nl/pack.json`: `code` `nl`, `name` Dutch, `name_native` Nederlands, `locale` `nl-NL`, `levels` `["A1"]` to start, `tts`, and the `sources` list. Cite the Companion Volume, the Dutch word list you will use, and the exam descriptions (CNaVT, Staatsexamen NT2).
3. Fill `content/nl/ramp.json`. Start from the defaults and change only what Dutch needs.
4. Write `content/nl/candos/A1.json`. Take the A1 codes from `docs/05` (`A1.REA.01` and so on). The six CEFR skills paraphrase the Companion Volume scales. `GRA` and `VOC` come from the Dutch grammar sequence, which you add to `docs/05` in its own commit first, with its sources.
5. Write `content/nl/items/A1.jsonl`. Follow the vocabulary source rule in `docs/05`: take the published list, order by frequency, group by unit theme.
6. Write `content/nl/units/A1/01-<slug>/unit.json` and its lessons. Follow the lesson pattern. End the unit with a production lesson and a review lesson.
7. Run `node scripts/validate-content.mjs nl`. Fix every fail row. Read the warn rows.
8. Run `node scripts/validate-content.mjs nl --write-checksum`.
9. Add `packages/lang-nl` with the standard box shape: `module.json`, `README.md`, `CHANGELOG.md`, `src/index.ts`, `tests/`. It implements `LanguagePack` from `contracts`: it reads `content/nl`, exposes `rules` (article and gender helpers, conjugation, `normalize`, `classifyError`), `immersionRamp`, `examFormats` and `tts`. No UI, no core imports.
10. Register it in `apps/web`: add the pack to the registry that calls `core-content.registerPack` at app start, add `nl` to `LanguageCode` in `contracts` if it is not already there, and set `languages.status` to `coming` or `active` through a migration. That is three boxes and three commits: contracts, lang-nl, apps/web.
11. Add `content/nl` and `lang-nl` rows to `docs/07-build-sequence.md`.

Nothing under `core-` changes. If it has to, that is a core change, its own commit, first.

## The content forge pipeline

`tools-content-forge` is a later box. It runs offline and never ships in the app. Its job is to turn descriptors into draft content fast and keep humans in the loop where judgement is needed.

1. Input: the descriptors for one unit, the item budget from `docs/05`, the theme, the vocabulary source list, and the pack's existing items so drafts reuse rather than duplicate.
2. Generate: Claude drafts items, then lessons with exercises, from a prompt that includes the schemas, the key rules and the lesson pattern. Every generated record carries `"source": "unverified"` and `"reviewed": false`, except items copied verbatim from the word list, which carry the list's source id.
3. Validate: run `scripts/validate-content.mjs`. Feed fail rows back to the model once. Anything still failing is dropped and logged.
4. Sample: pick a fixed share of records per type (every production task, every grammar item, one exercise in five) and show them to a human reviewer with the source beside them.
5. Mark: the reviewer sets `reviewed: true` on each record that is right, edits the ones that are nearly right, and deletes the rest. Records that fail review twice for the same reason become a prompt fix, not a third try.
6. Stamp: `--write-checksum`, bump the pack version, commit as `feat(content-de): ...`.

The pipeline never edits a record with `reviewed: true` without a human resetting the flag first.

## Versioning

Packs use semantic versions, independent of the app and of the `lang-<code>` box.

| Change | Bump |
|--------|------|
| Fix a typo, a gloss, a wrong answer, a source note | patch |
| Add descriptors, items, units or lessons; add a level | minor |
| Remove or rename a key; change a descriptor's code; change a payload shape that needs a schema change | major |

Rules:

1. `pack.json` `version` and the checksum change in the same commit as the content.
2. `core-content.installPack(language, version)` records the version and checksum in `content_pack_versions`. The previous version becomes `superseded`. Rolling back is installing the previous version again.
3. A schema change is a `core-content` change and goes first, in its own commit, with the schema files under `content/schema/`. Packs then move to the new shape in their own commits.
4. The `lang-<code>` box declares which pack major version it supports in its `module.json`. A pack major bump means a `lang-<code>` minor bump at least.
5. Never edit a pack version that has been installed on a shared environment. Make a new version.

## Validation

```
node scripts/validate-content.mjs              every pack under content/
node scripts/validate-content.mjs de           one pack
node scripts/validate-content.mjs de --write-checksum
```

The script has no dependencies beyond Node. It implements the subset of JSON Schema the pack schemas use: `type`, `required`, `enum`, `const`, `properties`, `additionalProperties`, `items`, `minItems`, `minLength`, `pattern`, `minimum`, `maximum`, `$ref`, `oneOf` discriminated on a `const` property, `anyOf`, `allOf`. If a schema starts using a keyword the script does not know, the script must learn it in the same commit.

Output is one table per pack with a `check`, `status` and `detail` column, then a count of pass, warn and fail rows, then `RESULT: PASS` or `RESULT: FAIL`. Exit code is 0 on pass and 1 on fail. A lesson that fails schema validation is reported and skipped, so its referential rows appear only after the schema rows are fixed. CI runs the script on every push that touches `content/`.
