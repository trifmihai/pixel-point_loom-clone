import { describe, expect, it } from "vitest";

import type { PortalProject } from "./portal-types";
import {
  buildGumletEmbedUrl,
  calculatePlaybackSavings,
  createVideoShareUrl,
  createShareSlug,
  decodeShareVideoSnapshot,
  decodeShareProject,
  encodeShareProject,
  estimateTimeSavedSeconds,
  estimateWatchTimeSeconds,
  formatDuration,
  formatSavedTime,
  parseGumletInput,
} from "./portal-utils";

const projectFixture: PortalProject = {
  clientName: "Acme",
  createdAt: "2026-07-08T00:00:00.000Z",
  description: "Homepage review",
  id: "project_1",
  name: "Website walkthrough",
  shareSlug: "website-walkthrough-abc123",
  updatedAt: "2026-07-08T00:00:00.000Z",
  videos: [
    {
      assetId: "64fabc123",
      createdAt: "2026-07-08T00:00:00.000Z",
      description: "Design pass",
      durationSeconds: 720,
      id: "video_1",
      orderIndex: 0,
      recommendedPlaybackSpeed: 1.5,
      startTimeSeconds: 42,
      thumbnailUrl: "https://example.com/thumb.jpg",
      title: "Hero review",
      updatedAt: "2026-07-08T00:00:00.000Z",
    },
  ],
  visibility: "unlisted",
};

describe("portal utilities", () => {
  it("formats durations for labels and estimates", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(59)).toBe("0:59");
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(720)).toBe("12:00");
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("estimates watch time and time saved from recommended speed", () => {
    expect(estimateWatchTimeSeconds(720, 1.5)).toBe(480);
    expect(estimateTimeSavedSeconds(720, 1.5)).toBe(240);
    expect(estimateWatchTimeSeconds(undefined, 1.5)).toBeUndefined();
    expect(estimateTimeSavedSeconds(720, 0)).toBe(0);
    expect(calculatePlaybackSavings(103, 1.5)).toEqual({
      fasterSeconds: 69,
      originalSeconds: 103,
      savedSeconds: 34,
    });
    expect(formatSavedTime(34)).toBe("34s");
    expect(formatSavedTime(240)).toBe("4:00");
  });

  it("builds Gumlet iframe URLs with optional start time", () => {
    expect(buildGumletEmbedUrl(" asset/with space ", 0)).toBe(
      "https://play.gumlet.io/embed/asset%2Fwith%20space?background=false&autoplay=false&loop=false&disable_player_controls=false",
    );
    expect(buildGumletEmbedUrl("64fabc123", 42)).toBe(
      "https://play.gumlet.io/embed/64fabc123?background=false&autoplay=false&loop=false&disable_player_controls=false&t=42",
    );
  });

  it("creates stable-looking unlisted share slugs", () => {
    const slug = createShareSlug("Website Walkthrough", "project_abc123");

    expect(slug).toMatch(/^website-walkthrough-[a-z0-9]+$/);
  });

  it("round-trips a project through an encoded share snapshot", () => {
    const encoded = encodeShareProject(projectFixture);
    const decoded = decodeShareProject(encoded);

    expect(encoded).not.toContain("{");
    expect(decoded).toEqual(projectFixture);
  });

  it("rejects invalid share snapshots without throwing", () => {
    expect(decodeShareProject("not-json")).toBeNull();
    expect(decodeShareProject("")).toBeNull();
  });

  it("parses Gumlet IDs, watch links, embed snippets, and MP4 URLs", () => {
    expect(parseGumletInput("6707bf60f0a80d006151c369")).toEqual({
      assetId: "6707bf60f0a80d006151c369",
      directVideoUrl: undefined,
    });
    expect(parseGumletInput("https://gumlet.tv/watch/6707bf60f0a80d006151c369")).toEqual({
      assetId: "6707bf60f0a80d006151c369",
      directVideoUrl: undefined,
    });
    expect(
      parseGumletInput(
        '<iframe src="https://play.gumlet.io/embed/6707bf60f0a80d006151c369?autoplay=false"></iframe>',
      ),
    ).toEqual({
      assetId: "6707bf60f0a80d006151c369",
      directVideoUrl: undefined,
    });
    expect(
      parseGumletInput(
        "https://video.gumlet.io/655d712a774b17ed87ac87e2/6707bf60f0a80d006151c369/main.mp4",
      ),
    ).toEqual({
      assetId: "6707bf60f0a80d006151c369",
      directVideoUrl:
        "https://video.gumlet.io/655d712a774b17ed87ac87e2/6707bf60f0a80d006151c369/main.mp4",
    });
  });

  it("creates and decodes single-video share URLs", () => {
    const url = createVideoShareUrl(projectFixture, projectFixture.videos[0]!, "https://app.test");
    const parsed = new URL(url);
    const decoded = decodeShareVideoSnapshot(parsed.searchParams.get("data") ?? "");

    expect(parsed.pathname).toMatch(/^\/video\/hero-review-/);
    expect(decoded).toEqual({
      project: {
        clientName: "Acme",
        id: "project_1",
        name: "Website walkthrough",
        shareSlug: "website-walkthrough-abc123",
      },
      video: projectFixture.videos[0],
    });
  });
});
