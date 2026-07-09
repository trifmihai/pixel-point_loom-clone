import type { PlaybackSpeed, PortalData, PortalProject, PortalVideo } from "./portal-types";

type D1Result<T> = {
  results?: T[];
};

type D1PreparedStatement = {
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
};

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatement;
};

type ShareLinkKind = "share" | "video";

export type PortalShareLinkRecord = {
  createdAt: string;
  expiresAt?: string;
  id: string;
  passcodeHash?: string;
  projectId: string;
  revokedAt?: string;
  token: string;
  videoId?: string;
};

export type PortalCloudDatabase = {
  createShareLink(ownerEmail: string, record: PortalShareLinkRecord): Promise<PortalShareLinkRecord>;
  getShareLink(token: string): Promise<(PortalShareLinkRecord & { ownerEmail: string }) | null>;
  listProjects(ownerEmail: string): Promise<PortalData>;
  replaceProjects(ownerEmail: string, data: PortalData): Promise<PortalData>;
  revokeShareLink(token: string, revokedAt: string): Promise<boolean>;
};

export type PortalApiRuntime = {
  adminEmail: string;
  adminPassword?: string;
  authSecret?: string;
  createToken?: () => string;
  db: PortalCloudDatabase;
  now?: () => Date;
  publicAppUrl: string;
};

type CreateShareLinkBody = {
  expiresAt?: string;
  passcode?: string;
  projectId?: string;
  videoId?: string | null;
};

type PublicPayload =
  | {
      kind: "share";
      project: PortalProject;
    }
  | {
      kind: "video";
      snapshot: {
        project: Pick<PortalProject, "clientName" | "id" | "name" | "shareSlug">;
        video: PortalVideo;
      };
    };

type AdminSessionPayload = {
  email: string;
  expiresAt: number;
  issuedAt: number;
  purpose: "portal-admin";
};

const publicRateLimits = new Map<string, { count: number; resetAt: number }>();
const publicRateLimitWindowMs = 60_000;
const publicRateLimitMaxRequests = 60;
const adminSessionCookieName = "portal_admin_session";
const adminSessionMaxAgeSeconds = 60 * 60 * 24 * 7;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getNowIso(runtime: PortalApiRuntime): string {
  return (runtime.now?.() ?? new Date()).toISOString();
}

function normalizeAdminEmail(value: string): string {
  return value.trim().toLowerCase();
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);

  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

function getConfiguredAdminPassword(runtime: PortalApiRuntime): Response | string {
  if (!runtime.adminPassword) {
    return errorResponse(
      500,
      "auth_not_configured",
      "Admin authentication is not configured.",
    );
  }

  return runtime.adminPassword;
}

function getConfiguredAuthSecret(runtime: PortalApiRuntime): Response | string {
  const authSecret = runtime.authSecret?.trim();

  if (!authSecret) {
    return errorResponse(
      500,
      "auth_not_configured",
      "Admin authentication is not configured.",
    );
  }

  return authSecret;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function encodeJsonBase64Url(value: unknown): string {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeJsonBase64Url<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

async function signSessionValue(value: string, authSecret: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSecret),
    {
      hash: "SHA-256",
      name: "HMAC",
    },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );

  return encodeBase64Url(new Uint8Array(signature));
}

function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("Cookie");

  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");

    if (rawName === name) {
      return decodeURIComponent(rawValueParts.join("="));
    }
  }

  return null;
}

