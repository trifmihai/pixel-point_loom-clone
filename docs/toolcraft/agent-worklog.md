# Implementation Worklog

This file records product decisions and the evidence behind them.

## Status

Mode: product

The app is now a local-first Gumlet client video portal. It organizes existing Gumlet videos, creates encoded project and single-video share links, embeds Gumlet videos, starts direct MP4 video pages at the selected speed, and collects timestamped feedback locally.

## Decision Trail

### Iteration 1 - Gumlet portal build

- Request: Build a simple Loom-style client video portal using Gumlet embeds, with projects, manual asset IDs, recommended speed, share links, and timestamped feedback.
- Task type: Product app build in an existing Vite React starter.
- User-visible result: Admins can create projects, add Gumlet videos, copy share links, and clients can open a share page, watch embedded Gumlet videos, and leave timestamped comments.
- Source/reference checked: User request, local repo structure, `AGENTS.md`, Toolcraft workflow docs, route files, package scripts, existing tests.
- Reference inputs: User pasted-text request only; no Figma, video, GIF, screen recording, or external visual reference was supplied.
- Docs/contracts read: `AGENTS.md`, `docs/toolcraft/workflow.md`, `assembly-workflow.md`, `decision-contract.md`, `schema-reference.md`, `component-rules.md`, `acceptance-testing.md`, `performance.md`, `renderer-technique.md`.
- Contract rules applied: Reuse existing React/TanStack/Tailwind stack, avoid Gumlet server APIs, keep secrets out of client code, classify verification as Tier 4, use browser checks for visible behavior.
- Decision: Build a static local-first portal instead of inventing a backend or forcing the portal into a Toolcraft export-canvas workflow.
- Alternatives rejected: Gumlet upload/API integration because videos already exist in Gumlet; custom video controls because Gumlet native controls should stay enabled; database/auth because none exists in the repo.
- State/output mapping: Admin forms write project/video metadata to localStorage; copy link encodes a project snapshot into `/share/$slug?data=...`; share route decodes that snapshot, renders Gumlet iframe URLs, stores comments/progress locally, and updates iframe `t` when timestamp links are clicked.
- Files changed: `src/app/portal-*`, `src/app/admin-portal.tsx`, `src/app/share-portal.tsx`, `src/app/gumlet-player.tsx`, `src/routes/*`, `src/styles.css`, `src/app/*test.ts`, `e2e/*.spec.ts`, `docs/superpowers/*`, `docs/toolcraft/agent-worklog.md`.
- Verification: `npm.cmd run test` passed; `npm.cmd run build` passed; direct Playwright browser acceptance passed; direct Playwright browser performance fallback passed. `npm.cmd run verify:final` reached browser install after passing AI checks, tests, and build, then hung in `playwright install chromium`, so browser suites were run directly with the installed browser.
- Skipped checks: Gumlet API tests skipped because MVP intentionally uses iframe embeds only and no Gumlet API key.
- Risks: Feedback and admin data are local to the browser unless a backend is added; iframe playback-rate setting is best effort because the standard iframe does not expose a guaranteed typed API in this app.

### Iteration 2 - Toolcraft UI component refactor

- Request: Refactor the portal screens to use almost entirely shadcn-style Toolcraft components instead of hand-rolled buttons, inputs, textareas, selects, cards, and badges.
- Task type: Post-first-working product presentation and component-system refactor.
- User-visible result: Admin and share portal screens now compose the existing Toolcraft UI layer for cards, buttons, fields, labels, inputs, textarea, badges, separators, empty states, and the playback-speed select.
- Source/reference checked: User correction, `AGENTS.md`, `docs/toolcraft/workflow.md`, exported Toolcraft UI primitive/composite APIs, existing browser failure output.
- Docs/contracts read: `AGENTS.md`, `docs/toolcraft/workflow.md`, local `writing-plans` skill, `superpowers:test-driven-development`, `superpowers:systematic-debugging`.
- Contract rules applied: Use existing component system before custom code, keep route/store/Gumlet behavior unchanged, preserve accessible browser-observable behavior, update worklog before completion.
- Decision: Replace available raw form/control primitives with Toolcraft UI components and add a static guard test that prevents regressing to raw `button`, `input`, `textarea`, `select`, or `option` usage in portal screens.
- Alternatives rejected: Keeping native controls with CSS classes because the project already ships Toolcraft UI primitives; changing product behavior while refactoring because the requested correction was component usage.
- State/output mapping: Project/video/share/feedback state remains in the same local React and localStorage paths; only presentation composition changed.
- Files changed: `src/app/admin-portal.tsx`, `src/app/share-portal.tsx`, `src/app/portal-component-system.test.ts`, `e2e/app-controls.spec.ts`, `e2e/app-browser-acceptance.spec.ts`, `docs/toolcraft/agent-worklog.md`.
- Verification: Red test first failed for missing shared UI imports and raw controls; after refactor `npm.cmd run typecheck`, `npm.cmd run test`, and focused Playwright browser acceptance passed.
- Skipped checks: Full performance suite skipped because this Tier 2 pass does not change renderer workload, Gumlet iframe behavior, routing, storage, or export paths.
- Risks: The portal still uses ordinary layout tags where no Toolcraft component is appropriate; this is intentional and keeps semantic page structure straightforward.

