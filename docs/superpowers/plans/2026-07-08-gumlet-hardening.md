# Gumlet Share Flow Hardening Plan

Verification tier: Tier 2

Reason: This pass changes product route behavior, iframe playback status, duration fallback/persistence, local video metadata, and admin video actions. It does not change Toolcraft runtime internals, canvas, export, layers, timeline, dependencies, or renderer workload.

Files:
- `src/app/gumlet-player-adapter.ts`: clarify observed Gumlet command path vs fallback command attempts; parse playback/status events when available.
- `src/app/gumlet-player.tsx`: expose status callbacks, duration request timing, start retries, and timeout handling.
- `src/app/video-share-portal.tsx`: keep start CTA honest, show attempting/fallback status, keep the button usable without duration, and avoid fake savings.
- `src/app/admin-portal.tsx`: clear duration on asset changes, add refresh-duration action, stabilize active selection on delete, persist preview-detected duration.
- `src/app/portal-store.ts`: ensure asset changes can clear stale duration without losing explicit new duration.
- Tests in `src/app/*.test.ts` and `e2e/*.spec.ts`.
- `docs/toolcraft/agent-worklog.md`.

Acceptance:
- Stored duration shows savings immediately.
- Missing duration shows loading, then a non-fake fallback message.
- Start sends Gumlet commands, re-applies speed, and does not claim confirmed playback when Gumlet has not confirmed.
- Editing title works.
- Editing asset clears stale duration unless a new duration is explicitly entered.
- Deleting the active video selects the next video or shows empty state.
- Preview/player duration detection persists to localStorage.
- Browser manual verification uses the supplied real Gumlet asset.

Commands:
- Red focused Vitest and Playwright tests before implementation.
- `npm.cmd exec -- vitest run src/app/gumlet-player-adapter.test.ts src/app/portal-store.test.ts src/app/portal-utils.test.ts`
- `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts e2e/app-controls.spec.ts --reporter=list --workers=1`
- `npm.cmd run verify:quick`
- `npm.cmd run build`

Skipped:
- Full performance checkpoint because this is post-first-working product behavior and local metadata hardening without renderer/canvas workload changes.
