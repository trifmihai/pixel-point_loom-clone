export const appProductReadiness = {
  mode: "product",
  productName: "Gumlet Client Video Portal",
  productSummary:
    "A local-first portal for organizing existing Gumlet videos into client review links.",
  requestedBehavior:
    "Create projects, add Gumlet asset IDs or links, copy project and video share links, enforce selected playback speed on video pages, and collect timestamped feedback.",
} as const;

export const appAcceptance = [
  "admin creates projects",
  "admin adds Gumlet videos by asset ID",
  "admin copies encoded client share links",
  "admin copies encoded single-video share links",
  "share page embeds Gumlet videos",
  "video page starts a single video at the selected speed",
  "share page records timestamped feedback",
] as const;
