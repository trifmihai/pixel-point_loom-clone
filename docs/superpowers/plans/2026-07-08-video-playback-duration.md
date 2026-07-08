# Video Playback And Duration Plan

Verification tier: Tier 2

Reason: This changes product behavior on the single-video route: playback start, audio state, speed application, and metadata-derived time labels. It does not touch Toolcraft runtime internals, exports, canvas rendering, dependencies, or performance-sensitive workloads.

Files:
- `e2e/app-browser-acceptance.spec.ts`: add/adjust browser coverage for native video metadata, start button time labels, unmuted playback, and selected speed at play time.
- `src/app/video-share-portal.tsx`: infer duration from native video metadata, use inferred duration in overlay/button copy, force unmuted audible playback from the click handler, and apply selected speed at the same user gesture.
- `docs/toolcraft/agent-worklog.md`: record this iteration and verification.

Affected surfaces:
- Schema controls: none.
- Sections/panel actions: none.
- Renderer output: route-local DOM video page only.
- Timeline/layers/persistence/settings/export: none.

Acceptance and verification:
- Red browser test before implementation for missing metadata-derived time labels and play-time media state.
- `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts -g "video page"`.
- `npm.cmd run verify:quick`.
- `npm.cmd run build`.

Skipped:
- Full performance checkpoint, because this is a route behavior/DOM control change with no renderer workload change.
