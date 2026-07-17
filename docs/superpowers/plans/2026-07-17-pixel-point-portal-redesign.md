# Pixel Point Portal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Multi-agent execution is intentionally disabled for this workspace.

**Goal:** Redesign the complete Pixel Point admin and public portal while preserving every existing public path, query fallback, token, Gumlet identifier, auth boundary, and deployed-domain assumption.

**Architecture:** Keep TanStack Router, Cloudflare Pages Functions, D1 tables, localStorage fallbacks, Gumlet/native playback adapters, and Toolcraft UI primitives. Add reusable-link lookup to the existing share-link API, introduce a small shared portal presentation layer, and incrementally reshape the route components. No runtime files, public path patterns, route parameter names, database migrations, or dependencies change.

**Tech Stack:** React 19, TypeScript 6, TanStack Router, Tailwind CSS 4, Toolcraft UI/Base UI primitives, Cloudflare Pages Functions, D1, Vitest, Playwright.

## Global Constraints

- Preserve `/share/$slug`, `/video/$slug`, `$slug`, the optional `data` search parameter, legacy `/#/share/...` and `/#/video/...` upgrades, `/api/public/share/:token`, and `/api/public/share/:token/passcode`.
- Never regenerate or re-key existing tokens, project IDs, video IDs, share slugs, or Gumlet asset IDs.
- Do not change `VITE_PUBLIC_APP_URL`, `PUBLIC_APP_URL`, `wrangler.toml`, or the deployed Pages domain.
- Do not add or execute a database migration.
- Keep `/admin` session-protected and public routes unauthenticated.
- Reuse existing Toolcraft UI primitives; do not edit `src/toolcraft` or add a dependency.
- Use test-driven changes: write and run a failing focused test before each compatibility or behavior implementation.
- Verification tier is Tier 4.

## File Responsibility Map

- `src/app/portal-cloud-api.ts`: stable share-link matching, token reuse, and unchanged public resolution.
- `src/app/portal-api.ts`: additive `reused` response typing.
- `src/app/portal-utils.ts`: route-compatible display/time helpers only; public URL creation remains unchanged.
- `src/app/portal-ui.tsx`: Pixel Point brand, page/state/status primitives, speed control, and time-savings presentation.
- `src/app/gumlet-player.tsx`: bounded player loading/fallback surface and playback-speed updates through the existing adapter.
- `src/app/admin-portal.tsx`: admin shell, project switcher, project/video workflows, stable share dialog, confirmations, validation, and status feedback.
- `src/app/share-portal.tsx`: responsive public collection, adjacent navigation, viewer speed, progress, and honest local feedback.
- `src/app/video-share-portal.tsx`: responsive single-video player, viewer speed, mobile start panel, and playback feedback.
- `src/app/admin-auth-gate.tsx`, `src/app/share-passcode-gate.tsx`, `src/routes/index.tsx`: shared Pixel Point state treatment without route or auth changes.
- `src/styles.css`: portal tokens, safe areas, skip link, focus/hover support, reduced motion, typography, and surface hierarchy.
- `src/app/*.test.ts`, `e2e/*.spec.ts`: compatibility, behavior, accessibility, and responsive evidence.
- `docs/toolcraft/agent-worklog.md`: route contract, decisions, verification, and remaining risks.

---

### Task 1: Lock Public URL & Stable Token Behavior

**Files:**
- Modify: `src/app/portal-cloud-api.test.ts`
- Modify: `src/app/portal-cloud-api.ts`
- Modify: `src/app/portal-api.ts`
- Modify: `src/app/portal-utils.test.ts`

**Interfaces:**
- Produces `PortalCloudDatabase.findReusableShareLink(ownerEmail, match)`.
- Produces `PortalShareLinkMatch = { expiresAt?: string; passcodeHash?: string; projectId: string; videoId?: string }`.
- Extends `CreateShareLinkResponse` with `reused: boolean` without removing existing fields.

- [ ] **Step 1: Add failing stable-link API tests**

Add focused tests that create the same unprotected project link twice, the same video link twice, and the same passcode-protected link twice, then assert the second response keeps `token_1` and returns `reused: true`. Add separate assertions that a different video, passcode, or normalized expiry creates a different token.

```ts
const firstBody = await json<CreateShareLinkResponse>(first);
const secondBody = await json<CreateShareLinkResponse>(second);
expect(firstBody).toMatchObject({ reused: false, token: "token_1" });
expect(secondBody).toMatchObject({ reused: true, token: "token_1" });
```

