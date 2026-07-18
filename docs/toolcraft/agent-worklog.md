# Implementation Worklog

This file records product decisions and the evidence behind them.

## Status

Mode: product

The app is now the Pixel Point video-sharing portal with local fallback plus Cloudflare D1 cloud sync. It organizes existing Gumlet videos, reuses stable tokenized project and single-video share links when cloud sync is enabled, keeps encoded links as a legacy fallback, embeds Gumlet videos with visible failure handling, lets viewers choose playback speed, keeps legacy collection notes local, and persists positioned timestamped feedback for cloud video tokens in D1.

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

### Iteration 7 - Confirmed Gumlet player.js hardening

- Request: Continue the real Gumlet video flow fix without restarting; verify the actual Gumlet iframe behavior, keep the overlay visible until playback is confirmed, add duration fallback handling, clear stale duration on asset changes, and improve edit/delete UX.
- Task type: Post-first-working product playback hardening, duration-state bug fix, and admin control refinement.
- User-visible result: Gumlet single-video links now use the confirmed `player.js` command protocol, request duration from the live embed, keep the start overlay visible while playback is only attempting, hide it only after play plus selected speed are confirmed, and show the required fallback copy if playback cannot be confirmed. Admin edits clear stale duration when the Gumlet asset/link changes unless a new duration is explicitly entered, and each video card has a Refresh duration action.
- Source/reference checked: User attachment, running local app, real Gumlet embed at `https://play.gumlet.io/embed/6707bf60f0a80d006151c369`, Gumlet player chunk behavior observed in browser, existing adapter/player/share/admin/store code, focused unit/browser failures.
- Reference inputs: User supplied real Gumlet asset ID, embed/watch/thumbnail/MP4 URLs, screenshots, and the latest pasted-text request.
- Docs/contracts read: `AGENTS.md`, `docs/toolcraft/workflow.md`, `docs/toolcraft/component-rules.md`, `docs/toolcraft/acceptance-testing.md`, local `systematic-debugging`, local `brainstorming`, local `writing-plans`, local `browser`, `superpowers:test-driven-development`.
- Contract rules applied: Investigate actual runtime before fix, write tests before implementation, use Toolcraft/shadcn components for visible controls, keep iframe fallback messaging honest, update worklog before completion, and skip full performance only because this post-first-working change does not touch renderer workload.
- Decision: Prefer Gumlet's confirmed `player.js` v3 postMessage protocol (`play`, `unmute`, `setVolume` with value `100`, `setPlaybackRate`, `getDuration`, `getPlaybackRate`, `getMuted`, `getVolume`, and event listeners) and retain older object-shaped commands only as fallback compatibility messages.
- Alternatives rejected: Continuing to mark success immediately after posting guessed commands because that hid failures from users; reloading the iframe with `autoplay=true` because the real Gumlet embed mutes autoplay; preserving old durations after an asset change because that can show fake savings for the wrong video.
- State/output mapping: `GumletPlayer` posts confirmed `player.js` commands, parses ready/duration/playback-rate/play/muted/volume events, and reports them upward. `VideoSharePortal` maps duration events into CTA savings, maps play plus matching speed into overlay dismissal, and maps missing confirmations into fallback copy. `AdminPortal` maps edit asset changes into a null duration patch, maps Refresh duration into an active preview duration request, and maps preview duration events back to localStorage.
- Files changed: `src/app/gumlet-player-adapter.ts`, `src/app/gumlet-player.tsx`, `src/app/video-share-portal.tsx`, `src/app/admin-portal.tsx`, `src/app/portal-store.ts`, `src/app/gumlet-player-adapter.test.ts`, `src/app/portal-store.test.ts`, `e2e/app-browser-acceptance.spec.ts`, `e2e/app-controls.spec.ts`, `docs/superpowers/plans/2026-07-08-gumlet-hardening.md`, `docs/toolcraft/agent-worklog.md`.
- Verification: `npm.cmd exec -- vitest run src/app/gumlet-player-adapter.test.ts src/app/portal-store.test.ts` first failed on parser expectations, then passed 8 tests. `npm.cmd run typecheck` passed. `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts e2e/app-controls.spec.ts` passed 6 browser tests after fixing late audio confirmation status. `npm.cmd run verify:quick` passed docs/integrity, Node tests, and 30 Vitest tests. `npm.cmd run build` passed. A real Gumlet headless browser probe against asset `6707bf60f0a80d006151c369` detected pre-click `1:44`, `1:09`, and `saves 35s`; after click, Gumlet `videoTag` reported `duration: 103.979`, `playbackRate: 1.5`, `muted: false`, `volume: 1`, and `paused: false`.
- Skipped checks: Full browser performance skipped because this is a post-first-working DOM/iframe messaging and local-storage behavior fix with no custom renderer, canvas, animation, export, or heavy workload path.
- Risks: The app now verifies Gumlet play and selected speed from player events before hiding the overlay, and the real probe confirmed unmuted playback in Chromium. Browser or Gumlet policy can still vary by environment, so the fallback copy remains visible when confirmation does not arrive.

