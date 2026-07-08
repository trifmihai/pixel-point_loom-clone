import { describe, expect, it } from "vitest";

import { appPerformance } from "./app-performance";

describe("portal performance policy", () => {
  it("keeps browser performance policy configured without custom renderer workload", () => {
    expect(appPerformance.browserCheckPolicy).toEqual({
      fallbackRunner: "playwright",
      fallbackWhen: ["agent-browser-unavailable", "ci"],
      preferredRunner: "agent-browser",
    });
    expect(appPerformance.usesCustomRenderer).toBe(false);
    expect(appPerformance.rendererStrategy).toBe("none");
    expect(appPerformance.scenarios).toEqual([]);
  });
});