### Iteration 3 - Component surface verification

- Request: Check whether the app was being served from another port/link and fix why the UI still looked like shadcn components were not applied.
- Task type: Visual mismatch and component-system verification.
- User-visible result: Confirmed `http://127.0.0.1:3002/` serves this project through `/.toolcraft/server-identity.json`, verified the live DOM contains Toolcraft UI `data-slot` markers, and removed app-specific arbitrary background overrides from `Card` surfaces so shared component styling owns card surfaces.
- Source/reference checked: Running dev server on port `3002`, Toolcraft identity endpoint, live browser DOM via Playwright, portal component source, component-system guard test.
- Docs/contracts read: `superpowers:systematic-debugging`, local `browser` skill, `superpowers:test-driven-development`.
- Contract rules applied: Investigate root cause before changes, add a failing test before production edits, keep route/store/Gumlet behavior unchanged.
- Decision: Treat the issue as masked component styling, not a wrong URL. Keep selection-state backgrounds where they convey state, but remove arbitrary Card background utilities.
- Alternatives rejected: Restarting on a new port because `3002` already verified as the current project; replacing the component library because the existing Toolcraft UI components are present and rendered.
- State/output mapping: No data-flow changes; the same admin/share flows now render with default Card surfaces rather than app-specific surface overrides.
- Files changed: `src/app/admin-portal.tsx`, `src/app/share-portal.tsx`, `src/app/portal-component-system.test.ts`, `docs/toolcraft/agent-worklog.md`.
- Verification: Component-system guard failed first on custom Card background overrides, then passed after cleanup. Browser screenshot and DOM inspection confirmed `3002` renders Toolcraft UI slots.
- Skipped checks: Full performance suite skipped because this Tier 2 visual/component pass does not affect renderer workload or playback behavior.
- Risks: The Toolcraft/shadcn-style theme is intentionally quiet and dark, so the visual difference is subtle even when the components are correctly applied.

### Iteration 4 - Single-video share links

- Request: Replace project-only client sharing with links to individual videos, make the selected speed the actual playback speed on the video page, and show a clickable overlay with time saved before playback.
- Task type: Post-first-working product routing and behavior change.
- User-visible result: Admins can copy/open a per-video link from each video card. The `/video/$slug?data=...` page renders only that video, shows a start overlay with watch-time and saved-time messaging, and applies the selected playback speed to native MP4 playback.
- Source/reference checked: User screenshot and Gumlet link examples, existing portal store/utilities/routes, Gumlet iframe/MP4 URL formats from the supplied entries, Playwright browser failure output.
- Reference inputs: User supplied Gumlet embed snippet, watch URL, thumbnail URL, direct `main.mp4` URL, and screenshot of the admin UI.
- Docs/contracts read: `superpowers:brainstorming`, local `writing-plans`, `superpowers:test-driven-development`, `AGENTS.md`, `docs/toolcraft/workflow.md`.
- Contract rules applied: Tier 2 verification for routing/control/product behavior, use Toolcraft UI components where available, add red tests before implementation, keep no-secrets local-first sharing model.
- Decision: Add single-video encoded snapshots and a dedicated `/video/$slug` route. Parse Gumlet watch/embed/MP4 inputs so the easiest entry, the direct MP4 URL, both extracts the Gumlet asset ID and stores a native playback URL.
- Alternatives rejected: Project-wide deep links because the user explicitly wants one video per client link; relying only on Gumlet iframe playback-rate messaging because exact speed control is not guaranteed from this app; adding a Gumlet API integration because the supplied MP4 URL solves the speed requirement without credentials.
- State/output mapping: Admin video card calls `createVideoShareUrl(project, video, origin)`; the video route decodes `VideoShareSnapshot`; direct MP4 videos render a native `video` element with `playbackRate` set to `recommendedPlaybackSpeed`; iframe-only videos reload the Gumlet embed with autoplay and best-effort speed commands after the overlay click.
- Files changed: `src/app/video-share-portal.tsx`, `src/routes/root.tsx`, `src/app/admin-portal.tsx`, `src/app/gumlet-player.tsx`, `src/app/portal-utils.ts`, `src/app/portal-store.ts`, `src/app/portal-types.ts`, focused unit/browser tests, `src/app/app-acceptance.ts`, `docs/superpowers/*`, `docs/toolcraft/agent-worklog.md`.
- Verification: Red Playwright test first failed on missing `/video/$slug`; after implementation, focused Vitest/typecheck passed, `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts e2e/app-controls.spec.ts` passed 3 tests, `npm.cmd run verify:quick` passed, and `npm.cmd run build` passed.
- Skipped checks: Full browser performance skipped because this Tier 2 change adds routing and DOM controls but no custom renderer, canvas, animation, export, or heavy workload path.
- Risks: Exact playback speed requires the direct Gumlet `main.mp4` URL stored in the video; watch/embed/asset-only entries still render through the Gumlet iframe and speed commands remain best effort.

