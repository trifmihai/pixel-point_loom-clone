import { describe, expect, it } from "vitest";

import {
  MemoryPortalCloudDatabase,
  handlePortalApiRequest,
  type PortalApiRuntime,
} from "./portal-cloud-api";
import type { PortalData, PortalProject } from "./portal-types";

const adminEmail = "trifmihai.business@gmail.com";

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
    createToken: () => `token_${++tokenCount}`,
    db,
    now: () => new Date("2026-07-09T09:00:00.000Z"),
    publicAppUrl: "https://portal.example",
  };
}

function createRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`https://portal.example${path}`, init);
}

function createAdminRequest(path: string, init: RequestInit = {}): Request {
  return createRequest(path, {
    ...init,
    headers: {
      "Cf-Access-Authenticated-User-Email": adminEmail,
      ...(init.headers ?? {}),
    },
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("portal cloud API", () => {
  it("serves public health without Cloudflare Access or D1 access", async () => {
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

  it("rejects unauthenticated and non-admin admin API requests", async () => {
    const runtime = createRuntime();

    const unauthenticated = await handlePortalApiRequest(
      createRequest("/api/admin/projects"),
      runtime,
    );
    const nonAdmin = await handlePortalApiRequest(
      createRequest("/api/admin/projects", {
        headers: {
          "Cf-Access-Authenticated-User-Email": "someone@example.com",
        },
      }),
      runtime,
    );

    expect(unauthenticated.status).toBe(401);
    expect(nonAdmin.status).toBe(403);
  });

  it("allows only the configured admin and persists projects across sessions", async () => {
    const runtime = createRuntime();
    const data: PortalData = { projects: [createProject()] };

    const saveResponse = await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", {
        body: JSON.stringify({ data }),
        method: "PUT",
      }),
      runtime,
    );
    const loadResponse = await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects"),
      runtime,
    );

    expect(saveResponse.status).toBe(200);
    expect(loadResponse.status).toBe(200);
    await expect(json<PortalData>(loadResponse)).resolves.toEqual(data);
  });

  it("imports local projects into cloud storage without deleting the browser source", async () => {
    const runtime = createRuntime();
    const localData: PortalData = { projects: [createProject({ id: "project_local" })] };

    const response = await handlePortalApiRequest(
      createAdminRequest("/api/admin/import", {
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
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );

    const createLink = await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", {
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
    expect(publicResponse.status).toBe(200);
    expect(publicBody.kind).toBe("video");
    expect(publicBody.snapshot.video.id).toBe("video_1");
    expect(JSON.stringify(publicBody)).not.toContain("project_2");
  });

  it("loads public project tokens without localStorage data", async () => {
    const runtime = createRuntime();
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );

    const createLink = await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", {
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
    expect(publicResponse.status).toBe(200);
    expect(publicBody.kind).toBe("share");
    expect(publicBody.project.videos).toHaveLength(1);
  });

  it("rejects revoked and expired public tokens", async () => {
    const db = new MemoryPortalCloudDatabase();
    const runtime = createRuntime(db);
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", {
        body: JSON.stringify({ projectId: "project_1" }),
        method: "POST",
      }),
      runtime,
    );
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", {
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
    await handlePortalApiRequest(
      createAdminRequest("/api/admin/projects", {
        body: JSON.stringify({ data: { projects: [createProject()] } }),
        method: "PUT",
      }),
      runtime,
    );
    const createLink = await handlePortalApiRequest(
      createAdminRequest("/api/admin/share-links", {
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
