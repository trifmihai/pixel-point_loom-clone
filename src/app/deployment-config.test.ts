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
    expect(appConfig).not.toContain("Cloudflare Access");
    expect(portalApi).toContain("fetch(");
    expect(frontendSource).not.toMatch(/gumlet[_-]?api|api[_-]?key|secret|token_secret/i);
    expect(frontendSource).not.toMatch(/axios|stripe|resend|mongoose|mongodb|daisyui/i);
  });

  it("defines the timestamped feedback D1 migration and required lookup indexes", () => {
    const migration = readFileSync("migrations/0002_feedback_comments.sql", "utf8");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS feedback_comments");
    for (const column of [
      "share_token",
      "project_id",
      "video_id",
      "parent_id",
      "author_name",
      "author_email",
      "author_role",
      "body",
      "timestamp_seconds",
      "position_x",
      "position_y",
      "status",
      "admin_read_at",
      "created_at",
      "updated_at",
      "deleted_at",
    ]) {
      expect(migration).toContain(column);
    }
    for (const indexTarget of [
      "share_token",
      "video_id",
      "project_id",
      "parent_id",
      "status",
      "admin_read_at",
    ]) {
      expect(migration).toMatch(new RegExp(`CREATE INDEX[^;]+${indexTarget}`, "i"));
    }
  });

  it("uses free app-level admin authentication without frontend secrets", () => {
    const apiFunction = readFileSync("functions/api/[[path]].ts", "utf8");
    const adminRoute = readFileSync("src/routes/admin.tsx", "utf8");
    const authGate = readFileSync("src/app/admin-auth-gate.tsx", "utf8");
    const portalApi = readFileSync("src/app/portal-api.ts", "utf8");
    const frontendSource = `${adminRoute}\n${authGate}\n${portalApi}`;

    expect(apiFunction).toContain("ADMIN_PASSWORD");
    expect(apiFunction).toContain("AUTH_SECRET");
    expect(adminRoute).toContain("AdminAuthGate");
    expect(authGate).toContain("portalApi.loginAdmin");
    expect(authGate).toContain("getAdminSession");
    expect(portalApi).toContain('credentials: "same-origin"');
    expect(portalApi).toContain('"/api/auth/login"');
    expect(portalApi).toContain('"/api/auth/logout"');
    expect(portalApi).toContain('"/api/auth/session"');
    expect(frontendSource).not.toContain("ADMIN_PASSWORD");
    expect(frontendSource).not.toContain("AUTH_SECRET");
    expect(frontendSource).not.toContain("localStorage");
  });

  it("shows production cloud sync diagnostics in the admin UI", () => {
    const adminPortal = readFileSync("src/app/admin-portal.tsx", "utf8");

    expect(adminPortal).toContain("Cloud sync enabled");
    expect(adminPortal).toContain("Local mode");
    expect(adminPortal).toContain("Public app URL");
    expect(adminPortal).toContain("Cloud sync status");
    expect(adminPortal).toContain(
      "Cloud sync is disabled in this production build. Do not send ?data= links to clients.",
    );
  });
});