### Iteration 8 - Cloudflare Pages production hardening

- Request: Finalize production readiness for the deployed Cloudflare Pages app, keep hosting static-only and zero-cost, make copied links use `VITE_PUBLIC_APP_URL`, add SPA refresh routing, security headers, warnings, documentation, and verification.
- Task type: Post-first-working deployment hardening and static hosting configuration.
- User-visible result: Admin copy/open links resolve through the configured public app URL, local-only share links show a warning before copying, unlisted-link limitations are visible near share controls, direct `/share/:slug` and `/video/:slug` refreshes are covered by Cloudflare `_redirects`, and static security headers are configured for the next Cloudflare Pages deployment.
- Source/reference checked: User-provided Cloudflare Pages URL and env var, current admin/share/video routes, `public` static asset state, Vite build output, live deployed Pages URL, focused browser probes, Toolcraft contracts.
- Reference inputs: User supplied deployed URL `https://pixel-point-loom-clone.pages.dev/`, production env var `VITE_PUBLIC_APP_URL=https://pixel-point-loom-clone.pages.dev/`, and the production hardening checklist.
- Docs/contracts read: `AGENTS.md`, `docs/toolcraft/workflow.md`, `docs/toolcraft/component-rules.md`, `docs/toolcraft/acceptance-testing.md`, local `systematic-debugging`, local `brainstorming`, local `writing-plans`, local `browser`.
- Contract rules applied: Keep deployment static-only, do not add backend services or paid Cloudflare products, use Toolcraft UI components for warnings, add tests before final claims, run Tier 2 verification and browser acceptance, update worklog before completion.
- Decision: Add static Pages files (`public/_redirects`, `public/_headers`) and a client-side public-origin resolver instead of adding Workers, Pages Functions, or any storage/proxy layer. Treat links as unlisted snapshots and document that URL data is encoded, not private or encrypted.
- Alternatives rejected: Cloudflare Workers/Functions/KV/R2/D1/Durable Objects/Stream/Images because the app must stay zero-cost static hosting; custom domain because Pages subdomain is sufficient; Gumlet API integration because videos remain hosted and privacy-controlled in Gumlet.
- State/output mapping: `getPortalAppOrigin()` reads `VITE_PUBLIC_APP_URL` at build/dev time and falls back to `window.location.origin`; admin copy/open actions pass that origin into project/video URL builders; local-origin detection drives warning copy; `_redirects` maps direct SPA paths back to `index.html`; `_headers` applies static security headers after deployment.
- Files changed: `public/_redirects`, `public/_headers`, `src/app/portal-utils.ts`, `src/app/admin-portal.tsx`, `src/app/portal-utils.test.ts`, `src/app/deployment-config.test.ts`, `e2e/app-browser-acceptance.spec.ts`, `e2e/app-controls.spec.ts`, `docs/deployment-zero-cost.md`, `docs/superpowers/plans/2026-07-08-cloudflare-production-hardening.md`, `docs/toolcraft/agent-worklog.md`.
- Verification: `npm.cmd run typecheck` first failed on a missing test import, then passed. `npm.cmd run test` passed docs/integrity, Node tests, and 35 Vitest tests. `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts e2e/app-controls.spec.ts` first hit strict selector issues, then passed 7 browser tests. `npm.cmd run build` passed and copied `_redirects` and `_headers` into `dist`. `npm.cmd run verify:quick` passed. Manual deployed probe created a project/video on `https://pixel-point-loom-clone.pages.dev/`, copied a video link starting with the public Pages URL and no localhost, opened it in a separate browser context, refreshed it, confirmed Gumlet iframe and CTA savings, then verified edit and delete. Live header probe showed current deployment has `nosniff` and referrer policy; the new CSP and Permissions-Policy are present in repo/build and require the next Cloudflare Pages deploy to become live.
- Skipped checks: Full browser performance skipped because this post-first-working Tier 2 pass changes static hosting config, link generation, warnings, docs, and tests, not renderer workload or performance-sensitive controls.
- Risks: Current live deployment does not show the newly added CSP and Permissions-Policy until these changes are redeployed. Shared URLs remain unlisted, not private or encrypted; real privacy must be enforced in Gumlet.

### Iteration 9 - ShipFast-inspired Cloudflare architecture

