# Pixel Point Portal Redesign

## Goal

Turn the existing Gumlet-backed client review app into a focused Pixel Point video-sharing portal without changing any already-shared public URL, token, Gumlet identifier, deployed domain setting, authentication boundary, or stored record solely to fit the redesign.

The redesign covers the admin workspace, project and video management, public project collections, public single-video viewing, authentication and passcode states, responsive behavior, accessibility, feedback, and link management.

## Reference & Audit Inputs

- User brief in `C:\Users\Mike\.codex\attachments\8f9b572b-11f9-4010-bf2f-47ca2a765fc0\pasted-text.txt`.
- Admin reference screenshot `D:\Downloads\screencapture-pixel-point-loom-clone-pages-dev-admin-2026-07-17-16_05_25.png`.
- Public video reference screenshot `D:\Downloads\screencapture-pixel-point-loom-clone-pages-dev-video-3cfaa1f363052071eb1c9f72c679ec7d8853-2026-07-17-16_06_08.png`.
- Current local browser audit at 1440, 1280, 1024, 768, 430, 390, and 360 pixels.
- Current route, API, D1, localStorage, auth, Gumlet player, and Playwright source.

## Current Public URL Contract — Immutable

The implementation must preserve this contract exactly:

1. `/share/$slug`
   - TanStack route parameter name remains `$slug`.
   - A cloud URL uses the D1 `share_links.token` as the slug.
   - A legacy local URL may use `PortalProject.shareSlug`.
   - The existing optional `data` search parameter remains accepted and decoded as the legacy base64url project snapshot.
2. `/video/$slug`
   - TanStack route parameter name remains `$slug`.
   - A cloud URL uses the D1 `share_links.token` as the slug.
   - A legacy local URL may use the video-ID-derived slug suffix.
   - The existing optional `data` search parameter remains accepted and decoded as the legacy base64url video snapshot.
3. Old hash links `/#/share/...` and `/#/video/...` continue to upgrade to the matching clean public path. They must never redirect to `/admin`.
4. `/api/public/share/:token` remains the unauthenticated cloud token resolver.
5. `/api/public/share/:token/passcode` remains the unauthenticated passcode unlock endpoint.
6. `/admin` remains the protected administration route and `/` continues routing to it only when no legacy public hash route is present.
7. `VITE_PUBLIC_APP_URL`, `PUBLIC_APP_URL`, and the deployed Pages domain remain unchanged.
8. Existing `share_links.token`, `projects.share_slug`, project IDs, video IDs, and `videos.gumlet_asset_id` values are never regenerated or re-keyed.
9. No migration is required for this redesign. The existing D1 schema remains valid and existing rows are not rewritten as a migration step.

Compatibility is more important than route or storage elegance.

## Audit Findings Driving the Design

### Critical

- Copying or opening a cloud project/video link currently calls `POST /api/admin/share-links` every time and silently creates a new token. Link retrieval must reuse an active link with the same project, optional video, passcode hash, and expiry semantics.
- Immediate project deletion and video deletion can invalidate or change token-backed public content. Destructive actions need explicit confirmation and an accurate warning that active portal links can stop working; the redesign must not trigger either action automatically.
- A public Gumlet iframe can render as a blank white region when the third-party player is unavailable. The portal needs a bounded loading/error presentation around the player rather than allowing an unexplained empty surface.

### High Priority

- The admin page mixes project metadata, passcode creation, generated URLs, video ordering, preview, and destructive actions without a clear workflow.
- The 1024-pixel layout activates the desktop sidebar while compressing the project workspace; mobile actions become large vertical stacks and project switching is a horizontal button strip with weak hierarchy.
- Public collection navigation falls after the entire feedback area on narrow screens, making switching or returning to a video unnecessarily difficult.
- The single-video start overlay covers almost the entire player on mobile.
- A suggested speed is shown, but there is no clear portal-owned viewer speed selector.
- Save, copy, and playback status updates are not consistently announced to assistive technology.

### Medium Priority

- The app still presents itself as “Gumlet portal” and “Client reviews” instead of a cohesive Pixel Point product.
- Pure-black background, near-identical card surfaces, tight spacing, and dense metadata create a generic starter-dashboard appearance.
- Forms have limited helper text, native numeric constraints, inline validation, and autocomplete metadata.
- Long project/video titles are truncated or produce uneven action alignment at several breakpoints.
- Local-only viewer feedback is not clearly described as device-local.

### Polish

- Loading copy uses periods instead of an ellipsis and loading states are mostly text cards instead of consistent skeletons.
- Numeric durations and time savings do not consistently use tabular numerals.
- Safe-area padding, reduced-motion behavior, skip navigation, and balanced heading wrapping are missing.

## Approaches Considered

### 1. Incremental product redesign — selected

Keep the routing, auth, APIs, D1 schema, localStorage fallback, Gumlet adapters, and existing UI library. Add only the API capability needed to reuse active share links, extract a small shared portal presentation layer, and reshape the route components incrementally.

This provides the required UX improvement with the smallest compatibility surface.

