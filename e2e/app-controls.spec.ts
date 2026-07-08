import { expect, test } from "@playwright/test";

test("browser: admin creates a project, adds a Gumlet video, and exposes a share link", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByLabel("Project name").fill("Website walkthrough");
  await page.getByLabel("Client name").fill("Acme");
  await page.getByLabel("Project description").fill("Design review videos");
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page.getByRole("heading", { name: "Website walkthrough" })).toBeVisible();
  await expect(page.getByText("0 videos")).toBeVisible();

  await page
    .getByLabel("Gumlet URL or asset ID")
    .fill("https://video.gumlet.io/workspace/gumlet-asset-123/main.mp4");
  await page.getByLabel("Video title").fill("Hero review");
  await page.getByLabel("Video description").fill("Review the homepage hero changes.");
  await page.getByLabel("Duration in seconds").fill("720");
  await page.getByLabel("Start time in seconds").fill("30");
  await page.getByLabel("Recommended speed").click();
  await page.getByRole("option", { name: "1.5x" }).click();
  await page.getByRole("button", { name: "Add video" }).click();

  await expect(page.getByRole("heading", { name: "Hero review" })).toBeVisible();
  await expect(page.getByText("12:00 video - Suggested 1.5x").first()).toBeVisible();
  await expect(page.locator('iframe[title="Hero review Gumlet video"]')).toHaveAttribute(
    "src",
    /https:\/\/play\.gumlet\.io\/embed\/gumlet-asset-123\?background=false&autoplay=false&loop=false&disable_player_controls=false&t=30/,
  );

  await page.getByRole("button", { name: "Copy client link" }).click();
  await expect(page.getByLabel("Share URL")).toHaveValue(/\/share\/website-walkthrough-/);
  await expect(page.getByText("Share link ready")).toBeVisible();

  await page.getByRole("button", { name: "Copy video link" }).click();
  await expect(page.getByLabel("Share URL")).toHaveValue(/\/video\/hero-review-/);
  await expect(page.getByText("Video link ready")).toBeVisible();
});