- Request: Use the ShipFast repo only as architectural inspiration and make the Gumlet portal production-ready with cross-device admin data, protected admin access, secure token share links, optional passcodes, and Cloudflare-native storage/functions without adding paid SaaS features or migrating from Vite.
- Task type: Tier 4 architecture and production persistence/security pass.
- User-visible result: The app now has central app config, admin cloud/local status UI, local-project import to cloud, optional share passcodes, tokenized copy/open links in cloud mode, public token loading for `/share/:token` and `/video/:token`, and passcode gates before protected client details.
- Source/reference checked: User attachment, existing Gumlet portal code, current Cloudflare Pages deployment docs, local Toolcraft docs, and the explicit ShipFast concepts listed in the prompt.
- Reference inputs: Source repo URL `https://github.com/trifmihai/ship-fast-ts` was used only as a conceptual reference from the user's requested pattern list; no source code was copied.
- Docs/contracts read: `AGENTS.md`, `docs/toolcraft/workflow.md`, `docs/toolcraft/assembly-workflow.md`, `docs/toolcraft/decision-contract.md`, `docs/toolcraft/component-rules.md`, `docs/toolcraft/acceptance-testing.md`, local `brainstorming`, local `writing-plans`, local `systematic-debugging`, local `browser`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion`.
- Contract rules applied: Keep current Vite/TanStack app, keep Toolcraft/shadcn UI components, keep localStorage fallback/import source, avoid paid services and dependency bloat, write API tests before implementation, and verify visible token/passcode routes in a real browser.
- Decision: Add a minimal Cloudflare Pages Functions API and D1 schema for metadata/tokens, originally with Cloudflare Access as the admin gate and native `fetch` as the only API client. The admin gate was later superseded by the app-level signed-cookie login in Iteration 11.
- Alternatives rejected: Next.js/NextAuth, MongoDB/Mongoose, Stripe/Resend/Crisp/DaisyUI, Gumlet API keys in frontend code, storing/proxying video files, and embedding full project/video data in new share URLs.
- State/output mapping: Admin state loads from D1 through `/api/admin/projects` when `VITE_CLOUD_SYNC_ENABLED=true`; local data stays in localStorage for fallback/import. Admin copy/open actions call `/api/admin/share-links` to create `/share/:token` or `/video/:token`; public pages call `/api/public/share/:token` and `/passcode` to load only the authorized project/video.
- Files changed: `src/app/app-config.ts`, `src/app/portal-api.ts`, `src/app/portal-cloud-api.ts`, `functions/api/[[path]].ts`, `migrations/0001_portal.sql`, `wrangler.toml`, `src/app/admin-portal.tsx`, `src/app/share-portal.tsx`, `src/app/video-share-portal.tsx`, `src/app/share-passcode-gate.tsx`, `src/app/deployment-config.test.ts`, `src/app/portal-cloud-api.test.ts`, `e2e/app-browser-acceptance.spec.ts`, `docs/deployment-zero-cost.md`, `docs/superpowers/plans/2026-07-09-shipfast-cloudflare-architecture.md`, `docs/toolcraft/agent-worklog.md`.
- Verification: `.\node_modules\.bin\vitest.cmd run src/app/portal-cloud-api.test.ts` failed first on the missing API module, then passed 7 API tests after implementation. `.\node_modules\.bin\vitest.cmd run src/app/deployment-config.test.ts` failed first on missing config/client files, then passed 3 tests after implementation. `npm.cmd run typecheck` passed after adding `functions` to `tsconfig.json`. `npm.cmd run verify:quick` passed docs/integrity, Node tests, AI check, and 43 Vitest tests. `npm.cmd run build` passed with Vite's existing large chunk warning. Focused Playwright token/passcode tests reported 3 `ok` browser tests, then the Playwright runner hung during teardown and was stopped by killing only the recent test runner/web-server Node processes. `npm.cmd run dev` reported the app already running on `http://127.0.0.1:3002/`.
- Skipped checks: Full performance checkpoint skipped because this post-first-working pass changes data/API/security/routing and visible DOM flows, not canvas, renderer, animation, export, or performance-sensitive controls. Full browser suite is pending a clean Playwright teardown run because the focused run hung during teardown after passing its test cases.
- Risks: The original Cloudflare Access dependency in this iteration was superseded by Iteration 11. The included rate limiter is best-effort per isolate, not a global distributed limiter. Passcode hashing uses browser/Worker SHA-256 and is not a slow password KDF. Token security depends on keeping admin session secrets strong and monitoring D1/Functions usage.

### Iteration 10 - Protected admin route split

