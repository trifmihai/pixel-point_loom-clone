export const appProductReadiness = {
  mode: "product",
  productName: "Gumlet Client Video Portal",
  productSummary:
    "A local-first portal for organizing existing Gumlet videos into client review links.",
  requestedBehavior:
    "Create projects, manually add Gumlet asset IDs, suggest playback speed, copy client share links, and collect timestamped feedback.",
} as const;

export const appAcceptance = [
  "admin creates projects",
  "admin adds Gumlet videos by asset ID",
  "admin copies encoded client share links",
  "share page embeds Gumlet videos",
  "share page records timestamped feedback",
] as const;