- [ ] **Step 2: Run the focused API test and verify failure**

Run: `npm.cmd exec -- vitest run src/app/portal-cloud-api.test.ts`

Expected: FAIL because `reused` and `findReusableShareLink` are not implemented and the second call currently returns `token_2`.

- [ ] **Step 3: Implement reusable-link lookup**

Add the match type and database method. The memory implementation filters owner, project, optional video, optional passcode hash, exact normalized expiry, `revokedAt === undefined`, and an expiry later than `runtime.now`. The D1 implementation uses the existing `share_links` and `projects` tables with a joined `SELECT ... ORDER BY created_at DESC LIMIT 1`; do not alter the schema.

Hash the requested passcode before lookup. In `handleAdminShareLinks`, return the reusable record when present; otherwise call the existing token generator and insert path. Return `{ kind, reused, token, url }` in both branches.

- [ ] **Step 4: Prove active, revoked, expired, passcode, and route behavior**

Run: `npm.cmd exec -- vitest run src/app/portal-cloud-api.test.ts src/app/portal-utils.test.ts`

Expected: PASS; existing public payload, auth, revoked, expired, passcode, clean URL, legacy hash, and encoded snapshot tests remain green.

- [ ] **Step 5: Inspect the compatibility diff**

Run: `git diff --check -- src/app/portal-cloud-api.ts src/app/portal-api.ts src/app/portal-cloud-api.test.ts src/app/portal-utils.test.ts`

Expected: no whitespace errors and no changes to public path literals or route parameter names.

### Task 2: Build the Shared Pixel Point Presentation Layer

**Files:**
- Create: `src/app/portal-ui.tsx`
- Create: `src/app/portal-ui.test.tsx`
- Modify: `src/styles.css`
- Modify: `index.html`

**Interfaces:**
- Produces `PortalBrand`, `PortalPageHeader`, `PortalStateCard`, `PortalStatus`, `PlaybackSpeedControl`, and `TimeSavingsSummary`.
- `PlaybackSpeedControl` consumes `{ label: string; onChange: (speed: PlaybackSpeed) => void; recommendedSpeed: PlaybackSpeed; value: PlaybackSpeed }`.
- `TimeSavingsSummary` consumes `{ durationSeconds?: number; speed: PlaybackSpeed; compact?: boolean }`.

- [ ] **Step 1: Add failing component-contract tests**

Assert the shared file exports the six components, the brand renders “Pixel Point”, `PortalStatus` includes `aria-live="polite"`, the speed control has a programmatic label and all five speed options, and the time summary uses existing duration helpers.

```tsx
render(<PlaybackSpeedControl label="Playback speed" onChange={onChange} recommendedSpeed={1.5} value={1.5} />);
expect(screen.getByLabelText("Playback speed")).toBeVisible();
expect(screen.getByText("Recommended")).toBeVisible();
```

- [ ] **Step 2: Run the component test and verify failure**

Run: `npm.cmd exec -- vitest run src/app/portal-ui.test.tsx`

Expected: FAIL because `portal-ui.tsx` does not exist.

- [ ] **Step 3: Implement shared components with Toolcraft primitives**

Use existing `Badge`, `Button`, `Card`, `Select`, and semantic HTML. Keep icons decorative unless they are the only accessible label. `PortalStateCard` accepts loading/error/empty content without owning route logic. `PortalPageHeader` accepts React nodes for actions and metadata so admin and public pages share framing without coupling state.

- [ ] **Step 4: Establish the visual tokens and global interaction rules**

Add `--portal-bg`, `--portal-surface-1`, `--portal-surface-2`, `--portal-border`, `--portal-blue`, `--portal-cyan`, and `--portal-success`. Add `.portal-shell`, `.portal-skip-link`, `.portal-numeric`, safe-area padding helpers, `text-wrap: balance/pretty`, intentional tap highlight/touch action, and a `prefers-reduced-motion` rule that disables pulse/transition animation. Keep browser zoom enabled.

Update `index.html` title/meta copy from the old clone wording to Pixel Point without changing URLs or CSP.

- [ ] **Step 5: Verify shared presentation behavior**

Run: `npm.cmd exec -- vitest run src/app/portal-ui.test.tsx src/app/portal-component-system.test.ts`

Expected: PASS and no raw replacement component library is introduced.

### Task 3: Make Gumlet Playback Resilient & Speed-Aware

