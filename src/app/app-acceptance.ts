export const appProductReadiness = {
  mode: "product",
  productName: "Pixel Point Video Portal",
  productSummary:
    "A focused video-sharing workspace for organizing Gumlet videos into stable client review links.",
  requestedBehavior:
    "Create and manage projects, add Gumlet asset IDs or links, reuse stable project and video share links, provide compact Notion dark-mode embeds that start at the recommended speed, let viewers choose playback speed in the full review, collect D1-persisted timestamped visual feedback, and notify the admin in-app after the first external playback of each cloud-shared video without changing public URL contracts.",
} as const;

export const appAcceptance = [
  "admin creates projects",
  "admin adds Gumlet videos by asset ID",
  "admin reuses stable project share links",
  "admin reuses stable single-video share links",
  "admin manages projects responsively",
  "share page embeds Gumlet videos",
  "video page starts a single video at the viewer-selected speed",
  "project collection keeps video navigation before playback on mobile",
  "share page records timestamped notes locally",
  "cloud video review places timestamped positioned feedback persisted through the public API",
  "direct comment links open Review mode and focus the matching timestamp",
  "admin sees unread feedback badges and can reply resolve reopen copy and soft-delete",
  "public token and encoded fallback routes survive refresh",
  "passcode-protected links hide review details until unlocked",
  "first confirmed external playback creates one in-app activity event per video",
  "admin activity shows unread first views and opens the viewed video",
  "legacy encoded links keep playback without first-view tracking",
  "admin copies a stable Notion embed link for a shared video",
  "Notion embed exposes native playback at the recommended speed without review navigation or feedback chrome",
  "Notion embed chrome matches a compact Notion dark-mode content block",
  "only the dedicated embed route permits third-party framing",
] as const;
