import { expect, test } from "@playwright/test";

import type { PortalProject } from "../src/app/portal-types";
import {
  createVideoEmbedUrl,
  createVideoShareUrl,
  encodeShareProject,
} from "../src/app/portal-utils";

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
  await expect(page.getByText("Pixel Point").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByText("Create your first project")).toBeVisible();
});

test("browser: portal identity is text-only across admin and public flows", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.locator(".portal-brand-mark")).toHaveCount(0);
  await expect(page.getByText("Pixel Point").first()).toBeVisible();

  const encodedProject = encodeShareProject(shareProjectFixture);
  await page.goto(`/share/${shareProjectFixture.shareSlug}?data=${encodedProject}`);
  await expect(page.locator(".portal-brand-mark")).toHaveCount(0);
  await expect(page.getByText("Pixel Point").first()).toBeVisible();

  const videoShareUrl = createVideoShareUrl(
    shareProjectFixture,
    shareProjectFixture.videos[0]!,
    "http://127.0.0.1:3002",
  );
  const videoUrl = new URL(videoShareUrl);

  await page.goto(`${videoUrl.pathname}${videoUrl.search}`);
  await expect(page.locator(".portal-brand-mark")).toHaveCount(0);
  await expect(page.getByText("Pixel Point").first()).toBeVisible();
});

test("browser: old hash video links are replaced with clean public paths", async ({ page }) => {
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

  await page.goto("/#/video/video_token");

  await expect(page).toHaveURL(/\/video\/video_token$/);
  await expect(page.getByRole("heading", { name: "Homepage walkthrough" })).toBeVisible();
});

test("browser: share page opens an encoded project and records timestamped feedback", async ({
  page,
}) => {
  const encoded = encodeShareProject(shareProjectFixture);

  await page.goto(`/share/${shareProjectFixture.shareSlug}?data=${encoded}`);

  await expect(page.getByRole("heading", { name: "Client review" })).toBeVisible();
  await expect(
    page.locator("span:visible", {
      hasText: "12:00 video - Suggested 1.5x - Watch in about 8:00",
    }).first(),
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

test("browser: collection keeps video navigation beside the player on mobile", async ({ page }) => {
  const encoded = encodeShareProject(shareProjectFixture);

  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto(`/share/${shareProjectFixture.shareSlug}?data=${encoded}`);

  await expect(page.locator("span:visible", { hasText: "Pixel Point" }).first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Video collection" })).toBeVisible();
  await expect(page.getByText("Notes on this device")).toBeVisible();
  await expect(page.getByText(/not sent to the administrator/i)).toBeVisible();

  const navigationPrecedesPlayer = await page.evaluate(() => {
    const navigation = document.querySelector('[aria-label="Video collection"]');
    const player = document.querySelector('[data-testid="collection-player"]');

    return Boolean(
      navigation &&
        player &&
        navigation.compareDocumentPosition(player) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  expect(navigationPrecedesPlayer).toBe(true);

  await page.getByLabel("Playback speed").click();
  await page.getByRole("option", { name: "2x" }).click();
  await expect(page.getByText("6:00 at 2x")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(430);
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

test("browser: first external playback records one view without adding a client step", async ({
  page,
}) => {
  let viewCalls = 0;
  let viewInput: Record<string, unknown> | null = null;

  await page.route("**/api/public/share/view_token**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith("/view")) {
      viewCalls += 1;
      viewInput = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        body: JSON.stringify({ recorded: viewCalls === 1 }),
        contentType: "application/json",
        status: viewCalls === 1 ? 201 : 200,
      });
      return;
    }

    if (url.pathname.endsWith("/comments")) {
      await route.fulfill({
        body: JSON.stringify({ comments: [] }),
        contentType: "application/json",
      });
      return;
    }

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
  await page.evaluate(() =>
    window.localStorage.setItem(
      "pixel-point.feedback.guest.v1",
      JSON.stringify({ email: "mira@example.com", name: "Mira" }),
    ),
  );
  await page.goto("/video/view_token");

  await expect(page.getByRole("heading", { name: "Homepage walkthrough" })).toBeVisible();
  await expect(page.getByLabel("Name")).toBeHidden();
  await expect(page.getByLabel("Email (optional)")).toBeHidden();

  await page.locator("video").dispatchEvent("play");
  await expect.poll(() => viewCalls).toBe(1);
  expect(viewInput).toEqual({
    videoId: "video_share_1",
    viewerEmail: "mira@example.com",
    viewerName: "Mira",
  });

  await page.locator("video").dispatchEvent("play");
  await page.waitForTimeout(100);
  expect(viewCalls).toBe(1);
});

test("browser: collection token records the selected video after Gumlet confirms playback", async ({
  page,
}) => {
  const viewInputs: Array<Record<string, unknown>> = [];

  await page.route("**/api/public/share/collection_view_token**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith("/view")) {
      viewInputs.push(request.postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        body: JSON.stringify({ recorded: true }),
        contentType: "application/json",
        status: 201,
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({ kind: "share", project: shareProjectFixture }),
      contentType: "application/json",
    });
  });

  await page.goto("/share/collection_view_token");
  await expect(page.getByRole("heading", { name: "Homepage walkthrough" })).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          context: "player.js",
          event: "play",
          value: null,
          version: "3.0",
        }),
        origin: "https://play.gumlet.io",
      }),
    );
  });

  await expect.poll(() => viewInputs.length).toBe(1);
  expect(viewInputs).toEqual([{ videoId: "video_share_1" }]);
});