**Files:**
- Modify: `src/app/gumlet-player.tsx`
- Modify: `src/app/gumlet-player-adapter.test.ts`
- Modify: `src/app/gumlet-player-adapter.ts` only if a missing existing command is proven by the failing test
- Modify: `e2e/app-browser-acceptance.spec.ts`

**Interfaces:**
- `GumletPlayer` continues consuming `PortalVideo`; viewer overrides are passed by callers through a cloned video with a different `recommendedPlaybackSpeed`.
- Add optional `onReady?: () => void` and a bounded loading/fallback visual that does not alter the iframe URL.

- [ ] **Step 1: Add failing playback-update and fallback tests**

Add browser coverage that changes the external speed control from 1.5x to 2x and verifies the existing Gumlet command builder sends 2, while the iframe `src` and asset ID remain unchanged. Add a test that the player wrapper exposes a loading status before readiness and useful fallback copy after its bounded timeout.

- [ ] **Step 2: Run affected playback tests and verify failure**

Run: `npm.cmd exec -- vitest run src/app/gumlet-player-adapter.test.ts`

Run: `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts -g "viewer speed|player fallback" --reporter=list`

Expected: focused browser tests fail before the shared control and player state exist.

- [ ] **Step 3: Implement loading/readiness without changing integration URLs**

Keep `buildGumletEmbedUrl`, `allow`, title, `postMessage` origin, subscription commands, duration commands, start time, and native fallback behavior unchanged. Add a parent status overlay/skeleton that clears on iframe load or a recognized ready message and becomes corrective fallback copy after the existing duration timeout window. Mark status updates polite and motion-reduced.

- [ ] **Step 4: Verify Gumlet integration and direct video behavior**

Run: `npm.cmd exec -- vitest run src/app/gumlet-player-adapter.test.ts src/app/portal-utils.test.ts`

Expected: PASS; exact embed URL, start time, duration parsing, speed, play, unmute, and volume commands remain covered.

### Task 4: Redesign the Admin Workspace

**Files:**
- Modify: `src/app/admin-portal.tsx`
- Create: `src/app/admin-video-form.tsx`
- Modify: `src/app/portal-component-system.test.ts`
- Modify: `e2e/app-controls.spec.ts`

**Interfaces:**
- `AdminVideoForm` consumes `draft`, `idPrefix`, `onChange`, and `errors`, and is reused by Add/Edit dialogs.
- Admin state and persistence remain in `AdminPortal`; presentational extraction must not move D1/localStorage behavior into route files.

- [ ] **Step 1: Add failing admin flow and accessibility tests**

Cover Pixel Point branding, mobile project Sheet, 1024-pixel non-sidebar layout, Share project dialog, stable project/video link copy, Project settings dialog, explicit project-delete confirmation, video-remove warning, numeric constraints, polite save/copy status, and no horizontal overflow at 1024/430/360.

```ts
await page.setViewportSize({ width: 430, height: 900 });
await expect(page.getByRole("button", { name: "Open projects" })).toBeVisible();
expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(430);
```

- [ ] **Step 2: Run the admin browser test and verify failure**

Run: `npm.cmd exec -- playwright test e2e/app-controls.spec.ts --reporter=list`

Expected: FAIL on the new brand, mobile navigation, dialogs, and status contract.

- [ ] **Step 3: Reshape navigation and project header**

Use `PortalBrand` and a semantic project `nav`. Show the sticky sidebar only at `min-[1200px]`; below it, render a compact top bar and left-side `Sheet` with the same project buttons. Keep New project, system status, import, cloud error, and sign-out behavior. Add a skip link and `id="main-content"`.

- [ ] **Step 4: Move settings and sharing into explicit workflows**

Replace inline project settings with a Project settings dialog. Keep existing project updates and persistence. Add a Share project dialog that resolves the standard link through the existing POST endpoint, surfaces `reused`, copies/opens the same URL, and offers an explicit passcode-protected link action. Remove passcode and URL fields from ordinary metadata.

- [ ] **Step 5: Rebuild the video library/preview hierarchy**

Render the library before preview in document order; use CSS grid to place them side by side at wide widths. Keep selection, ordering, refresh, edit, copy, open, and remove handlers. Long titles wrap to two or three lines. Consolidate duration/speed/watch/saved-time into `TimeSavingsSummary`.

- [ ] **Step 6: Harden forms and destructive actions**

