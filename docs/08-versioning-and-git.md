# 08. Versioning and git

Three things carry a version: the repo, each box, and each content pack. They move independently. This document says how each one moves and how commits, branches and changelogs record it.

## Repo version

The repo follows semver. The version lives in the root `package.json` and in the root `CHANGELOG.md`.

| Bump | When | Example |
|------|------|---------|
| Major | A learner facing behaviour is removed or changed so that existing learners must act (for example a plan change that removes access, or a data migration that cannot be rolled back) | 1.x to 2.0.0 |
| Minor | A phase in `docs/07-build-sequence.md` completes, or a feature that a learner can see ships | 0.2.0 to 0.3.0 |
| Patch | Fixes only, no new learner facing feature | 0.3.0 to 0.3.1 |

Rules:

- Tags are `vX.Y.Z` and are created only at phase ends and for hotfix patches. The tag list in the phase overview of `docs/07` is the plan.
- `0.x` means beta. During `0.x` a minor bump may change public box APIs without a major bump. From `1.0.0` the major rule above applies.
- `1.0.0` is cut when the Phase 5 exit criteria pass, not before.

## Box version

Every box has `version` in `module.json`. It starts at `0.0.1` as a skeleton.

| Bump | When | Extra requirement |
|------|------|-------------------|
| Minor | The public API in `src/index.ts` gains or changes a function, type or event | Update `docs/04-module-contracts.md` in the same commit. Update callers in `apps/web` in a separate commit |
| Patch | A fix or internal change with no API change | None |
| Major | A public function or event is removed or its meaning changes so callers break | An ADR under `docs/adr/` accepted before the commit. The commit body links the ADR |

The first real feature moves a box from `0.0.1` to `0.1.0`. Box versions are recorded in `docs/07` in the `Box version after` column when a row goes to `done`.

## Content pack version

Each pack has `version` in `content/<lang>/pack.json`. It follows semver on its own line, independent of the repo version. A repo at `0.4.0` may carry a German pack at `0.2.0` and a Dutch pack at `0.0.1`.

| Bump | When |
|------|------|
| Major | A schema change in `content/schema/` that old packs do not validate against |
| Minor | A level or unit is added, or descriptors change |
| Patch | Fixes to existing items, exercises or citations |

Every install writes a row to `content_pack_versions` with `language_code`, `version`, `checksum`, `installed_at`, `status`. Only one row per language is `active`.

Rollback procedure:

1. Find the previous row with `status = superseded` for that language.
2. Run `node scripts/install-pack.mjs <lang> --version <previous>`. The script checks the pack files out at the git tag `content-<lang>-<version>` and installs them.
3. The script marks the failed version `failed`, the previous version `active`, and emits `content.pack_installed` with the previous version.
4. Learner data is not touched. `attempts`, `review_cards` and `cando_mastery` reference stable `key` and `code` values, so a rollback never orphans evidence.
5. Record the rollback as a row in the sequence log with the message `content(<lang>-<level>): roll back to <version>`.

Every content pack install that goes to production gets a git tag `content-<lang>-<version>`.

## Database migrations

- Files live in `supabase/migrations/` and are named `NNNN_short_name.sql` with four digits, starting at `0001`.
- Numbers are never reused and never skipped. The next number is the highest existing plus one.
- A migration is never edited after it has been applied to any shared environment. A fix is a new migration.
- Every migration ends with a comment block containing the reverse SQL, even if we never run it.
- One migration per commit. The commit scope is `supabase`.
- Migrations that a box needs are committed before the box change that uses them.

## Branching

| Branch | Purpose | Naming |
|--------|---------|--------|
| `main` | Always deployable. Vercel production follows it | `main` |
| Feature | One row of `docs/07` | `feat/<box>-<short>`, for example `feat/core-srs-fsrs` |
| Fix | One bug in one box | `fix/<box>-<short>`, for example `fix/lang-de-dative-plural` |
| Content | One level of one pack | `content/<lang>-<level>`, for example `content/de-a2` |
| Release | Version bump and changelog only | `release/vX.Y.Z` |

Rules:

- Branches merge to `main` by squash merge. The squash commit message is the planned commit message from `docs/07`.
- During Phase 0 direct commits to `main` are allowed because there is one author and no deploy. From the `v0.1.0` tag onward there are no direct commits to `main`. Everything goes through a branch and a pull request, even a one line fix.
- CI must be green before merge. `check-boundaries`, `validate-content`, lint and tests.
- Delete the branch after merge.

## Conventional commits

Format: `type(scope): message`. Lower case. Imperative. No full stop at the end of the subject line. Under 72 characters.

