# Real Gumlet Player Flow Plan

Verification tier: Tier 2

Reason: This changes route-level product behavior, localStorage video metadata, admin video management actions, and browser-visible client CTA behavior. It does not change Toolcraft runtime internals, app dependencies, export, canvas, layers, timeline, or heavy renderer workload.

Files:
- `src/app/gumlet-player-adapter.ts`: central Gumlet iframe command and message parsing adapter.
- `src/app/gumlet-player.tsx`: expose imperative player actions, post playback/unmute/speed commands, parse duration events.
- `src/app/video-share-portal.tsx`: use the real Gumlet player path for CTA start/speed/duration, native MP4 fallback remains supported.
- `src/app/admin-portal.tsx`: persist duration from preview metadata, use Dialog for edit, DropdownMenu + AlertDialog for delete.
- `src/app/portal-utils.ts`: central time-savings calculation/formatting.
- Tests under `src/app/*.test.ts` and `e2e/*.spec.ts`.
- `docs/toolcraft/agent-worklog.md`.

Affected surfaces:
- Schema controls: none.
- Product UI: admin video cards and single-video share CTA.
- Persistence: existing localStorage project/video store gains duration updates from player metadata.
- Renderer output: route DOM + Gumlet iframe/native video only.
- Timeline/layers/export/settings transfer: none.

Acceptance:
- Unit coverage for Gumlet command/message adapter and time-savings formatting.
- Browser coverage for Gumlet iframe CTA duration, strikethrough/faster/saved labels, and command attempts to play/unmute/set selected speed.
- Browser coverage for edit dialog and delete confirmation.

Commands:
- Red focused tests before implementation.
- `npm.cmd exec -- vitest run src/app/gumlet-player-adapter.test.ts src/app/portal-utils.test.ts`
- `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts e2e/app-controls.spec.ts`
- `npm.cmd run verify:quick`
- `npm.cmd run build`

Skipped:
- Full performance checkpoint because this is product routing/control behavior with no custom renderer workload.