- Request: Move the admin dashboard fully to `/admin`, keep public share/video/API-token routes public, keep `/api/admin/*` server-side protected, add a public `/api/health`, and make `/` redirect to `/admin` without rendering the admin UI there.
- Task type: Post-first-working route security and deployment verification bug fix.
- User-visible result: `/admin` owns the dashboard. `/` is only a lightweight redirect/landing route. `/share/:token`, `/video/:token`, legacy `?data=` links, and `/api/public/share/:token` remain public. `/api/health` returns `{ ok: true, service: "portal-api" }` without Cloudflare Access or D1.
- Source/reference checked: User request, current TanStack route tree, Cloudflare Pages `_redirects`, shared API handler, Pages Function wrapper, existing deployment/API/browser tests.
- Reference inputs: User request only; no visual reference supplied.
- Docs/contracts read: `AGENTS.md`, `docs/toolcraft/workflow.md`, `docs/toolcraft/assembly-workflow.md`, local `systematic-debugging`, local `writing-plans`, and `superpowers:test-driven-development`.
- Contract rules applied: Keep route files thin, keep public client routes unchanged, keep admin API auth in the server handler, test route/security behavior before implementation, and avoid adding new Cloudflare products.
- Decision: Add a dedicated `src/routes/admin.tsx` for `AdminPortal`, make `src/routes/index.tsx` a minimal redirect to `/admin`, add `/admin` SPA rewrite rules, and handle `/api/health` before admin auth or D1 access.
- Alternatives rejected: Protecting `/` with Cloudflare Access because the requested Access policy is `/admin*`; duplicating admin UI on `/`; touching public share token behavior; adding any paid Cloudflare service for health checks.
- State/output mapping: TanStack routes map `/admin` to `AdminHome`, `/` to `<Navigate to="/admin" />`, `/share/$slug` and `/video/$slug` to existing public portals. `handlePortalApiRequest` maps `/api/health` to a static JSON response before admin/public-token routing. The Cloudflare Access email check noted in this iteration was superseded by the signed-cookie app login in Iteration 11.
- Files changed: `src/routes/root.tsx`, `src/routes/index.tsx`, `src/routes/admin.tsx`, `src/app/portal-cloud-api.ts`, `functions/api/[[path]].ts`, `public/_redirects`, `src/app/deployment-config.test.ts`, `src/app/portal-cloud-api.test.ts`, `e2e/app-controls.spec.ts`, `e2e/app-browser-acceptance.spec.ts`, `docs/deployment-zero-cost.md`, `docs/toolcraft/agent-worklog.md`.
- Verification: `npx vitest run src/app/portal-cloud-api.test.ts src/app/deployment-config.test.ts` failed first on missing `/api/health`, missing `/admin` route, and missing admin rewrite rules; after implementation it passed 13 focused tests. `npm run typecheck` passed. `npm run build` passed with Vite's existing large chunk warning. Focused Playwright `root redirects` test reported 1 `ok` browser test, then the Playwright runner hung during teardown and only the recent test-runner/web-server Node processes were stopped.
- Skipped checks: Full performance checkpoint skipped because this route/API split does not affect renderer/canvas/export performance. Full browser suite was not rerun because the focused Playwright runner again hung after printing the passing test.
- Risks: The Cloudflare Access requirement in this route-split iteration was removed in Iteration 11; admin protection now depends on `ADMIN_PASSWORD`, `AUTH_SECRET`, and the signed HttpOnly session cookie.

### Iteration 11 - Free app-level admin login and production diagnostics

- Request: Avoid Cloudflare Zero Trust because it requires billing authorization for overages; replace the Cloudflare Access-only admin protection with a free app-level login using Pages Functions and D1, keep public share/video routes open, add auth endpoints, and add production diagnostics to the admin UI.
- Task type: Production auth/security correction and deployment diagnostics.
- User-visible result: `/admin` now shows a small password login screen when a signed admin session is required. After login, the existing admin dashboard loads. `/api/admin/*` no longer depends on `Cf-Access-Authenticated-User-Email`; it accepts only a valid signed `portal_admin_session` cookie. The admin status card shows cloud sync enabled, local mode, public app URL, and cloud sync status, with a strong production warning if the deployed Pages build has cloud sync disabled.
- Source/reference checked: Latest user request, current Pages Function wrapper, shared API handler, admin route, admin portal status UI, deployment config tests, and deployment docs.
- Reference inputs: Manual owner email remains `trifmihai.business@gmail.com`; `ADMIN_PASSWORD` and `AUTH_SECRET` are Cloudflare Pages environment secrets and are not exposed to frontend code.
- Docs/contracts read: `AGENTS.md`, `docs/toolcraft/workflow.md`, `docs/toolcraft/assembly-workflow.md`, local `systematic-debugging`, local `writing-plans`, and `superpowers:test-driven-development`.
- Contract rules applied: Use only Cloudflare Pages Functions and D1, do not add paid Cloudflare products, keep `/video/:token`, `/share/:token`, `/api/public/share/:token`, and `/api/health` public, do not use frontend storage for admin auth, and test server auth behavior before implementation.
- Decision: Add `/api/auth/login`, `/api/auth/logout`, and `/api/auth/session`, sign the session payload with HMAC-SHA256 using `AUTH_SECRET`, store the session in an HttpOnly, Secure, SameSite=Lax cookie, and have `/api/admin/*` validate that cookie before touching admin data.
- Alternatives rejected: Cloudflare Zero Trust/Access, NextAuth, paid auth providers, localStorage-based admin auth, exposing password/secret values to Vite, and adding KV/R2/Durable Objects/Stream/Images/Queues/custom domains.
- State/output mapping: `functions/api/[[path]].ts` passes `ADMIN_PASSWORD` and `AUTH_SECRET` only to the server runtime. `src/app/portal-cloud-api.ts` handles auth routes and signed-cookie admin authorization. `src/app/admin-auth-gate.tsx` gates the `/admin` dashboard. `src/app/portal-api.ts` sends same-origin credentials and exposes auth methods. `src/app/admin-portal.tsx` shows production diagnostics and continues creating cloud token links through the API when cloud sync is connected; legacy `?data=` decoding stays only in the public fallback routes.
- Files changed: `functions/api/[[path]].ts`, `src/app/portal-cloud-api.ts`, `src/app/portal-api.ts`, `src/app/admin-auth-gate.tsx`, `src/routes/admin.tsx`, `src/app/admin-portal.tsx`, `src/app/app-config.ts`, `src/app/portal-cloud-api.test.ts`, `src/app/deployment-config.test.ts`, `docs/deployment-zero-cost.md`, `docs/toolcraft/agent-worklog.md`.
- Verification: `.\node_modules\.bin\vitest.cmd run src/app/portal-cloud-api.test.ts` failed first on missing `/api/auth/*` behavior, then passed 9 API tests after implementation. `.\node_modules\.bin\vitest.cmd run src/app/deployment-config.test.ts` failed first on old Access copy, missing auth gate, and missing diagnostics, then passed 7 tests after implementation. `npm.cmd run typecheck` passed. `npm.cmd run test` passed docs/integrity, Node tests, and 49 Vitest tests. `npm.cmd run build` passed with Vite's existing large chunk warning.
- Skipped checks: Full browser suite not rerun because the requested verification was typecheck/build and this pass primarily changes server auth/API behavior plus a small admin login surface; focused source/API tests cover the auth contract.
- Risks: Sessions are stateless until expiry, so logout clears the browser cookie but does not revoke a copied cookie server-side. Use a long random `AUTH_SECRET`, rotate it if needed to invalidate all sessions, and set a strong `ADMIN_PASSWORD`.

