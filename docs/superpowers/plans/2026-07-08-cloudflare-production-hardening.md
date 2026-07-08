# Cloudflare Production Hardening Plan

## Scope

- `public/_redirects`: Cloudflare Pages static SPA fallback for `/share/:slug` and `/video/:slug`.
- `public/_headers`: static security headers that allow this app, Gumlet embeds, and Gumlet-hosted video.
- `src/app/portal-utils.ts`: public URL resolution from `VITE_PUBLIC_APP_URL`, localhost detection, share URL creation helpers.
- `src/app/admin-portal.tsx`: use public URL helper for copy/open links and show admin warnings for local-only and unlisted-link security.
- `docs/deployment-zero-cost.md`: Cloudflare Pages Free setup, guardrails, and limitations.
- Tests: unit tests for URL/header helpers; browser tests for public copied links, localhost warning, encoded `/share` and `/video` routes without localStorage, Gumlet CTA, edit/delete behavior.
- Worklog: record the production hardening pass, verification, skipped performance, and risks.

## Verification

- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- `npm.cmd run verify:quick`
- `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts e2e/app-controls.spec.ts`
- Manual local browser probe for copied links and refresh behavior.
- Manual deployed Cloudflare Pages probe if network access is available.
