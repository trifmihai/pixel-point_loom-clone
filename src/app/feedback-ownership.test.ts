import { describe, expect, it } from "vitest";

import {
  getFeedbackEditToken,
  removeFeedbackEditToken,
  saveFeedbackEditToken,
} from "./feedback-ownership";

function createStorage(): Storage {
  const values = new Map<string, string>();

  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("feedback ownership storage", () => {
  it("keeps an edit token scoped to its share and comment across reloads", () => {
    const storage = createStorage();

    saveFeedbackEditToken(storage, "share-a", "comment-1", "edit-secret");

    expect(getFeedbackEditToken(storage, "share-a", "comment-1")).toBe("edit-secret");
    expect(getFeedbackEditToken(storage, "share-b", "comment-1")).toBeNull();
    expect(getFeedbackEditToken(storage, "share-a", "comment-2")).toBeNull();
  });

  it("removes ownership after deletion and ignores malformed stored data", () => {
    const storage = createStorage();

    saveFeedbackEditToken(storage, "share-a", "comment-1", "edit-secret");
    removeFeedbackEditToken(storage, "comment-1");
    storage.setItem(
      "pixel-point.feedback.comment-owner.v1.comment-2",
      JSON.stringify({ editToken: 42, shareToken: "share-a" }),
    );

    expect(getFeedbackEditToken(storage, "share-a", "comment-1")).toBeNull();
    expect(getFeedbackEditToken(storage, "share-a", "comment-2")).toBeNull();
  });
});
