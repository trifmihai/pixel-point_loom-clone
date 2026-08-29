export const appProductReadiness = {
  mode: "product",
  productName: "Pixel Point Video Portal",
  productSummary:
    "A focused video-sharing workspace for organizing Gumlet videos into stable client review links.",
  requestedBehavior:
    "Create and manage projects, add Gumlet asset IDs or links, reuse stable project and video share links, provide compact scrollbar-free Notion dark-mode embeds that start at the recommended speed and open cloud feedback in Watch mode, let viewers toggle Watch and Review with C, collect D1-persisted timestamped visual feedback, let the creating browser edit or soft-delete its guest comments without exposing ownership secrets, and notify the admin in-app after the first external playback of each cloud-shared video without changing public URL contracts.",
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
  "cloud video Watch and Review modes toggle with C and visibly distinguish Review mode",
  "same-browser guest comments can be edited or soft-deleted without exposing ownership secrets",
  "direct comment links open Review mode and focus the matching timestamp",
  "admin sees unread feedback badges and can reply resolve reopen copy and soft-delete",
  "public token and encoded fallback routes survive refresh",
  "passcode-protected links hide review details until unlocked",
  "first confirmed external playback creates one in-app activity event per video",
  "admin activity shows unread first views and opens the viewed video",
  "legacy encoded links keep playback without first-view tracking",
  "admin copies a stable Notion embed link for a shared video",
  "Notion embed exposes native playback at the recommended speed without review navigation or feedback chrome",
  "cloud Notion embed opens Leave comments in a Watch-mode page and shows exact saved time",
  "legacy Notion embed omits the cloud comment action",
  "Notion embed chrome matches a compact Notion dark-mode content block",
  "Notion embed hides its internal scrollbar without disabling overflow scrolling",
  "only the dedicated embed route permits third-party framing",
] as const;
