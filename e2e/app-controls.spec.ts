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

test("browser: admin activity shows unread first views and opens the viewed video on mobile", async ({
  page,
}) => {
  const activityVideo = {
    assetId: "activity-video-1",
    createdAt: "2026-08-14T07:00:00.000Z",
    directVideoUrl: "https://video.gumlet.io/workspace/activity-video-1/main.mp4",
    durationSeconds: 90,
    id: "video_activity_1",
    orderIndex: 0,
    recommendedPlaybackSpeed: 1.5,
    title: "Homepage activity review",
    updatedAt: "2026-08-14T07:00:00.000Z",
  };
  const project = {
    ...adminProjectFixture,
    id: "project_activity_1",
    name: "Activity project",
    videos: [activityVideo],
  };
  let markedRead = false;

  await page.route("**/api/admin/activity**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith("/read")) {
      markedRead = true;
      await route.fulfill({
        body: JSON.stringify({ read: true }),
        contentType: "application/json",
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({
        emailConfigured: false,
        events: [
          {
            emailStatus: "not-configured",
            firstViewedAt: "2026-08-14T08:30:00.000Z",
            id: "view_activity_1",
            projectId: project.id,
            projectName: project.name,
            shareToken: "activity_token_1",
            viewerEmail: "mira@example.com",
            viewerName: "Mira",
            videoId: activityVideo.id,
            videoTitle: activityVideo.title,
          },
        ],
        unreadCount: markedRead ? 0 : 1,
      }),
      contentType: "application/json",
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: portalStorageKey, value: { projects: [project] } },
  );
  await page.reload();

  await expect(page.getByRole("button", { name: /Activity.*1 unread/i })).toBeVisible();
  await page.getByRole("button", { name: /Activity.*1 unread/i }).click();

  const activityDialog = page.getByRole("dialog", { name: "Activity" });
  await expect(activityDialog).toBeVisible();
  await expect(activityDialog.getByText("Homepage activity review")).toBeVisible();
  await expect(activityDialog.getByText("Mira", { exact: true })).toBeVisible();
  await expect(activityDialog.getByText("mira@example.com")).toBeVisible();
  await expect(
    activityDialog.getByText("In-app activity is on. Email notifications aren't connected."),
  ).toBeVisible();
  await expect.poll(() => markedRead).toBe(true);

  await activityDialog.getByRole("button", { name: "Open video" }).click();
  await expect(activityDialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Homepage activity review" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Activity$/i })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(390);
});

test("browser: admin creates a project, adds a Gumlet video, and exposes a share link", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(value: string) {
          Object.assign(window, { __copiedPortalLink: value });
          return Promise.resolve();
        },
      },
    });
    Object.defineProperty(window, "open", {
      configurable: true,
      value(url?: string | URL) {
        Object.assign(window, { __openedPortalLink: String(url ?? "") });
        return null;
      },
    });
  });

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
  await expect(page.getByLabel("Notion embed URL")).toHaveValue(
    /^http:\/\/localhost:\d+\/embed\/video\/hero-review-/,
  );
  const notionEmbedUrl = await page.getByLabel("Notion embed URL").inputValue();
  await expect(
    page.getByText("In Notion, type /embed, paste this HTTPS URL, and choose Embed."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy embed link" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __copiedPortalLink?: string }).__copiedPortalLink,
      ),
    )
    .toBe(notionEmbedUrl);
  await page.getByRole("button", { name: "Preview embed" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __openedPortalLink?: string }).__openedPortalLink,
      ),
    )
    .toBe(notionEmbedUrl);
  await expect(page.getByText("Embed link copied")).toBeVisible();
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

