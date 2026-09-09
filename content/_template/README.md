# Content pack template

This directory is an empty but valid content pack. Copy it to start a new language. Never edit it in place and never install it.

## How to copy it

1. Pick the two letter code for the language, for example `nl`.
2. Copy this directory: `cp -r content/_template content/nl` (on Windows use Explorer or `xcopy /E`).
3. Delete `content/nl/README.md` and the two `.gitkeep` files once real files exist beside them.
4. Open `content/nl/pack.json`. Set `code` to `nl`, `name` and `name_native`, `locale`, `tts`, and replace the placeholder source with the real published sources you will cite.
5. Fill `ramp.json`. The template uses the German defaults from `docs/05-curriculum-spine.md`. Change them if the language needs a different ramp.
6. Add exam formats to `exam-formats.json`. It may stay an empty array until you have the numbers.
7. Write `candos/A1.json`, then `items/A1.jsonl`, then `units/A1/01-<slug>/unit.json` with its lessons.
8. Run `node scripts/validate-content.mjs nl`. Fix everything in the fail rows.
9. Run `node scripts/validate-content.mjs nl --write-checksum` to stamp the checksum into `pack.json`.

The full rules are in `docs/09-content-pack-spec.md`.

## What is in here

| File | Purpose |
|------|---------|
| `pack.json` | Manifest with placeholder values. `code` is `xx` so the validator does not confuse it with a real language |
| `ramp.json` | Immersion ramp with the default values |
| `exam-formats.json` | Empty array |
| `candos/A1.json` | Empty array |
| `items/.gitkeep` | Keeps the directory in git. Replace with `A1.jsonl` |
| `units/.gitkeep` | Keeps the directory in git. Replace with `A1/01-<slug>/` |

The validator accepts this directory as it stands. It prints warnings for the empty parts and for the `pending` checksum, and no failures.