test("browser: legacy encoded links keep playback without sending first-view requests", async ({
  page,
}) => {
  let trackingCalls = 0;

  await page.route("**/api/public/share/**/view", async (route) => {
    trackingCalls += 1;
    await route.fulfill({
      body: JSON.stringify({ recorded: true }),
      contentType: "application/json",
      status: 201,
    });
  });

  const videoShareUrl = createVideoShareUrl(
    shareProjectFixture,
    shareProjectFixture.videos[0]!,
    "http://127.0.0.1:3002",
  );
  const videoUrl = new URL(videoShareUrl);

  await page.goto(`${videoUrl.pathname}${videoUrl.search}`);
  await expect(page.getByRole("heading", { name: "Homepage walkthrough" })).toBeVisible();
  await page.locator("video").dispatchEvent("play");
  await page.waitForTimeout(100);

  expect(trackingCalls).toBe(0);
  await expect(page.getByRole("button", { name: /Start 1\.5x review/ })).toBeVisible();
});

test("browser: cloud video Review mode persists positioned feedback and guest identity on mobile", async ({
  page,
}) => {
  const comments: Array<Record<string, unknown>> = [];
  let capturedInput: Record<string, unknown> | null = null;

  await page.route("**/api/public/share/feedback_token**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith("/comments")) {
      if (route.request().method() === "POST") {
        capturedInput = route.request().postDataJSON() as Record<string, unknown>;
        const created = {
          authorName: capturedInput.authorName,
          authorRole: "guest",
          body: capturedInput.body,
          createdAt: "2026-07-17T15:00:00.000Z",
          id: "feedback_public_1",
          positionX: capturedInput.positionX,
          positionY: capturedInput.positionY,
          status: "open",
          timestampSeconds: capturedInput.timestampSeconds,
          updatedAt: "2026-07-17T15:00:00.000Z",
          videoId: "video_share_1",
        };
        comments.push(created);
        await route.fulfill({ body: JSON.stringify(created), contentType: "application/json", status: 201 });
        return;
      }

      await route.fulfill({
        body: JSON.stringify({ comments }),
        contentType: "application/json",
      });
      return;
    }

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

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/video/feedback_token");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "Review", exact: true }).click();
  const placementButton = page.getByRole("button", { name: "Place feedback on video" });
  await placementButton.click({ position: { x: 120, y: 110 } });

  await page.getByLabel("Name").fill("Mira");
  await page.getByLabel("Email (optional)").fill("mira@example.com");
  await page.getByLabel("Comment").fill("Please tighten this transition.");
  await page.getByRole("button", { name: "Add comment" }).click();

  await expect(page.getByText("Please tighten this transition.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Open feedback 1 at/ })).toBeVisible();
  expect(capturedInput).toMatchObject({
    authorEmail: "mira@example.com",
    authorName: "Mira",
    body: "Please tighten this transition.",
    videoId: "video_share_1",
  });
  expect(Number(capturedInput?.positionX)).toBeGreaterThan(0);
  expect(Number(capturedInput?.positionX)).toBeLessThan(100);
  expect(Number(capturedInput?.positionY)).toBeGreaterThan(0);
  expect(Number(capturedInput?.positionY)).toBeLessThan(100);

  await page.reload();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.getByText("Please tighten this transition.")).toBeVisible();
  await placementButton.click({ position: { x: 180, y: 130 } });
  await expect(page.getByLabel("Name")).toHaveValue("Mira");
  await expect(page.getByLabel("Email (optional)")).toHaveValue("mira@example.com");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(390);
});

test("browser: direct comment link opens Review mode and focuses the matching feedback", async ({
  page,
}) => {
  const directComment = {
    authorName: "Mira",
    authorRole: "guest",
    body: "Align this card with the heading.",
    createdAt: "2026-07-17T15:00:00.000Z",
    id: "feedback_direct_1",
    positionX: 62,
    positionY: 35,
    status: "open",
    timestampSeconds: 12.5,
    updatedAt: "2026-07-17T15:00:00.000Z",
    videoId: "video_share_1",
  };

  await page.route("**/api/public/share/direct_token**", async (route) => {
    const url = new URL(route.request().url());

    await route.fulfill({
      body: JSON.stringify(
        url.pathname.endsWith("/comments")
          ? { comments: [directComment] }
          : {
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
            },
      ),
      contentType: "application/json",
    });
  });

  await page.goto("/video/direct_token?comment=feedback_direct_1");

  await expect(page.getByRole("button", { name: "Review", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("Align this card with the heading.")).toBeVisible();
  await expect
    .poll(() =>
      page.locator("article", { hasText: "Align this card with the heading." }).evaluate(
        (element) => document.activeElement === element,
      ),
    )
    .toBe(true);
  await expect
    .poll(() => page.locator("video").evaluate((element) => (element as HTMLVideoElement).currentTime))
    .toBe(12.5);
});

test("browser: passcode-protected review and embed routes block details until unlock", async ({
  page,
}) => {
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

  await expect(page.getByText("Pixel Point")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Protected video" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Homepage walkthrough" })).toBeHidden();

  await page.getByLabel("Passcode").fill("client-pass");
  await page.getByRole("button", { name: "Unlock review" }).click();

  await expect(page.getByRole("heading", { name: "Homepage walkthrough" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Start 1\.5x review/ })).toBeVisible();

  await page.goto("/embed/video/protected_video");
  await expect(page.getByRole("heading", { name: "Protected video" })).toBeVisible();
  await expect(page.getByTestId("notion-video-embed")).toHaveCount(0);

  await page.getByLabel("Passcode").fill("client-pass");
  await page.getByRole("button", { name: "Unlock review" }).click();

  await expect(page.getByTestId("notion-video-embed")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Homepage walkthrough" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open full review" })).toHaveAttribute(
    "href",
    "/video/protected_video",
  );
});

