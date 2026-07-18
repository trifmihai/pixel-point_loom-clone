import { describe, expect, it } from "vitest";

import { appSchema, starterControlSectionInventory } from "./app-schema";

describe("legacy Toolcraft schema", () => {
  it("keeps the generated Toolcraft runtime schema available but out of the portal flow", () => {
    expect(appSchema.canvas.enabled).toBe(true);
    expect(appSchema.panels.controls?.sections[0]?.title).toBe("Setup");
    expect(appSchema.toolbar.history).toBe(true);
    expect(starterControlSectionInventory).toEqual([]);
  });
});
