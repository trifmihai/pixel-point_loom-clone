import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { appAcceptance, appProductReadiness } from "./app-acceptance";

describe("portal acceptance metadata", () => {
  it("marks the generated starter as the Pixel Point portal product", () => {
    expect(appProductReadiness).toMatchObject({
      mode: "product",
      productName: "Pixel Point Video Portal",
    });
    expect(appProductReadiness.requestedBehavior).toContain("Gumlet asset IDs");
    expect(appProductReadiness.requestedBehavior).toContain("stable project and video share links");
    expect(appProductReadiness.requestedBehavior).toContain("D1-persisted timestamped visual feedback");
    expect(appAcceptance).toEqual(
      expect.arrayContaining([
        "admin creates projects",
        "admin adds Gumlet videos by asset ID",
        "share page embeds Gumlet videos",
        "share page records timestamped notes locally",
        "cloud video review places timestamped positioned feedback persisted through the public API",
        "direct comment links open Review mode and focus the matching timestamp",
        "admin sees unread feedback badges and can reply resolve reopen copy and soft-delete",
        "public token and encoded fallback routes survive refresh",
      ]),
    );
  });

  it("keeps the implementation scoped to embeds instead of Gumlet upload APIs", () => {
    const implementationSource = [
      readFileSync("src/app/admin-portal.tsx", "utf8"),
      readFileSync("src/app/share-portal.tsx", "utf8"),
      readFileSync("src/app/gumlet-player.tsx", "utf8"),
      readFileSync("src/app/portal-store.ts", "utf8"),
      readFileSync("src/app/portal-utils.ts", "utf8"),
    ].join("\n");

    expect(implementationSource).toContain("https://play.gumlet.io/embed");
    expect(implementationSource).not.toMatch(/api\.gumlet|GUMLET_API|uploadVideo|createAsset/i);
  });

  it("documents the no-backend sharing limitation in the design spec", () => {
    const designSpec = readFileSync(
      "docs/superpowers/specs/2026-07-08-gumlet-video-portal-design.md",
      "utf8",
    );

    expect(designSpec).toContain("browser localStorage");
    expect(designSpec).toContain("encoded share-link snapshots");
    expect(designSpec).toContain("not synced back to the admin");
  });
});
