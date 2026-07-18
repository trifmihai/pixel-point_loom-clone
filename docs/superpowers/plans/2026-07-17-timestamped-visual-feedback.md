# Timestamped Visual Feedback Implementation Plan

> Execute with test-driven development. Keep `src/toolcraft` unchanged and preserve existing route/token/auth behavior.

**Goal:** Add D1-persisted, token-scoped positioned video comments for guests and an authenticated feedback workflow for administrators.

**Architecture:** Define feedback DTOs and pure validation/position/link utilities in focused app modules. Extend the existing portal database interface with Memory and D1 implementations, then route public/admin feedback endpoints through the shared Pages Function handler. Compose public and admin feedback as focused React components that consume new `portalApi` methods. Extend the Gumlet adapter only for current-time, pause, and seek commands.

**Stack:** React 19, TypeScript, TanStack Router, Toolcraft/shadcn UI, Vitest, Playwright, Cloudflare Pages Functions, D1.

## Verification note

Verification tier: Tier 4

Reason: the change adds a migration, database contract, public and signed-admin APIs, player overlay behavior, route search state, and responsive public/admin UI.

Run: focused tests per task, `npm.cmd run verify:quick`, focused browser tests at desktop/390/430, `npm.cmd run verify:final`, `npm.cmd run dev`.

Skip: full performance suite because this is a post-first-working low-count DOM/API feature with no custom renderer or reported jank.

## Task 1: Domain, route, and migration contracts

**Files:**

- Create `src/app/feedback-types.ts`
- Create `src/app/feedback-utils.ts`
- Create `src/app/feedback-utils.test.ts`
- Create `migrations/0002_feedback_comments.sql`
- Modify `src/routes/root.tsx`
- Modify `src/app/deployment-config.test.ts`

1. Write failing tests for click-position percentages, direct comment parsing/link construction, validation bounds, and migration fields/indexes.
2. Add public/admin feedback types, guest identity type, DB record type, summary type, and input/patch types.
3. Implement pure validation, public DTO redaction, thread grouping, marker positions, query parsing, and direct-link construction.
4. Add the D1 table/checks/indexes and extend the video route search contract with `comment` while preserving `data`.
5. Run the focused Vitest files and typecheck.

## Task 2: Database and API behavior

**Files:**

- Modify `src/app/portal-cloud-api.test.ts`
- Modify `src/app/portal-cloud-api.ts`
- Modify `functions/api/[[path]].ts`
- Modify `src/app/portal-api.ts`

1. Write failing API tests for valid creation/listing, validation, token/video scope, project-token scope, passcode enforcement, public redaction, auth, summaries/unread, video listing, reply, resolve/reopen/delete, and mark-read.
2. Write a focused fake-D1 mapping test that records SQL/bind values and verifies row mapping.
3. Extend `PortalCloudDatabase`; implement Memory and D1 feedback CRUD/count/read methods.
4. Add public feedback route authorization and validation using the existing rate limiter.
5. Add signed-admin feedback routes and actionable D1 error handling.
6. Add typed `portalApi` methods, including optional in-memory share passcode headers.
7. Extend the unavailable DB adapter in the Pages Function.
8. Run focused API tests, typecheck, and `npm.cmd run verify:quick`.

## Task 3: Media time controls and public Review mode

**Files:**

- Modify `src/app/gumlet-player-adapter.test.ts`
- Modify `src/app/gumlet-player-adapter.ts`
- Modify `src/app/gumlet-player.test.ts`
- Modify `src/app/gumlet-player.tsx`
- Create `src/app/video-feedback-review.tsx`
- Modify `src/app/video-share-portal.tsx`
- Modify `src/app/portal-component-system.test.ts`

1. Write failing adapter tests for current-time parsing/subscription, current-time request, pause, and seek commands.
2. Extend the Gumlet handle with current-time callbacks plus pause/request/seek methods; keep existing playback behavior unchanged.
3. Build the public Review component with Watch/Review mode, overlay click capture, numbered marker buttons, desktop composer, mobile sheet/card, guest identity storage, inline validation/network errors, filters, replies, and comment selection.
4. Integrate it only when `encodedData` is absent and the cloud token has resolved. Retain an unlocked passcode in component memory for comment requests.
5. Apply direct-comment search after comments load: enter Review, seek/pause, select, and focus.
6. Run focused unit/component tests and typecheck.

## Task 4: Admin feedback workflow

**Files:**

- Create `src/app/admin-feedback-panel.tsx`
- Modify `src/app/admin-portal.tsx`
- Modify `src/app/portal-api.ts`
- Modify `src/app/portal-component-system.test.ts`

1. Add summary state/loading to the cloud admin and refresh it after project load and feedback actions.
2. Render compact unread/open badges on video cards without changing selection/reorder behavior.
3. Add the selected-video Feedback section with empty/retry states, automatic mark-read, parent/reply display, reply form, resolve/reopen, copy/open direct link, and soft-delete confirmation/menu.
4. Keep local mode explicit: feedback collection requires a cloud token link.
5. Verify one-column mobile cards and DropdownMenu actions at 390px/430px.

## Task 5: Acceptance, worklog, and final verification

**Files:**

- Modify `src/app/app-acceptance.ts`
- Modify `src/app/app-acceptance.test.ts`
- Modify `e2e/app-browser-acceptance.spec.ts`
- Modify `e2e/app-controls.spec.ts`
- Modify `docs/toolcraft/agent-worklog.md`

1. Add browser mocks with mutable persisted comment state.
2. Cover public add/refresh/marker/direct-link behavior, mobile 390/430 widths, and passcode comment requests.
3. Cover admin summaries, mark-read, reply, resolve/reopen, direct link, delete, empty/retry states, and mobile actions.
4. Update product readiness and the decision trail with D1 persistence/privacy, no timeline/layers/export, DOM renderer, and skipped full performance rationale.
5. Run `npm.cmd run verify:quick` and fix root causes using the required systematic-debugging workflow if anything fails.
6. Run focused Playwright acceptance, then `npm.cmd run verify:final`.
7. Start `npm.cmd run dev`, verify the Toolcraft identity endpoint and app marker, and report the local URL. Do not push or deploy unless separately requested.