Reuse `AdminVideoForm` in Add/Edit dialogs. Use `type="number"`, `min={0}`, `step={1}`, helper descriptions, `name`, and autocomplete metadata. Create inline errors for missing/invalid Gumlet input, title, duration, and start time. Project deletion and video removal require `AlertDialog`; project delete no longer executes directly from the dropdown.

- [ ] **Step 7: Verify admin unit/browser behavior**

Run: `npm.cmd exec -- vitest run src/app/portal-store.test.ts src/app/portal-component-system.test.ts`

Run: `npm.cmd exec -- playwright test e2e/app-controls.spec.ts --reporter=list`

Expected: PASS for create/edit/add/reorder/remove confirmation, stable share URLs, layout, labels, and empty states.

### Task 5: Redesign the Public Single-Video Page

**Files:**
- Modify: `src/app/video-share-portal.tsx`
- Modify: `e2e/app-browser-acceptance.spec.ts`

**Interfaces:**
- Uses `PortalBrand`, `PortalPageHeader`, `PortalStateCard`, `PortalStatus`, `PlaybackSpeedControl`, and `TimeSavingsSummary`.
- Adds route-local `viewerSpeed` initialized/reset from `video.recommendedPlaybackSpeed`; it never persists to project/video data.

- [ ] **Step 1: Add failing public-video behavior tests**

Cover unchanged token/encoded routes, Pixel Point framing, viewer speed selection, recalculated savings, native playback rate, Gumlet command rate, mobile in-flow start panel, invalid/expired/passcode states, and no `/admin` content.

- [ ] **Step 2: Run focused video-page tests and verify failure**

Run: `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts -g "video page|viewer speed|passcode-protected video|invalid video" --reporter=list`

Expected: new redesign assertions fail while existing link-resolution assertions remain green.

- [ ] **Step 3: Implement the new public frame and viewer speed state**

Do not change `loadVideoSnapshot`, `getSnapshotFromPublicResponse`, `portalApi.getPublicShare`, or passcode submission. Build `playbackVideo = { ...video, recommendedPlaybackSpeed: viewerSpeed }` and use it only for player commands and savings. Keep the stored recommendation visible as “Recommended”.

- [ ] **Step 4: Make the start experience responsive**

Keep the player first. Place the start panel after the player in mobile document flow and position it as an overlay from the small breakpoint upward. Keep the existing accessible button name with original duration, accelerated duration, and saved time. Put playback status in `PortalStatus`.

- [ ] **Step 5: Verify video route compatibility and viewport behavior**

Run: `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts -g "video page|video routes|hash video|passcode-protected video" --reporter=list`

Expected: PASS at desktop and mobile; route and token assertions are unchanged.

### Task 6: Redesign the Public Project Collection

**Files:**
- Modify: `src/app/share-portal.tsx`
- Modify: `e2e/app-browser-acceptance.spec.ts`

**Interfaces:**
- Adds `viewerSpeedByVideo: Record<string, PlaybackSpeed>` initialized lazily from each video recommendation.
- Keeps local feedback keys and progress keys unchanged.

- [ ] **Step 1: Add failing collection navigation/responsive tests**

Cover collection navigation before the player at 430 pixels, sticky rail at 1440 pixels, long titles, viewer speed selection, selected/progress states, comments, timestamp seek, empty collection, invalid/passcode states, and device-local feedback disclosure.

- [ ] **Step 2: Run focused collection tests and verify failure**

Run: `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts -g "share page|collection" --reporter=list`

Expected: new layout, local disclosure, and speed-control assertions fail.

- [ ] **Step 3: Reorder the document and implement shared controls**

Keep loading/token/passcode/data resolution and storage effects unchanged. Render header, mobile collection control, player, selected details/speed, feedback, then desktop sticky rail. Use responsive visibility classes so there is one accessible collection control per viewport, not duplicated focus targets.

- [ ] **Step 4: Preserve and clarify feedback/progress**

Keep `loomish.gumlet.portal.feedback.*` and `loomish.gumlet.portal.progress.*`. Label feedback “Notes on this device” and state that notes are not sent to the administrator. Keep existing name/email/timestamp/comment fields and timestamp seek behavior.

- [ ] **Step 5: Verify collection behavior**

Run: `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts -g "share page|collection|public token share" --reporter=list`

Expected: PASS without changing the public route or stored local keys.

### Task 7: Unify Auth, Passcode, Loading & Error States

