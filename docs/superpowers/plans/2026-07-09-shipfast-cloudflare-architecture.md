# ShipFast-Inspired Cloudflare Architecture Plan

Verification tier: Tier 4
Reason: Adds production persistence, API/security boundaries, tokenized public routes, admin sync UI, Cloudflare deployment files, and regression tests.
Run: `npm run test`, `npm run build`, focused Playwright public-token checks, then `npm run verify:final` if time and environment allow.
Skip: Full performance checkpoint is not required for this post-first-working non-performance architecture pass.

## Scope

1. Add a small central app config for app identity, public URL, admin email, cloud sync/local mode, and security copy.
2. Add a typed native-fetch API client with centralized API error/loading helpers.
3. Add shared Cloudflare API logic with D1 and in-memory adapters:
   - Admin project list/save/import.
   - Admin-only share-link creation.
   - Public token resolution and passcode unlock.
   - Revoked/expired token rejection.
4. Add Cloudflare Pages Functions wrapper, D1 migration, and minimal Wrangler Pages config.
5. Update admin UI:
   - Account/status area.
   - Local project import-to-cloud action.
   - Cloud token copy/open behavior when cloud sync is enabled.
   - Optional passcode input per newly created share link.
6. Update public `/share/:token` and `/video/:token` pages:
   - Keep legacy encoded-data/localStorage fallback.
   - Load tokenized public payloads without localStorage.
   - Show passcode gate before video/project details when required.
7. Add tests for admin auth, D1-like cross-session persistence, import, token links, public token loads, revoked/expired links, passcode unlock, no secret leakage, and existing Gumlet behavior.
8. Add docs covering borrowed ShipFast concepts, intentionally omitted ShipFast features, Cloudflare setup, D1 schema, Access setup, env vars, cost guardrails, security limits, and backup/export.

## Notes

- Keep Vite React/TanStack routing.
- Keep Toolcraft/shadcn-style components and existing Gumlet playback/duration logic.
- Do not add paid SaaS dependencies or video storage/proxying.
- Cloudflare Access protects `/admin`; public token routes remain open.