| Type | Use |
|------|-----|
| `feat` | New capability in a box |
| `fix` | A bug fix in a box |
| `docs` | Documentation only, including ADRs and `docs/07` |
| `content` | A change under `content/` |
| `test` | Tests only, including CI test steps |
| `chore` | Tooling, config, dependencies, CI, migrations applied |
| `refactor` | Internal change, no behaviour change, no API change |
| `release` | Version bump, changelog, tag |

Scope is one of:

- A box name exactly as in `docs/02`: `contracts`, `core-srs`, `lang-de`, `ui-kit`, `web`, and so on. `apps/web` is written as `web`.
- A content pack and level: `de-a1`, `nl-b2`.
- `supabase`, `scripts`, `ci`, `content-schema`.
- `build-seq` for a commit that only changes `docs/07`.
- `repo` for root level files, release commits and multi box release work.

Rules:

1. One box per commit. If a change needs two boxes, make two commits and say why in the second body.
2. Release commits with scope `repo` may touch every box's `module.json` and `CHANGELOG.md` plus the root changelog. Nothing else.
3. A commit that changes a box's status or version also edits its row in `docs/07`. This does not count as a second box.
4. A commit that bumps a box version says so in the body: `Bumps core-srs to 0.2.0`.
5. Every commit written by Claude ends with this trailer on its own line:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

Ten example messages:

| Message | Notes |
|---------|-------|
| `feat(contracts): add shared types and event map` | First feature, bumps box to 0.1.0 |
| `feat(core-srs): add FSRS scheduler` | Body names `ts-fsrs` version pinned |
| `fix(lang-de): correct dative plural rule` | Patch bump |
| `feat(core-exercise-types): add speak_prompt` | Minor bump, `docs/04` updated in same commit |
| `content(de-a2): add units 5 to 8` | Pack version stays until the level completes |
| `docs(build-seq): mark core-progress done` | Only when status changes without code, which is rare |
| `test(ci): add A1 lesson flow` | Playwright step |
| `chore(supabase): apply 0001 to dev` | No SQL change, records that it was applied |
| `refactor(core-progress): split mastery rule into pure function` | No version bump unless the API moved |
| `release(repo): v0.2.0` | Squash of `release/v0.2.0` |

## Changelogs

There are two kinds.

| File | Records | Sections |
|------|---------|----------|
| Root `CHANGELOG.md` | Repo releases. One section per tag | Keep a Changelog headings: Added, Changed, Deprecated, Removed, Fixed, Security |
| `packages/<box>/CHANGELOG.md` | Every change to that box, at that box's version | Same headings, under the box version |

Rules:

- Every feature, fix or refactor commit adds a line under `[Unreleased]` in the box changelog.
- A release commit moves the box `[Unreleased]` lines under the box version, and writes one summary line per box in the root changelog under the repo version.
- Content packs have `content/<lang>/CHANGELOG.md` following the same rules at the pack version.
- Dates are `YYYY-MM-DD`.

## Release checklist

1. All rows of the phase in `docs/07` are `done` and the phase exit criteria pass on a preview deploy.
2. Create `release/vX.Y.Z` from `main`.
3. Run `pnpm test`, `node scripts/check-boundaries.mjs`, `node scripts/validate-content.mjs` for every pack. All green.
4. For every box with `[Unreleased]` lines, move them under the box version and confirm `module.json` matches.
5. Write the root `CHANGELOG.md` section for `vX.Y.Z` with one line per box.
6. Bump the root `package.json` version.
7. Update the phase overview row in `docs/07` with the actual date.
8. Commit `release(repo): vX.Y.Z`, open the pull request, wait for CI.
9. Squash merge. Tag `vX.Y.Z` on `main`. Push the tag.
10. Confirm the Vercel production deploy is green and sign in works.
11. If a content pack changed, tag `content-<lang>-<version>` on the same commit.
12. Add the release row to the sequence log.

## Commit log convention

Two records exist for every merged commit, both in `docs/07-build-sequence.md`, both updated in the same commit as the change.

The first is the work item row. Its `Status` and `Box version after` columns change in the commit that does the work. This keeps the plan honest: the table cannot drift from the code because they land together.

The second is the sequence log table at the bottom of `docs/07`. Every merged commit gets one row with four columns: date, short commit hash, box, message. The hash is the squash commit on `main`. Because the hash is not known until the merge, the row is added with `pending` in the branch and the hash is filled in by the next commit that touches `docs/07`. Release commits fill in every remaining `pending`.

Why both: the work item row answers "what is the state of this box". The sequence log answers "what happened, in order". Reading the log top to bottom is the project history without opening git. When something breaks, the log gives the commit to bisect from.

Rows are never deleted from the log. A reverted commit gets its own row with the message `revert(<box>): <original subject>`.