### Iteration 5 - Audible speed start and inferred duration

- Request: Make the video start unmuted at the shown speed when the overlay button is clicked, and show original duration, faster watch time, and time saved on the button based on the video length.
- Task type: Post-first-working product playback bug fix and video-page copy behavior.
- User-visible result: Direct MP4 video pages infer duration from native video metadata when no duration was typed, show the original duration with strikethrough, show the faster watch time plus saved time on the start button, and force unmuted 1x-volume playback at the selected speed before calling `play()`.
- Source/reference checked: User screenshot, current `/video/$slug` implementation, Playwright regression failure, HTML native video metadata/playback behavior.
- Reference inputs: User screenshot of the single-video page and the previously supplied Gumlet direct `main.mp4` URL pattern.
- Docs/contracts read: `superpowers:systematic-debugging`, `superpowers:test-driven-development`, local `brainstorming`, local `writing-plans`, `AGENTS.md`, `docs/toolcraft/workflow.md`, `docs/toolcraft/assembly-workflow.md`, `docs/toolcraft/acceptance-testing.md`.
- Contract rules applied: Root cause before fix, red browser test before implementation, Tier 2 verification for product behavior, preserve Toolcraft UI components and route-local portal model.
- Decision: Use native `loadedmetadata` duration for direct MP4 videos as the duration source of truth when an admin has not entered duration manually, and apply `defaultPlaybackRate`, `playbackRate`, `muted = false`, `defaultMuted = false`, and `volume = 1` at the click handler before invoking `play()`.
- Alternatives rejected: Estimating duration from the asset ID alone because the app has no Gumlet API credentials and iframe metadata is not exposed; relying on post-load playback-rate effects only because the user asked for the video to start at the shown speed.
- State/output mapping: `loadedmetadata` writes `metadataDurationSeconds`; overlay labels derive original duration, accelerated watch time, and saved time from `metadataDurationSeconds ?? video.durationSeconds`; clicking the Toolcraft `Button` applies audible native media state and calls `HTMLVideoElement.play()`.
- Files changed: `src/app/video-share-portal.tsx`, `e2e/app-browser-acceptance.spec.ts`, `docs/superpowers/plans/2026-07-08-video-playback-duration.md`, `docs/toolcraft/agent-worklog.md`.
- Verification: Browser test failed first on missing `Save about 4:00` when duration was metadata-only, then passed after implementation; `npm.cmd run typecheck`, affected Playwright browser tests, `npm.cmd run verify:quick`, and `npm.cmd run build` passed.
- Skipped checks: Full browser performance skipped because this is a DOM video-page behavior fix with no custom renderer or heavy workload change.
- Risks: Metadata-derived duration is available only for native direct MP4 links. Asset/watch/embed-only entries still use the Gumlet iframe and cannot expose duration or guaranteed unmuted playback control to this client app.

### Iteration 6 - Real Gumlet iframe playback flow

