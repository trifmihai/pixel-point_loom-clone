const feedbackOwnershipStoragePrefix = "pixel-point.feedback.comment-owner.v1.";

type StoredFeedbackOwnership = {
  editToken: string;
  shareToken: string;
};

function getOwnershipKey(commentId: string): string {
  return `${feedbackOwnershipStoragePrefix}${encodeURIComponent(commentId)}`;
}

export function getFeedbackEditToken(
  storage: Pick<Storage, "getItem">,
  shareToken: string,
  commentId: string,
): string | null {
  try {
    const parsed = JSON.parse(
      storage.getItem(getOwnershipKey(commentId)) ?? "null",
    ) as Partial<StoredFeedbackOwnership> | null;

    return parsed &&
      parsed.shareToken === shareToken &&
      typeof parsed.editToken === "string" &&
      parsed.editToken
      ? parsed.editToken
      : null;
  } catch {
    return null;
  }
}

export function saveFeedbackEditToken(
  storage: Pick<Storage, "setItem">,
  shareToken: string,
  commentId: string,
  editToken: string,
): void {
  try {
    storage.setItem(
      getOwnershipKey(commentId),
      JSON.stringify({ editToken, shareToken } satisfies StoredFeedbackOwnership),
    );
  } catch {
    // A blocked or full localStorage should not prevent the comment itself from saving.
  }
}

export function removeFeedbackEditToken(
  storage: Pick<Storage, "removeItem">,
  commentId: string,
): void {
  try {
    storage.removeItem(getOwnershipKey(commentId));
  } catch {
    // Deletion remains successful even when browser storage is unavailable.
  }
}
