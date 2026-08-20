# First View Activity Design

## Product intent

Notify the signed-in administrator when the first external viewer starts each video, without adding a required client step and without changing any existing client link, token, passcode, playback, feedback, or legacy-link behavior.

The in-app Activity feed is the durable source of truth. Email is an optional delivery adapter: missing configuration or delivery failure never blocks playback and never removes the in-app event.

## Approved decisions

- Trigger: first confirmed playback, not page load.
- Scope: once per video across all current and future share links.
- Identity: reuse an already-saved feedback identity when present; otherwise record an anonymous viewer. Do not add a form or gate before playback.
- Admin experience: Activity feed with unread count, history, and video/project deep links.
- Email: provider-neutral app-first adapter only. Do not require Cloudflare Email Service, a sending domain, secrets, or a separate Worker in this pass.

## Existing-link compatibility gate

Implementation is allowed only while all changes remain additive:

- Keep `/video/:token`, `/share/:token`, legacy `?data=`, and hash-upgrade routes unchanged.
- Keep `share_links` rows and token creation/reuse semantics unchanged.
- Keep existing `GET /api/public/share/:token`, passcode unlock, comments endpoints, and response payloads unchanged.
- Add a new table rather than altering `projects`, `videos`, `share_links`, or `feedback_comments`.
- Add a new `POST /api/public/share/:token/view` endpoint; playback does not wait for its result.
- If the migration is missing, the tracking request may fail silently but the client video must still play.
- Legacy encoded links have no server token and therefore do not track; they continue to play unchanged.

## Event behavior

The focused video page records a view after native video emits `play` or Gumlet reports `playbackStarted`. The collection page records the selected video's first Gumlet `playbackStarted` event. Client code sends at most one request per mounted video; D1 remains authoritative across devices, tabs, links, and concurrent requests.

The server resolves the existing active, unexpired token, validates optional passcodes and video scope, and ignores a request when it carries a valid administrator session. If the stored guest-feedback identity already exists in the browser, the request may include its name and email. No identity field is shown before playback.

The database uses one row per video, so `INSERT OR IGNORE` makes simultaneous first plays idempotent. The row stores project/video/token references, optional viewer identity, first-view time, read time, and email delivery state. It stores no IP address, user-agent fingerprint, or playback telemetry.

## Admin experience

Add a compact Activity entry point to desktop and mobile admin navigation. Its unread badge is visible without opening the feed. The feed shows newest-first first-view events with project, video, relative/absolute time, optional viewer identity, and an `Open video` action that selects the correct project and video. Opening Activity marks visible events read after they have loaded.

Empty state: `No client views yet` with guidance that an event appears after someone starts a shared video.

Email state: `In-app activity is on. Email notifications aren't connected.` This is informational, not an error, and includes no provider-specific configuration form.

## Email adapter boundary

`PortalApiRuntime` may receive an optional first-view delivery callback. A newly inserted event calls it after the durable D1 write. No callback produces `not-configured`; success produces `sent`; a thrown error produces `failed`. Delivery status can be updated independently and cannot roll back or delay the playback response.

Cloudflare Email Sending is intentionally not configured here. The current Pages Function has no Email Sending binding, and doing so would require external sender-domain setup or a separate Worker/service binding.

## Toolcraft decisions

- Controls: ordinary portal navigation and cards using existing Toolcraft UI primitives; no Toolcraft schema controls.
- Renderer: unchanged React DOM plus native/Gumlet playback.
- Timeline: none; playback transport remains media-owned.
- Layers: none.
- Persistence: D1 for first-view activity; existing guest-identity localStorage key is read-only input and remains unchanged.
- Export: none.
- Performance: low-count activity rows and one fire-and-forget request per mounted video; no full performance checkpoint is required.

## Verification classification

Verification tier: Tier 4

Reason: additive D1 schema, public/admin API endpoints, authentication/passcode boundaries, playback signals, responsive admin navigation, and high-value compatibility requirements for live client links.

Run: baseline compatibility tests; focused red/green Vitest tests; `npm.cmd run verify:quick`; focused browser tests for existing link variants plus first-play activity at desktop and mobile widths; `npm.cmd run verify:final`; then `npm.cmd run dev` and verify the saved app identity URL.

Skip: full `verify:perf` because this is a post-first-working low-count DOM/API feature with no custom renderer, canvas, export, animation workload, or reported performance issue.
