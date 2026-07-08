# Cloudflare Production Setup And Cost Guardrails

The Gumlet portal stays a Vite React app on Cloudflare Pages. The production
backend is limited to Cloudflare Pages Functions plus D1 for project metadata,
share tokens, and passcode hashes. Videos remain hosted on Gumlet.

## ShipFast Concepts Borrowed

- Central config: `src/app/app-config.ts` keeps app name, public URL, admin
  email, cloud/local mode flags, and short security/help copy in one place.
- Protected dashboard concept: `/admin` should be protected by Cloudflare
  Access, similar to a protected dashboard route, without adding NextAuth.
- Account/status UI: the admin panel shows Local only vs Cloud sync, admin
  access status, and the Cloudflare Access login/logout note.
- API client pattern: `src/app/portal-api.ts` centralizes native `fetch` calls,
  API errors, and loading-state types.

## ShipFast Parts Intentionally Not Copied

- No Next.js migration.
- No NextAuth.
- No Stripe, billing, pricing pages, payment webhooks, or customer portal.
- No Resend, Crisp, email marketing, or chat widget.
- No MongoDB, Mongoose, Supabase, Firebase, or paid auth provider.
- No DaisyUI.
- No video upload, proxy, storage, or transcoding in this app.

## Cloudflare Pages

- Build command: `npm run build`.
- Output directory: `dist`.
- Pages Functions directory: `functions`.
- SPA fallback: `public/_redirects` keeps `/share/:token` and `/video/:token`
  refresh-safe.
- Static security headers: `public/_headers`.

## D1 Setup

1. Create a D1 database in Cloudflare.
2. Replace `database_id` in `wrangler.toml`.
3. Apply `migrations/0001_portal.sql`.
4. Bind the database to Pages as `DB`.

Schema summary:

- `projects`: `id`, `owner_email`, `name`, `client_name`, `description`,
  `visibility`, `share_slug`, `created_at`, `updated_at`.
- `videos`: `id`, `project_id`, `title`, `gumlet_asset_id`, `gumlet_input`,
  `direct_video_url`, `description`, `thumbnail_url`, `duration_seconds`,
  `start_time_seconds`, `recommended_playback_speed`, `order_index`,
  `created_at`, `updated_at`.
- `share_links`: `id`, `token`, `project_id`, nullable `video_id`, nullable
  `passcode_hash`, nullable `expires_at`, `created_at`, nullable `revoked_at`.

`share_slug` is an app compatibility column for existing local projects and
legacy fallback links.

## Cloudflare Access

Protect the admin route at Cloudflare, not in client JavaScript:

1. In Cloudflare Zero Trust, create an Access application for the Pages domain.
2. Set the protected path to `/admin*`.
3. Allow only `trifmihai.business@gmail.com`.
4. Leave public routes open:
   - `/video/*`
   - `/share/*`
   - `/api/public/share/*`
5. Cloudflare Access must forward
   `Cf-Access-Authenticated-User-Email`; admin APIs reject missing or
   non-matching email headers.

## Environment Variables

Frontend:

- `VITE_PUBLIC_APP_URL=https://pixel-point-loom-clone.pages.dev`
- `VITE_CLOUD_SYNC_ENABLED=true`
- `VITE_ADMIN_EMAIL=trifmihai.business@gmail.com`

Pages Functions:

- `PUBLIC_APP_URL=https://pixel-point-loom-clone.pages.dev`
- `ADMIN_EMAIL=trifmihai.business@gmail.com`
- D1 binding: `DB`

Do not add Gumlet API keys to frontend code. This app only uses public Gumlet
asset/embed/video URLs already provided by the admin.

## Cost Guardrails

- Cloudflare Pages hosts the Vite build.
- D1 stores only metadata and tokens, not video files.
- Pages Functions are limited to the minimal admin/public API.
- No paid Cloudflare products are required by this implementation.
- Cloudflare free-tier limits and pricing can change. Monitor Pages, Workers,
  and D1 usage in the Cloudflare dashboard and set billing alerts if available.
- Gumlet remains the video hosting cost center.

## Security Limits

- Client links are unlisted by default, not searchable or listed.
- Token links avoid embedding full project/video JSON in new URLs.
- Passcodes are verified server-side and stored only as hashes.
- Public APIs return only the project/video allowed by the token.
- Revoked or expired tokens are rejected.
- A simple per-isolate request limiter is included for public token endpoints,
  but it is not a global distributed rate limiter.
- Real video privacy must still be configured inside Gumlet.

## Backup And Export

- Use Cloudflare D1 export/backup tools from the Cloudflare dashboard or
  Wrangler for database snapshots.
- Local browser data remains importable through the admin action; it is not
  deleted automatically.
- Gumlet videos are backed up and managed in Gumlet, not this app.
