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
  await page.addInitScript(() => {
    const playCalls: Array<{ muted: boolean; playbackRate: number; volume: number }> = [];

    Object.defineProperty(window, "__portalPlayCalls", {
      configurable: true,
      value: playCalls,
    });

    Object.defineProperty(HTMLMediaElement.prototype, "duration", {
      configurable: true,
      get() {
        return Number(this.dataset.mockDurationSeconds ?? "0");
      },
    });

    HTMLMediaElement.prototype.play = function mockPlay() {
      playCalls.push({
        muted: this.muted,
        playbackRate: this.playbackRate,
        volume: this.volume,
      });

      return Promise.resolve();
    };
  });

  const videoWithoutManualDuration = {
    ...shareProjectFixture.videos[0]!,
    durationSeconds: undefined,
  };
  const shareUrl = createVideoShareUrl(
    shareProjectFixture,
    videoWithoutManualDuration,
    "http://127.0.0.1:3002",
  );
  const path = new URL(shareUrl).pathname + new URL(shareUrl).search;

  await page.goto(path);

  await expect(page.getByRole("heading", { name: "Homepage walkthrough" })).toBeVisible();
  await page.locator("video").evaluate((element) => {
    const video = element as HTMLVideoElement;

    video.dataset.mockDurationSeconds = "720";
    video.dispatchEvent(new Event("loadedmetadata"));
  });

  await expect(page.getByText("Save about 4:00")).toBeVisible();
  await expect(page.getByText("Watch in about 8:00")).toBeVisible();
  await expect(page.locator("del", { hasText: "12:00" })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Start 1\.5x review.*12:00.*8:00.*saves 4:00/,
    }),
  ).toBeVisible();
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "https://video.gumlet.io/workspace/asset-share-1/main.mp4",
  );

  await page
    .getByRole("button", {
      name: /Start 1\.5x review.*12:00.*8:00.*saves 4:00/,
    })
    .click();
  await expect(page.getByText("Save about 4:00")).toBeHidden();
  await expect
    .poll(() =>
      page.locator("video").evaluate((element) => (element as HTMLVideoElement).playbackRate),
    )
    .toBe(1.5);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const calls = (
          window as typeof window & {
            __portalPlayCalls?: Array<{ muted: boolean; playbackRate: number; volume: number }>;
          }
        ).__portalPlayCalls;

        return calls?.at(-1);
      }),
    )
    .toEqual({
      muted: false,
      playbackRate: 1.5,
      volume: 1,
    });
});

test("browser: Gumlet video page uses player metadata and sends review playback commands", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const commands: unknown[] = [];
    const fakeContentWindow = {
      postMessage(command: unknown) {
        commands.push(command);
      },
    };

    Object.defineProperty(window, "__gumletCommands", {
      configurable: true,
      value: commands,
    });
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      configurable: true,
      get() {
        return fakeContentWindow;
      },
    });
  });

  const gumletOnlyVideo = {
    ...shareProjectFixture.videos[1]!,
    durationSeconds: undefined,
    recommendedPlaybackSpeed: 1.5 as const,
  };
  const shareUrl = createVideoShareUrl(
    shareProjectFixture,
    gumletOnlyVideo,
    "http://127.0.0.1:3002",
  );
  const path = new URL(shareUrl).pathname + new URL(shareUrl).search;

  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Checkout notes" })).toBeVisible();
  await expect(page.getByText("Loading duration")).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { event: "durationchange", duration: 103 },
        origin: "https://play.gumlet.io",
      }),
    );
  });

  await expect(page.locator("del", { hasText: "1:43" })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Start 1\.5x review.*1:43.*1:09.*saves 34s/,
    }),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: /Start 1\.5x review.*1:43.*1:09.*saves 34s/,
    })
    .click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const commands = (
          window as typeof window & {
            __gumletCommands?: Array<{ args?: unknown[]; func?: string; method?: string; type?: string }>;
          }
        ).__gumletCommands ?? [];

        return {
          play: commands.some(
            (command) => command.func === "play" || command.method === "play" || command.type === "play",
          ),
          speed: commands.some(
            (command) =>
              (command.func === "setPlaybackRate" ||
                command.method === "setPlaybackRate" ||
                command.type === "setPlaybackRate") &&
              JSON.stringify(command).includes("1.5"),
          ),
          unmute: commands.some(
            (command) =>
              command.func === "unMute" ||
              command.method === "unMute" ||
              command.type === "unmute" ||
              JSON.stringify(command).includes('"muted":false'),
          ),
        };
      }),
    )
    .toEqual({ play: true, speed: true, unmute: true });
});
