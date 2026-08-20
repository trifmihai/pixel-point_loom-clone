import { describe, expect, it } from "vitest";

import {
  MemoryPortalCloudDatabase,
  handlePortalApiRequest,
  type PortalApiRuntime,
} from "./portal-cloud-api";
import type { CreateShareLinkResponse } from "./portal-api";
import type { PortalData, PortalProject } from "./portal-types";

const adminEmail = "trifmihai.business@gmail.com";
const adminPassword = "correct-password";
const authSecret = "test-auth-secret";

function createProject(overrides: Partial<PortalProject> = {}): PortalProject {
  return {
    clientName: "TrifDigital",
    createdAt: "2026-07-09T08:00:00.000Z",
    description: "Client review collection",
    id: "project_1",
    name: "Project Collection",
    shareSlug: "project-collection",
    updatedAt: "2026-07-09T08:00:00.000Z",
    videos: [
      {
        assetId: "6707bf60f0a80d006151c369",
        createdAt: "2026-07-09T08:01:00.000Z",
        description: "Main review video",
        directVideoUrl:
          "https://video.gumlet.io/655d712a774b17ed87ac87e2/6707bf60f0a80d006151c369/main.mp4",
        durationSeconds: 103,
        id: "video_1",
        orderIndex: 0,
        recommendedPlaybackSpeed: 1.5,
        startTimeSeconds: 3,
        thumbnailUrl:
          "https://video.gumlet.io/655d712a774b17ed87ac87e2/6707bf60f0a80d006151c369/thumbnail-1-0.png",
        title: "Successful Story",
        updatedAt: "2026-07-09T08:01:00.000Z",
      },
    ],
    visibility: "unlisted",
    ...overrides,
  };
}

function createRuntime(db = new MemoryPortalCloudDatabase()): PortalApiRuntime {
  let tokenCount = 0;

  return {
    adminEmail,
    adminPassword,
    authSecret,
    createToken: () => `token_${++tokenCount}`,
    db,
    now: () => new Date("2026-07-09T09:00:00.000Z"),
    publicAppUrl: "https://portal.example",
  } as PortalApiRuntime;
}

function createRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`https://portal.example${path}`, init);
}

