# Remove the portal logo and publish

## Implementation

1. Add failing source-level coverage that rejects `portal-brand-mark` markup and CSS while requiring the Pixel Point text identity.
2. Add focused browser coverage for text-only branding on admin, collection-share, and single-video flows.
3. Remove the decorative mark from `src/app/portal-ui.tsx` and delete its rules from `src/styles.css`.
4. Record the decision and verification evidence in `docs/toolcraft/agent-worklog.md`.
5. Commit and push the verified change to `main`; confirm the Git-connected Cloudflare Pages production deployment and smoke-test the canonical URL.

## Verification note

Verification tier: Tier 1 - shared portal presentation

Reason: The shared identity component and its CSS change across several screens, but runtime state, schema, renderer output, API behavior, persistence, and layout mechanics remain unchanged.

Run: focused Vitest for `portal-ui.test.ts`, focused Playwright branding coverage, `npm.cmd run verify:final`, clean-tree checks, Pages deployment verification, and live canonical browser/API smoke tests.

Skip: performance suites because the change removes four static DOM elements and CSS only; it adds no workload, animation, canvas, export, or interaction cost.
