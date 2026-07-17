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
});
