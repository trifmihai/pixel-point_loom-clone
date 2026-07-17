import { expect, test } from "@playwright/test";

import { portalStorageKey } from "../src/app/portal-store";

const adminProjectFixture = {
  clientName: "Raluca Stoinea",
  createdAt: "2026-07-08T00:00:00.000Z",
  description: "Website review and implementation notes.",
  id: "project_admin_responsive",
  name: "TSA Law",
  shareSlug: "tsa-law-existing",
  updatedAt: "2026-07-17T13:10:00.000Z",
  videos: [],
  visibility: "unlisted",
};

test("browser: admin uses the Pixel Point workspace and intentional mobile project navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/admin");
  await page.evaluate(
    ({ key, project }) =>
      window.localStorage.setItem(key, JSON.stringify({ projects: [project] })),
    { key: portalStorageKey, project: adminProjectFixture },
  );
  await page.reload();

  await expect(page.locator("span:visible", { hasText: "Pixel Point" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Open projects" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share project" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Project settings" })).toBeVisible();
  await expect(page.locator("aside").filter({ hasText: "Projects" })).toBeHidden();

  await page.getByRole("button", { name: "Open projects" }).click();
  await expect(page.getByRole("dialog", { name: "Projects" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.setViewportSize({ width: 360, height: 800 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(360);

  await page.getByRole("button", { name: "Share project" }).click();
  await expect(page.getByRole("dialog", { name: "Share TSA Law" })).toBeVisible();
  await expect(page.getByLabel("Share URL")).toHaveValue(/\/share\/tsa-law-existing/);
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Project settings" }).click();
  await expect(page.getByRole("dialog", { name: "Project settings" })).toBeVisible();
  await page.getByRole("button", { name: "Delete project" }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Delete TSA Law?" }),
  ).toBeVisible();
  await expect(page.getByText(/active client links.*stop working/i)).toBeVisible();
});

test("browser: admin creates a project, adds a Gumlet video, and exposes a share link", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Project name").fill("Website walkthrough");
  await page.getByLabel("Client name").fill("Acme");
  await page.getByLabel("Project description").fill("Design review videos");
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page.getByRole("heading", { name: "Website walkthrough" })).toBeVisible();
  await expect(page.getByText("0 videos").first()).toBeVisible();
  await expect(
    page.getByText(
      "This is a local-only link. Deploy to Cloudflare Pages and set the public app URL before sending to clients.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Anyone with a token link can view the shared client page. Keep sensitive context out of titles and descriptions unless Gumlet access is restricted.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add Gumlet video" }).first().click();
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

  await page.getByRole("button", { name: "Share project" }).click();
  await expect(page.getByRole("dialog", { name: "Share Website walkthrough" })).toBeVisible();
  await expect(page.getByLabel("Share URL")).toHaveValue(
    /^http:\/\/localhost:\d+\/share\/website-walkthrough-/,
  );
  await expect(page.getByText("Client link ready")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Share video" }).click();
  await expect(page.getByRole("dialog", { name: "Share Hero review" })).toBeVisible();
  await expect(page.getByLabel("Share URL")).toHaveValue(
    /^http:\/\/localhost:\d+\/video\/hero-review-/,
  );
  await expect(page.getByText("Video link ready")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Video actions for Hero review" }).click();
  await page.getByRole("menuitem", { name: "Edit video" }).click();
  await expect(page.getByRole("dialog", { name: "Edit video" })).toBeVisible();
  await page.getByLabel("Edit video title").fill("Hero walkthrough");
  await page.getByLabel("Edit default speed").click();
  await page.getByRole("option", { name: "2x" }).click();
  await page.getByRole("button", { name: "Save video" }).click();

  await expect(page.getByRole("heading", { name: "Hero walkthrough" })).toBeVisible();
  await expect(page.getByText("Suggested 2x").first()).toBeVisible();

  await page.getByRole("button", { name: "Video actions for Hero walkthrough" }).click();
  await page.getByRole("menuitem", { name: "Edit video" }).click();
  await page.getByLabel("Edit Gumlet URL or asset ID").fill("https://gumlet.tv/watch/gumlet-asset-456");
  await page.getByRole("button", { name: "Save video" }).click();

  await expect(page.getByText("Detect duration").first()).toBeVisible();
  await expect(page.getByText("12:00 source")).toBeHidden();

  await page.getByRole("button", { name: "Video actions for Hero walkthrough" }).click();
  await page.getByRole("menuitem", { name: "Refresh duration" }).click();
  await expect(page.getByText("Duration refresh requested for Hero walkthrough")).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          context: "player.js",
          event: "getDuration",
          value: 184,
          version: "3.0",
        }),
        origin: "https://play.gumlet.io",
      }),
    );
  });
  await expect(page.getByText("3:04 source").first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const rawData = window.localStorage.getItem(key);

        return rawData ? JSON.parse(rawData).projects[0].videos[0].durationSeconds : null;
      }, portalStorageKey),
    )
    .toBe(184);

  await page.getByRole("button", { name: "Add Gumlet video" }).first().click();
  await page.getByLabel("Gumlet URL or asset ID").fill("gumlet-asset-789");
  await page.getByLabel("Video title").fill("Footer review");
  await page.getByLabel("Recommended speed").click();
  await page.getByRole("option", { name: "1.5x" }).click();
  await page.getByRole("button", { name: "Add video" }).click();
  await expect(page.getByRole("heading", { name: "Footer review" })).toBeVisible();

  await page.getByRole("button", { name: /^Hero walkthrough/ }).click();
  await page.getByRole("button", { name: "Video actions for Hero walkthrough" }).click();
  await page.getByRole("menuitem", { name: "Delete video" }).click();
  await expect(page.getByRole("alertdialog", { name: "Delete this video from the project?" })).toBeVisible();
  await page.getByRole("button", { name: "Delete video" }).click();

  await expect(page.getByText("1 videos").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hero walkthrough" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Footer review" })).toBeVisible();

  await page.getByRole("button", { name: "Video actions for Footer review" }).click();
  await page.getByRole("menuitem", { name: "Delete video" }).click();
  await page.getByRole("button", { name: "Delete video" }).click();
  await expect(page.getByText("0 videos").first()).toBeVisible();
  await expect(page.getByText("Add a Gumlet video to preview it here.")).toBeVisible();
});