### Iteration 12 - Pixel Point portal audit and cohesive redesign

- Request: Audit the complete admin and public video-sharing experience, then implement a cohesive Pixel Point redesign without changing deployed domains, public route patterns, tokens, query parameters, Gumlet asset IDs, Cloudflare storage, authentication, or data behavior.
- Task type: Tier 4 broad product presentation, responsive layout, share-link reliability, and public-player failure-state iteration.
- Verification tier: Tier 4.
- Reason: The pass changes every visible portal surface, responsive navigation, share dialogs, project settings, public collection order, viewer speed controls, and Gumlet readiness behavior. It also adds backwards-compatible server token reuse without changing the route or database schema.
- Run: `npm.cmd run verify:quick`, focused red/green Vitest and Playwright regressions, full functional browser coverage through the verified existing app server, `npm.cmd run verify:final`, route and source invariant inspection, and browser screenshots at 1440, 1280, 1024, 768, 430, 390, and 360 pixels.
- Skip: The full performance suite is not required for this post-first-working iteration because the app still uses ordinary low-count React DOM, external Gumlet iframes, no custom renderer, no canvas, no animation timeline, and no export workload. Responsive browser acceptance covers the touched layout paths.
- User-visible result: The admin is now a focused Pixel Point workspace with desktop project navigation, a compact mobile project picker, a stronger project header, settings and destructive-action confirmation, clearer video list/preview hierarchy, and intentional project/video share dialogs. Public single-video and collection pages now share the same identity, expose viewer-selected playback speed, present time savings clearly, place mobile collection navigation before playback, explain that notes stay on the current device, and show explicit loading/delayed Gumlet states instead of a blank frame.
- Source/reference checked: The user's pasted audit brief; the supplied 1920px admin and single-video screenshots; the running local `/admin`, `/share/$slug`, and `/video/$slug` routes; route and deployment files; Cloudflare API/token code; Gumlet embed adapter; existing localStorage/D1 behavior; Toolcraft UI exports; and the latest local Web Interface Guidelines workflow.
- Reference inputs: Two still screenshots and a written behavior brief. No Figma URL, video, GIF, screen recording, or frame sequence was supplied, so no Figma inspection or Video Reference Study was required.
- Docs/contracts read: `AGENTS.md`, `docs/toolcraft/workflow.md`, `assembly-workflow.md`, `decision-contract.md`, `schema-reference.md`, `component-rules.md`, `acceptance-testing.md`, `performance.md`, `renderer-technique.md`, and the required brainstorming, writing-plans, systematic-debugging, browser, frontend-design, Playwright, and verification workflows.
- Contract rules applied: Preserve `/share/$slug`, `/video/$slug`, legacy hash upgrades, optional `data` query fallback, `/api/public/share/:token`, `/api/public/share/:token/passcode`, `/admin`, the Cloudflare Pages domain, D1 schema, signed-cookie auth, Gumlet IDs, and current storage keys. Use Toolcraft controls and Cards, semantic landmarks, visible focus behavior, live status regions, reduced motion, safe-area padding, and browser-observable acceptance coverage.
- Decision: Reuse an existing active server-issued share token when owner, project, optional video, passcode hash, and expiry are identical. This makes repeated Copy/Open operations stable while preserving every previously issued token and avoiding any D1 migration. A changed passcode or expiry intentionally creates a distinct link.
- Alternatives rejected: Replacing the router or storage layer; changing route slugs or the production domain; regenerating all links; mutating Gumlet asset IDs; adding a new component library; exposing permanent share URLs inline in settings; using a generic hamburger sidebar at tablet widths; and treating iframe `load` as proof that Gumlet rendered successfully.
- State/output mapping: Admin project/video CRUD continues through the existing React/store/D1 paths. Share dialogs call the existing `/api/admin/share-links` endpoint, which now returns the matching active token when one exists. Viewer speed stays route-local and is passed to the existing native/Gumlet playback paths without changing stored recommendations. Collection notes and progress keep the original localStorage keys. Gumlet readiness now requires a real player message; a bounded timeout renders a visible connection fallback.
- Files changed: Portal UI and styles under `src/app` and `src/styles.css`, the backwards-compatible share-link lookup in `src/app/portal-cloud-api.ts` plus its Function adapter, acceptance/browser tests, app acceptance metadata, Playwright server reuse and installed-browser detection, the product spec/plan, `index.html` identity metadata, and this worklog. Routes, `_redirects`, `wrangler.toml`, migrations, storage keys, and Gumlet asset parsing were not changed.
- Verification: Stable-link API tests failed first, then passed for repeated project/video creation plus exact passcode/expiry semantics. Responsive admin, viewer-speed/mobile overlay, collection ordering, protected access identity, and Gumlet failure-state tests failed first, then passed. `npm.cmd run verify:quick` passed Toolcraft docs/integrity, 12 Node tests, and 59 Vitest tests. The functional Playwright run passed all 14 admin/public tests with a clean exit by reusing the verified `http://127.0.0.1:3002/` app server. Browser screenshots covered admin/share/video at 1440, 1280, 1024, 768, 430, 390, and 360 pixels with document width equal to viewport width in every case. A blocked Gumlet request produced the intended visible delayed-player state and no app console errors. The first final-gate attempt passed tests and build but stalled in the template's unconditional browser download; `scripts/ensure-playwright-browser.mjs` now verifies the installed Chromium executable before downloading, so offline verification does not re-run a network installer. The fresh second `npm.cmd run verify:final` run completed with exit code 0: AI/docs/integrity checks, 12 Node tests, 59 Vitest tests, typecheck, production build, and all 14 non-performance Playwright tests passed.
- Risks: The sandbox blocks `play.gumlet.io`, so live media playback cannot be re-proven here; the app now exposes that condition clearly, while adapter/browser tests verify command behavior. Local feedback remains intentionally browser-local and is now labeled as such. Existing links can still stop resolving when an administrator deliberately deletes their target content, revokes them, or their configured expiry passes; destructive dialogs now state the deletion consequence.

