import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { appAcceptance, appProductReadiness } from "./app-acceptance";

describe("portal acceptance metadata", () => {
  it("marks the generated starter as a real Gumlet portal product", () => {
    expect(appProductReadiness).toMatchObject({
      mode: "product",
      productName: "Gumlet Client Video Portal",
    });
    expect(appProductReadiness.requestedBehavior).toContain("Gumlet asset IDs");
    expect(appAcceptance).toEqual(
      expect.arrayContaining([
        "admin creates projects",
        "admin adds Gumlet videos by asset ID",
        "share page embeds Gumlet videos",
        "share page records timestamped feedback",
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
