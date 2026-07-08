import { expect, test } from "@playwright/test";

test("browser perf: portal shell renders without custom renderer workload", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Client video reviews" })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
});