test("browser: Notion embed rejects project collection tokens before and after passcode unlock", async ({
  page,
}) => {
  await page.route("**/api/public/share/project_embed_token", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ kind: "share", project: shareProjectFixture }),
      contentType: "application/json",
    });
  });
  await page.route("**/api/public/share/protected_project_embed_token/passcode", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ kind: "share", project: shareProjectFixture }),
      contentType: "application/json",
    });
  });
  await page.route("**/api/public/share/protected_project_embed_token", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ kind: "share", requiresPasscode: true }),
      contentType: "application/json",
    });
  });

  await page.goto("/embed/video/project_embed_token");
  await expect(page.getByText("This video link is not available", { exact: true })).toBeVisible();
  await expect(page.getByTestId("notion-video-embed")).toHaveCount(0);

  await page.goto("/embed/video/protected_project_embed_token");
  await expect(page.getByRole("heading", { name: "Protected video" })).toBeVisible();
  await page.getByLabel("Passcode").fill("client-pass");
  await page.getByRole("button", { name: "Unlock review" }).click();

  await expect(page.getByRole("heading", { name: "Protected video" })).toBeVisible();
  await expect(page.getByText("This passcode did not unlock a video.")).toBeVisible();
  await expect(page.getByTestId("notion-video-embed")).toHaveCount(0);
});