### 2. CSS-only restyle — rejected

This would be quick but would preserve silent token regeneration, unclear destructive actions, weak responsive information architecture, and inaccessible status feedback.

### 3. Full router/data/component rewrite — rejected

This could produce cleaner internals but would create unnecessary risk around public paths, token semantics, auth, local fallbacks, Gumlet playback, and production D1 data.

## Product & Visual Direction

Pixel Point is presented as a quiet client video portal, not a Loom clone and not a generic analytics dashboard.

- Use a deep ink background rather than pure black, with three clear surface levels and low-contrast cool borders.
- Retain blue as the action color, with cyan only for selected/focus states and green only for successful completion.
- Introduce a small Pixel Point wordmark treatment built from text and a simple geometric mark; do not introduce a remote logo asset.
- Use Inter with balanced headings, comfortable body line height, tabular duration numerals, 12–16 pixel surface radii, and a consistent 4/8/12/16/24/32 spacing rhythm.
- Keep cards restrained. Important workspace boundaries come from layout and surface hierarchy, not decorative gradients or excessive badges.
- All route states use the same page frame, state card, buttons, fields, alert language, and focus treatment.

## Shared Presentation Components

Create a focused app-owned presentation layer under `src/app`:

- `PortalBrand`: Pixel Point mark and product label.
- `PortalPageHeader`: public/admin heading shell with optional eyebrow, description, metadata, and actions.
- `PortalStateCard`: consistent loading, empty, unavailable, and protected-state framing.
- `PlaybackSpeedControl`: accessible viewer speed selection initialized from the administrator recommendation.
- `TimeSavingsSummary`: original duration, accelerated duration, and saved time using tabular numerals.
- `PortalStatus`: polite live-region status for save, copy, sync, and playback results.

These are app presentation components only. They use existing Toolcraft UI primitives and do not replace the Toolcraft runtime or copy runtime component implementations.

## Admin Experience

### Navigation & Workspace

- Desktop at 1200 pixels and above uses a 264-pixel sticky project sidebar and a flexible project workspace.
- Tablet and narrow desktop use a compact top bar with a project switcher that opens a Sheet; the 1024-pixel view does not retain a cramped desktop sidebar.
- Mobile uses the same top bar, full-width primary actions, and a Sheet-based project list rather than a horizontal overflow strip.
- The sidebar/top bar shows Pixel Point branding, a clear Projects label, project count, sync state, New project, and the signed-in/admin status. Diagnostics remain available in a disclosure area but do not dominate navigation.

### Project Overview

- The project header shows client, project name, video count, updated time, accessible save/sync state, and two primary workflow actions: Share project and Add video.
- Project metadata moves behind an explicit Project settings action. The settings dialog groups identity fields separately from the danger area.
- Share URL and passcode are removed from the ordinary project metadata form. Link creation belongs to the share workflow.
- Project deletion keeps the current data operation but requires an alert dialog, names the project, warns that portal links can stop working, and never runs from a menu click alone.

### Video Library & Preview

- The main project view is organized around a scannable video library and the selected preview.
- Wide layouts place the library beside the preview; medium and mobile layouts put the library before the preview.
- Video rows show title, source duration, recommended speed, accelerated watch time, saved time, and an obvious selected state without truncating the only meaningful title text.
- Reorder, edit, refresh duration, copy link, open link, and remove are available from a well-labeled menu. Up/down buttons keep their accessible names.
- Removing a video keeps the existing metadata-only operation, requires confirmation, states that Gumlet is untouched, and warns that an active single-video portal link can stop working.

### Forms & Feedback

- Create/edit project and video dialogs use explicit sections, helper text, correct `name`, `type`, `inputMode`, `min`, `step`, and autocomplete attributes.
- Required errors render inline and the first invalid field receives focus.
- Unsaved dialog edits are local to the dialog and Cancel discards them.
- Cloud/local persistence state appears in a polite live region. The user sees “Saving…”, “Saved to cloud”, “Saved on this device”, or a corrective error message.

### Stable Sharing

- The existing `POST /api/admin/share-links` route remains unchanged.
- The backend first looks for an unrevoked, unexpired link for the same owner, project, optional video, passcode hash, and normalized requested expiry. Undefined expiry matches only another undefined expiry. If found, it returns that record instead of creating a token.
- The response adds `reused: boolean`; existing clients remain compatible because existing response fields are unchanged.
- Copy/Open actions therefore reuse stable links by default. No “regenerate” action is introduced.
- A share dialog makes the distinction between copying the standard client link and deliberately creating/retrieving a passcode-protected link clear.
- Copy success is visible and announced. Opening uses the same resolved URL and cannot point to `/admin`.

## Public Single-Video Experience

