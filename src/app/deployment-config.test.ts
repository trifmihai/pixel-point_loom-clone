import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Cloudflare Pages static deployment config", () => {
  it("keeps the admin dashboard on /admin instead of /", () => {
    const routeSource = readFileSync("src/routes/root.tsx", "utf8");
    const indexRouteSource = readFileSync("src/routes/index.tsx", "utf8");

    expect(routeSource).toContain('path: "/admin"');
    expect(indexRouteSource).not.toContain("AdminPortal");
    expect(indexRouteSource).toContain('to="/admin"');
  });

  it("declares the Pages D1 binding and cloud sync variables in wrangler", () => {
    const wranglerConfig = readFileSync("wrangler.toml", "utf8");

    expect(wranglerConfig).toContain('name = "pixel-point-loom-clone"');
    expect(wranglerConfig).toContain('pages_build_output_dir = "dist"');
    expect(wranglerConfig).toContain("[[d1_databases]]");
    expect(wranglerConfig).toContain('binding = "DB"');
    expect(wranglerConfig).toContain('database_name = "portal-prod"');
    expect(wranglerConfig).toContain(
      'database_id = "f9830510-4fda-44df-8e2d-c8ec8aae7539"',
    );
    expect(wranglerConfig).toContain('migrations_dir = "migrations"');
    expect(wranglerConfig).toContain("[vars]");
    expect(wranglerConfig).toContain(
      'VITE_PUBLIC_APP_URL = "https://pixel-point-loom-clone.pages.dev"',
    );
    expect(wranglerConfig).toContain('VITE_CLOUD_SYNC_ENABLED = "true"');
    expect(wranglerConfig).toContain('VITE_ADMIN_EMAIL = "trifmihai.business@gmail.com"');
    expect(wranglerConfig).toContain(
      'PUBLIC_APP_URL = "https://pixel-point-loom-clone.pages.dev"',
    );
    expect(wranglerConfig).toContain('ADMIN_EMAIL = "trifmihai.business@gmail.com"');
    expect(wranglerConfig).not.toMatch(
      /\[\[(kv_namespaces|r2_buckets|durable_objects|queues|analytics_engine_datasets)\]\]/i,
    );
  });

  it("keeps direct SPA refreshes on share and video routes working", () => {
    const redirects = readFileSync("public/_redirects", "utf8");
    const redirectLines = redirects
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    expect(redirects).toContain("/admin /index.html 200");
    expect(redirects).toContain("/admin/* /index.html 200");
    expect(redirects).toContain("/share/* /index.html 200");
    expect(redirects).toContain("/video/* /index.html 200");
    expect(redirectLines).not.toContain("/* /index.html 200");
  });

  it("sets static security headers without adding paid services", () => {
    const headers = readFileSync("public/_headers", "utf8");

    expect(headers).toContain("X-Content-Type-Options: nosniff");
    expect(headers).toContain("Referrer-Policy: strict-origin-when-cross-origin");
    expect(headers).toContain(
      "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()",
    );
    expect(headers).toContain("Content-Security-Policy:");
    expect(headers).toContain("frame-src https://play.gumlet.io");
    expect(headers).toContain("media-src 'self' blob: https://video.gumlet.io https://*.gumlet.io");
    expect(headers).not.toMatch(/worker|function|kv|r2|d1|durable|stream|images/i);
  });

  it("keeps frontend config and API client free of private secrets and paid clients", () => {
    const appConfig = readFileSync("src/app/app-config.ts", "utf8");
    const portalApi = readFileSync("src/app/portal-api.ts", "utf8");
    const frontendSource = `${appConfig}\n${portalApi}`;

    expect(appConfig).toContain("appName");
    expect(appConfig).toContain("cloudSyncEnabled");
    expect(portalApi).toContain("fetch(");
    expect(frontendSource).not.toMatch(/gumlet[_-]?api|api[_-]?key|secret|token_secret/i);
    expect(frontendSource).not.toMatch(/axios|stripe|resend|mongoose|mongodb|daisyui/i);
  });
});
