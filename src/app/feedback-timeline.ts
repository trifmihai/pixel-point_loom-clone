import type { PublicFeedbackComment } from "./feedback-types";

export type FeedbackTimelineItem = {
  comment: PublicFeedbackComment;
  replyCount: number;
};

export type FeedbackTimelineCluster = {
  items: FeedbackTimelineItem[];
  positionPercent: number;
};

export type FeedbackShortcutInput = {
  altKey?: boolean;
  ctrlKey?: boolean;
  editable: boolean;
  key: string;
  metaKey?: boolean;
  repeat?: boolean;
};

const feedbackMarkerClusterDistancePx = 24;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function buildFeedbackTimelineClusters(
  comments: PublicFeedbackComment[],
  durationSeconds: number,
  railWidth: number,
): FeedbackTimelineCluster[] {
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    !Number.isFinite(railWidth) ||
    railWidth <= 0
  ) {
    return [];
  }

  const replyCounts = new Map<string, number>();

  for (const comment of comments) {
    if (comment.parentId) {
      replyCounts.set(comment.parentId, (replyCounts.get(comment.parentId) ?? 0) + 1);
    }
  }

  const items = comments
    .filter(
      (comment) =>
        !comment.parentId &&
        Number.isFinite(comment.timestampSeconds) &&
        comment.timestampSeconds >= 0,
    )
    .sort(
      (left, right) =>
        left.timestampSeconds - right.timestampSeconds ||
        left.createdAt.localeCompare(right.createdAt),
    )
    .map((comment) => ({
      comment,
      replyCount: replyCounts.get(comment.id) ?? 0,
    }));

  const clusters: Array<FeedbackTimelineCluster & { lastPixel: number }> = [];

  for (const item of items) {
    const positionPercent = clamp(
      (item.comment.timestampSeconds / durationSeconds) * 100,
      0,
      100,
    );
    const pixel = (positionPercent / 100) * railWidth;
    const previous = clusters.at(-1);

    if (previous && pixel - previous.lastPixel < feedbackMarkerClusterDistancePx) {
      previous.items.push(item);
      previous.lastPixel = pixel;
      previous.positionPercent =
        previous.items.reduce(
          (total, candidate) =>
            total +
            clamp((candidate.comment.timestampSeconds / durationSeconds) * 100, 0, 100),
          0,
        ) / previous.items.length;
      continue;
    }

    clusters.push({ items: [item], lastPixel: pixel, positionPercent });
  }

  return clusters.map(({ items: clusterItems, positionPercent }) => ({
    items: clusterItems,
    positionPercent,
  }));
}

export function shouldHandleFeedbackShortcut(input: FeedbackShortcutInput): boolean {
  return (
    input.key.toLowerCase() === "c" &&
    !input.editable &&
    !input.repeat &&
    !input.ctrlKey &&
    !input.altKey &&
    !input.metaKey
  );
}

export function parseVideoReviewTimestamp(value: unknown): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
export function buildVideoReviewHref(
  baseHref: string,
  timestampSeconds: number,
  commentId?: string,
): string {
  const absolute = /^[a-z][a-z\d+.-]*:/i.test(baseHref);
  const url = new URL(baseHref, "https://pixel-point.local");

  url.searchParams.set("t", String(Math.max(0, Math.round(timestampSeconds))));
  if (commentId) {
    url.searchParams.set("comment", commentId);
  } else {
    url.searchParams.delete("comment");
  }

  return absolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}