- Request: Fix the user-facing Gumlet iframe video page, not only the native MP4 fallback; start the Gumlet player at the selected speed, request unmuted playback, show duration-derived time savings, and add edit/delete actions for project videos.
- Task type: Post-first-working product playback bug fix and admin control refinement.
- User-visible result: The `/video/$slug` Gumlet iframe path now requests player duration, shows a loading state until duration is known, updates the CTA to show original time, faster watch time, and saved time, and sends play/unmute/volume/speed commands when the CTA is clicked. Admin video cards now use a Toolcraft DropdownMenu for actions, a Dialog for editing, and an AlertDialog for delete confirmation.
- Source/reference checked: User attachment, current Gumlet iframe implementation, single-video route, admin card UI, Toolcraft Dialog/DropdownMenu/AlertDialog components, browser failure output.
- Reference inputs: User supplied Gumlet asset ID/embed/watch/MP4 examples and screenshots from the admin and video pages.
- Docs/contracts read: `superpowers:systematic-debugging`, `superpowers:test-driven-development`, local `brainstorming`, local `writing-plans`, `AGENTS.md`, `docs/toolcraft/workflow.md`, `docs/toolcraft/component-rules.md`.
- Contract rules applied: Root cause before fix, red unit/browser tests before implementation, use Toolcraft UI components for available controls, centralize Gumlet postMessage command shapes in a helper, and keep the local-first storage model.
- Decision: Add a Gumlet iframe adapter that sends multiple common player command shapes for speed, play, unmute, volume, and duration requests; parse common player metadata message shapes; and persist detected duration back into local project video metadata when the matching video exists locally.
- Alternatives rejected: Treating the iframe path as solved by the native MP4 fix because the visible client page uses the Gumlet iframe for asset/watch/embed entries; deleting Gumlet assets from the admin delete action because the app has no Gumlet API credentials and the requested action is project-local cleanup.
- State/output mapping: `GumletPlayer` exposes an imperative start handle, posts adapter commands on load and CTA click, and reports duration messages upward. `VideoSharePortal` updates its encoded snapshot state and local project storage with resolved durations. `AdminPortal` edits videos through a Dialog and removes them through a confirmed project-local delete action.
- Files changed: `src/app/gumlet-player-adapter.ts`, `src/app/gumlet-player.tsx`, `src/app/video-share-portal.tsx`, `src/app/admin-portal.tsx`, `src/app/portal-utils.ts`, focused unit/browser tests, and `docs/superpowers/plans/2026-07-08-real-gumlet-player-flow.md`.
- Verification: Adapter/util tests failed first, then `npm.cmd exec -- vitest run src/app/gumlet-player-adapter.test.ts src/app/portal-utils.test.ts` passed 11 tests. Focused Playwright browser tests first failed on missing Gumlet duration/loading/actions, then printed 4 passing browser tests after implementation. `npm.cmd run build` passed. `npm.cmd run verify:quick` passed AI checks, docs/integrity checks, Node tests, and 28 Vitest tests.
- Skipped checks: Full browser performance skipped because this Tier 2 fix changes DOM controls, iframe messaging, routing behavior, and local metadata, not renderer workload.
- Risks: Gumlet and the browser can still block forced unmuted playback inside a cross-origin iframe. The app now makes the unmuted request from the user click and shows an explicit status, but the iframe's own sound control may still be required if Gumlet rejects the command.

## Decisions

### Renderer

- Decision: Use ordinary React DOM UI plus Gumlet iframe embeds and native MP4 playback for single-video pages when a direct Gumlet MP4 URL is available.
- Reason: The product is an operational portal, not a generated visual canvas/export tool; native video is the browser-controlled path that can enforce playback speed.
- Evidence: `src/app/admin-portal.tsx`, `src/app/share-portal.tsx`, `src/app/video-share-portal.tsx`, and `src/app/gumlet-player.tsx`.

### Timeline

- Decision: No Toolcraft timeline.
- Reason: Playback transport belongs to Gumlet or the browser-native video element; the portal only sets initial speed/start state.
- Evidence: No timeline route or schema behavior is used by the portal.

### Layers

- Decision: No layers.
- Reason: Projects and videos are list records, not editable visual layers.
- Evidence: The UI uses project/video lists and local form state.

### Controls

- Decision: Use Toolcraft UI/shadcn-style primitives for visible portal controls and form chrome.
- Reason: The generated app includes a shared component system and the portal should not hand-roll available controls.
- Evidence: `src/app/admin-portal.tsx`, `src/app/share-portal.tsx`, `src/app/video-share-portal.tsx`, and `src/app/portal-component-system.test.ts`.

