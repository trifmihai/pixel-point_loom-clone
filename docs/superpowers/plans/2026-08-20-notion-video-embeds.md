# Notion Video Embeds Implementation Plan

Verification tier: Tier 3

Reason: This adds a public media route, cross-origin framing policy, share-dialog actions, and playback behavior inside a nested iframe. It does not change Toolcraft runtime internals, dependencies, D1 schema, canvas/export behavior, or renderer workload.

Run: red-first focused unit/browser checks, `npm.cmd run verify:quick`, `npm.cmd run build`, focused nested-iframe/mobile browser acceptance, then `npm.cmd run verify:final` for the final handoff.

Skip: the full browser performance checkpoint because this is a post-first-working DOM/media feature with no performance complaint, custom renderer, canvas, animation workload, or export path. Preserve the existing lightweight performance policy.

## 1. Lock the URL and token contract

Files:

- `src/app/portal-utils.ts`
- `src/app/portal-utils.test.ts`
- `src/app/portal-api.ts` only if a returned link type needs to expose both destinations

Work:

- Add a pure helper that converts a resolved single-video review URL into `/embed/video/:slug`, preserving the cloud token and any legacy `data` query.
- Reject project/share URLs as embed candidates so a collection cannot silently become a single-video player.
- Keep one D1 share-link record and one token for review and embed destinations; do not add a migration or second token kind.
- Cover cloud HTTPS, encoded fallback, malformed URL, and project-link rejection in unit tests.

## 2. Share public-video resolution between review and embed routes

Files:

- `src/app/video-share-portal.tsx`
- new `src/app/use-public-video-share.ts` (or an equivalently focused loader module)
- focused unit tests for extracted pure resolution helpers

Work:

- Extract the current encoded/local/cloud token resolution, passcode unlock, expiry/error handling, and video snapshot normalization from `VideoSharePortal`.
- Return the same `VideoShareSnapshot`, cloud-token status, passcode state, and unlock callbacks to both presentations.
- Preserve the rule that legacy encoded links do not create cloud first-view events.
- Keep API payloads and current `/video/:slug` behavior unchanged.

## 3. Reuse the recommended-speed playback surface

Files:

- `src/app/video-share-portal.tsx`
- `src/app/gumlet-player.tsx`
- new `src/app/recommended-speed-video-player.tsx` (name may follow the final extraction boundary)
- `src/app/gumlet-player-adapter.ts` only if reuse exposes a missing typed callback

Work:

- Extract the native MP4/Gumlet player, duration resolution, configured start-time application, recommended-speed start action, confirmation/fallback status, and time-savings overlay into a shared component.
- Give the shared component callbacks for confirmed playback, current time, duration, and external pause/seek needs so the full review page retains timestamped feedback behavior.
- Keep the native path exact (`defaultPlaybackRate`, `playbackRate`, start time, sound request before `play()`) and the Gumlet path best-effort with the existing player.js confirmation logic.
- Ensure the compact embed does not duplicate or fork playback-rate logic.

## 4. Add the compact embed route

Files:

- new `src/app/video-embed-portal.tsx`
- `src/routes/root.tsx`
- `src/styles.css` only for embed-specific layout that cannot be expressed cleanly with existing utilities

Work:

- Register `/embed/video/$slug` with the same optional legacy `data` search value.
- Render a responsive 16:9 playback card with title, project context, speed/time-saved overlay, loading/error/passcode states, and `Open full review` link.
- Omit project navigation, feedback canvas/comments, admin navigation, and other full-page chrome.
- Reuse `useFirstViewTracking` and trigger it only from confirmed native/Gumlet playback.
- Make the layout work without document scrolling at typical Notion widths (about 320px through full page width), with keyboard-accessible start and full-review actions.

## 5. Add the admin sharing workflow

Files:

- `src/app/admin-portal.tsx`
- `src/app/portal-ui.test.ts` or the closest focused presentation test
- `e2e/app-controls.spec.ts`

Work:

- When the share dialog targets a video, show separate `Full review link` and `Notion embed link` fields/actions.
- Resolve the stable review link once, derive the embed URL from it, and keep both disabled/loading/error states synchronized.
- Add Copy and Preview actions for the embed URL plus concise `/embed` instructions.
- Keep project-targeted dialogs unchanged and explain that local-only URLs cannot work in Notion; require the public HTTPS cloud URL for the embed action.
- Use existing Toolcraft UI components and clipboard/status handling; do not add raw form controls or route-local persistence.

## 6. Make only the embed route frameable

Files:

- `public/_redirects`
- `public/_headers`
- `src/app/deployment-config.test.ts`

Work:

- Add the SPA rewrite for `/embed/video/*`.
- Refactor the CSP rules so `/embed/video/*` has an intentional frame-ancestor policy suitable for Notion while `/admin`, `/share/*`, and `/video/*` remain self-only.
- Add `X-Robots-Tag: noindex, nofollow` to embed responses and preserve the current script/style/media/frame/connect restrictions.
- Add configuration tests that fail if a future global/self-only CSP shadows the embed exception or if protected routes become frameable.
- Verify actual response headers after build and, when deployed, with an HTTPS request; do not infer success only from `_headers` source text.

## 7. Acceptance and regression coverage

Files:

- `src/app/app-acceptance.ts`
- `src/app/app-acceptance.test.ts`
- `e2e/app-browser-acceptance.spec.ts`
- `e2e/app-controls.spec.ts`
- `docs/toolcraft/agent-worklog.md`

Add named coverage for:

- stable full-review/embed URL pairing;
- admin Copy/Preview embed actions;
- direct embed route refresh;
- cross-origin nested iframe rendering (a local harness simulates the Notion ancestor boundary);
- native playback starts at configured speed/start time and requests sound;
- Gumlet fallback receives speed/start commands;
- passcode unlock inside the embed;
- page load does not track a view, confirmed playback does, and repeat playback remains idempotent;
- narrow and wide responsive layout;
- `Open full review` keeps the original `/video/:token` destination;
- existing project/video/passcode/feedback/activity/legacy-link regressions.

## 8. Browser verification and release boundary

Commands:

- `npm.cmd run ai:check`
- focused Vitest files for URL, deployment, playback, acceptance, and component-system behavior
- focused Playwright tests for admin embed sharing and embedded playback
- `npm.cmd run verify:quick`
- `npm.cmd run build`
- inspect `dist/_headers` and `dist/_redirects`
- `npm.cmd run verify:final`
- start or reuse the verified app URL with `npm.cmd run dev`

Production check after deployment:

- paste a real public HTTPS `/embed/video/:token` URL into a Notion `/embed` block;
- confirm in-place playback at the recommended speed, resizing, passcode behavior if applicable, and the full-review link;
- confirm `/video/:token` still refuses third-party framing.

If Loom-style automatic recognition from the ordinary review URL is required after this core flow works, add a separate oEmbed/Iframely discovery plan and submit the live domain for Iframely review. That external approval is not a prerequisite for the explicit Notion `/embed` workflow.