test("browser: Notion embed plays the shared video in place at the recommended speed", async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function mockPlay() {
      return Promise.resolve();
    };
  });

  const reviewUrl = createVideoShareUrl(
    shareProjectFixture,
    shareProjectFixture.videos[0]!,
    "http://local.test",
  );
  const embedUrl = createVideoEmbedUrl(reviewUrl);

  expect(embedUrl).not.toBeNull();

  const embedPath = new URL(embedUrl!).pathname + new URL(embedUrl!).search;

  await page.setViewportSize({ width: 360, height: 700 });
  await page.goto(embedPath);

  await expect(page.getByTestId("notion-video-embed")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Homepage walkthrough" })).toBeVisible();
  await expect(page.getByText("Client review", { exact: true })).toBeVisible();
  await expect(page.getByText("Recommended 1.5x", { exact: true })).toBeVisible();
  await expect(page.getByText("Watch in about 8:00", { exact: true })).toBeVisible();
  await expect(page.getByText("Save about 4:00", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Playback speed")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Feedback" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open full review" })).toHaveAttribute(
    "href",
    new URL(reviewUrl).pathname + new URL(reviewUrl).search,
  );

  await page.getByRole("button", { name: /Start 1\.5x review/ }).click();

  await expect
    .poll(() =>
      page.locator("video").evaluate((element) => ({
        currentTime: (element as HTMLVideoElement).currentTime,
        playbackRate: (element as HTMLVideoElement).playbackRate,
      })),
    )
    .toEqual({ currentTime: 15, playbackRate: 1.5 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(360);
});

test("browser: Notion embed records first playback once without adding an identity step", async ({
  page,
}) => {
  let viewCalls = 0;
  let viewInput: Record<string, unknown> | null = null;

  await page.route("**/api/public/share/embed_view_token**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith("/view")) {
      viewCalls += 1;
      viewInput = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        body: JSON.stringify({ recorded: viewCalls === 1 }),
        contentType: "application/json",
        status: viewCalls === 1 ? 201 : 200,
      });
      return;
    }

    if (url.pathname.endsWith("/comments")) {
      await route.fulfill({
        body: JSON.stringify({ comments: [] }),
        contentType: "application/json",
      });
      return;
    }

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
  await page.evaluate(() =>
    window.localStorage.setItem(
      "pixel-point.feedback.guest.v1",
      JSON.stringify({ email: "mira@example.com", name: "Mira" }),
    ),
  );
  await page.goto("/embed/video/embed_view_token");

  await expect(page.getByTestId("notion-video-embed")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveCount(0);
  await expect(page.getByLabel("Email (optional)")).toHaveCount(0);

  await page.locator("video").dispatchEvent("play");
  await expect.poll(() => viewCalls).toBe(1);
  expect(viewInput).toEqual({
    videoId: "video_share_1",
    viewerEmail: "mira@example.com",
    viewerName: "Mira",
  });

  await page.locator("video").dispatchEvent("play");
  await page.waitForTimeout(100);
  expect(viewCalls).toBe(1);
});

test("browser: Notion embed works inside a cross-origin parent frame", async ({ page }) => {
  await page.goto("/");
  const parentUrl = new URL(page.url());
  const alternateHost = parentUrl.hostname === "127.0.0.1" ? "localhost" : "127.0.0.1";
  const alternateOrigin = `${parentUrl.protocol}//${alternateHost}:${parentUrl.port}`;
  const reviewUrl = createVideoShareUrl(
    shareProjectFixture,
    shareProjectFixture.videos[0]!,
    alternateOrigin,
  );
  const embedUrl = createVideoEmbedUrl(reviewUrl);

  expect(embedUrl).not.toBeNull();

  await page.setContent(
    `<iframe title="Notion-style embed" src="${embedUrl!.replaceAll("&", "&amp;")}" style="width:360px;height:640px;border:0"></iframe>`,
  );

  const embedFrame = page.frameLocator('iframe[title="Notion-style embed"]');
  await expect(embedFrame.getByTestId("notion-video-embed")).toBeVisible();
  await expect(embedFrame.getByRole("heading", { name: "Homepage walkthrough" })).toBeVisible();
  await expect(embedFrame.getByRole("link", { name: "Open full review" })).toBeVisible();
});

test("browser: Gumlet Notion embed exposes native playback and applies the recommended speed", async ({ page }) => {
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

  const gumletVideo = {
    ...shareProjectFixture.videos[1]!,
    recommendedPlaybackSpeed: 1.5 as const,
  };
  const reviewUrl = createVideoShareUrl(shareProjectFixture, gumletVideo, "http://local.test");
  const embedUrl = createVideoEmbedUrl(reviewUrl);

  expect(embedUrl).not.toBeNull();

  await page.goto(new URL(embedUrl!).pathname + new URL(embedUrl!).search);
  await expect(page.getByTestId("notion-video-embed")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start 1\.5x review/ })).toHaveCount(0);
  await expect(page.getByText("Press play in the video. Playback will switch to 1.5x.")).toBeVisible();
  await expect(page.getByTitle("Checkout notes Gumlet video")).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({
          context: "player.js",
          event: "play",
          version: "3.0",
        }),
        origin: "https://play.gumlet.io",
      }),
    );
  });

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
        ) as Array<{ func?: string; method?: string; type?: string }>;

        return {
          play: normalizedCommands.some(
            (command) =>
              command.func === "play" || command.method === "play" || command.type === "play",
          ),
          speed: normalizedCommands.some(
            (command) =>
              (command.func === "setPlaybackRate" ||
                command.method === "setPlaybackRate" ||
                command.type === "setPlaybackRate") &&
              JSON.stringify(command).includes("1.5"),
          ),
        };
      }),
    )
    .toEqual({ play: false, speed: true });
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

