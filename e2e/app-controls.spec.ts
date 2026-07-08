import { expect, test } from "@playwright/test";

import { portalStorageKey } from "../src/app/portal-store";

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
  await expect(
    page.getByText(
      "This is a local-only link. Deploy to Cloudflare Pages and set the public app URL before sending to clients.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Anyone with this link can view the shared video page. Do not include sensitive information in titles, descriptions, or URL data unless Gumlet access is restricted.",
    ),
  ).toBeVisible();

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
  await expect(page.getByLabel("Share URL")).toHaveValue(
    /^http:\/\/localhost:\d+\/share\/website-walkthrough-/,
  );
  await expect(page.getByText("Local-only share link ready")).toBeVisible();

  await page.getByRole("button", { name: "Copy video link" }).click();
  await expect(page.getByLabel("Share URL")).toHaveValue(
    /^http:\/\/localhost:\d+\/video\/hero-review-/,
  );
  await expect(page.getByText("Local-only video link ready")).toBeVisible();

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

  await expect(page.getByText("Duration will be detected from Gumlet when available.")).toBeVisible();
  await expect(page.getByText("12:00 source length")).toBeHidden();

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
  await expect(page.getByText("3:04 source length")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const rawData = window.localStorage.getItem(key);

        return rawData ? JSON.parse(rawData).projects[0].videos[0].durationSeconds : null;
      }, portalStorageKey),
    )
    .toBe(184);

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

  await expect(page.getByText("1 videos")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hero walkthrough" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Footer review" })).toBeVisible();

  await page.getByRole("button", { name: "Video actions for Footer review" }).click();
  await page.getByRole("menuitem", { name: "Delete video" }).click();
  await page.getByRole("button", { name: "Delete video" }).click();
  await expect(page.getByText("0 videos")).toBeVisible();
  await expect(page.getByText("Add a Gumlet video to preview it here.")).toBeVisible();
});