test("browser: admin receives unread feedback and manages the mobile feedback workflow", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const feedbackVideo = {
    assetId: "asset-feedback-1",
    createdAt: "2026-07-17T14:00:00.000Z",
    directVideoUrl: "https://video.gumlet.io/workspace/asset-feedback-1/main.mp4",
    durationSeconds: 120,
    id: "video_feedback_1",
    orderIndex: 0,
    recommendedPlaybackSpeed: 1.5,
    title: "Feedback walkthrough",
    updatedAt: "2026-07-17T14:00:00.000Z",
  };
  const project = { ...adminProjectFixture, videos: [feedbackVideo] };
  const comments: Array<Record<string, unknown>> = [
    {
      authorEmail: "mira@example.com",
      authorName: "Mira",
      authorRole: "guest",
      body: "Please align this card with the heading.",
      createdAt: "2026-07-17T15:00:00.000Z",
      id: "feedback_admin_1",
      positionX: 62,
      positionY: 35,
      projectId: project.id,
      shareToken: "feedback_token_1",
      status: "open",
      timestampSeconds: 12.5,
      updatedAt: "2026-07-17T15:00:00.000Z",
      videoId: feedbackVideo.id,
    },
  ];
  let unreadCount = 1;

  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/admin/feedback" && request.method() === "GET") {
      await route.fulfill({
        body: JSON.stringify({
          videos:
            comments.length > 0
              ? [
                  {
                    openCount: comments[0]?.status === "open" ? 1 : 0,
                    projectId: project.id,
                    resolvedCount: comments[0]?.status === "resolved" ? 1 : 0,
                    unreadCount,
                    videoId: feedbackVideo.id,
                  },
                ]
              : [],
        }),
        contentType: "application/json",
      });
      return;
    }

    if (
      url.pathname === `/api/admin/videos/${feedbackVideo.id}/feedback/read` &&
      request.method() === "POST"
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      unreadCount = 0;
      comments[0] = comments[0] ? { ...comments[0], adminReadAt: "2026-07-17T15:01:00.000Z" } : comments[0]!;
      await route.fulfill({ body: JSON.stringify({ read: true }), contentType: "application/json" });
      return;
    }

    if (
      url.pathname === `/api/admin/videos/${feedbackVideo.id}/feedback` &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        body: JSON.stringify({ comments }),
        contentType: "application/json",
      });
      return;
    }

    if (
      url.pathname === "/api/admin/feedback/feedback_admin_1/replies" &&
      request.method() === "POST"
    ) {
      const input = request.postDataJSON() as { body: string };
      const reply = {
        authorEmail: "admin@example.com",
        authorName: "Pixel Point",
        authorRole: "admin",
        body: input.body,
        createdAt: "2026-07-17T15:02:00.000Z",
        id: "feedback_reply_1",
        parentId: "feedback_admin_1",
        projectId: project.id,
        shareToken: "feedback_token_1",
        status: comments[0]?.status,
        timestampSeconds: 12.5,
        updatedAt: "2026-07-17T15:02:00.000Z",
        videoId: feedbackVideo.id,
      };
      comments.push(reply);
      await route.fulfill({ body: JSON.stringify(reply), contentType: "application/json", status: 201 });
      return;
    }

    if (
      url.pathname === "/api/admin/feedback/feedback_admin_1" &&
      request.method() === "PATCH"
    ) {
      const patch = request.postDataJSON() as { deleted?: boolean; status?: "open" | "resolved" };

      if (patch.deleted) {
        comments.splice(0, comments.length);
      } else if (comments[0] && patch.status) {
        comments[0] = { ...comments[0], status: patch.status };
      }
      await route.fulfill({
        body: JSON.stringify(comments[0] ?? { deleted: true }),
        contentType: "application/json",
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({ error: { code: "not_found", message: "Mock route not found." } }),
      contentType: "application/json",
      status: 404,
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: portalStorageKey, value: { projects: [project] } },
  );
  await page.reload();

  await expect(page.getByText("1 new")).toBeVisible();
  await expect(page.getByText("Please align this card with the heading.")).toBeVisible();
  await expect(page.getByText("mira@example.com")).toBeVisible();

  await page.getByRole("button", { name: "Feedback actions" }).click();
  await page.getByRole("menuitem", { name: "Reply" }).click();
  await page.getByLabel("Admin reply").fill("Thanks, I will align it.");
  await page.getByRole("button", { name: "Add reply" }).click();
  await expect(page.getByText("Thanks, I will align it.")).toBeVisible();

  await page.getByRole("button", { name: "Feedback actions" }).click();
  await page.getByRole("menuitem", { name: "Resolve" }).click();
  await expect(page.getByText("resolved", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Feedback actions" }).click();
  await page.getByRole("menuitem", { name: "Copy direct link" }).click();
  await expect(page.getByText("Direct feedback link copied.")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toMatch(/\/video\/feedback_token_1\?comment=feedback_admin_1$/);

  await page.setViewportSize({ width: 430, height: 900 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(430);

  await page.getByRole("button", { name: "Feedback actions" }).click();
  await page.getByRole("menuitem", { name: "Delete feedback" }).click();
  await expect(page.getByRole("alertdialog", { name: "Delete this feedback?" })).toBeVisible();
  await page.getByRole("button", { name: "Delete feedback" }).click();
  await expect(page.getByText("No feedback yet")).toBeVisible();
});
