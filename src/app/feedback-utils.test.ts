import { describe, expect, it } from "vitest";

import {
  buildDirectFeedbackUrl,
  calculateVideoPositionPercent,
  mapFeedbackCommentRow,
  parseDirectCommentId,
  validatePublicFeedbackInput,
} from "./feedback-utils";

describe("feedback utilities", () => {
  it("calculates and clamps video click positions as percentages", () => {
    const bounds = { height: 400, left: 100, top: 50, width: 800 };

    expect(calculateVideoPositionPercent({ clientX: 300, clientY: 350 }, bounds)).toEqual({
      x: 25,
      y: 75,
    });
    expect(calculateVideoPositionPercent({ clientX: -20, clientY: 700 }, bounds)).toEqual({
      x: 0,
      y: 100,
    });
  });

  it("parses direct comment search and builds clean encoded links", () => {
    expect(parseDirectCommentId({ comment: "comment_123" })).toBe("comment_123");
    expect(parseDirectCommentId({ comment: ["comment_123"] })).toBeUndefined();
    expect(parseDirectCommentId({ comment: "   " })).toBeUndefined();
    expect(
      buildDirectFeedbackUrl(
        "https://pixel-point-loom-clone.pages.dev/",
        "token with spaces",
        "comment/123",
      ),
    ).toBe(
      "https://pixel-point-loom-clone.pages.dev/video/token%20with%20spaces?comment=comment%2F123",
    );
  });

  it("validates the public feedback field and range contract", () => {
    expect(
      validatePublicFeedbackInput({
        authorEmail: "guest@example.com",
        authorName: "Mira",
        body: "Tighten this transition.",
        positionX: 32.5,
        positionY: 75,
        timestampSeconds: 42.25,
        videoId: "video_1",
      }),
    ).toEqual({
      input: {
        authorEmail: "guest@example.com",
        authorName: "Mira",
        body: "Tighten this transition.",
        positionX: 32.5,
        positionY: 75,
        timestampSeconds: 42.25,
        videoId: "video_1",
      },
      issues: [],
    });

    const invalid = validatePublicFeedbackInput({
      authorEmail: "not-an-email",
      authorName: " ",
      body: "x".repeat(1001),
      positionX: -1,
      positionY: 101,
      timestampSeconds: -5,
      videoId: "",
    });

    expect(invalid.input).toBeNull();
    expect(invalid.issues.map((issue) => issue.field)).toEqual([
      "videoId",
      "authorName",
      "authorEmail",
      "body",
      "timestampSeconds",
      "positionX",
      "positionY",
    ]);
  });

  it("maps nullable D1 feedback rows without leaking snake_case", () => {
    expect(
      mapFeedbackCommentRow({
        admin_read_at: null,
        author_email: "guest@example.com",
        author_name: "Mira",
        author_role: "guest",
        body: "Please update this heading.",
        created_at: "2026-07-17T10:00:00.000Z",
        deleted_at: null,
        edit_token_hash: "storage-only-hash",
        id: "comment_1",
        parent_id: null,
        position_x: 20.5,
        position_y: 80,
        project_id: "project_1",
        share_token: "token_1",
        status: "open",
        timestamp_seconds: 31.25,
        updated_at: "2026-07-17T10:00:00.000Z",
        video_id: "video_1",
      }),
    ).toEqual({
      adminReadAt: undefined,
      authorEmail: "guest@example.com",
      authorName: "Mira",
      authorRole: "guest",
      body: "Please update this heading.",
      createdAt: "2026-07-17T10:00:00.000Z",
      deletedAt: undefined,
      id: "comment_1",
      parentId: undefined,
      positionX: 20.5,
      positionY: 80,
      projectId: "project_1",
      shareToken: "token_1",
      status: "open",
      timestampSeconds: 31.25,
      updatedAt: "2026-07-17T10:00:00.000Z",
      videoId: "video_1",
    });
  });
});
