# Notion Dark Embed Chrome Plan

## Outcome

Make the Pixel Point chrome surrounding `/embed/video/:slug` feel native inside a Notion dark-mode page while leaving video playback, Gumlet controls, tokens, passcodes, APIs, and the full review route unchanged.

## Research basis

- Notion treats embeds as content blocks that are resized by the host page and can open their source in a separate view.
- Notion's dark appearance is intentionally warm-neutral and low contrast rather than blue-black.
- Notion's default product typography is compact, sans-serif, and organized through block hierarchy instead of decorative containers.
- The user's production screenshots are visual evidence only: they show a warm charcoal page, thin separators, compact text, and minimal surface elevation.

## Visual direction

- Subject: a quiet client-review video block.
- Audience: a reviewer who should play immediately and only leave Notion when they deliberately choose `Open full review`.
- Page/surface palette: `#191919` outer field, `#202020` block, white-alpha hairlines, high-contrast primary text, and subdued secondary text.
- Typography: system UI stack, 12px metadata, 14px title and action, compact line heights, restrained weight.
- Layout: 8px block radius, 1px border, no shadow, compact header/footer, flush player viewport.
- Interaction: neutral hover/focus treatments; no blue accent unless the video provider itself renders one.
- Signature detail: speed guidance remains functional status copy instead of becoming another pill or branded decoration.

## Control section inventory

This route exposes no Toolcraft schema controls. Its operational groups are:

| Group | Product entity | Target | Grouping reason |
| --- | --- | --- | --- |
| Identity | Project and video | Embed header | Establishes context before playback |
| Playback | Shared video | Existing Gumlet/native player | Keeps the playable media uninterrupted |
| Navigation and status | Review link, client, speed state | Header action and footer | Keeps secondary actions quieter than playback |

Timeline, layers, persistence, canvas sizing, and export remain absent because this is a hosted media presentation route.

## Responsive contract

- Wide embeds show project/title and the labelled full-review action on one row.
- Narrow embeds preserve the title, expose the action as an icon with an accessible label, and keep the footer readable without horizontal overflow.
- The embed fills its iframe width and never imitates Notion's host-owned resize handles.

## Test-first implementation

1. Add a browser regression that asserts the real route's computed surface color, type family, border radius, lack of shadow, compact header/footer, and narrow-width overflow behavior.
2. Observe the test fail against the current blue-black raised card.
3. Add route-scoped Notion tokens and semantic embed classes in `src/styles.css`.
4. Restyle the embed branch in `src/app/video-share-portal.tsx` without touching playback logic.
5. Run the focused browser scenario, `npm run verify:quick`, and `npm run build`.
6. Inspect wide and narrow screenshots in a real browser and record evidence in the Toolcraft worklog.

## Verification tier

Verification tier: Tier 2

Reason: the pass changes the complete compact embed presentation and its responsive mapping, but not state, playback, APIs, renderer workload, or the full review route.

Run: focused Notion embed Playwright checks, `npm run verify:quick`, `npm run build`, and real browser inspection at wide and narrow embed widths.

Skip: performance coverage because this changes static DOM/CSS only and adds no canvas, animation, export, media-processing, or high-frequency workload.
