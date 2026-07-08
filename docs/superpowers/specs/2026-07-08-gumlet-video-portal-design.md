# Gumlet Video Portal Design

## Goal

Build a lightweight Loom-style client viewing portal on top of already-hosted Gumlet videos. The app does not record, upload, edit, process, or manage Gumlet assets through server APIs.

## Context

The repo is a fresh Toolcraft/Vite React starter with TanStack Router, Tailwind CSS, TypeScript, Playwright, and local Toolcraft UI/runtime code. There is no auth, backend, database, ORM, server API, or migration system. The MVP therefore uses browser localStorage for admin data and encoded share-link snapshots for client access.

## Product Shape

The admin route at `/` is a quiet workspace with a project list on the left and the selected project detail on the right. It supports creating, renaming, deleting, and describing projects. Project cards show the project name, client name when present, number of videos, last updated date, and a copy client link button.

The project detail view supports manually adding Gumlet videos by asset ID, title, optional description, optional thumbnail URL, recommended speed, optional start time, and duration. Videos can be edited, removed, and reordered with up/down buttons. Removing a video never touches Gumlet.

The public route `/share/$slug` loads a project either from an encoded `data` query parameter or, as a local fallback, from admin localStorage. The share view shows project metadata, the Gumlet player, a playlist, viewing status stored locally, time-saved estimates, and simple timestamped feedback.

## Data Policy

Projects and videos are stored in localStorage under `loomish.gumlet.portal.v1`. Share links include a base64url JSON snapshot of the selected project so the link can open on another browser without a backend. Client feedback is stored locally on the viewer device under a share-specific key; it is not synced back to the admin without a backend.

## Gumlet Player

The player uses the standard Gumlet iframe URL: `https://play.gumlet.io/embed/{assetId}`. Start time is sent as `t` in the query string when configured or when clicking a timestamp. The app attempts to set the initial playback rate after iframe load with safe `postMessage` commands, but keeps Gumlet's native controls enabled and never locks the speed.

Duration is manually entered in the admin for reliable time-saved calculations. If a future Gumlet player API message exposes duration/current time, the component can consume it, but this MVP does not require a Gumlet API key or package dependency.

## UI

The app uses dense, production-minded operational UI rather than a landing page. The palette is neutral dark with restrained blue/green status accents. Layout is responsive: desktop uses two-column admin and player/playlist layouts; mobile stacks controls and content.

## Security

No Gumlet API keys or secrets are stored or exposed. Share links are unlisted snapshots. There is no auth in the current codebase, so admin pages are not protected in this MVP; adding real auth and a database is the next step before external deployment.

## Verification Tier

Verification tier: Tier 4
Reason: Fresh generated app completion touching routing, product data, visible UI, embeds, persistence, tests, and browser checks.
Run: `npm run verify:final`, browser performance fallback when feasible, then `npm run dev`.
Skip: No Gumlet API integration tests because the MVP intentionally uses embeds only and no Gumlet API key.
