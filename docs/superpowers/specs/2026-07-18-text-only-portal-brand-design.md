# Text-only portal brand design

## Goal

Remove the decorative Pixel Point logo mark from every portal flow while keeping the `Pixel Point` name, context labels, navigation, authentication, and public review behavior unchanged.

## Scope

- Make the shared `PortalBrand` component text-only.
- Remove the unused `.portal-brand-mark` CSS rules.
- Cover every consumer through the shared component: admin login, desktop/mobile admin navigation, passcode access, project shares, and single-video shares.
- Preserve the existing brand text and context copy.

## Product decisions

- The screenshot arrow targets the graphic mark, so "remove the logo" means remove the icon/mark rather than remove the `Pixel Point` wordmark.
- Keep one shared component; do not add route-specific hiding or feature flags.
- Controls, canvas, renderer, timeline, layers, persistence, settings transfer, export, API, D1, and authentication are unchanged.
- No control-section inventory changes are required because this portal presentation change does not add or alter Toolcraft controls.

## Acceptance

- Source and styles contain no `portal-brand-mark` markup or rules.
- `PortalBrand` still renders `Pixel Point` and optional context text.
- Admin and public routes show text-only identity with no logo mark at desktop and mobile widths.
