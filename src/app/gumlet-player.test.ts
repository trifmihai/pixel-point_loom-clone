import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve(process.cwd(), "src/app/gumlet-player.tsx"), "utf8");

describe("Gumlet player presentation contract", () => {
  it("keeps a bounded accessible loading and delayed fallback state", () => {
    expect(source).toContain('type GumletPlayerState = "delayed" | "loading" | "ready"');
    expect(source).toContain("gumletPlayerLoadingTimeoutMs");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("Loading video…");
    expect(source).toContain("Video is taking longer than expected");
  });

  it("reports player readiness without changing the embed URL contract", () => {
    expect(source).toContain("onReady?: () => void");
    expect(source).toContain("setPlayerReady");
    expect(source).toContain("buildGumletEmbedUrl(video.assetId, startTime");
    expect(source).not.toMatch(/onLoad=\{\(\) => \{\s*setPlayerReady/);
    expect(source).not.toContain("allowFullScreen");
  });
});
