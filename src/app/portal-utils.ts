import type { PortalProject, PortalVideo, VideoShareSnapshot } from "./portal-types";

const gumletEmbedBaseUrl = "https://play.gumlet.io/embed";

export const playbackSpeedOptions = [1, 1.25, 1.5, 1.75, 2] as const;

function clampSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.round(value);
}

export function formatDuration(durationSeconds: number | undefined): string {
  const totalSeconds = clampSeconds(durationSeconds ?? 0);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const paddedSeconds = seconds.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}

export function estimateWatchTimeSeconds(
  durationSeconds: number | undefined,
  playbackSpeed: number,
): number | undefined {
  if (!durationSeconds || durationSeconds <= 0) {
    return undefined;
  }

  if (!Number.isFinite(playbackSpeed) || playbackSpeed <= 0) {
    return durationSeconds;
  }

  return Math.round(durationSeconds / playbackSpeed);
}

export function estimateTimeSavedSeconds(
  durationSeconds: number | undefined,
  playbackSpeed: number,
): number {
  const watchTime = estimateWatchTimeSeconds(durationSeconds, playbackSpeed);

  if (!durationSeconds || watchTime === undefined || playbackSpeed <= 0) {
    return 0;
  }

  return Math.max(0, Math.round(durationSeconds - watchTime));
}

type GumletEmbedOptions = {
  autoplay?: boolean;
};

export type ParsedGumletInput = {
  assetId: string;
  directVideoUrl?: string;
};

export function buildGumletEmbedUrl(
  assetId: string,
  startTimeSeconds?: number,
  options: GumletEmbedOptions = {},
): string {
  const encodedAssetId = encodeURIComponent(assetId.trim());
  const url = new URL(`${gumletEmbedBaseUrl}/${encodedAssetId}`);
  const startTime = clampSeconds(startTimeSeconds ?? 0);

  url.searchParams.set("background", "false");
  url.searchParams.set("autoplay", options.autoplay ? "true" : "false");
  url.searchParams.set("loop", "false");
  url.searchParams.set("disable_player_controls", "false");

  if (startTime > 0) {
    url.searchParams.set("t", String(startTime));
  }

  return url.toString();
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function createShareSlug(projectName: string, seed: string): string {
  const base = slugify(projectName) || "project";
  const suffix = slugify(seed).replace(/-/g, "").slice(-8) || Math.random().toString(36).slice(2, 8);

  return `${base}-${suffix}`;
}

function toBase64Url(value: string): string {
  return btoa(unescape(encodeURIComponent(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  return decodeURIComponent(escape(atob(padded)));
}

export function encodeShareProject(project: PortalProject): string {
  return toBase64Url(JSON.stringify(project));
}

export function createShareUrl(project: PortalProject, origin: string): string {
  const url = new URL(`/share/${project.shareSlug}`, origin);

  url.searchParams.set("data", encodeShareProject(project));

  return url.toString();
}

function getVideoShareProject(project: PortalProject): VideoShareSnapshot["project"] {
  return {
    clientName: project.clientName,
    id: project.id,
    name: project.name,
    shareSlug: project.shareSlug,
  };
}

function createVideoShareSlug(video: PortalVideo, seed: string): string {
  const base = slugify(video.title) || "video";
  const suffix = slugify(seed).replace(/-/g, "").slice(-8) || Math.random().toString(36).slice(2, 8);

  return `${base}-${suffix}`;
}

export function encodeShareVideoSnapshot(snapshot: VideoShareSnapshot): string {
  return toBase64Url(JSON.stringify(snapshot));
}

export function createVideoShareUrl(
  project: PortalProject,
  video: PortalVideo,
  origin: string,
): string {
  const url = new URL(`/video/${createVideoShareSlug(video, video.id)}`, origin);

  url.searchParams.set(
    "data",
    encodeShareVideoSnapshot({
      project: getVideoShareProject(project),
      video,
    }),
  );

  return url.toString();
}

export function decodeShareProject(value: string): PortalProject | null {
  if (!value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(value)) as Partial<PortalProject>;

    if (
      typeof parsed.id !== "string" ||
      typeof parsed.name !== "string" ||
      typeof parsed.shareSlug !== "string" ||
      !Array.isArray(parsed.videos)
    ) {
      return null;
    }

    return parsed as PortalProject;
  } catch {
    return null;
  }
}

export function decodeShareVideoSnapshot(value: string): VideoShareSnapshot | null {
  if (!value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(value)) as Partial<VideoShareSnapshot>;

    if (
      !parsed.project ||
      !parsed.video ||
      typeof parsed.project.id !== "string" ||
      typeof parsed.project.name !== "string" ||
      typeof parsed.project.shareSlug !== "string" ||
      typeof parsed.video.id !== "string" ||
      typeof parsed.video.assetId !== "string" ||
      typeof parsed.video.title !== "string"
    ) {
      return null;
    }

    return parsed as VideoShareSnapshot;
  } catch {
    return null;
  }
}

function extractFirstUrl(value: string): string | null {
  return value.match(/https?:\/\/[^\s"'<>]+/)?.[0] ?? null;
}

function getAssetIdFromUrl(url: URL): string | null {
  const pathParts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);

  if (url.hostname === "gumlet.tv" && pathParts[0] === "watch" && pathParts[1]) {
    return pathParts[1];
  }

  if (url.hostname === "play.gumlet.io" && pathParts[0] === "embed" && pathParts[1]) {
    return pathParts[1];
  }

  if (url.hostname === "video.gumlet.io" && pathParts.length >= 3) {
    return pathParts[1] ?? null;
  }

  return null;
}

export function parseGumletInput(value: string): ParsedGumletInput {
  const trimmed = value.trim();
  const urlCandidate = extractFirstUrl(trimmed);

  if (urlCandidate) {
    try {
      const url = new URL(urlCandidate);
      const assetId = getAssetIdFromUrl(url) ?? trimmed;
      const directVideoUrl =
        url.hostname === "video.gumlet.io" && url.pathname.endsWith(".mp4")
          ? url.toString()
          : undefined;

      return {
        assetId,
        directVideoUrl,
      };
    } catch {
      return {
        assetId: trimmed,
      };
    }
  }

  return {
    assetId: trimmed,
  };
}
