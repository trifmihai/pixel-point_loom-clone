import { expect, test } from "@playwright/test";

import type { PortalProject } from "../src/app/portal-types";
import { createVideoShareUrl, encodeShareProject } from "../src/app/portal-utils";

const shareProjectFixture: PortalProject = {
  clientName: "Acme",
  createdAt: "2026-07-08T00:00:00.000Z",
  description: "Review these changes before the next design pass.",
  id: "project_share",
  name: "Client review",
  shareSlug: "client-review-share",
  updatedAt: "2026-07-08T00:00:00.000Z",
  videos: [
    {
      assetId: "asset-share-1",
      createdAt: "2026-07-08T00:00:00.000Z",
      description: "Homepage polish notes.",
      directVideoUrl: "https://video.gumlet.io/workspace/asset-share-1/main.mp4",
      durationSeconds: 720,
      id: "video_share_1",
      orderIndex: 0,
      recommendedPlaybackSpeed: 1.5,
      startTimeSeconds: 15,
      title: "Homepage walkthrough",
      updatedAt: "2026-07-08T00:00:00.000Z",
    },
    {
      assetId: "asset-share-2",
      createdAt: "2026-07-08T00:00:00.000Z",
      durationSeconds: 300,
      id: "video_share_2",
      orderIndex: 1,
      recommendedPlaybackSpeed: 2,
      title: "Checkout notes",
      updatedAt: "2026-07-08T00:00:00.000Z",
    },
  ],
  visibility: "unlisted",
};

test("browser: share page opens an encoded project and records timestamped feedback", async ({
  page,
}) => {
  const encoded = encodeShareProject(shareProjectFixture);

  await page.goto(`/share/${shareProjectFixture.shareSlug}?data=${encoded}`);

  await expect(page.getByRole("heading", { name: "Client review" })).toBeVisible();
  await expect(
    page.getByText("12:00 video - Suggested 1.5x - Watch in about 8:00").first(),
  ).toBeVisible();
  await expect(page.locator('iframe[title="Homepage walkthrough Gumlet video"]')).toHaveAttribute(
    "src",
    /https:\/\/play\.gumlet\.io\/embed\/asset-share-1\?background=false&autoplay=false&loop=false&disable_player_controls=false&t=15/,
  );

  await page.getByLabel("Your name").fill("Mira");
  await page.getByLabel("Timestamp").fill("75");
  await page.getByLabel("Feedback").fill("Please tighten this transition.");
  await page.getByRole("button", { name: "Add comment at current time" }).click();

  await expect(page.getByText("Mira")).toBeVisible();
  await expect(page.getByText("Please tighten this transition.")).toBeVisible();
  await page.getByRole("button", { name: "1:15" }).click();
  await expect(page.locator('iframe[title="Homepage walkthrough Gumlet video"]')).toHaveAttribute(
    "src",
    /t=75/,
  );

  await page.getByRole("button", { name: "Checkout notes" }).click();
  await expect(page.locator('iframe[title="Checkout notes Gumlet video"]')).toHaveAttribute(
    "src",
    /https:\/\/play\.gumlet\.io\/embed\/asset-share-2\?background=false&autoplay=false&loop=false&disable_player_controls=false/,
  );
});

test("browser: video page starts one shared video at selected speed from the overlay", async ({
  page,
}) => {
  const shareUrl = createVideoShareUrl(
    shareProjectFixture,
    shareProjectFixture.videos[0]!,
    "http://127.0.0.1:3002",
  );
  const path = new URL(shareUrl).pathname + new URL(shareUrl).search;

  await page.goto(path);

  await expect(page.getByRole("heading", { name: "Homepage walkthrough" })).toBeVisible();
  await expect(page.getByText("Save about 4:00")).toBeVisible();
  await expect(page.getByText("Watch in about 8:00")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start 1.5x review" })).toBeVisible();
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "https://video.gumlet.io/workspace/asset-share-1/main.mp4",
  );

  await page.getByRole("button", { name: "Start 1.5x review" }).click();
  await expect(page.getByText("Save about 4:00")).toBeHidden();
  await expect
    .poll(() =>
      page.locator("video").evaluate((element) => (element as HTMLVideoElement).playbackRate),
    )
    .toBe(1.5);
});
