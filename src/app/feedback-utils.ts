import type {
  CreatePublicFeedbackInput,
  FeedbackComment,
  FeedbackCommentRow,
  FeedbackValidationIssue,
  PublicFeedbackComment,
} from "./feedback-types";

type PointerCoordinates = {
  clientX: number;
  clientY: number;
};

type VideoBounds = {
  height: number;
  left: number;
  top: number;
  width: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function optionalString(value: string | null): string | undefined {
  return value ?? undefined;
}

function optionalNumber(value: number | null): number | undefined {
  return value ?? undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isLightweightEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function calculateVideoPositionPercent(
  pointer: PointerCoordinates,
  bounds: VideoBounds,
): { x: number; y: number } {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: clamp(((pointer.clientX - bounds.left) / bounds.width) * 100, 0, 100),
    y: clamp(((pointer.clientY - bounds.top) / bounds.height) * 100, 0, 100),
  };
}

export function parseDirectCommentId(search: Record<string, unknown>): string | undefined {
  const value = search.comment;

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function buildDirectFeedbackUrl(
  publicAppUrl: string,
  shareToken: string,
  commentId: string,
): string {
  const url = new URL(
    `/video/${encodeURIComponent(shareToken)}`,
    publicAppUrl.endsWith("/") ? publicAppUrl : `${publicAppUrl}/`,
  );

  url.searchParams.set("comment", commentId);
  return url.toString();
}

export function validatePublicFeedbackInput(value: unknown): {
  input: CreatePublicFeedbackInput | null;
  issues: FeedbackValidationIssue[];
} {
  const candidate = (value ?? {}) as Partial<CreatePublicFeedbackInput>;
  const videoId = typeof candidate.videoId === "string" ? candidate.videoId.trim() : "";
  const authorName =
    typeof candidate.authorName === "string" ? candidate.authorName.trim() : "";
  const authorEmail =
    typeof candidate.authorEmail === "string" ? candidate.authorEmail.trim() : "";
  const body = typeof candidate.body === "string" ? candidate.body.trim() : "";
  const issues: FeedbackValidationIssue[] = [];

  if (!videoId) {
    issues.push({ field: "videoId", message: "A video is required." });
  }
  if (!authorName || authorName.length > 80) {
    issues.push({ field: "authorName", message: "Name must be between 1 and 80 characters." });
  }
  if (authorEmail && (authorEmail.length > 254 || !isLightweightEmail(authorEmail))) {
    issues.push({ field: "authorEmail", message: "Enter a valid email address." });
  }
  if (!body || body.length > 1000) {
    issues.push({ field: "body", message: "Comment must be between 1 and 1000 characters." });
  }
  if (!isFiniteNumber(candidate.timestampSeconds) || candidate.timestampSeconds < 0) {
    issues.push({ field: "timestampSeconds", message: "Timestamp must be zero or greater." });
  }
  if (
    !isFiniteNumber(candidate.positionX) ||
    candidate.positionX < 0 ||
    candidate.positionX > 100
  ) {
    issues.push({ field: "positionX", message: "Horizontal position must be from 0 to 100." });
  }
  if (
    !isFiniteNumber(candidate.positionY) ||
    candidate.positionY < 0 ||
    candidate.positionY > 100
  ) {
    issues.push({ field: "positionY", message: "Vertical position must be from 0 to 100." });
  }

  if (issues.length > 0) {
    return { input: null, issues };
  }

  return {
    input: {
      ...(authorEmail ? { authorEmail } : {}),
      authorName,
      body,
      positionX: candidate.positionX!,
      positionY: candidate.positionY!,
      timestampSeconds: candidate.timestampSeconds!,
      videoId,
    },
    issues: [],
  };
}

export function mapFeedbackCommentRow(row: FeedbackCommentRow): FeedbackComment {
  return {
    adminReadAt: optionalString(row.admin_read_at),
    authorEmail: optionalString(row.author_email),
    authorName: row.author_name,
    authorRole: row.author_role,
    body: row.body,
    createdAt: row.created_at,
    deletedAt: optionalString(row.deleted_at),
    id: row.id,
    parentId: optionalString(row.parent_id),
    positionX: optionalNumber(row.position_x),
    positionY: optionalNumber(row.position_y),
    projectId: row.project_id,
    shareToken: row.share_token,
    status: row.status,
    timestampSeconds: row.timestamp_seconds,
    updatedAt: row.updated_at,
    videoId: row.video_id,
  };
}

export function toPublicFeedbackComment(comment: FeedbackComment): PublicFeedbackComment {
  return {
    authorName: comment.authorName,
    authorRole: comment.authorRole,
    body: comment.body,
    createdAt: comment.createdAt,
    id: comment.id,
    parentId: comment.parentId,
    positionX: comment.positionX,
    positionY: comment.positionY,
    status: comment.status,
    timestampSeconds: comment.timestampSeconds,
    updatedAt: comment.updatedAt,
    videoId: comment.videoId,
  };
}
