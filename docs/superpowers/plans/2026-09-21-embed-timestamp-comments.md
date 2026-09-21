# Clear timestamped comments in Notion embeds

Approved plan: retain the top-right button with a live timestamp, remove the embed C shortcut, pause and confirm a timestamp before posting, keep the full label on narrow embeds, and preserve drafts through a retryable two-second capture timeout. No public API, dependency, database, runtime, schema sections, canvas, timeline, layers, export, or persistence changes.

Verification tier: Tier 3
Reason: Compact comment UI, native/Gumlet timestamp capture, and player message correlation.
Run: npm run ai:check; capture unit tests; npm run verify:quick; focused nested-iframe/native browser acceptance and constrained-layout responsiveness; npm run verify:final; identity-verified npm run dev.
Skip: Full performance suite because this is a post-first-working non-performance edit without renderer workload changes. Dependencies are present and unchanged.

## Implementation

1. Add a cancellable, correlated pause/current-time operation to the Gumlet adapter with origin/source validation and bounded failure. Test success, unrelated messages, invalid values, timeout, cancellation, and independent sessions.
2. Expose onCaptureTimestamp(signal): Promise<number> through the shared portal; native media pauses and reads currentTime. Track whether playback time is known.
3. Update the compact composer, label, hover/focus help, pending/error/retry behavior, and abort lifecycle. Keep the full-review shortcut unchanged.
4. Preserve the bounded embed, 44px targets, focus, and narrow layout. Verify timestamps saved through the API, including fractional seconds.
5. Update acceptance metadata and worklog, run required checks, and provide the verified local URL.
