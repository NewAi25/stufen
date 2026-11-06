# Changelog

## [Unreleased]

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
