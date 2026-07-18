import type { FeedbackComment, FeedbackStatus } from "./feedback-types";
import { toPublicFeedbackComment, validatePublicFeedbackInput } from "./feedback-utils";
import type {
  PortalApiRuntime,
  PortalShareLinkRecord,
} from "./portal-cloud-api";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);

  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");

  return new Response(JSON.stringify(body), { ...init, headers });
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, { status });
}

async function readJsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

function getNowIso(runtime: PortalApiRuntime): string {
  return (runtime.now?.() ?? new Date()).toISOString();
}

function createFeedbackId(): string {
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);

  return `feedback_${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

async function hashPasscode(passcode: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(passcode),
  );

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

async function authorizeFeedbackVideo(
  request: Request,
  runtime: PortalApiRuntime,
  record: PortalShareLinkRecord & { ownerEmail: string },
  requestedVideoId: string | undefined,
): Promise<{ projectId: string; videoId: string } | Response> {
  if (record.passcodeHash) {
    const suppliedPasscode = request.headers.get("X-Share-Passcode") ?? "";
    const suppliedHash = await hashPasscode(suppliedPasscode);

    if (!constantTimeEqual(suppliedHash, record.passcodeHash)) {
      return errorResponse(403, "passcode_required", "Enter the share passcode to access feedback.");
    }
  }

  const videoId = requestedVideoId?.trim() || record.videoId;

  if (!videoId) {
    return errorResponse(400, "video_required", "A video ID is required for project feedback.");
  }

  if (record.videoId && record.videoId !== videoId) {
    return errorResponse(404, "video_not_found", "This share token does not include that video.");
  }

  const data = await runtime.db.listProjects(record.ownerEmail);
  const project = data.projects.find((candidate) => candidate.id === record.projectId);

  if (!project || !project.videos.some((video) => video.id === videoId)) {
    return errorResponse(404, "video_not_found", "This share token does not include that video.");
  }

  return { projectId: project.id, videoId };
}

function feedbackDatabaseError(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);

  if (/feedback_comments|no such table/i.test(message)) {
    return errorResponse(
      503,
      "feedback_migration_required",
      "Feedback storage is not ready. Apply the latest D1 migrations and try again.",
    );
  }

  return errorResponse(500, "feedback_failed", "The feedback request could not be completed.");
}

export async function handlePublicFeedbackApi(
  request: Request,
  runtime: PortalApiRuntime,
  record: PortalShareLinkRecord & { ownerEmail: string },
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const authorized = await authorizeFeedbackVideo(
      request,
      runtime,
      record,
      url.searchParams.get("videoId") ?? undefined,
    );

    if (authorized instanceof Response) {
      return authorized;
    }

    try {
      const comments = await runtime.db.listFeedbackForShareToken(
        record.token,
        authorized.videoId,
      );

      return jsonResponse({ comments: comments.map(toPublicFeedbackComment) });
    } catch (error) {
      return feedbackDatabaseError(error);
    }
  }

  if (request.method === "POST") {
    const validation = validatePublicFeedbackInput(await readJsonBody<unknown>(request));

    if (!validation.input) {
      return jsonResponse(
        {
          error: {
            code: "feedback_invalid",
            issues: validation.issues,
            message: "Check the feedback fields and try again.",
          },
        },
        { status: 400 },
      );
    }

    const authorized = await authorizeFeedbackVideo(
      request,
      runtime,
      record,
      validation.input.videoId,
    );

    if (authorized instanceof Response) {
      return authorized;
    }

    const now = getNowIso(runtime);
    const comment: FeedbackComment = {
      authorEmail: validation.input.authorEmail,
      authorName: validation.input.authorName,
      authorRole: "guest",
      body: validation.input.body,
      createdAt: now,
      id: createFeedbackId(),
      positionX: validation.input.positionX,
      positionY: validation.input.positionY,
      projectId: authorized.projectId,
      shareToken: record.token,
      status: "open",
      timestampSeconds: validation.input.timestampSeconds,
      updatedAt: now,
      videoId: authorized.videoId,
    };

    try {
      return jsonResponse(
        toPublicFeedbackComment(await runtime.db.createFeedbackComment(comment)),
        { status: 201 },
      );
    } catch (error) {
      return feedbackDatabaseError(error);
    }
  }

  return errorResponse(405, "method_not_allowed", "This feedback route accepts GET and POST.");
}

export async function handleAdminFeedbackApi(
  request: Request,
  runtime: PortalApiRuntime,
  ownerEmail: string,
  pathParts: string[],
): Promise<Response> {
  try {
    if (request.method === "GET" && pathParts.length === 3) {
      return jsonResponse({ videos: await runtime.db.getFeedbackCountsByVideo(ownerEmail) });
    }

    if (
      request.method === "GET" &&
      pathParts.length === 5 &&
      pathParts[2] === "videos" &&
      pathParts[4] === "feedback"
    ) {
      return jsonResponse({
        comments: await runtime.db.listFeedbackForVideo(ownerEmail, pathParts[3]!),
      });
    }

    if (
      request.method === "POST" &&
      pathParts.length === 6 &&
      pathParts[2] === "videos" &&
      pathParts[4] === "feedback" &&
      pathParts[5] === "read"
    ) {
      await runtime.db.markVideoFeedbackRead(ownerEmail, pathParts[3]!, getNowIso(runtime));
      return jsonResponse({ read: true });
    }

    const commentId = pathParts[3];

    if (
      request.method === "POST" &&
      pathParts.length === 5 &&
      pathParts[2] === "feedback" &&
      pathParts[4] === "replies" &&
      commentId
    ) {
      const body = await readJsonBody<{ body?: string }>(request);
      const replyBody = body.body?.trim() ?? "";

      if (!replyBody || replyBody.length > 1000) {
        return errorResponse(400, "reply_invalid", "Reply must be between 1 and 1000 characters.");
      }

      const parent = await runtime.db.getFeedbackComment(ownerEmail, commentId);

      if (!parent || parent.deletedAt || parent.parentId) {
        return errorResponse(404, "feedback_not_found", "Feedback comment not found.");
      }

      const now = getNowIso(runtime);
      const reply = await runtime.db.createFeedbackComment({
        authorEmail: ownerEmail,
        authorName: "Pixel Point",
        authorRole: "admin",
        body: replyBody,
        createdAt: now,
        id: createFeedbackId(),
        parentId: parent.id,
        projectId: parent.projectId,
        shareToken: parent.shareToken,
        status: parent.status,
        timestampSeconds: parent.timestampSeconds,
        updatedAt: now,
        videoId: parent.videoId,
      });

      return jsonResponse(reply, { status: 201 });
    }

    if (
      request.method === "PATCH" &&
      pathParts.length === 4 &&
      pathParts[2] === "feedback" &&
      commentId
    ) {
      const body = await readJsonBody<{
        deleted?: boolean;
        markRead?: boolean;
        status?: FeedbackStatus;
      }>(request);

      if (body.status !== undefined && body.status !== "open" && body.status !== "resolved") {
        return errorResponse(400, "status_invalid", "Status must be open or resolved.");
      }

      if (body.status === undefined && body.markRead !== true && body.deleted !== true) {
        return errorResponse(400, "feedback_patch_empty", "No supported feedback change was supplied.");
      }

      const now = getNowIso(runtime);
      const updated = await runtime.db.updateFeedbackComment(ownerEmail, commentId, {
        ...(body.status ? { status: body.status } : {}),
        ...(body.markRead ? { adminReadAt: now } : {}),
        ...(body.deleted ? { deletedAt: now } : {}),
        updatedAt: now,
      });

      return updated
        ? jsonResponse(updated)
        : errorResponse(404, "feedback_not_found", "Feedback comment not found.");
    }
  } catch (error) {
    return feedbackDatabaseError(error);
  }

  return errorResponse(404, "not_found", "Admin feedback API route not found.");
}
