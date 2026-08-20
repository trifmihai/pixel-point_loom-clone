import { existsSync, readFileSync } from "node:fs";

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

  it("keeps direct SPA refreshes on share, review, and embed routes working", () => {
    const redirects = readFileSync("public/_redirects", "utf8");
    const redirectLines = redirects
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    expect(redirects).toContain("/admin /index.html 200");
    expect(redirects).toContain("/admin/* /index.html 200");
    expect(redirects).toContain("/share/* /index.html 200");
    expect(redirects).toContain("/video/* /index.html 200");
    expect(redirects).toContain("/embed/video/* /index.html 200");
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

  it("permits third-party framing only for the dedicated video embed route", () => {
    const headers = readFileSync("public/_headers", "utf8");
    const headerBlocks = headers
      .split(/(?=^\/)/m)
      .map((block) => block.trim())
      .filter(Boolean);
    const getHeaderBlock = (route: string) =>
      headerBlocks.find((block) => block.split(/\r?\n/, 1)[0] === route) ?? "";

    expect(getHeaderBlock("/*")).toContain("Content-Security-Policy:");
    expect(getHeaderBlock("/*")).not.toContain("frame-ancestors");
    for (const protectedRoute of ["/", "/admin", "/admin/*", "/share/*", "/video/*"]) {
      expect(getHeaderBlock(protectedRoute)).toContain(
        "Content-Security-Policy: frame-ancestors 'self'",
      );
    }
    expect(getHeaderBlock("/embed/video/*")).toContain("X-Robots-Tag: noindex, nofollow");
    expect(getHeaderBlock("/embed/video/*")).not.toContain("frame-ancestors");
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

  it("adds first-video-view storage without altering existing portal tables", () => {
    const migrationPath = "migrations/0003_first_video_views.sql";

    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS first_video_views");
    expect(migration).toContain("video_id TEXT NOT NULL UNIQUE");
    expect(migration).toContain("FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE");
    expect(migration).toContain("FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE");
    expect(migration).not.toMatch(/ALTER\s+TABLE/i);
    for (const column of [
      "share_token",
      "viewer_name",
      "viewer_email",
      "first_viewed_at",
      "admin_read_at",
      "email_status",
    ]) {
      expect(migration).toContain(column);
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
