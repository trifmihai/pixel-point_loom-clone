# Implementation Worklog

This file records product decisions and the evidence behind them.

## Status

Mode: product

The app is now a local-first Gumlet client video portal. It organizes existing Gumlet asset IDs, creates encoded client share links, embeds Gumlet videos, suggests initial playback speeds, and collects timestamped feedback locally.

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

## Decisions

### Renderer

- Decision: Use ordinary React DOM UI plus Gumlet iframe embeds.
- Reason: The product is an operational portal, not a generated visual canvas/export tool.
- Evidence: `src/app/admin-portal.tsx`, `src/app/share-portal.tsx`, and `src/app/gumlet-player.tsx`.

### Timeline

- Decision: No Toolcraft timeline.
- Reason: Playback transport belongs to Gumlet's native player controls.
- Evidence: No timeline route or schema behavior is used by the portal.

### Layers

- Decision: No layers.
- Reason: Projects and videos are list records, not editable visual layers.
- Evidence: The UI uses project/video lists and local form state.

### Controls

- Decision: Use Toolcraft UI/shadcn-style primitives for visible portal controls and form chrome.
- Reason: The generated app includes a shared component system and the portal should not hand-roll available controls.
- Evidence: `src/app/admin-portal.tsx`, `src/app/share-portal.tsx`, and `src/app/portal-component-system.test.ts`.

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

## Risks

- Risk: Without a backend, copied links contain a project snapshot and client feedback does not sync back to the admin automatically.
- Risk: Recommended playback speed is sent to the iframe with safe postMessage attempts after load; exact behavior depends on Gumlet iframe API support.