test("browser: video viewer can choose speed and the mobile start panel stays below the player", async ({
  page,
}) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function mockPlay() {
      return Promise.resolve();
    };
  });

  const shareUrl = createVideoShareUrl(
    shareProjectFixture,
    shareProjectFixture.videos[0]!,
    "http://127.0.0.1:3002",
  );
  const path = new URL(shareUrl).pathname + new URL(shareUrl).search;

  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto(path);

  await expect(page.locator("span:visible", { hasText: "Pixel Point" }).first()).toBeVisible();
  await page.getByLabel("Playback speed").click();
  await page.getByRole("option", { name: "2x" }).click();
  await expect(page.getByText("Watch in about 6:00").first()).toBeVisible();
  await expect(page.getByText("Save about 6:00").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Start 2x review/ })).toBeVisible();

  const playerBox = await page.getByTestId("video-player-frame").boundingBox();
  const startBox = await page.getByTestId("review-start-panel").boundingBox();

  expect(playerBox).not.toBeNull();
  expect(startBox).not.toBeNull();
  expect(startBox!.y).toBeGreaterThanOrEqual(playerBox!.y + playerBox!.height - 1);

  await page.getByRole("button", { name: /Start 2x review/ }).click();
  await expect
    .poll(() => page.locator("video").evaluate((element) => (element as HTMLVideoElement).playbackRate))
    .toBe(2);
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
