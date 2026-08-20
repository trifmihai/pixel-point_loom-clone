# Notion Video Embeds Design

## Goal

Give every shared video a public HTTPS embed URL that can be pasted into a Notion `/embed` block and played inside the Notion page. Playback must start from the configured start time at the video's recommended speed and retain the existing time-saved message.

## Scope

- Add embeds for individual videos only. Project collection links remain full portal pages because a collection is navigation, not one playable media object.
- Reuse the existing cloud share token for both the full review URL and the embed URL. Revocation, expiry, passcode protection, and stable-link reuse therefore apply to both URLs without a new database table.
- Keep legacy encoded video snapshots working for local/browser testing, but label them non-portable because Notion cannot load a localhost URL.
- Keep feedback and review tools on the full video page. The embed is a compact playback surface with an `Open full review` link.

## User Experience

The video share dialog exposes two destinations when its target is a video:

1. **Full review link** — the current `/video/:token` route.
2. **Notion embed link** — a new `/embed/video/:token` route, with Copy and Preview actions plus the instruction: `In Notion, type /embed, paste this HTTPS URL, and choose Embed.`

The embedded card is responsive and playback-first:

- 16:9 video surface with poster/Gumlet preview;
- compact title and project context;
- central start action;
- recommended speed, accelerated watch time, and time saved;
- configured start time;
- native video or Gumlet fallback using the existing playback adapter;
- first-view tracking only after confirmed playback, never on iframe/page load;
- compact passcode gate when the underlying token is protected;
- a subtle full-review link for feedback and comments.

## Architecture

- Add a TanStack route at `/embed/video/$slug`.
- Extract/reuse the current public-video resolution and recommended-speed playback logic so `/video/$slug` and `/embed/video/$slug` cannot drift.
- Derive the embed URL from the resolved video review URL. Do not create a second share-link record.
- Make only `/embed/video/*` frameable. Keep `/admin`, `/share/*`, and `/video/*` protected by `frame-ancestors 'self'`.
- Add the embed path to the Cloudflare Pages SPA rewrite and return `X-Robots-Tag: noindex, nofollow` for unlisted embed pages.
- Use ordinary React DOM plus native video/Gumlet iframe playback. No Toolcraft canvas, custom renderer, timeline, layers, export, or new persistence is introduced.

## Notion Compatibility Boundary

The first release guarantees the workflow Notion documents for arbitrary providers: create an Embed block, paste the HTTPS embed URL, and play in place. The current repository blocks this because its global CSP uses `frame-ancestors 'self'`; the dedicated route and path-scoped CSP fix that concrete blocker.

Loom-like automatic recognition when pasting the ordinary review URL is a separate publisher-discovery step. Notion uses Iframely, and Iframely requires server-readable discovery metadata plus provider review. After the core embed ships, that can be added as a second phase with oEmbed/Iframely discovery and domain submission; approval is external and cannot be guaranteed by application code alone.

## Toolcraft Decisions

- **Control Section Inventory:** unchanged. The feature adds actions to the existing share dialog, not schema-backed Toolcraft control sections.
- **Timeline:** none; media playback remains native/Gumlet-owned.
- **Layers:** none.
- **Persistence/settings transfer:** no new state; stable public share records remain in D1 and legacy snapshots remain URL-encoded.
- **Custom controls:** none; use existing Toolcraft UI buttons, fields, dialog surfaces, and status components.
- **Renderer:** ordinary DOM/video composition, not a Toolcraft product renderer.
- **Export:** none.

## Acceptance Criteria

- Copying the Notion embed link for a cloud-shared video returns a stable public `/embed/video/:token` HTTPS URL using the same token as the full review link.
- Opening that URL directly or inside a cross-origin iframe resolves the video, including passcode, expiry, and revocation states.
- Clicking the overlay starts native MP4 playback at the configured speed and start time with audible playback requested; Gumlet fallback sends the existing start/speed commands and reports its current confirmation/fallback status.
- The embed shows title, project context, recommended speed, and duration savings without rendering admin UI or the full feedback interface.
- Confirmed playback records the same once-per-video first-view activity as the full video page; loading the embed alone does not.
- `/admin`, `/share/*`, and `/video/*` remain non-embeddable outside the app; only `/embed/video/*` is frameable.
- The embed remains usable at narrow Notion column widths and at a full-width 16:9 size.
- Existing project links, video review links, passcodes, feedback, first-view tracking, and legacy encoded URLs continue to pass their current tests.