### Iteration 13 - Timestamped visual feedback

- Request: Add a focused Loom/Figma-style V1 where a client clicks a point on a public token video to leave D1-persisted timestamped feedback, and the signed-in administrator can receive, reply to, resolve/reopen, link, read, and soft-delete it.
- Task type: Tier 4 post-first-working D1 schema, public/admin API, player interaction, responsive public UI, and admin workflow feature.
- User-visible result: Cloud-token video pages now have Watch and Review modes, positioned numbered markers, a responsive comment composer, filtered comment cards, remembered guest identity, and direct-comment focus links. Admin video cards show unread/open/resolved counts and the selected video has a focused Feedback section with replies and moderation actions.
- Source/reference checked: The user's timestamped-visual-feedback brief, existing `/video/$slug`, `/share/$slug`, `/admin`, Pages Function router, D1 migration, portal API client, Gumlet player.js adapter, Toolcraft UI exports, existing unit/browser acceptance, and the supplied admin/video screenshots as current-state context only.
- Reference inputs: User pasted-text feature brief and two current-product screenshots. No Figma URL, video, GIF, screen recording, contact sheet, or extracted frames were supplied, so no Figma inspection or Video Reference Study was required.
- Docs/contracts read: `AGENTS.md`, `docs/toolcraft/workflow.md`, `assembly-workflow.md`, `decision-contract.md`, `component-rules.md`, `acceptance-testing.md`, `performance.md`, plus required brainstorming, writing-plans, test-driven-development, systematic-debugging, frontend-design, and browser skills.
- Contract rules applied: Preserve existing routes/tokens/auth/playback/legacy fallback; use existing Toolcraft UI components; keep route controls out of `canvasContent`; declare an empty schema control-section inventory because portal controls remain operational route UI; persist comments in D1 and only guest identity in localStorage; omit timeline, layers, export, and custom renderer; classify broad cross-surface work as Tier 4.
- Decision: Store flat parent/reply records in `feedback_comments`, authorize every public request through the active share token and optional in-memory passcode, omit guest email/read metadata from public DTOs, hide soft-deleted parents and their replies, and use percentage positions so markers remain stable across responsive video sizes.
- Alternatives rejected: localStorage-only comments because admin receipt and cross-device persistence are required; user accounts, notifications, reactions, drawings, screenshots, deep threads, and paid Cloudflare products because they exceed V1; a custom video player because native/Gumlet playback remains source of truth; a custom Toolcraft renderer/timeline because this is a DOM portal interaction over hosted video.
- State/output mapping: Overlay clicks map `clientX/clientY` into clamped x/y percentages and read native/Gumlet current time. Public `portalApi` calls write/read token-scoped D1 rows. The video route's `comment` search param selects and seeks the matching row. Admin summary/detail endpoints feed video badges and the Feedback panel; reply/status/read/delete actions write back through signed-cookie admin APIs. Guest name/email convenience values use `pixel-point.feedback.guest.v1` only.
- Files changed: `migrations/0002_feedback_comments.sql`; feedback types/utilities/API/database code under `src/app`; Pages Function unavailable adapter; Gumlet current-time/pause/seek adapter; public and admin feedback components; route search contract; acceptance/unit/browser tests; product spec/plan; and this worklog. `src/toolcraft` and paid-service configuration were not changed.
- Verification: Red tests first proved the missing migration/utilities/endpoints and Gumlet controls. Focused Vitest passed 45 tests across feedback validation/mapping, migration, API/auth/privacy/scope, player adapter, component usage, and acceptance metadata. Focused Playwright passed all 3 new public/admin flows, including 390px and 430px widths, persistent mocked API state, direct focus/seek, unread/read, reply, resolve, copy, and delete. `npm.cmd run verify:quick` passed Toolcraft docs/integrity, 12 Node tests, and all 76 Vitest tests. `npm.cmd run verify:final` then completed with exit code 0 against the verified same-app server: AI/docs/integrity checks, the same 12 Node and 76 Vitest tests, TypeScript, production Vite build, and all 17 functional Playwright scenarios passed. Runner: Playwright functional fallback; a full performance checkpoint was not triggered for this post-first-working non-performance feature.
- Skipped checks: Full browser performance checkpoint is not required for this post-first-working low-count DOM/API feature. It adds no custom renderer, Toolcraft canvas, export, animation, or reported performance problem; functional mobile browser checks cover the touched interaction/layout paths.
- Risks: Production requires applying `0002_feedback_comments.sql` before the new endpoints are used. Gumlet timestamp capture depends on player.js current-time events and falls back to the last reported time until a response arrives. Rate limiting is the existing per-isolate in-memory Pages Function limiter, appropriate for basic V1 abuse protection but not a global quota.

