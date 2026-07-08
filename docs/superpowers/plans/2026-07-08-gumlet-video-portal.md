# Gumlet Video Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static Loom-style Gumlet video portal with admin project/video organization, encoded client share links, Gumlet embeds, time-saved estimates, and timestamped feedback.

**Architecture:** Use TanStack Router for `/` admin and `/share/$slug` public views. Keep data in focused app modules: domain types, pure utilities, localStorage store, Gumlet player component, admin page, share page. Use pure utility tests first, then Playwright browser checks against real UI.

**Tech Stack:** Vite, React 19, TanStack Router, TypeScript, Tailwind CSS, localStorage, Gumlet iframe embeds, Vitest, Playwright.

## Global Constraints

- Do not build recording, upload, editing, Gumlet server API, processing, analytics dashboards, notifications, or custom Gumlet controls.
- Do not expose secrets to the client.
- Use Gumlet embed URL `https://play.gumlet.io/embed/{assetId}`.
- Recommended speed is applied as a best-effort initial player command after iframe load; viewers can change speed in Gumlet controls.
- With no database/auth in the repo, use localStorage and encoded share snapshots; document that feedback does not sync between browsers.

---

### Task 1: Data Model And Utility Tests

**Files:**
- Create: `src/app/portal-types.ts`
- Create: `src/app/portal-utils.ts`
- Create: `src/app/portal-utils.test.ts`

**Interfaces:**
- Produces `PortalProject`, `PortalVideo`, `PortalComment`, `PlaybackSpeed`, `formatDuration`, `estimateWatchTimeSeconds`, `estimateTimeSavedSeconds`, `createShareSlug`, `encodeShareProject`, `decodeShareProject`, `buildGumletEmbedUrl`.

- [ ] Write failing tests for duration formatting, time-saved math, Gumlet iframe URL construction, slug creation, and share snapshot round trip.
- [ ] Run `npm.cmd exec -- vitest run src/app/portal-utils.test.ts` and confirm failures are missing exports.
- [ ] Implement the types and pure utility functions.
- [ ] Re-run the targeted test and confirm it passes.

### Task 2: Local Store And Admin UI

**Files:**
- Create: `src/app/portal-store.ts`
- Create: `src/app/admin-portal.tsx`
- Create: `src/app/gumlet-player.tsx`
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/root.tsx`

**Interfaces:**
- Consumes utilities from Task 1.
- Produces `AdminPortal`, `GumletPlayer`, and admin route behavior for create, edit, delete, reorder, and copy share link.

- [ ] Write browser tests for creating a project, adding a Gumlet asset ID, seeing an iframe src, and copying a share link.
- [ ] Run the browser test and confirm it fails because UI is not implemented.
- [ ] Implement localStorage load/save helpers with a seeded empty state and stable update timestamps.
- [ ] Implement the admin project dashboard and project detail forms.
- [ ] Implement iframe player preview and best-effort playback-rate postMessage on load.
- [ ] Re-run targeted unit/build checks.

### Task 3: Public Share Page And Feedback

**Files:**
- Create: `src/app/share-portal.tsx`
- Modify: `src/routes/root.tsx`

**Interfaces:**
- Consumes encoded share snapshots and store fallback.
- Produces `/share/$slug` route with video playlist, Gumlet player, local viewing progress, comments, timestamp seek links, and time-saved estimates.

- [ ] Write browser tests for opening an encoded share link, showing the playlist, rendering the Gumlet iframe, adding timestamped feedback, and changing videos.
- [ ] Run the browser test and confirm it fails before implementation.
- [ ] Implement share route loading from `data` query first and localStorage second.
- [ ] Implement feedback storage keyed by share slug and video ID.
- [ ] Implement timestamp seek by updating the iframe start time parameter.
- [ ] Re-run browser tests.

### Task 4: Product Tests, Worklog, And Final Verification

**Files:**
- Replace starter-specific app tests with portal-specific tests in `src/app/app-schema.test.ts`, `src/app/app-acceptance.test.ts`, and `src/app/app-performance.test.ts`.
- Replace starter e2e checks in `e2e/app-controls.spec.ts`, `e2e/app-browser-acceptance.spec.ts`, and keep `e2e/app-performance.spec.ts` as a light no-op perf policy check.
- Update: `docs/toolcraft/agent-worklog.md`

**Interfaces:**
- Produces test coverage that matches this portal instead of the neutral Toolcraft template.

- [ ] Update app tests to assert product readiness metadata and portal utility behavior.
- [ ] Update Playwright tests to exercise admin/share flows with real inputs.
- [ ] Update the worklog to `Mode: product` with decisions, evidence, verification, assumptions, and risks.
- [ ] Run `npm.cmd run verify:final`.
- [ ] If Playwright browser installation or external browser execution is unavailable, record the exact blocker and run the strongest passing subset: `npm.cmd run ai:check`, `npm.cmd run test`, and `npm.cmd run build`.
- [ ] Start or reuse the dev server and report the verified URL.