- Use a centered 1120-pixel frame with a compact Pixel Point brand bar, client/project context, clear video title, recommended speed, and time-saving summary.
- The player remains the dominant surface and continues using the existing native MP4 or Gumlet iframe path.
- On mobile, the start-review panel sits in normal flow immediately below the player. At larger widths it may overlay the player without obscuring the complete frame.
- Add an external playback-speed selector. It starts at the recommended speed, lets the viewer select every existing supported speed, updates watch/saved-time calculations, and applies the selected speed to native or Gumlet playback without mutating admin metadata.
- Keep native/Gumlet controls available. The portal never locks speed.
- Playback confirmation and fallback text use an accessible live region.
- Loading, invalid, expired, passcode, duration-undetected, and player-unavailable states use the shared state language and provide a next step where possible.

## Public Project/Collection Experience

- Desktop keeps a sticky collection rail beside the selected player.
- Tablet/mobile place a compact collection switcher directly after the project header and before the player. The viewer never has to pass the feedback form to switch videos.
- Each video item handles long titles, shows progress, duration, selected speed, watch time, and saved time.
- Returning to the collection is inherent because the collection control stays adjacent to the player.
- The selected video exposes the same viewer speed control and time-saving summary as the single-video page.
- Existing local viewing progress and feedback remain supported. Feedback is labeled as notes saved on this device so the portal does not imply admin synchronization that does not exist.

## Accessibility & Interaction

- Add a skip link to the main content for admin and public layouts.
- Maintain semantic `main`, `nav`, `aside`, `section`, and hierarchical headings without redundant ARIA heading roles.
- Keep all icon-only buttons labeled and provide at least 44-pixel touch targets for primary mobile interactions.
- Use existing focus-visible primitives and add group focus treatment where cards contain compound controls.
- Put save/copy/sync/playback messages in `aria-live="polite"`; errors use `role="alert"` and field associations.
- Dialogs and menus continue using the existing accessible primitives for focus management and Escape behavior.
- Loading/skeleton animation respects `prefers-reduced-motion`.
- Add safe-area-aware outer padding and preserve browser zoom.

## Error & Empty States

- Admin: first project, empty project, cloud unavailable, local-only, local import, and save failure states all keep one clear primary next action.
- Public: token loading, invalid/revoked token, expired token, passcode required/incorrect, empty project, missing video, player unavailable, duration unavailable, and playback-command fallback are visually distinct but use the same state component.
- API error messages remain corrective and do not expose sensitive admin data.

## Data, Security & Migration Policy

- No destructive or compatibility migration is part of this redesign.
- No existing record is edited during startup or as a design migration.
- Existing token resolution remains public and passcode-gated exactly as before.
- Admin APIs remain session-protected and public APIs remain outside the admin layout.
- Gumlet asset IDs, direct video URLs, thumbnails, durations, start times, recommended speeds, and project/video IDs remain unchanged unless an administrator explicitly edits the corresponding form.
- LocalStorage keys and legacy encoded snapshot formats remain accepted.

## Toolcraft Decisions

- Product output is operational React DOM and third-party/native video, not a Toolcraft canvas product.
- No Toolcraft layers, timeline, renderer, export action, or schema controls are added.
- Existing hidden `ToolcraftApp` assembly compatibility remains untouched in this redesign.
- Persistence remains the existing D1-plus-localStorage portal policy; runtime settings transfer is not used for product records.

## Verification Tier

Verification tier: Tier 4

Reason: Broad final-delivery redesign of routing-sensitive public pages, API link behavior, admin information architecture, shared visual system, forms, responsiveness, accessibility, and browser acceptance.

Run:

- `npm run ai:check`
- focused Vitest tests for route utilities, store behavior, cloud API link reuse, and Gumlet playback
- `npm run verify:quick` during implementation checkpoints
- focused browser acceptance for admin, public collection, public video, passcode, invalid token, clipboard links, responsive layouts, and keyboard/dialog behavior
- `npm run verify:final`
- browser performance checkpoint because this is a major final-delivery pass
- `npm run dev` with verified Toolcraft server identity

Skip: No D1 migration execution or deployment because the redesign requires no schema change and the user did not request production deployment.

## Acceptance Mapping

- Route contract tests prove `/share/$slug`, `/video/$slug`, `data`, and legacy hash compatibility.
- Cloud API tests prove an existing active project/video link is returned unchanged and a new token is created only when no compatible active link exists.
- Browser tests prove copied URLs are public, never `/admin`, and resolve to the expected project/video.
- Admin acceptance proves project creation, project editing, video add/edit/reorder/remove confirmation, stable sharing, and empty/error states.
- Public acceptance proves video prominence, viewer speed selection, saved-time updates, collection navigation, passcode states, invalid tokens, and mobile layout.
- Accessibility checks prove labels, live regions, focus behavior, dialog confirmation, heading order, touch targets, and no horizontal overflow at 1440, 1280, 1024, 768, 430, 390, and 360 pixels.

## Out of Scope

- Uploading, recording, editing, transcoding, or deleting Gumlet assets.
- New analytics, billing, user teams, notifications, or client accounts.
- Syncing viewer feedback to D1; current feedback remains device-local and is labeled honestly.
- Changing the Pages domain, route structure, token format, or authentication provider.
- Deploying or mutating the production database.
