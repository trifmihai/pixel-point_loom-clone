import { describe, expect, it } from "vitest";

import type { PublicFeedbackComment } from "./feedback-types";
import {
  buildFeedbackTimelineClusters,
  buildVideoReviewHref,
  parseVideoReviewTimestamp,
  shouldHandleFeedbackShortcut,
} from "./feedback-timeline";

function comment(
  id: string,
  timestampSeconds: number,
  parentId?: string,
): PublicFeedbackComment {
  return {
    authorName: "Mira",
    authorRole: "guest",
    body: `Comment ${id}`,
    createdAt: `2026-08-30T10:00:0${id.length}.000Z`,
    id,
    parentId,
    status: "open",
    timestampSeconds,
    updatedAt: "2026-08-30T10:00:00.000Z",
    videoId: "video_1",
  };
}

describe("feedback timeline", () => {
  it("clusters top-level comments that render within 24 pixels and counts replies", () => {
    const clusters = buildFeedbackTimelineClusters(
      [
        comment("first", 10),
        comment("nearby", 11),
        comment("reply", 10.5, "first"),
        comment("later", 40),
      ],
      100,
      1000,
    );

    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toMatchObject({
      items: [
        { comment: { id: "first" }, replyCount: 1 },
        { comment: { id: "nearby" }, replyCount: 0 },
      ],
      positionPercent: 10.5,
    });
    expect(clusters[1]).toMatchObject({
      items: [{ comment: { id: "later" }, replyCount: 0 }],
      positionPercent: 40,
    });
  });

  it("omits the rail until duration and width are usable", () => {
    expect(buildFeedbackTimelineClusters([comment("first", 10)], 0, 1000)).toEqual([]);
    expect(buildFeedbackTimelineClusters([comment("first", 10)], 100, 0)).toEqual([]);
  });

  it("handles only an unmodified non-repeating C outside editable content", () => {
    expect(shouldHandleFeedbackShortcut({ editable: false, key: "c" })).toBe(true);
    expect(shouldHandleFeedbackShortcut({ editable: false, key: "C" })).toBe(true);
    expect(shouldHandleFeedbackShortcut({ editable: true, key: "c" })).toBe(false);
    expect(shouldHandleFeedbackShortcut({ editable: false, key: "c", repeat: true })).toBe(false);
    expect(shouldHandleFeedbackShortcut({ ctrlKey: true, editable: false, key: "c" })).toBe(false);
    expect(shouldHandleFeedbackShortcut({ editable: false, key: "x" })).toBe(false);
  });

  it("preserves fallback data while adding timestamp and selected comment context", () => {
    expect(buildVideoReviewHref("/video/token?data=encoded", 42.6)).toBe(
      "/video/token?data=encoded&t=43",
    );
    expect(buildVideoReviewHref("/video/token?data=encoded", 42.6, "comment/1")).toBe(
      "/video/token?data=encoded&t=43&comment=comment%2F1",
    );
  });

  it("accepts only finite non-negative timestamp deep links", () => {
    expect(parseVideoReviewTimestamp("42.5")).toBe(42.5);
    expect(parseVideoReviewTimestamp(0)).toBe(0);
    expect(parseVideoReviewTimestamp("-1")).toBeUndefined();
    expect(parseVideoReviewTimestamp("later")).toBeUndefined();
    expect(parseVideoReviewTimestamp(undefined)).toBeUndefined();
  });
});
