# Video Share Links Implementation Plan

Verification tier: Tier 2

Reason: This changes product routing, video metadata, encoded share snapshots, and browser-visible admin/share behavior. It does not change Toolcraft runtime internals, dependencies, or heavy renderer workload.

## Files

- `src/app/portal-types.ts`: add `directVideoUrl` and a video share snapshot type.
- `src/app/portal-utils.ts`: add Gumlet input parsing, video share snapshot encoding/decoding, and video share URL creation.
- `src/app/portal-store.ts`: normalize parsed Gumlet inputs into `assetId` plus optional `directVideoUrl`.
- `src/app/gumlet-player.tsx`: support autoplay/start overlay calls for iframe fallback.
- `src/app/video-share-portal.tsx`: new single-video share page with native video playback when `directVideoUrl` exists.
- `src/app/admin-portal.tsx`: update Gumlet input label and add per-video copy/open link actions.
- `src/routes/root.tsx`: add `/video/$slug` route.
- Tests: update unit tests and Playwright browser specs.
- `docs/toolcraft/agent-worklog.md`: record the decision trail.

## Verification Commands

- `npm.cmd exec -- vitest run src/app/portal-utils.test.ts src/app/portal-store.test.ts`
- `npm.cmd run verify:quick`
- `npm.cmd run build`
- `npm.cmd exec -- playwright test e2e/app-controls.spec.ts e2e/app-browser-acceptance.spec.ts --reporter=list`

## Skips

Full browser performance is skipped because this is a routing/control behavior change with no new renderer workload.