**Files:**
- Modify: `src/app/admin-auth-gate.tsx`
- Modify: `src/app/share-passcode-gate.tsx`
- Modify: `src/routes/index.tsx`
- Modify: `src/app/deployment-config.test.ts`
- Modify: `e2e/app-browser-acceptance.spec.ts`

**Interfaces:**
- Uses the shared portal state/brand components without changing auth API requests or navigation destinations.

- [ ] **Step 1: Add failing state and keyboard tests**

Cover branded login, auth checking, wrong password inline alert, passcode error association, invalid/revoked/expired token next-step copy, reduced-motion loading, Escape-close dialogs, keyboard focus visibility, and heading hierarchy.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm.cmd exec -- vitest run src/app/deployment-config.test.ts`

Run: `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts -g "login|passcode|invalid|loading|keyboard" --reporter=list`

Expected: shared-brand and new accessibility assertions fail.

- [ ] **Step 3: Apply shared state treatment**

Keep `/api/auth/session`, `/api/auth/login`, `/api/auth/logout`, password handling, signed cookie, public route access, and root redirect logic unchanged. Add Pixel Point brand, skip target, correct autocomplete/name/spellcheck, inline `role="alert"`, `aria-describedby`, and polite checking status. Remove redundant ARIA heading roles where semantic headings already exist.

- [ ] **Step 4: Verify auth/public isolation**

Run: `npm.cmd exec -- vitest run src/app/deployment-config.test.ts src/app/portal-cloud-api.test.ts`

Run: `npm.cmd exec -- playwright test e2e/app-browser-acceptance.spec.ts -g "root redirects|public token|login|passcode" --reporter=list`

Expected: PASS; public pages never show admin controls and admin remains protected in production configuration.

### Task 8: Complete Acceptance, Worklog & Final Verification

**Files:**
- Modify: `src/app/app-acceptance.ts`
- Modify: `src/app/app-acceptance.test.ts`
- Modify: `e2e/app-browser-acceptance.spec.ts`
- Modify: `e2e/app-controls.spec.ts`
- Modify: `docs/toolcraft/agent-worklog.md`

**Interfaces:**
- No new product behavior; this task closes traceability and verification.

- [ ] **Step 1: Expand app acceptance inventory**

Record observable entities for stable project/video links, admin navigation, settings/share dialogs, project/video confirmations, public speed control, time savings, collection navigation, loading/error/passcode states, responsive breakpoints, and accessible status. Keep performance strategy `rendererStrategy: "none"` because the portal has no custom canvas renderer.

- [ ] **Step 2: Run the quick verification gate**

Run: `npm.cmd run verify:quick`

Expected: AI skills, docs/integrity checks, Node tests, and all Vitest app tests pass.

- [ ] **Step 3: Run the final gate**

Run: `npm.cmd run verify:final`

Expected: AI check, all tests, typecheck/build, and browser acceptance pass. The existing Vite large-chunk warning may remain if unchanged; record it honestly.

- [ ] **Step 4: Run the required browser performance checkpoint**

Prefer the controlled browser audit at 1440/1280/1024/768/430/390/360 and record `agent-browser`. If controlled-browser measurement is unavailable, run: `npm.cmd run verify:perf` and record `playwright-fallback`.

Expected: no horizontal overflow, responsive interaction budget pass, no new app console errors, and only environment-attributable Gumlet network errors if external frames are blocked.

- [ ] **Step 5: Verify link preservation explicitly**

Run focused unit/browser tests proving the pre-existing `/video/:token` and `/share/:token` patterns, the optional `data` query, old hash upgrade, same token returned on repeated copy, public resolution to the same project/video, no `/admin` redirect, unchanged Gumlet iframe asset ID, and no migration file change.

- [ ] **Step 6: Update the worklog and inspect final diff**

Record the pre-change audit, immutable URL contract, visual/system decisions, stable-link change, responsive checks, commands, results, skipped deployment/migration, Gumlet network limitations, and remaining risks.

Run: `git diff --check`

Run: `git status --short`

Expected: only intentional source, tests, docs, and metadata changes; no `src/toolcraft`, migration, lockfile, domain, or generated audit artifact changes.

- [ ] **Step 7: Start and verify the final local app**

Run: `npm.cmd run dev`

Expected: the saved port serves this repository’s `/.toolcraft/server-identity.json` and the Pixel Point app title marker. Report the verified local URL only after identity succeeds.