### Iteration 14 - Text-only portal identity

- Request: Remove the logo from every flow and screen, using the annotated admin screenshot as the concrete target, then publish the change.
- Task type: Tier 1 shared presentation change with a full final gate because the result will be published to production.
- User-visible result: Admin sign-in, desktop/mobile admin navigation, protected share access, collection shares, and single-video shares keep the Pixel Point name and context text but no longer render the decorative three-bar logo mark.
- Source/reference checked: The annotated user screenshot, the shared `PortalBrand` component, all five app consumers, the brand-mark CSS rules, existing portal presentation tests, and functional Playwright coverage.
- Reference inputs: `C:/Users/Mike/AppData/Local/Temp/codex-clipboard-24c9d2cb-5c96-41d5-9e82-6e15c4f997d1.png`. No Figma URL, video, GIF, screen recording, contact sheet, or extracted frames were supplied.
- Docs/contracts read: `AGENTS.md`, `docs/toolcraft/workflow.md`, `assembly-workflow.md`, `decision-contract.md`, `acceptance-testing.md`, plus the required brainstorming, writing-plans, test-driven-development, and browser workflow skills.
- Contract rules applied: Keep route/runtime/auth/data behavior unchanged, preserve the shared component boundary, remove dead presentation CSS, test the visible result through real routes, and avoid runtime/schema/control/canvas/export changes for a brand-only request.
- Decision: Interpret the screenshot arrow as removal of the graphic mark while retaining the Pixel Point wordmark and context labels. Remove it once in `PortalBrand` so every current and future consumer inherits the text-only identity.
- Alternatives rejected: Removing the Pixel Point name because the screenshot targets only the icon; hiding the mark independently in each route because that would drift; leaving unused logo CSS because the mark is intentionally removed from the product.
- State/output mapping: `PortalBrand` owns the identity rendered by admin auth, admin navigation, passcode access, collection shares, and video shares. Removing its decorative child and CSS changes only visible presentation; props, routes, runtime state, persistence, API, D1, playback, feedback, and exports are untouched.
- Files changed: `src/app/portal-ui.tsx`, `src/styles.css`, `src/app/portal-ui.test.ts`, `e2e/app-browser-acceptance.spec.ts`, the text-only brand spec/plan, and this worklog. No `src/toolcraft`, schema, API, migration, or dependency files change.
- Verification: The new Vitest assertion failed first because `portal-brand-mark` remained in shared markup. The focused Playwright test then failed with two visible marks on `/admin`. After the minimal shared removal, all 5 focused Vitest cases passed and the cross-flow Playwright scenario passed on admin, collection-share, and single-video routes. `npm.cmd run verify:final` completed with exit code 0: AI/docs/integrity checks, 12 Node tests, all 77 Vitest tests, TypeScript, the production Vite build, and all 18 functional Playwright scenarios passed against the verified same-app server.
- Skipped checks: Full browser performance is not required for this post-first-working presentation-only deletion. The change removes four static DOM elements and CSS and adds no workload, animation, canvas, export, media, or interaction path.
- Risks: None. All logo-bearing flows consume the same component, and automated source coverage fails if the removed mark or CSS is reintroduced.