function createSessionCookie(value: string, maxAgeSeconds: number): string {
  return `${adminSessionCookieName}=${encodeURIComponent(
    value,
  )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function createExpiredSessionCookie(): string {
  return createSessionCookie("", 0);
}

function coerceAdminSessionPayload(value: unknown): AdminSessionPayload | null {
  const payload = value as Partial<AdminSessionPayload>;

  if (
    !payload ||
    payload.purpose !== "portal-admin" ||
    typeof payload.email !== "string" ||
    typeof payload.expiresAt !== "number" ||
    typeof payload.issuedAt !== "number" ||
    !Number.isFinite(payload.expiresAt) ||
    !Number.isFinite(payload.issuedAt)
  ) {
    return null;
  }

  return {
    email: payload.email,
    expiresAt: payload.expiresAt,
    issuedAt: payload.issuedAt,
    purpose: "portal-admin",
  };
}

async function createSignedSessionCookie(runtime: PortalApiRuntime): Promise<Response | string> {
  const authSecret = getConfiguredAuthSecret(runtime);

  if (authSecret instanceof Response) {
    return authSecret;
  }

  const now = runtime.now?.() ?? new Date();
  const payload = encodeJsonBase64Url({
    email: runtime.adminEmail,
    expiresAt: now.getTime() + adminSessionMaxAgeSeconds * 1000,
    issuedAt: now.getTime(),
    purpose: "portal-admin",
  } satisfies AdminSessionPayload);
  const signature = await signSessionValue(payload, authSecret);

  return createSessionCookie(`${payload}.${signature}`, adminSessionMaxAgeSeconds);
}

async function getAdminSession(
  request: Request,
  runtime: PortalApiRuntime,
): Promise<AdminSessionPayload | Response | null> {
  const cookie = getCookie(request, adminSessionCookieName);

  if (!cookie) {
    return null;
  }

  const [payloadPart, signaturePart, extraPart] = cookie.split(".");

  if (!payloadPart || !signaturePart || extraPart) {
    return null;
  }

  const authSecret = getConfiguredAuthSecret(runtime);

  if (authSecret instanceof Response) {
    return authSecret;
  }

  const expectedSignature = await signSessionValue(payloadPart, authSecret);

  if (!constantTimeEqual(signaturePart, expectedSignature)) {
    return null;
  }

  try {
    const payload = coerceAdminSessionPayload(decodeJsonBase64Url<unknown>(payloadPart));
    const now = runtime.now?.() ?? new Date();

    if (
      !payload ||
      payload.expiresAt <= now.getTime() ||
      normalizeAdminEmail(payload.email) !== normalizeAdminEmail(runtime.adminEmail)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function adminSessionBody(runtime: PortalApiRuntime, authenticated: boolean) {
  return {
    adminEmail: runtime.adminEmail,
    authenticated,
  };
}

async function handleAuthRequest(
  request: Request,
  runtime: PortalApiRuntime,
  pathParts: string[],
): Promise<Response> {
  if (pathParts.length !== 3) {
    return errorResponse(404, "not_found", "Auth API route not found.");
  }

  if (pathParts[2] === "session") {
    if (request.method !== "GET") {
      return errorResponse(405, "method_not_allowed", "This session route only accepts GET.");
    }

    const session = await getAdminSession(request, runtime);

    if (session instanceof Response) {
      return session;
    }

    return jsonResponse(adminSessionBody(runtime, Boolean(session)));
  }

  if (pathParts[2] === "login") {
    if (request.method !== "POST") {
      return errorResponse(405, "method_not_allowed", "This login route only accepts POST.");
    }

    const configuredPassword = getConfiguredAdminPassword(runtime);

    if (configuredPassword instanceof Response) {
      return configuredPassword;
    }

    const body = await readJsonBody<{ password?: string }>(request);

    if (
      typeof body.password !== "string" ||
      !constantTimeEqual(body.password, configuredPassword)
    ) {
      return errorResponse(401, "invalid_credentials", "The admin password is not correct.");
    }

    const sessionCookie = await createSignedSessionCookie(runtime);

    if (sessionCookie instanceof Response) {
      return sessionCookie;
    }

    return jsonResponse(adminSessionBody(runtime, true), {
      headers: {
        "Set-Cookie": sessionCookie,
      },
    });
  }

  if (pathParts[2] === "logout") {
    if (request.method !== "POST") {
      return errorResponse(405, "method_not_allowed", "This logout route only accepts POST.");
    }

    return jsonResponse(adminSessionBody(runtime, false), {
      headers: {
        "Set-Cookie": createExpiredSessionCookie(),
      },
    });
  }

  return errorResponse(404, "not_found", "Auth API route not found.");
}

async function authorizeAdmin(request: Request, runtime: PortalApiRuntime): Promise<Response | string> {
  const session = await getAdminSession(request, runtime);

  if (session instanceof Response) {
    return session;
  }

  if (!session) {
    return errorResponse(401, "admin_auth_required", "Admin login is required for admin APIs.");
  }

  return runtime.adminEmail;
}

function createToken(): string {
  const bytes = new Uint8Array(18);

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createId(prefix: string): string {
  return `${prefix}_${createToken().slice(0, 18)}`;
}

async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

function coercePortalData(value: unknown): PortalData | null {
  const data = value as Partial<PortalData>;

  if (!data || !Array.isArray(data.projects)) {
    return null;
  }

  const projects = data.projects.filter((project): project is PortalProject => {
    const candidate = project as Partial<PortalProject>;

    return (
      typeof candidate.id === "string" &&
      typeof candidate.name === "string" &&
      typeof candidate.shareSlug === "string" &&
      typeof candidate.createdAt === "string" &&
      typeof candidate.updatedAt === "string" &&
      Array.isArray(candidate.videos)
    );
  });

  return { projects: clone(projects) };
}

function mergePortalData(current: PortalData, imported: PortalData): PortalData {
  const projectsById = new Map(current.projects.map((project) => [project.id, project]));

  for (const project of imported.projects) {
    projectsById.set(project.id, project);
  }

  return {
    projects: Array.from(projectsById.values()).sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    ),
  };
}

function normalizePublicAppUrl(value: string): string {
  try {
    const url = new URL(value);

    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "");

    return url.toString().replace(/\/$/, "");
  } catch {
    return value.replace(/\/+$/, "");
  }
}

async function hashPasscode(passcode: string): Promise<string> {
  const data = new TextEncoder().encode(passcode);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}

function getShareKind(record: PortalShareLinkRecord): ShareLinkKind {
  return record.videoId ? "video" : "share";
}

function getPublicShareUrl(runtime: PortalApiRuntime, record: PortalShareLinkRecord): string {
  const baseUrl = normalizePublicAppUrl(runtime.publicAppUrl);
  const route = getShareKind(record) === "video" ? "video" : "share";

  return `${baseUrl}/${route}/${record.token}`;
}

function getRateLimitKey(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function checkPublicRateLimit(request: Request, runtime: PortalApiRuntime): boolean {
  const now = runtime.now?.().getTime() ?? Date.now();
  const key = getRateLimitKey(request);
  const existing = publicRateLimits.get(key);

  if (!existing || existing.resetAt <= now) {
    publicRateLimits.set(key, {
      count: 1,
      resetAt: now + publicRateLimitWindowMs,
    });
    return true;
  }

  if (existing.count >= publicRateLimitMaxRequests) {
    return false;
  }

  existing.count += 1;
  return true;
}

async function createPublicPayload(
  runtime: PortalApiRuntime,
  record: PortalShareLinkRecord & { ownerEmail: string },
): Promise<PublicPayload | Response> {
  const data = await runtime.db.listProjects(record.ownerEmail);
  const project = data.projects.find((candidate) => candidate.id === record.projectId);

  if (!project) {
    return errorResponse(404, "share_not_found", "This share link no longer points to a project.");
  }

  if (!record.videoId) {
    return {
      kind: "share",
      project,
    };
  }

  const video = project.videos.find((candidate) => candidate.id === record.videoId);

  if (!video) {
    return errorResponse(404, "share_not_found", "This share link no longer points to a video.");
  }

  return {
    kind: "video",
    snapshot: {
      project: {
        clientName: project.clientName,
        id: project.id,
        name: project.name,
        shareSlug: project.shareSlug,
      },
      video,
    },
  };
}

async function resolveShareLink(
  runtime: PortalApiRuntime,
  token: string,
): Promise<(PortalShareLinkRecord & { ownerEmail: string }) | Response> {
  const record = await runtime.db.getShareLink(token);

  if (!record || record.revokedAt) {
    return errorResponse(404, "share_not_found", "This share link is not available.");
  }

  const now = runtime.now?.() ?? new Date();

  if (record.expiresAt && new Date(record.expiresAt).getTime() <= now.getTime()) {
    return errorResponse(410, "share_expired", "This share link has expired.");
  }

  return record;
}

async function handleAdminProjects(
  request: Request,
  runtime: PortalApiRuntime,
  ownerEmail: string,
): Promise<Response> {
  if (request.method === "GET") {
    return jsonResponse(await runtime.db.listProjects(ownerEmail));
  }

  if (request.method === "PUT") {
    const body = await readJsonBody<{ data?: unknown }>(request);
    const data = coercePortalData(body.data);

    if (!data) {
      return errorResponse(400, "invalid_portal_data", "Portal data is missing or invalid.");
    }

    return jsonResponse(await runtime.db.replaceProjects(ownerEmail, data));
  }

  return errorResponse(405, "method_not_allowed", "This admin projects route does not support this method.");
}

async function handleAdminImport(
  request: Request,
  runtime: PortalApiRuntime,
  ownerEmail: string,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "method_not_allowed", "This import route only accepts POST.");
  }

  const body = await readJsonBody<{ data?: unknown }>(request);
  const importedData = coercePortalData(body.data);

  if (!importedData) {
    return errorResponse(400, "invalid_portal_data", "Portal data is missing or invalid.");
  }

  const currentData = await runtime.db.listProjects(ownerEmail);
  const mergedData = mergePortalData(currentData, importedData);

  return jsonResponse(await runtime.db.replaceProjects(ownerEmail, mergedData));
}

async function handleAdminShareLinks(
  request: Request,
  runtime: PortalApiRuntime,
  ownerEmail: string,
  pathParts: string[],
): Promise<Response> {
  if (request.method === "POST" && pathParts.length === 3 && pathParts[2] === "share-links") {
    const body = await readJsonBody<CreateShareLinkBody>(request);
    const projectId = body.projectId?.trim();

    if (!projectId) {
      return errorResponse(400, "project_required", "A project ID is required.");
    }

    const data = await runtime.db.listProjects(ownerEmail);
    const project = data.projects.find((candidate) => candidate.id === projectId);

    if (!project) {
      return errorResponse(404, "project_not_found", "Project not found.");
    }

    const videoId = body.videoId?.trim() || undefined;

    if (videoId && !project.videos.some((video) => video.id === videoId)) {
      return errorResponse(404, "video_not_found", "Video not found.");
    }

    const createdAt = getNowIso(runtime);
    const token = runtime.createToken?.() ?? createToken();
    const passcode = body.passcode?.trim();
    const record = await runtime.db.createShareLink(ownerEmail, {
      createdAt,
      expiresAt: body.expiresAt?.trim() || undefined,
      id: createId("share"),
      passcodeHash: passcode ? await hashPasscode(passcode) : undefined,
      projectId,
      revokedAt: undefined,
      token,
      videoId,
    });

    return jsonResponse({
      kind: getShareKind(record),
      token: record.token,
      url: getPublicShareUrl(runtime, record),
    });
  }

  if (
    request.method === "POST" &&
    pathParts.length === 5 &&
    pathParts[2] === "share-links" &&
    pathParts[4] === "revoke"
  ) {
    const revoked = await runtime.db.revokeShareLink(pathParts[3]!, getNowIso(runtime));

    return revoked
      ? jsonResponse({ revoked: true })
      : errorResponse(404, "share_not_found", "Share link not found.");
  }

  return errorResponse(405, "method_not_allowed", "This share-link route does not support this method.");
}

async function handlePublicShare(
  request: Request,
  runtime: PortalApiRuntime,
  pathParts: string[],
): Promise<Response> {
  if (!checkPublicRateLimit(request, runtime)) {
    return errorResponse(429, "rate_limited", "Too many share requests. Try again shortly.");
  }

  const token = pathParts[3];

  if (!token) {
    return errorResponse(404, "share_not_found", "Share token is missing.");
  }

  const resolved = await resolveShareLink(runtime, token);

  if (resolved instanceof Response) {
    return resolved;
  }

  if (request.method === "GET" && pathParts.length === 4) {
    if (resolved.passcodeHash) {
      return jsonResponse({
        kind: getShareKind(resolved),
        requiresPasscode: true,
      });
    }

    const payload = await createPublicPayload(runtime, resolved);

    return payload instanceof Response ? payload : jsonResponse(payload);
  }

  if (request.method === "POST" && pathParts.length === 5 && pathParts[4] === "passcode") {
    const body = await readJsonBody<{ passcode?: string }>(request);
    const hash = await hashPasscode(body.passcode ?? "");

    if (!resolved.passcodeHash || !constantTimeEqual(hash, resolved.passcodeHash)) {
      return errorResponse(403, "passcode_invalid", "The passcode is not correct.");
    }

    const payload = await createPublicPayload(runtime, resolved);

    return payload instanceof Response ? payload : jsonResponse(payload);
  }

  return errorResponse(405, "method_not_allowed", "This public share route does not support this method.");
}

export async function handlePortalApiRequest(
  request: Request,
  runtime: PortalApiRuntime,
): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (pathParts[0] !== "api") {
    return errorResponse(404, "not_found", "API route not found.");
  }

  if (pathParts[1] === "health" && pathParts.length === 2) {
    if (request.method !== "GET") {
      return errorResponse(405, "method_not_allowed", "This health route only accepts GET.");
    }

    return jsonResponse({
      ok: true,
      service: "portal-api",
    });
  }

  if (pathParts[1] === "auth") {
    return handleAuthRequest(request, runtime, pathParts);
  }

  if (pathParts[1] === "admin") {
    const authorization = await authorizeAdmin(request, runtime);

    if (authorization instanceof Response) {
      return authorization;
    }

    if (pathParts[2] === "projects" && pathParts.length === 3) {
      return handleAdminProjects(request, runtime, authorization);
    }

    if (pathParts[2] === "import" && pathParts.length === 3) {
      return handleAdminImport(request, runtime, authorization);
    }

    if (pathParts[2] === "share-links") {
      return handleAdminShareLinks(request, runtime, authorization, pathParts);
    }

    return errorResponse(404, "not_found", "Admin API route not found.");
  }

  if (pathParts[1] === "public" && pathParts[2] === "share") {
    return handlePublicShare(request, runtime, pathParts);
  }

  return errorResponse(404, "not_found", "API route not found.");
}

export class MemoryPortalCloudDatabase implements PortalCloudDatabase {
  private readonly dataByOwnerEmail = new Map<string, PortalData>();
  private readonly shareLinks = new Map<string, PortalShareLinkRecord & { ownerEmail: string }>();

  async createShareLink(
    ownerEmail: string,
    record: PortalShareLinkRecord,
  ): Promise<PortalShareLinkRecord> {
    const shareLink = {
      ...clone(record),
      ownerEmail,
    };

    this.shareLinks.set(record.token, shareLink);

    return clone(record);
  }

  async getShareLink(
    token: string,
  ): Promise<(PortalShareLinkRecord & { ownerEmail: string }) | null> {
    const record = this.shareLinks.get(token);

    return record ? clone(record) : null;
  }

  getRawShareToken(token: string): (PortalShareLinkRecord & { ownerEmail: string }) | null {
    return this.shareLinks.get(token) ?? null;
  }

  async listProjects(ownerEmail: string): Promise<PortalData> {
    return clone(this.dataByOwnerEmail.get(normalizeAdminEmail(ownerEmail)) ?? { projects: [] });
  }

  async replaceProjects(ownerEmail: string, data: PortalData): Promise<PortalData> {
    const normalizedOwner = normalizeAdminEmail(ownerEmail);
    const clonedData = clone(data);

    this.dataByOwnerEmail.set(normalizedOwner, clonedData);

    return clone(clonedData);
  }

  async revokeShareLink(token: string, revokedAt: string): Promise<boolean> {
    const record = this.shareLinks.get(token);

    if (!record) {
      return false;
    }

    this.shareLinks.set(token, {
      ...record,
      revokedAt,
    });

    return true;
  }

  revokeShareToken(token: string): void {
    const record = this.shareLinks.get(token);

    if (record) {
      this.shareLinks.set(token, {
        ...record,
        revokedAt: new Date().toISOString(),
      });
    }
  }
}

type ProjectRow = {
  client_name: string | null;
  created_at: string;
  description: string | null;
  id: string;
  name: string;
  owner_email: string;
  share_slug: string;
  updated_at: string;
  visibility: string;
};

type VideoRow = {
  created_at: string;
  description: string | null;
  direct_video_url: string | null;
  duration_seconds: number | null;
  gumlet_asset_id: string;
  gumlet_input: string | null;
  id: string;
  order_index: number;
  project_id: string;
  recommended_playback_speed: number;
  start_time_seconds: number | null;
  thumbnail_url: string | null;
  title: string;
  updated_at: string;
};

type ShareLinkRow = {
  created_at: string;
  expires_at: string | null;
  id: string;
  owner_email: string;
  passcode_hash: string | null;
  project_id: string;
  revoked_at: string | null;
  token: string;
  video_id: string | null;
};

function optionalString(value: string | null): string | undefined {
  return value ?? undefined;
}

function optionalNumber(value: number | null): number | undefined {
  return value ?? undefined;
}

function mapVideoRow(row: VideoRow): PortalVideo {
  return {
    assetId: row.gumlet_asset_id || row.gumlet_input || "",
    createdAt: row.created_at,
    description: optionalString(row.description),
    directVideoUrl: optionalString(row.direct_video_url),
    durationSeconds: optionalNumber(row.duration_seconds),
    id: row.id,
    orderIndex: row.order_index,
    recommendedPlaybackSpeed: row.recommended_playback_speed as PlaybackSpeed,
    startTimeSeconds: optionalNumber(row.start_time_seconds),
    thumbnailUrl: optionalString(row.thumbnail_url),
    title: row.title,
    updatedAt: row.updated_at,
  };
}

function mapShareLinkRow(row: ShareLinkRow): PortalShareLinkRecord & { ownerEmail: string } {
  return {
    createdAt: row.created_at,
    expiresAt: optionalString(row.expires_at),
    id: row.id,
    ownerEmail: row.owner_email,
    passcodeHash: optionalString(row.passcode_hash),
    projectId: row.project_id,
    revokedAt: optionalString(row.revoked_at),
    token: row.token,
    videoId: optionalString(row.video_id),
  };
}

export function createD1PortalDatabase(db: D1DatabaseLike): PortalCloudDatabase {
  return new D1PortalCloudDatabase(db);
}

class D1PortalCloudDatabase implements PortalCloudDatabase {
  constructor(private readonly db: D1DatabaseLike) {}

  async createShareLink(
    ownerEmail: string,
    record: PortalShareLinkRecord,
  ): Promise<PortalShareLinkRecord> {
    await this.db
      .prepare(
        `INSERT INTO share_links (
          id, token, project_id, video_id, passcode_hash, expires_at, created_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.token,
        record.projectId,
        record.videoId ?? null,
        record.passcodeHash ?? null,
        record.expiresAt ?? null,
        record.createdAt,
        record.revokedAt ?? null,
      )
      .run();

    return clone(record);
  }

  async getShareLink(
    token: string,
  ): Promise<(PortalShareLinkRecord & { ownerEmail: string }) | null> {
    const row = await this.db
      .prepare(
        `SELECT share_links.*, projects.owner_email
          FROM share_links
          INNER JOIN projects ON projects.id = share_links.project_id
          WHERE share_links.token = ?`,
      )
      .bind(token)
      .first<ShareLinkRow>();

    return row ? mapShareLinkRow(row) : null;
  }

  async listProjects(ownerEmail: string): Promise<PortalData> {
    const projectsResult = await this.db
      .prepare(
        `SELECT id, owner_email, name, client_name, description, visibility, created_at, updated_at
          , share_slug
          FROM projects
          WHERE owner_email = ?
          ORDER BY updated_at DESC`,
      )
      .bind(ownerEmail)
      .all<ProjectRow>();
    const projects = projectsResult.results ?? [];

    const dataProjects = await Promise.all(
      projects.map(async (project) => {
        const videosResult = await this.db
          .prepare(
            `SELECT id, project_id, title, gumlet_asset_id, gumlet_input, direct_video_url,
              description, thumbnail_url, duration_seconds, start_time_seconds,
              recommended_playback_speed, order_index, created_at, updated_at
            FROM videos
            WHERE project_id = ?
            ORDER BY order_index ASC`,
          )
          .bind(project.id)
          .all<VideoRow>();

        return {
          clientName: optionalString(project.client_name),
          createdAt: project.created_at,
          description: optionalString(project.description),
          id: project.id,
          name: project.name,
          shareSlug: project.share_slug,
          updatedAt: project.updated_at,
          videos: (videosResult.results ?? []).map(mapVideoRow),
          visibility: project.visibility as PortalProject["visibility"],
        } satisfies PortalProject;
      }),
    );

    return { projects: dataProjects };
  }

  async replaceProjects(ownerEmail: string, data: PortalData): Promise<PortalData> {
    const projectIds = data.projects.map((project) => project.id);

    if (projectIds.length === 0) {
      await this.db.prepare("DELETE FROM projects WHERE owner_email = ?").bind(ownerEmail).run();
      return { projects: [] };
    }

    const placeholders = projectIds.map(() => "?").join(", ");

    await this.db
      .prepare(`DELETE FROM projects WHERE owner_email = ? AND id NOT IN (${placeholders})`)
      .bind(ownerEmail, ...projectIds)
      .run();

    for (const project of data.projects) {
      await this.db
        .prepare(
          `INSERT INTO projects (
            id, owner_email, name, client_name, description, visibility, share_slug, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            owner_email = excluded.owner_email,
            name = excluded.name,
            client_name = excluded.client_name,
            description = excluded.description,
            visibility = excluded.visibility,
            share_slug = excluded.share_slug,
            updated_at = excluded.updated_at`,
        )
        .bind(
          project.id,
          ownerEmail,
          project.name,
          project.clientName ?? null,
          project.description ?? null,
          project.visibility,
          project.shareSlug,
          project.createdAt,
          project.updatedAt,
        )
        .run();

      const videoIds = project.videos.map((video) => video.id);

      if (videoIds.length === 0) {
        await this.db.prepare("DELETE FROM videos WHERE project_id = ?").bind(project.id).run();
      } else {
        const videoPlaceholders = videoIds.map(() => "?").join(", ");

        await this.db
          .prepare(`DELETE FROM videos WHERE project_id = ? AND id NOT IN (${videoPlaceholders})`)
          .bind(project.id, ...videoIds)
          .run();
      }

      for (const video of project.videos) {
        await this.db
          .prepare(
            `INSERT INTO videos (
              id, project_id, title, gumlet_asset_id, gumlet_input, direct_video_url,
              description, thumbnail_url, duration_seconds, start_time_seconds,
              recommended_playback_speed, order_index, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              project_id = excluded.project_id,
              title = excluded.title,
              gumlet_asset_id = excluded.gumlet_asset_id,
              gumlet_input = excluded.gumlet_input,
              direct_video_url = excluded.direct_video_url,
              description = excluded.description,
              thumbnail_url = excluded.thumbnail_url,
              duration_seconds = excluded.duration_seconds,
              start_time_seconds = excluded.start_time_seconds,
              recommended_playback_speed = excluded.recommended_playback_speed,
              order_index = excluded.order_index,
              updated_at = excluded.updated_at`,
          )
          .bind(
            video.id,
            project.id,
            video.title,
            video.assetId,
            video.assetId,
            video.directVideoUrl ?? null,
            video.description ?? null,
            video.thumbnailUrl ?? null,
            video.durationSeconds ?? null,
            video.startTimeSeconds ?? null,
            video.recommendedPlaybackSpeed,
            video.orderIndex,
            video.createdAt,
            video.updatedAt,
          )
          .run();
      }
    }

    return clone(data);
  }

  async revokeShareLink(token: string, revokedAt: string): Promise<boolean> {
    await this.db
      .prepare("UPDATE share_links SET revoked_at = ? WHERE token = ?")
      .bind(revokedAt, token)
      .run();

    return true;
  }
}
