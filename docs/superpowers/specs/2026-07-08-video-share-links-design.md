# Video Share Links Design

## Goal

Admins need to send a link to one specific Gumlet video instead of sharing a whole project playlist. The video page should communicate the selected playback speed as the intended viewing speed, show the estimated time saved, and let the client start playback from an overlay.

## Behavior

- Each video in the admin list gets its own copy/open link actions.
- The video link encodes a single-video snapshot, including project context and video metadata.
- The admin Gumlet input accepts a plain asset ID, Gumlet watch/embed URL, full iframe snippet, or direct Gumlet MP4 URL.
- When a direct MP4 URL is present, the video-only page renders a native HTML video player, sets `playbackRate` to the selected speed before playback, and starts at the configured start time.
- When only an asset ID is present, the page renders the Gumlet iframe fallback and sends best-effort playback-speed commands after load.
- The video page shows a dismissible start overlay over the video. The overlay displays selected speed, estimated watch time, and estimated time saved. Clicking it starts playback.

## Data

- Add `directVideoUrl?: string` to `PortalVideo`.
- Existing videos without this field continue to work through Gumlet embed URLs.
- Video share snapshots include a minimal project object plus one `PortalVideo`.

## Limits

Browser code cannot guarantee playback speed inside a third-party iframe. Enforced speed is only guaranteed for direct video sources rendered through native `<video>`.

## Verification

- Unit tests cover Gumlet input parsing, video share URL encoding/decoding, and the direct video URL storage path.
- Browser tests cover copying a single-video link and opening the video page overlay.
