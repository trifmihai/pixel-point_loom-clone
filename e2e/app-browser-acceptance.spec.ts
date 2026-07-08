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

test("browser: root redirects to the protected admin route", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Client video reviews" })).toBeVisible();
});

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

test("browser: encoded share and video routes survive refresh without localStorage", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());

  const encodedProject = encodeShareProject(shareProjectFixture);
  await page.goto(`/share/${shareProjectFixture.shareSlug}?data=${encodedProject}`);
  await expect(page.getByRole("heading", { name: "Client review" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Client review" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Homepage walkthrough" })).toBeVisible();

  const videoWithoutStoredData = {
    ...shareProjectFixture.videos[1]!,
    recommendedPlaybackSpeed: 1.5 as const,
  };
  const videoShareUrl = createVideoShareUrl(
    shareProjectFixture,
    videoWithoutStoredData,
    "http://127.0.0.1:3002",
  );
  const videoPath = new URL(videoShareUrl).pathname + new URL(videoShareUrl).search;

  await page.evaluate(() => window.localStorage.clear());
  await page.goto(videoPath);
  await expect(page.getByRole("heading", { name: "Checkout notes" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Checkout notes" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start 1\.5x review/ })).toBeVisible();
});

test("browser: public token share and video routes load without localStorage", async ({ page }) => {
  await page.route("**/api/public/share/share_token", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        kind: "share",
        project: shareProjectFixture,
      }),
      contentType: "application/json",
    });
  });
  await page.route("**/api/public/share/video_token", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        kind: "video",
        snapshot: {
          project: {
            clientName: shareProjectFixture.clientName,
            id: shareProjectFixture.id,
            name: shareProjectFixture.name,
            shareSlug: shareProjectFixture.shareSlug,
          },
          video: shareProjectFixture.videos[0],
        },
      }),
      contentType: "application/json",
    });
  });

  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());

  await page.goto("/share/share_token");
  await expect(page.getByRole("heading", { name: "Client review" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Homepage walkthrough" })).toBeVisible();

  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/video/video_token");
  await expect(page.getByRole("heading", { name: "Homepage walkthrough" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start 1\.5x review/ })).toBeVisible();
});

test("browser: passcode-protected video token blocks details until unlock", async ({ page }) => {
  await page.route("**/api/public/share/protected_video/passcode", async (route) => {
    const requestBody = route.request().postDataJSON() as { passcode: string };

    expect(requestBody.passcode).toBe("client-pass");
    await route.fulfill({
      body: JSON.stringify({
        kind: "video",
        snapshot: {
          project: {
            clientName: shareProjectFixture.clientName,
            id: shareProjectFixture.id,
            name: shareProjectFixture.name,
            shareSlug: shareProjectFixture.shareSlug,
          },
          video: shareProjectFixture.videos[0],
        },
      }),
      contentType: "application/json",
    });
  });
  await page.route("**/api/public/share/protected_video", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        kind: "video",
        requiresPasscode: true,
      }),
      contentType: "application/json",
    });
  });

  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/video/protected_video");

  await expect(page.getByRole("heading", { name: "Protected video" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Homepage walkthrough" })).toBeHidden();

  await page.getByLabel("Passcode").fill("client-pass");
  await page.getByRole("button", { name: "Unlock review" }).click();

  await expect(page.getByRole("heading", { name: "Homepage walkthrough" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start 1\.5x review/ })).toBeVisible();
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

test("browser: Gumlet video page shows stored time savings immediately", async ({ page }) => {
  const gumletVideo = {
    ...shareProjectFixture.videos[1]!,
    recommendedPlaybackSpeed: 1.5 as const,
  };
  const shareUrl = createVideoShareUrl(shareProjectFixture, gumletVideo, "http://127.0.0.1:3002");
  const path = new URL(shareUrl).pathname + new URL(shareUrl).search;

  await page.goto(path);

  await expect(page.getByRole("heading", { name: "Checkout notes" })).toBeVisible();
  await expect(page.locator("del", { hasText: "5:00" })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Start 1\.5x review.*5:00.*3:20.*saves 1:40/,
    }),
  ).toBeVisible();
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
        data: JSON.stringify({
          context: "player.js",
          event: "getDuration",
          value: 103,
          version: "3.0",
        }),
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

  await expect(
    page.getByText("Attempting to start playback at 1.5x.", { exact: true }),
  ).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const commands = (
          window as typeof window & {
            __gumletCommands?: unknown[];
          }
        ).__gumletCommands ?? [];
        const normalizedCommands = commands.map((command) =>
          typeof command === "string" ? JSON.parse(command) : command,
        ) as Array<{ args?: unknown[]; func?: string; method?: string; type?: string; value?: unknown }>;

        return {
          play: normalizedCommands.some(
            (command) => command.func === "play" || command.method === "play" || command.type === "play",
          ),
          speed: normalizedCommands.some(
            (command) =>
              (command.func === "setPlaybackRate" ||
                command.method === "setPlaybackRate" ||
                command.type === "setPlaybackRate") &&
              JSON.stringify(command).includes("1.5"),
          ),
          unmute: normalizedCommands.some(
            (command) =>
              command.func === "unMute" ||
              command.method === "unmute" ||
              command.method === "unMute" ||
              command.type === "unmute" ||
              JSON.stringify(command).includes('"muted":false'),
          ),
          volume: normalizedCommands.some(
            (command) => command.method === "setVolume" && command.value === 100,
          ),
        };
      }),
    )
    .toEqual({ play: true, speed: true, unmute: true, volume: true });

  await page.evaluate(() => {
    for (const event of [
      { event: "play", value: null },
      { event: "playbackRateChange", value: { speed: 1.5 } },
      { event: "getMuted", value: false },
      { event: "getVolume", value: 1 },
    ]) {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            context: "player.js",
            version: "3.0",
            ...event,
          }),
          origin: "https://play.gumlet.io",
        }),
      );
    }
  });

  await expect(page.getByText("Save about 34s")).toBeHidden();
  await expect(page.getByText("Playback confirmed at 1.5x with sound on.")).toBeVisible();
});

test("browser: Gumlet video page keeps useful fallbacks when duration or playback is not confirmed", async ({
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

  await expect(page.getByText("Loading duration")).toBeVisible();
  await expect(
    page
      .getByText("Duration not detected yet. Add duration in the video settings to show time saved.")
      .first(),
  ).toBeVisible({ timeout: 8000 });

  await page.getByRole("button", { name: /Start 1\.5x review/ }).click();
  await expect(
    page.getByText("Attempting to start playback at 1.5x.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Playback was requested at 1.5x. If Gumlet still shows 1x or muted audio, use the player controls.",
    ),
  ).toBeVisible({ timeout: 7000 });
  await expect(page.getByRole("button", { name: /Start 1\.5x review/ })).toBeVisible();
});