function createAdminRequest(path: string, sessionCookie: string, init: RequestInit = {}): Request {
  return createRequest(path, {
    ...init,
    headers: {
      Cookie: sessionCookie,
      ...(init.headers ?? {}),
    },
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function createAdminSessionCookie(runtime: PortalApiRuntime): Promise<string> {
  const response = await handlePortalApiRequest(
    createRequest("/api/auth/login", {
      body: JSON.stringify({ password: adminPassword }),
      method: "POST",
    }),
    runtime,
  );
  const setCookie = response.headers.get("Set-Cookie");

  expect(response.status).toBe(200);
  expect(setCookie).toContain("portal_admin_session=");

  return setCookie!.split(";")[0]!;
}

describe("portal cloud API", () => {
  it("serves public health without admin auth or D1 access", async () => {
    const throwingDb: MemoryPortalCloudDatabase = new Proxy(new MemoryPortalCloudDatabase(), {
      get() {
        throw new Error("D1 should not be touched by health checks");
      },
    });
    const runtime = createRuntime(throwingDb);

    const response = await handlePortalApiRequest(createRequest("/api/health"), runtime);

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({
      ok: true,
      service: "portal-api",
    });
  });

  it("serves admin session state and rejects invalid admin API cookies", async () => {
    const runtime = createRuntime();

    const session = await handlePortalApiRequest(createRequest("/api/auth/session"), runtime);
    const unauthenticated = await handlePortalApiRequest(
      createRequest("/api/admin/projects"),
      runtime,
    );
    const tampered = await handlePortalApiRequest(
      createRequest("/api/admin/projects", {
        headers: {
          Cookie: "portal_admin_session=tampered.cookie",
        },
      }),
      runtime,
    );

    expect(session.status).toBe(200);
    await expect(json(session)).resolves.toEqual({
      adminEmail,
      authenticated: false,
    });
    expect(unauthenticated.status).toBe(401);
    expect(tampered.status).toBe(401);
  });

  it("logs in with the admin password and clears the HttpOnly session cookie on logout", async () => {
    const runtime = createRuntime();

    const wrongPassword = await handlePortalApiRequest(
      createRequest("/api/auth/login", {
        body: JSON.stringify({ password: "wrong-password" }),
        method: "POST",
      }),
      runtime,
    );
    const login = await handlePortalApiRequest(
      createRequest("/api/auth/login", {
        body: JSON.stringify({ password: adminPassword }),
        method: "POST",
      }),
      runtime,
    );
    const setCookie = login.headers.get("Set-Cookie") ?? "";
    const sessionCookie = setCookie.split(";")[0]!;
    const session = await handlePortalApiRequest(
      createRequest("/api/auth/session", {
        headers: {
          Cookie: sessionCookie,
        },
      }),
      runtime,
    );
    const logout = await handlePortalApiRequest(
      createRequest("/api/auth/logout", {
        headers: {
          Cookie: sessionCookie,
        },
        method: "POST",
      }),
      runtime,
    );

    expect(wrongPassword.status).toBe(401);
    expect(login.status).toBe(200);
    await expect(json(login)).resolves.toEqual({
      adminEmail,
      authenticated: true,
    });
    expect(setCookie).toContain("portal_admin_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).not.toContain(adminPassword);
    expect(setCookie).not.toContain(authSecret);
    expect(session.status).toBe(200);
    await expect(json(session)).resolves.toEqual({
      adminEmail,
      authenticated: true,
    });
    expect(logout.status).toBe(200);
    expect(logout.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("allows a valid admin session to persist projects across sessions", async () => {
    const runtime = createRuntime();
    const sessionCookie = await createAdminSessionCookie(runtime);
    const data: PortalData = { projects: [createProject()] };

    const saveResponse = await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data }),
        method: "PUT",
      }),
      runtime,
    );
    const loadResponse = await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie),
      runtime,
    );

    expect(saveResponse.status).toBe(200);
    expect(loadResponse.status).toBe(200);
    await expect(json<PortalData>(loadResponse)).resolves.toEqual(data);
  });

  it("imports local projects into cloud storage without deleting the browser source", async () => {
    const runtime = createRuntime();
    const sessionCookie = await createAdminSessionCookie(runtime);
    const localData: PortalData = { projects: [createProject({ id: "project_local" })] };

    const response = await handlePortalApiRequest(
      createAdminRequest("/api/admin/import", sessionCookie, {
        body: JSON.stringify({ data: localData }),
        method: "POST",
      }),
      runtime,
    );

    expect(response.status).toBe(200);
    await expect(json<PortalData>(response)).resolves.toEqual(localData);
  });

  it("creates token links instead of encoded-data URLs and scopes public video payloads", async () => {
    const runtime = createRuntime();
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );

    const createLink = await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({ projectId: "project_1", videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );
    const linkBody = await json<{ token: string; url: string }>(createLink);
    const publicResponse = await handlePortalApiRequest(
      createRequest(`/api/public/share/${linkBody.token}`),
      runtime,
    );
    const publicBody = await json<{ kind: "video"; snapshot: { video: { id: string } } }>(
      publicResponse,
    );

    expect(createLink.status).toBe(200);
    expect(linkBody.url).toBe("https://portal.example/video/token_1");
    expect(linkBody.url).not.toContain("data=");
    expect(linkBody.url).not.toContain("#");
    expect(publicResponse.status).toBe(200);
    expect(publicBody.kind).toBe("video");
    expect(publicBody.snapshot.video.id).toBe("video_1");
    expect(JSON.stringify(publicBody)).not.toContain("project_2");
  });

  it("reuses active project and video links instead of silently regenerating tokens", async () => {
    const runtime = createRuntime();
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );

    const createLink = (videoId?: string) =>
      handlePortalApiRequest(
        createAdminRequest("/api/admin/share-links", sessionCookie, {
          body: JSON.stringify({ projectId: "project_1", videoId }),
          method: "POST",
        }),
        runtime,
      );

    const firstProject = await json<CreateShareLinkResponse>(await createLink());
    const secondProject = await json<CreateShareLinkResponse>(await createLink());
    const firstVideo = await json<CreateShareLinkResponse>(await createLink("video_1"));
    const secondVideo = await json<CreateShareLinkResponse>(await createLink("video_1"));

    expect(firstProject).toMatchObject({ reused: false, token: "token_1" });
    expect(secondProject).toMatchObject({ reused: true, token: "token_1" });
    expect(firstVideo).toMatchObject({ reused: false, token: "token_2" });
    expect(secondVideo).toMatchObject({ reused: true, token: "token_2" });
  });

  it("matches reusable links by passcode and exact expiry semantics", async () => {
    const runtime = createRuntime();
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );

    const createLink = (passcode: string, expiresAt?: string) =>
      handlePortalApiRequest(
        createAdminRequest("/api/admin/share-links", sessionCookie, {
          body: JSON.stringify({ expiresAt, passcode, projectId: "project_1" }),
          method: "POST",
        }),
        runtime,
      );

    const firstProtected = await json<CreateShareLinkResponse>(
      await createLink("client-pass"),
    );
    const reusedProtected = await json<CreateShareLinkResponse>(
      await createLink("client-pass"),
    );
    const differentPasscode = await json<CreateShareLinkResponse>(
      await createLink("other-pass"),
    );
    const expiring = await json<CreateShareLinkResponse>(
      await createLink("client-pass", "2026-07-10T09:00:00.000Z"),
    );

    expect(firstProtected).toMatchObject({ reused: false, token: "token_1" });
    expect(reusedProtected).toMatchObject({ reused: true, token: "token_1" });
    expect(differentPasscode).toMatchObject({ reused: false, token: "token_2" });
    expect(expiring).toMatchObject({ reused: false, token: "token_3" });
  });

  it("loads public project tokens without localStorage data", async () => {
    const runtime = createRuntime();
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );

    const createLink = await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({ projectId: "project_1" }),
        method: "POST",
      }),
      runtime,
    );
    const linkBody = await json<{ token: string; url: string }>(createLink);
    const publicResponse = await handlePortalApiRequest(
      createRequest(`/api/public/share/${linkBody.token}`),
      runtime,
    );
    const publicBody = await json<{ kind: "share"; project: PortalProject }>(publicResponse);

    expect(linkBody.url).toBe("https://portal.example/share/token_1");
    expect(linkBody.url).not.toContain("#");
    expect(linkBody.url).not.toContain("data=");
    expect(publicResponse.status).toBe(200);
    expect(publicBody.kind).toBe("share");
    expect(publicBody.project.videos).toHaveLength(1);
  });

  it("rejects revoked and expired public tokens", async () => {
    const db = new MemoryPortalCloudDatabase();
    const runtime = createRuntime(db);
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({ projectId: "project_1" }),
        method: "POST",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({
          expiresAt: "2026-07-09T08:30:00.000Z",
          projectId: "project_1",
        }),
        method: "POST",
      }),
      runtime,
    );

    db.revokeShareToken("token_1");

    const revoked = await handlePortalApiRequest(
      createRequest("/api/public/share/token_1"),
      runtime,
    );
    const expired = await handlePortalApiRequest(
      createRequest("/api/public/share/token_2"),
      runtime,
    );

    expect(revoked.status).toBe(404);
    expect(expired.status).toBe(410);
  });

  it("blocks passcode-protected tokens until the correct passcode is verified server-side", async () => {
    const runtime = createRuntime();
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );
    const createLink = await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({
          passcode: "client-pass",
          projectId: "project_1",
          videoId: "video_1",
        }),
        method: "POST",
      }),
      runtime,
    );
    const { token } = await json<{ token: string }>(createLink);

    const blocked = await handlePortalApiRequest(
      createRequest(`/api/public/share/${token}`),
      runtime,
    );
    const wrong = await handlePortalApiRequest(
      createRequest(`/api/public/share/${token}/passcode`, {
        body: JSON.stringify({ passcode: "wrong" }),
        method: "POST",
      }),
      runtime,
    );
    const unlocked = await handlePortalApiRequest(
      createRequest(`/api/public/share/${token}/passcode`, {
        body: JSON.stringify({ passcode: "client-pass" }),
        method: "POST",
      }),
      runtime,
    );

    expect(blocked.status).toBe(200);
    await expect(json(blocked)).resolves.toMatchObject({
      kind: "video",
      requiresPasscode: true,
    });
    expect(wrong.status).toBe(403);
    expect(unlocked.status).toBe(200);
    await expect(json(unlocked)).resolves.toMatchObject({
      kind: "video",
      snapshot: {
        video: {
          id: "video_1",
        },
      },
    });
    expect(JSON.stringify((runtime.db as MemoryPortalCloudDatabase).getRawShareToken("token_1"))).not.toContain(
      "client-pass",
    );
  });

  it("records the first confirmed external playback and exposes it to the admin activity feed", async () => {
    const runtime = createRuntime();
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({ projectId: "project_1", videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );

    const recorded = await handlePortalApiRequest(
      createRequest("/api/public/share/token_1/view", {
        body: JSON.stringify({ videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );
    const activity = await handlePortalApiRequest(
      createAdminRequest("/api/admin/activity", sessionCookie),
      runtime,
    );

    expect(recorded.status).toBe(201);
    await expect(json(recorded)).resolves.toEqual({ recorded: true });
    expect(activity.status).toBe(200);
    await expect(json(activity)).resolves.toEqual({
      emailConfigured: false,
      events: [
        {
          emailStatus: "not-configured",
          firstViewedAt: "2026-07-09T09:00:00.000Z",
          id: expect.any(String),
          projectId: "project_1",
          projectName: "Project Collection",
          shareToken: "token_1",
          videoId: "video_1",
          videoTitle: "Successful Story",
        },
      ],
      unreadCount: 1,
    });
  });

  it("records only one first view per video across links and keeps already-known viewer identity", async () => {
    const runtime = createRuntime();
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({ projectId: "project_1", videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({ projectId: "project_1" }),
        method: "POST",
      }),
      runtime,
    );

    const first = await handlePortalApiRequest(
      createRequest("/api/public/share/token_1/view", {
        body: JSON.stringify({
          videoId: "video_1",
          viewerEmail: " mira@example.com ",
          viewerName: " Mira ",
        }),
        method: "POST",
      }),
      runtime,
    );
    const duplicate = await handlePortalApiRequest(
      createRequest("/api/public/share/token_2/view", {
        body: JSON.stringify({ videoId: "video_1", viewerName: "Other viewer" }),
        method: "POST",
      }),
      runtime,
    );
    const activity = await json<{
      events: Array<{ viewerEmail?: string; viewerName?: string }>;
      unreadCount: number;
    }>(
      await handlePortalApiRequest(
        createAdminRequest("/api/admin/activity", sessionCookie),
        runtime,
      ),
    );

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(200);
    await expect(json(duplicate)).resolves.toEqual({ recorded: false });
    expect(activity.events).toEqual([
      expect.objectContaining({
        viewerEmail: "mira@example.com",
        viewerName: "Mira",
      }),
    ]);
    expect(activity.unreadCount).toBe(1);
  });

  it("keeps playback tracking non-fatal when the additive activity migration is not ready", async () => {
    const db = new MemoryPortalCloudDatabase();
    const runtime = createRuntime(db);
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({ projectId: "project_1", videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );
    db.createFirstVideoView = async () => {
      throw new Error("no such table: first_video_views");
    };

    const response = await handlePortalApiRequest(
      createRequest("/api/public/share/token_1/view", {
        body: JSON.stringify({ videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );

    expect(response.status).toBe(503);
    await expect(json(response)).resolves.toEqual({
      error: {
        code: "activity_migration_required",
        message: "Activity storage is not ready. Apply the latest D1 migrations and try again.",
      },
    });
  });

  it("does not record playback from a browser carrying the valid admin session", async () => {
    const runtime = createRuntime();
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({ projectId: "project_1", videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );

    const ownerView = await handlePortalApiRequest(
      createAdminRequest("/api/public/share/token_1/view", sessionCookie, {
        body: JSON.stringify({ videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );
    const activity = await json<{ events: unknown[]; unreadCount: number }>(
      await handlePortalApiRequest(
        createAdminRequest("/api/admin/activity", sessionCookie),
        runtime,
      ),
    );

    expect(ownerView.status).toBe(200);
    await expect(json(ownerView)).resolves.toEqual({ recorded: false });
    expect(activity).toMatchObject({ events: [], unreadCount: 0 });
  });

  it("requires the existing share passcode before recording a protected video view", async () => {
    const runtime = createRuntime();
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({
          passcode: "client-pass",
          projectId: "project_1",
          videoId: "video_1",
        }),
        method: "POST",
      }),
      runtime,
    );

    const blocked = await handlePortalApiRequest(
      createRequest("/api/public/share/token_1/view", {
        body: JSON.stringify({ videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );
    const recorded = await handlePortalApiRequest(
      createRequest("/api/public/share/token_1/view", {
        body: JSON.stringify({ videoId: "video_1" }),
        headers: { "X-Share-Passcode": "client-pass" },
        method: "POST",
      }),
      runtime,
    );

    expect(blocked.status).toBe(403);
    expect(recorded.status).toBe(201);
  });

  it("marks loaded activity read without changing the first-view evidence", async () => {
    const runtime = createRuntime();
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({ projectId: "project_1", videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createRequest("/api/public/share/token_1/view", {
        body: JSON.stringify({ videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );

    const marked = await handlePortalApiRequest(
      createAdminRequest("/api/admin/activity/read", sessionCookie, { method: "POST" }),
      runtime,
    );
    const activity = await json<{
      events: Array<{ adminReadAt?: string; firstViewedAt: string }>;
      unreadCount: number;
    }>(
      await handlePortalApiRequest(
        createAdminRequest("/api/admin/activity", sessionCookie),
        runtime,
      ),
    );

    expect(marked.status).toBe(200);
    expect(activity.unreadCount).toBe(0);
    expect(activity.events).toEqual([
      expect.objectContaining({
        adminReadAt: "2026-07-09T09:00:00.000Z",
        firstViewedAt: "2026-07-09T09:00:00.000Z",
      }),
    ]);
  });

  it("updates optional email delivery state without rolling back in-app activity", async () => {
    const runtime = createRuntime();
    const deferred: Array<Promise<unknown>> = [];
    const delivered: string[] = [];
    runtime.defer = (promise) => deferred.push(promise);
    runtime.deliverFirstViewNotification = async (activity) => {
      delivered.push(activity.videoId);
    };
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({ projectId: "project_1", videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );

    const recorded = await handlePortalApiRequest(
      createRequest("/api/public/share/token_1/view", {
        body: JSON.stringify({ videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );
    await Promise.all(deferred);
    const activity = await json<{
      emailConfigured: boolean;
      events: Array<{ emailStatus: string }>;
    }>(
      await handlePortalApiRequest(
        createAdminRequest("/api/admin/activity", sessionCookie),
        runtime,
      ),
    );

    expect(recorded.status).toBe(201);
    expect(delivered).toEqual(["video_1"]);
    expect(activity.emailConfigured).toBe(true);
    expect(activity.events[0]?.emailStatus).toBe("sent");
  });

  it("keeps in-app activity when optional email delivery fails", async () => {
    const runtime = createRuntime();
    const deferred: Array<Promise<unknown>> = [];
    runtime.defer = (promise) => deferred.push(promise);
    runtime.deliverFirstViewNotification = async () => {
      throw new Error("Email provider unavailable");
    };
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({ projectId: "project_1", videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );

    const recorded = await handlePortalApiRequest(
      createRequest("/api/public/share/token_1/view", {
        body: JSON.stringify({ videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );
    await Promise.all(deferred);
    const activity = await json<{
      events: Array<{ emailStatus: string; videoId: string }>;
      unreadCount: number;
    }>(
      await handlePortalApiRequest(
        createAdminRequest("/api/admin/activity", sessionCookie),
        runtime,
      ),
    );

    expect(recorded.status).toBe(201);
    expect(activity.unreadCount).toBe(1);
    expect(activity.events).toEqual([
      expect.objectContaining({ emailStatus: "failed", videoId: "video_1" }),
    ]);
  });

  it("creates and lists token-scoped public feedback without exposing private fields", async () => {
    const runtime = createRuntime();
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({ projectId: "project_1", videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );

    const created = await handlePortalApiRequest(
      createRequest("/api/public/share/token_1/comments", {
        body: JSON.stringify({
          authorEmail: "guest@example.com",
          authorName: "Mira",
          body: "Please tighten this transition.",
          positionX: 23.5,
          positionY: 67,
          timestampSeconds: 41.25,
          videoId: "video_1",
        }),
        method: "POST",
      }),
      runtime,
    );
    const listed = await handlePortalApiRequest(
      createRequest("/api/public/share/token_1/comments?videoId=video_1"),
      runtime,
    );
    const createdBody = await json<Record<string, unknown>>(created);
    const listedBody = await json<{ comments: Array<Record<string, unknown>> }>(listed);

    expect(created.status).toBe(201);
    expect(createdBody).toMatchObject({
      authorName: "Mira",
      body: "Please tighten this transition.",
      positionX: 23.5,
      positionY: 67,
      timestampSeconds: 41.25,
      videoId: "video_1",
    });
    expect(createdBody).not.toHaveProperty("authorEmail");
    expect(createdBody).not.toHaveProperty("adminReadAt");
    expect(listed.status).toBe(200);
    expect(listedBody.comments).toHaveLength(1);
    expect(JSON.stringify(listedBody)).not.toContain("guest@example.com");
  });

  it("validates public feedback and enforces video scope for video and project tokens", async () => {
    const runtime = createRuntime();
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({ projectId: "project_1", videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({ projectId: "project_1" }),
        method: "POST",
      }),
      runtime,
    );

    const invalid = await handlePortalApiRequest(
      createRequest("/api/public/share/token_1/comments", {
        body: JSON.stringify({
          authorEmail: "bad-email",
          authorName: "",
          body: "",
          positionX: -1,
          positionY: 101,
          timestampSeconds: -1,
          videoId: "video_1",
        }),
        method: "POST",
      }),
      runtime,
    );
    const wrongVideo = await handlePortalApiRequest(
      createRequest("/api/public/share/token_1/comments", {
        body: JSON.stringify({
          authorName: "Mira",
          body: "Wrong scope",
          positionX: 10,
          positionY: 10,
          timestampSeconds: 1,
          videoId: "video_other",
        }),
        method: "POST",
      }),
      runtime,
    );
    const projectTokenValid = await handlePortalApiRequest(
      createRequest("/api/public/share/token_2/comments", {
        body: JSON.stringify({
          authorName: "Mira",
          body: "Project token comment",
          positionX: 10,
          positionY: 10,
          timestampSeconds: 1,
          videoId: "video_1",
        }),
        method: "POST",
      }),
      runtime,
    );

    expect(invalid.status).toBe(400);
    expect(wrongVideo.status).toBe(404);
    expect(projectTokenValid.status).toBe(201);
  });

  it("requires the share passcode for protected feedback requests", async () => {
    const runtime = createRuntime();
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({
          passcode: "client-pass",
          projectId: "project_1",
          videoId: "video_1",
        }),
        method: "POST",
      }),
      runtime,
    );

    const blocked = await handlePortalApiRequest(
      createRequest("/api/public/share/token_1/comments?videoId=video_1"),
      runtime,
    );
    const unlocked = await handlePortalApiRequest(
      createRequest("/api/public/share/token_1/comments?videoId=video_1", {
        headers: { "X-Share-Passcode": "client-pass" },
      }),
      runtime,
    );

    expect(blocked.status).toBe(403);
    expect(unlocked.status).toBe(200);
  });

  it("summarizes unread feedback and supports the complete admin feedback workflow", async () => {
    const runtime = createRuntime();
    const sessionCookie = await createAdminSessionCookie(runtime);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", sessionCookie, {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", sessionCookie, {
        body: JSON.stringify({ projectId: "project_1", videoId: "video_1" }),
        method: "POST",
      }),
      runtime,
    );
    const guest = await handlePortalApiRequest(
      createRequest("/api/public/share/token_1/comments", {
        body: JSON.stringify({
          authorEmail: "guest@example.com",
          authorName: "Mira",
          body: "Please tighten this transition.",
          positionX: 23.5,
          positionY: 67,
          timestampSeconds: 41.25,
          videoId: "video_1",
        }),
        method: "POST",
      }),
      runtime,
    );
    const guestBody = await json<{ id: string }>(guest);

    const unauthorized = await handlePortalApiRequest(
      createRequest("/api/admin/feedback"),
      runtime,
    );
    const summaryBefore = await handlePortalApiRequest(
      createAdminRequest("/api/admin/feedback", sessionCookie),
      runtime,
    );
    const videoFeedback = await handlePortalApiRequest(
      createAdminRequest("/api/admin/videos/video_1/feedback", sessionCookie),
      runtime,
    );
    const reply = await handlePortalApiRequest(
      createAdminRequest(`/api/admin/feedback/${guestBody.id}/replies`, sessionCookie, {
        body: JSON.stringify({ body: "Thanks, I will update it." }),
        method: "POST",
      }),
      runtime,
    );
    const resolved = await handlePortalApiRequest(
      createAdminRequest(`/api/admin/feedback/${guestBody.id}`, sessionCookie, {
        body: JSON.stringify({ status: "resolved" }),
        method: "PATCH",
      }),
      runtime,
    );
    const markedRead = await handlePortalApiRequest(
      createAdminRequest("/api/admin/videos/video_1/feedback/read", sessionCookie, {
        method: "POST",
      }),
      runtime,
    );
    const summaryAfter = await handlePortalApiRequest(
      createAdminRequest("/api/admin/feedback", sessionCookie),
      runtime,
    );

    expect(unauthorized.status).toBe(401);
    await expect(json(summaryBefore)).resolves.toMatchObject({
      videos: [
        {
          openCount: 1,
          resolvedCount: 0,
          unreadCount: 1,
          videoId: "video_1",
        },
      ],
    });
    expect(videoFeedback.status).toBe(200);
    expect(JSON.stringify(await json(videoFeedback))).toContain("guest@example.com");
    expect(reply.status).toBe(201);
    expect(resolved.status).toBe(200);
    expect(markedRead.status).toBe(200);
    await expect(json(summaryAfter)).resolves.toMatchObject({
      videos: [
        {
          openCount: 0,
          resolvedCount: 1,
          unreadCount: 0,
          videoId: "video_1",
        },
      ],
    });

    const deleted = await handlePortalApiRequest(
      createAdminRequest(`/api/admin/feedback/${guestBody.id}`, sessionCookie, {
        body: JSON.stringify({ deleted: true }),
        method: "PATCH",
      }),
      runtime,
    );
    const publicAfterDelete = await handlePortalApiRequest(
      createRequest("/api/public/share/token_1/comments?videoId=video_1"),
      runtime,
    );

    expect(deleted.status).toBe(200);
    await expect(json(publicAfterDelete)).resolves.toEqual({ comments: [] });
  });
});
