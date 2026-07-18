# Timestamped Visual Feedback Design

## Product intent

Add a focused cloud-backed review workflow to existing clean-token video links. A guest switches from Watch to Review, clicks the visible video frame, and leaves a comment tied to the current time and a percentage position. The administrator sees unread feedback in the existing project workspace, can reply once or more as the administrator, resolve/reopen it, copy the exact comment link, and soft-delete inappropriate content.

This is an operational portal feature, not a Toolcraft canvas/editor feature. It keeps the existing React DOM, native video/Gumlet player, routes, signed admin session, Cloudflare Pages Functions, and D1 architecture.

## Scope decisions

- Feedback is available only for cloud token links. Legacy `?data=` links continue to play but do not expose Review mode.
- D1 is the source of truth for comments. `localStorage` stores only the guest display name and optional email convenience values.
- Public comment responses omit guest email, `adminReadAt`, deleted records, and other admin-only fields.
- A project share token may authorize comments only for a video that belongs to that project. A video token may authorize only its linked video.
- Passcode-protected links send the in-memory passcode in an `X-Share-Passcode` header when loading or creating comments. The passcode is not persisted.
- Parent comments are guest-authored in V1. Replies are admin-authored and attach to one parent. Replies do not form deeper threads.
- Parent comments own position, timestamp, status, and unread state. Admin replies inherit the parent timestamp for ordering and have no marker position.
- Public comments are sorted by timestamp, then creation time. Admin feedback is sorted newest first.
- Soft-deleted parents and their replies are hidden by default. Soft-deleted replies are hidden individually.
- Review mode pauses playback before opening the composer. Native video uses its exact `currentTime`; Gumlet uses subscribed/retrieved player.js time with a safe zero fallback until the player reports time.
- Direct links use `/video/:token?comment=:commentId`, enter Review mode, seek to the parent timestamp, and focus the comment after data loads.

## Data model

Migration `migrations/0002_feedback_comments.sql` creates `feedback_comments` with the requested fields and checks for roles, status, non-negative timestamp, and 0–100 positions. It indexes share token, project, video, parent, status, and unread lookup. Project/video foreign keys cascade with existing project deletion behavior; the token is stored as review evidence without a foreign key so a revoked token does not corrupt retained feedback rows.

## API behavior

Public:

- `GET /api/public/share/:token/comments?videoId=:videoId`
- `POST /api/public/share/:token/comments`

Both routes resolve active/non-expired tokens, enforce optional passcodes, validate video scope, and reuse the existing public IP rate limiter. POST validates name (1–80), optional lightly validated email, body (1–1000), timestamp >= 0, and both position percentages in 0–100.

Admin:

- `GET /api/admin/feedback`
- `GET /api/admin/videos/:videoId/feedback`
- `POST /api/admin/feedback/:commentId/replies`
- `PATCH /api/admin/feedback/:commentId`
- `POST /api/admin/videos/:videoId/feedback/read`

Every admin route uses the existing signed HttpOnly session. Summary counts include parent comments only. Unread means a non-deleted guest parent has no `admin_read_at`.

## Public experience

The page header gets a compact Watch/Review segmented control only on cloud-token pages. Review mode adds a subtle crosshair overlay and restrained numbered blue markers. Clicking empty video space pauses playback and opens a compact composer close to the selected point on desktop; at narrow widths it uses a bottom sheet/card so it cannot overflow. The comments card stacks below the player and contains open/resolved filtering, timestamp buttons, replies, and a clear inline error/retry state.

Marker buttons are at least 40px tappable while their visible pin remains visually small. Watch mode removes the interaction overlay and markers so native/Gumlet controls remain usable.

## Admin experience

Each video card gets compact unread/open badges. A Feedback card below the selected video details loads only for cloud mode, marks the video read when opened, and keeps the video-management hierarchy intact. Parent cards show author, optional email, timestamp, status, text, replies, and desktop actions. Mobile actions collapse into the existing DropdownMenu pattern. Reply, resolve/reopen, direct-link copy/open, and soft-delete all show inline failure feedback without discarding loaded comments.

The direct link uses the comment row's original `shareToken`, ensuring it opens through a token that actually owns the comment.

## Persistence and privacy

- D1: comments, replies, status, unread/read timestamps, and soft deletion.
- localStorage: `pixel-point.feedback.guest.v1` containing only guest name/email.
- signed HttpOnly cookie: unchanged admin authentication.
- no admin secret, auth token, guest email, or admin-read metadata is exposed by public DTOs.

## Toolcraft decisions

- Controls: route-level portal controls use existing Toolcraft/shadcn UI components. No new Toolcraft schema control targets are introduced.
- Renderer: ordinary DOM overlays above native video/Gumlet iframe. No custom Toolcraft renderer.
- Timeline: none; playback time remains owned by the media player.
- Layers: none; feedback markers are review annotations, not editable product layers.
- Export: none; Gumlet remains the video host.
- Performance: low-count DOM markers/comments; no workload scenario or full performance checkpoint is warranted for this post-first-working feature.

## Acceptance map

- Public API rejects invalid tokens, out-of-scope video IDs, invalid fields, deleted rows, and private public fields.
- D1 mapping preserves nullable columns and snake_case/camelCase conversion.
- Position utility returns clamped percentages and direct comment search parsing accepts only a non-empty string.
- Public browser flow creates a marker/comment, remembers identity, survives refresh through mocked persistent API state, and works without horizontal overflow at 390px and 430px.
- Direct comment browser flow enters Review mode, seeks the media, highlights the comment, and preserves clean token routing.
- Admin browser flow shows unread/open badges, loads feedback, marks read, replies, resolves/reopens, copies/opens the direct link, and soft-deletes.
- Existing admin login, public token playback, project share, passcode gate, encoded fallback, and hash-upgrade coverage continues to pass.

## Verification classification

Verification tier: Tier 4

Reason: new D1 schema, broad public/admin API surface, media-player interaction, route search contract, and two responsive product workflows.

Run: focused Vitest red/green tests, `npm.cmd run verify:quick`, targeted browser acceptance at desktop/390/430, `npm.cmd run verify:final`, then `npm.cmd run dev` and verify the saved app identity URL.

Skip: full `verify:perf`; this is a post-first-working DOM/API feature, it adds no custom renderer/canvas/export/animation workload, and the request does not report a performance problem.