## Decisions

### Renderer

- Decision: Use ordinary React DOM UI plus Gumlet iframe embeds and native MP4 playback, with a DOM feedback overlay for cloud-token single-video pages.
- Reason: The product is an operational portal, not a generated visual canvas/export tool; native video is the browser-controlled path that can enforce playback speed.
- Evidence: `src/app/admin-portal.tsx`, `src/app/admin-feedback-panel.tsx`, `src/app/share-portal.tsx`, `src/app/video-share-portal.tsx`, `src/app/video-feedback-review.tsx`, and `src/app/gumlet-player.tsx`.

### Timeline

- Decision: No Toolcraft timeline.
- Reason: Playback transport belongs to Gumlet or the browser-native video element; the portal only sets initial speed/start state.
- Evidence: No timeline route or schema behavior is used by the portal.

### Layers

- Decision: No layers.
- Reason: Projects and videos are list records, not editable visual layers.
- Evidence: The UI uses project/video lists and local form state.

### Controls

- Decision: Use Toolcraft UI/shadcn-style primitives for visible portal controls, feedback composers, menus, confirmation dialogs, and form chrome.
- Reason: The generated app includes a shared component system and the portal should not hand-roll available controls.
- Evidence: `src/app/admin-portal.tsx`, `src/app/admin-feedback-panel.tsx`, `src/app/share-portal.tsx`, `src/app/video-share-portal.tsx`, `src/app/video-feedback-review.tsx`, and `src/app/portal-component-system.test.ts`.

### Export

- Decision: No image/video export actions; metadata backup/export is handled through Cloudflare D1 tools and localStorage import remains available.
- Reason: Gumlet owns video playback and hosting; the portal only shares links and feedback.
- Evidence: No Gumlet upload/edit/export APIs are present; new cloud share links are token records in D1 and legacy encoded snapshots remain fallback-only.

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
- Run: `npm.cmd exec -- vitest run src/app/gumlet-player-adapter.test.ts src/app/portal-store.test.ts` first failed on parser expectations, then passed 8 tests after the confirmed `player.js` adapter hardening.
- Run: `npm.cmd run typecheck` passed after the Gumlet hardening pass.
- Run: `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts e2e/app-controls.spec.ts` passed 6 affected browser tests after Gumlet confirmation, fallback, admin duration, refresh, and delete coverage.
- Run: `npm.cmd run verify:quick` passed after the Gumlet hardening pass.
- Run: `npm.cmd run build` passed after the Gumlet hardening pass.
- Run: real Gumlet Playwright probe against `https://play.gumlet.io/embed/6707bf60f0a80d006151c369` passed; before click the CTA showed original duration, accelerated watch time, and saved time, and after click the live Gumlet `videoTag` reported duration `103.979`, playback rate `1.5`, muted `false`, volume `1`, and paused `false`.
- Run: `npm.cmd run typecheck` first failed on a missing `createShareUrl` test import, then passed after the Cloudflare production hardening changes.
- Run: `npm.cmd run test` passed after adding public URL and deployment config tests, with 35 Vitest tests and Toolcraft docs/integrity checks passing.
- Run: `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts e2e/app-controls.spec.ts` first failed on two strict selectors, then passed 7 affected browser tests after selector fixes.
- Run: `npm.cmd run build` passed after adding Cloudflare `_redirects` and `_headers`; `dist/_redirects` and `dist/_headers` were present.
- Run: `npm.cmd run verify:quick` passed after the Cloudflare production hardening changes.
- Run: deployed Cloudflare Pages browser probe passed for public video link, no localhost, incognito open, `/video/...` refresh, Gumlet iframe, stored-duration savings, edit video, and delete video.
- Run: deployed HEAD request showed live `x-content-type-options: nosniff` and `referrer-policy: strict-origin-when-cross-origin`; new CSP and Permissions-Policy are in `public/_headers` and `dist/_headers` for the next deployment.

## Risks

- Risk: Without a backend, copied links contain a project snapshot and client feedback does not sync back to the admin automatically.
- Risk: Recommended playback speed and audible start are exact for direct MP4 video pages. Iframe-only links now send play, speed, unmute, volume, and duration requests from the user click, but exact behavior still depends on Gumlet iframe API support and browser media policy.
