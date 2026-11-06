# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-06

### Added

- `/onboarding`: choose the language (German today, Dutch and French shown as coming soon) and the target level, each level with a one line meaning from `docs/14-levels-in-real-life.md`. "Start from zero" sets the active language and goes home. "Take the placement test" is shown disabled until the assessment box lands.
- `/settings`: display name, timezone, daily goal in minutes, the theme toggle, the interface language shown as fixed English, and a read only "Your plan" card with the plan and what is left of the three daily limits. Field errors show inline. A toast confirms a save.
- `src/server/actions/identity-actions.ts`: `completeOnboarding` and `saveSettings`. They take the container and a user id, validate the input, and return `{ ok: true }` or `{ ok: false, field?, message }`. They never throw for a user error.
- Server actions `submitOnboarding` and `submitSettings` that read the session, return a "not signed in" result when there is none, and revalidate.
- `src/lib`: the shared action result type, the language and level options, and the plan and limit labels.
- `tests/identity-actions.test.ts` against the real in memory container.

### Changed

- `/` now uses the profile. With no active language it redirects to `/onboarding`. Otherwise it greets the learner by display name or email, shows the language and target level, and says lessons arrive in the next phase.
- `/`, `/onboarding` and `/settings` show a short card saying sign in arrives in the next phase when nobody is signed in.
- Settings in the rail goes to `/settings`.

## [0.1.0] - 2026-11-05

### Added

- Next.js 16 App Router scaffold under `src/app` with React 19, Tailwind v4 through `@tailwindcss/postcss`, `output: 'standalone'` and `transpilePackages` for every workspace box.
- Root layout with a skip to content link, the ui-kit `ToastProvider`, a theme provider with a no flash inline script, and the app shell: left rail on wide screens, bottom bar on narrow screens.
- Pages: `/` (welcome card with a ui-kit `Button`), `/kit` (gallery of ui-kit components with the theme toggle), `/coming-soon`, and a custom not found page.
- `GET /api/health` returning `{ ok: true, version }`.
- Composition root in `src/server/container.ts`: one instance per process of the event bus, console mail, in memory auth, identity, entitlements, analytics, feedback and fs storage. On `user.signed_up` it creates the profile and the default plan.
- `src/server/config.ts`: typed read of the environment. Throws in production when `STORAGE_SIGNING_SECRET` is missing.
- `src/server/session.ts`: `getSession()` reads the `stufen_session` cookie. Outside production it falls back to a dev session.
- Tests for the container, the wiring and the config.

### Changed

- `module.json` and `package.json` list only the boxes this version imports. Later rows add boxes back as their routes land.
