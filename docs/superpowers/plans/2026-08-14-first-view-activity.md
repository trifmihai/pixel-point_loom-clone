# First View Activity Implementation Plan

Verification tier: Tier 4
Reason: Additive D1/API/playback/admin-activity feature whose primary risk is compatibility with live client links.
Run: compatibility baseline, focused TDD tests, `npm.cmd run verify:quick`, targeted Playwright, `npm.cmd run verify:final`, `npm.cmd run dev`.
Skip: full performance checkpoint; the feature adds one event request and low-count DOM rows only.

## Compatibility gate

1. Run the existing public-token, passcode, legacy encoded-link, hash redirect, playback, and feedback tests before implementation.
2. Add explicit regression assertions that existing public share payloads and reusable token behavior remain unchanged.
3. Keep migrations and endpoints additive. Stop implementation if any existing route, token schema, passcode flow, or playback contract would need a breaking change.

## Implementation sequence

1. Add `migrations/0003_first_video_views.sql` with one first-view activity row per `video_id`, foreign keys to project/video, optional viewer identity, read state, and email delivery state. Do not alter existing tables.
2. Add first-view types and validation/mapping helpers under `src/app`, with failing tests first for anonymous identity, reused optional identity, row mapping, and public-field normalization.
3. Extend `PortalCloudDatabase`, its memory adapter, D1 adapter, and the missing-DB Pages adapter with atomic create, list, mark-read, and delivery-state operations. Add failing API/database tests first for concurrency/idempotency and owner isolation.
4. Add `POST /api/public/share/:token/view`. Reuse existing active-token, expiry, passcode, rate-limit, and video-scope rules; ignore valid administrator sessions; return quickly after the durable first insert. Add tests first for video/project tokens, passcodes, duplicates, admin sessions, expired/revoked tokens, migration absence, and unchanged existing endpoints.
5. Add authenticated `GET /api/admin/activity` and `POST /api/admin/activity/read`, plus API-client methods. Responses include events, unread count, and whether email delivery is configured.
6. Add a provider-neutral optional delivery callback to `PortalApiRuntime`. Persist `not-configured`, `sent`, or `failed` without allowing email behavior to roll back the in-app event. Do not add bindings, secrets, provider packages, or client-visible setup fields.
7. Add a small playback tracking hook/helper. Wire native `play` and Gumlet `playbackStarted` on cloud-token video pages, and Gumlet `playbackStarted` for cloud-token collection pages. Reuse the existing `pixel-point.feedback.guest.v1` identity if present; add no client prompt. Never await tracking from the playback handler.
8. Add an Activity feed to `src/app/admin-portal.tsx` or a focused `src/app/admin-activity-panel.tsx`, using existing Card, Badge, Button, Empty, Sheet/Dialog, and status primitives. Cover desktop/mobile unread entry points, loading/error/empty states, email-not-connected information, mark-read, and project/video selection.
9. Update `src/app/app-acceptance.ts`, its tests, browser acceptance, deployment documentation, and `docs/toolcraft/agent-worklog.md`. Declare no Toolcraft control sections, timeline, layers, renderer, persistence-schema, settings transfer, or export changes.
10. Run the Tier 4 verification commands and real-browser compatibility flows. Do not report completion if any old-link regression, new feature test, build, or functional browser scenario fails.

## Expected file surface

- New: `migrations/0003_first_video_views.sql`, first-view activity types/helpers/tests, optional admin activity component/tests.
- Update: `src/app/portal-cloud-api.ts`, `src/app/portal-cloud-api.test.ts`, `src/app/portal-api.ts`, `functions/api/[[path]].ts`, `src/app/video-share-portal.tsx`, `src/app/share-portal.tsx`, `src/app/admin-portal.tsx`, acceptance and Playwright files, deployment docs, and Toolcraft worklog.
- Preserve: `src/toolcraft/**`, existing migrations, routes, share-link creation/reuse, public payloads, passcode flow, feedback contracts, timeline, layers, and export behavior.