### Export

- Decision: No image/video export actions.
- Reason: Gumlet owns video playback and hosting; the portal only shares links and feedback.
- Evidence: No Gumlet upload/edit/export APIs are present; share links are encoded snapshots.

### Performance

- Decision: Keep performance policy light with no custom renderer workload.
- Reason: The app renders low-count DOM lists and external iframes; there is no canvas, animation, or export workload.
- Evidence: `src/app/app-performance.ts`, `src/app/app-performance.test.ts`, and `e2e/app-performance.spec.ts`.

## Evidence

- Source reviewed: user request, `package.json`, route files, Toolcraft docs, and starter tests.
- Contract applied: Existing stack reused; no Gumlet secrets; no recording/upload/editing; browser verification added for admin and share flows.
- Evidence: Focused tests passed before final verification pass.

## Verification

- Run: `npm.cmd exec -- vitest run src/app/portal-utils.test.ts src/app/portal-store.test.ts` passed.
- Run: `npm.cmd run typecheck` passed.
- Run: `npm.cmd exec -- playwright test e2e/app-controls.spec.ts --reporter=list` passed.
- Run: `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts --reporter=list` passed.
- Run: `npm.cmd run verify:final` passed AI check, unit/docs/integrity tests, and build, then was stopped because `playwright install chromium` hung without output.
- Run: `npm.cmd exec -- playwright test --grep-invert "browser perf:" --reporter=list` passed, 2 browser tests.
- Run: `npm.cmd exec -- playwright test --grep "browser perf:" --workers=1 --reporter=list` passed, 1 browser performance fallback test.
- Run: `npm.cmd exec -- vitest run src/app/portal-component-system.test.ts` first failed for raw form primitives, then passed after the Toolcraft UI refactor.
- Run: `npm.cmd run typecheck` passed after refactor.
- Run: `npm.cmd run test` passed after refactor.
- Run: `npm.cmd exec -- playwright test e2e/app-controls.spec.ts e2e/app-browser-acceptance.spec.ts --reporter=list` passed after refactor.
- Run: `Invoke-WebRequest http://127.0.0.1:3002/.toolcraft/server-identity.json` returned this project root.
- Run: live Playwright DOM probe on `http://127.0.0.1:3002/` found visible `data-slot` markers for `card`, `button`, `input`, `textarea`, `field`, `field-label`, `badge`, and `empty`.
- Run: `npm.cmd exec -- vitest run src/app/portal-component-system.test.ts` failed on arbitrary Card background overrides, then passed after Card surface cleanup.
- Run: `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts -g "video page"` passed after adding `/video/$slug` and native speed handling.
- Run: `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts e2e/app-controls.spec.ts` passed 3 browser tests after adding per-video links.
- Run: `npm.cmd run verify:quick` passed after the single-video share-link implementation.
- Run: `npm.cmd run build` passed after the single-video share-link implementation.
- Run: `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts -g "video page"` failed on missing metadata-derived saved-time copy, then passed after adding native metadata duration and audible play handling.
- Run: `npm.cmd run typecheck` passed after adding native metadata duration and audible play handling.
- Run: `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts e2e/app-controls.spec.ts` passed 3 browser tests after the audible start and inferred-duration fix.
- Run: `npm.cmd run verify:quick` passed after the audible start and inferred-duration fix.
- Run: `npm.cmd run build` passed after the audible start and inferred-duration fix.
- Run: `npm.cmd exec -- vitest run src/app/gumlet-player-adapter.test.ts src/app/portal-utils.test.ts` first failed on missing Gumlet adapter/time-savings helpers, then passed 11 tests after implementation.
- Run: `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts e2e/app-controls.spec.ts` first failed on missing Gumlet iframe duration/action controls, then printed 4 passing browser tests after implementation; the Playwright runner process remained open in the tool backend after the pass output.
- Run: `npm.cmd run build` passed after adding the Gumlet iframe adapter and admin edit/delete dialogs.
- Run: `npm.cmd run verify:quick` passed after adding the Gumlet iframe adapter and admin edit/delete dialogs.

## Risks

- Risk: Without a backend, copied links contain a project snapshot and client feedback does not sync back to the admin automatically.
- Risk: Recommended playback speed and audible start are exact for direct MP4 video pages. Iframe-only links now send play, speed, unmute, volume, and duration requests from the user click, but exact behavior still depends on Gumlet iframe API support and browser media policy.
