import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

async function openNestedEmbed(page: Page, baseURL: string, mode: "auto" | "hold" = "auto") {
  const saved: Array<Record<string, unknown>> = [];
  await page.route("**/api/public/share/timestamp_fixture**", async (route) => {
    if (route.request().url().includes("/comments")) {
      if (route.request().method() === "POST") {
        const input = route.request().postDataJSON() as Record<string, unknown>;
        saved.push(input);
        await route.fulfill({ json: {
          comment: { ...input, id: "comment-" + saved.length, status: "open", authorRole: "guest",
            createdAt: "2026-09-21T00:00:00Z", updatedAt: "2026-09-21T00:00:00Z" },
          editToken: "test-owner-token",
        }, status: 201 });
      } else {
        await route.fulfill({ json: { comments: [] } });
      }
      return;
    }
    await route.fulfill({ json: {
      kind: "video",
      snapshot: {
        project: { id: "capture-project", name: "Client review", clientName: "Client", shareSlug: "capture-project" },
        video: { id: "capture-video", assetId: "capture-asset", title: "Timestamp review",
          durationSeconds: 7200, recommendedPlaybackSpeed: 1.5, startTimeSeconds: 15,
          orderIndex: 0, createdAt: "2026-09-21T00:00:00Z", updatedAt: "2026-09-21T00:00:00Z" },
      },
    } });
  });
  await page.route("https://play.gumlet.io/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><body style="margin:0;background:#161c25;color:white;font:16px sans-serif">
      <button id="play" style="margin:100px 30px 30px" onclick="state.paused=false;send('play',null)">Play video</button>
      <p>Video player fixture</p>
      <script>
        const state = window.playerState = { seconds: 84.625, paused: false, mode: "${mode}", commands: [], requests: [] };
        function send(event,value,listener) { parent.postMessage(JSON.stringify({context:"player.js",event,value,listener}),"*"); }
        window.addEventListener("message", event => {
          let data; try { data=JSON.parse(event.data); } catch { return; }
          if(data.context!=="player.js") return;
          state.commands.push(data);
          if(data.method==="pause") state.paused=true;
          if(data.method==="setCurrentTime") {state.seconds=data.value;send("timeupdate",{seconds:state.seconds});}
          if(data.method==="getPaused") send("getPaused",state.paused,data.listener);
          if(data.method==="getDuration") send("getDuration",7200,data.listener);
          if(data.method==="getPlaybackRate") send("getPlaybackRate",1.5,data.listener);
          if(data.method==="getCurrentTime") {
            if(data.listener.startsWith("feedback-capture-")) {
              state.requests.push(data);
              if(state.mode==="auto") send("getCurrentTime",state.seconds,data.listener);
            } else if(state.mode==="auto") send("getCurrentTime",state.seconds,data.listener);
          }
        });
        setTimeout(()=>send("ready",{}),50);
      </script></body></html>`,
  }));
  // Load the outer origin from the real server before adding a different-origin iframe.
  // An intercepted top-level document has no resolved address space in Chromium.
  const embedUrl = baseURL.replace("localhost", "127.0.0.1");
  await page.goto(baseURL);
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <input aria-label="Notion text" value="">
    <iframe title="Notion-style embed" src="${embedUrl}/embed/video/timestamp_fixture" style="display:block;width:640px;height:360px;border:0"></iframe>
  </body></html>`);
  const embed = page.frameLocator('iframe[title="Notion-style embed"]');
  const player = embed.frameLocator('iframe[title="Timestamp review Gumlet video"]');
  await expect(player.getByRole("button", { name: "Play video" })).toBeVisible();
  await expect(embed.getByText("Loading video…", { exact: true })).toHaveCount(0);
  const appFrame = page.frames().find((frame) => frame.url().includes("/embed/video/timestamp_fixture"))!;
  const playerFrame = page.frames().find((frame) => frame.url().startsWith("https://play.gumlet.io/"))!;
  return { embed, player, appFrame, playerFrame, saved };
}

test("browser: nested Notion timestamp action pauses, freezes fractional time, and saves with keyboard access", async ({ page, baseURL }) => {
  const { embed, player, playerFrame, appFrame, saved } = await openNestedEmbed(page, baseURL!);
  const action = embed.getByRole("button", { name: "Comment at 1:24", exact: true });
  await expect(action).toBeVisible();
  await expect(embed.getByRole("region", { name: "Video feedback review" })).not.toHaveAttribute("aria-keyshortcuts");
  await expect(embed.locator("kbd")).toHaveCount(0);
  await page.getByLabel("Notion text").fill("c");
  await expect(embed.getByRole("dialog")).toHaveCount(0);
  await player.getByRole("button", { name: "Play video" }).click();
  await page.keyboard.press("c");
  await expect(embed.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await action.focus();
  await expect(embed.getByRole("tooltip")).toBeVisible();
  await action.press("c");
  await expect(embed.getByRole("dialog")).toHaveCount(0);
  await action.press("Enter");
  const dialog = embed.getByRole("dialog", { name: "Comment at 1:24" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Playback paused. Your comment will be attached to this timestamp.")).toBeVisible();
  expect(await playerFrame.evaluate(() => (window as any).playerState.paused)).toBe(true);
  await dialog.getByLabel("Name", { exact: true }).fill("Mira");
  await expect(dialog.getByLabel("Name", { exact: true })).toBeFocused();
  await dialog.getByRole("textbox", { name: "Comment", exact: true }).fill("Please shorten this transition.");
  await playerFrame.evaluate(() => parent.postMessage(JSON.stringify({
    context: "player.js", event: "timeupdate", value: { seconds: 99.9 },
  }), "*"));
  await expect(dialog).toHaveAccessibleName("Comment at 1:24");
  await expect(action).toBeVisible();
  await dialog.getByRole("button", { name: "Add comment", exact: true }).click();
  await expect(embed.getByTestId("feedback-comment-card")).toContainText("Comment added at 1:24");
  expect(saved[0]?.timestampSeconds).toBe(84.625);
  expect(await playerFrame.evaluate(() => (window as any).playerState.paused)).toBe(true);
  await expect(embed.getByTestId("feedback-comment-card")).toBeFocused();

  // Bounded layouts, stable same-width digits, no extra capture requests from display updates.
  for (const size of [{width:960,height:540},{width:640,height:360},{width:390,height:280}]) {
    await page.locator('iframe[title="Notion-style embed"]').evaluate((element, size) => {
      element.style.width = size.width + "px"; element.style.height = size.height + "px";
    }, size);
    await playerFrame.evaluate(() => parent.postMessage(JSON.stringify({
      context:"player.js", event:"timeupdate", value:{seconds:84},
    }), "*"));
    const button = embed.getByRole("button", { name: "Comment at 1:24", exact: true });
    await expect(button).toBeVisible();
    const before = await button.boundingBox();
    for (const seconds of [85, 86, 87, 88]) {
      await playerFrame.evaluate((seconds) => parent.postMessage(JSON.stringify({
        context:"player.js", event:"timeupdate", value:{seconds},
      }), "*"), seconds);
      await expect(embed.getByRole("button", { name: `Comment at 1:${seconds-60}`, exact:true })).toBeVisible();
    }
    const after = await embed.getByRole("button", { name: "Comment at 1:28", exact:true }).boundingBox();
    expect(after!.x).toBeCloseTo(before!.x, 1);
    expect(after!.width).toBeCloseTo(before!.width, 1);
    expect(after!.height).toBeGreaterThanOrEqual(44);
    const dimensions = await appFrame.evaluate(() => ({
      scrollWidth:document.documentElement.scrollWidth, scrollHeight:document.documentElement.scrollHeight,
      width:innerWidth, height:innerHeight,
    }));
    expect(dimensions.scrollWidth).toBe(dimensions.width);
    expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.height);
    await embed.getByRole("button", { name: "Comment at 1:28", exact:true }).click();
    const composer = embed.getByRole("dialog");
    await expect(composer.getByRole("button", { name:"Add comment", exact:true })).toBeEnabled();
    await composer.getByRole("textbox", { name:"Comment", exact:true }).fill("c");
    await composer.getByRole("textbox", { name:"Comment", exact:true }).press("Escape");
    await expect(embed.getByRole("alertdialog")).toBeVisible();
    await embed.getByRole("button", { name:"Discard comment", exact:true }).click();
    await expect(composer).toHaveCount(0);
    await expect(embed.locator(".compact-feedback__comment-button")).toBeFocused();
    await page.screenshot({path:`test-results/embed-timestamp-${size.width}.png`});
  }
  expect(await playerFrame.evaluate(() => (window as any).playerState.requests.length)).toBe(4);
});

test("browser: nested Notion capture preserves drafts through timeout retry and rejects stale iframe replies", async ({page, baseURL}) => {
  const {embed, playerFrame, appFrame, saved} = await openNestedEmbed(page, baseURL!, "hold");
  const action = embed.getByRole("button", {name:"Comment at this time", exact:true});
  await expect(action).toBeVisible();
  await action.dblclick();
  let dialog = embed.getByRole("dialog");
  await expect(dialog.getByText("Getting timestamp…", {exact:true})).toBeVisible();
  await dialog.getByLabel("Name", {exact:true}).fill("Jules");
  const body = dialog.getByRole("textbox", {name:"Comment",exact:true});
  await body.fill("Keep this draft.");
  await expect(dialog.getByRole("button", {name:"Add comment",exact:true})).toBeDisabled();
  await expect(dialog.getByRole("alert")).toHaveText("Couldn’t confirm the timestamp. Try again.");
  expect(await playerFrame.evaluate(() => (window as any).playerState.requests.length)).toBe(1);
  await dialog.getByRole("button", {name:"Retry timestamp"}).click();
  await expect(body).toHaveValue("Keep this draft.");
  await expect.poll(() => playerFrame.evaluate(() => (window as any).playerState.requests.length)).toBe(2);
  // The real player emits the old request, an unsolicited timeupdate, and a reply with no matching ID.
  await playerFrame.evaluate(() => {
    const oldId=(window as any).playerState.requests[0].listener;
    parent.postMessage(JSON.stringify({context:"player.js",event:"getCurrentTime",listener:oldId,value:22}),"*");
    parent.postMessage(JSON.stringify({context:"player.js",event:"timeupdate",value:{seconds:44}}),"*");
  });
  // A different source spoofs a valid ID: source validation must reject it.
  const latestId=await playerFrame.evaluate(() => (window as any).playerState.requests.at(-1).listener);
  await appFrame.evaluate((listener) => window.dispatchEvent(new MessageEvent("message", {
    origin:"https://play.gumlet.io", source:window,
    data:JSON.stringify({context:"player.js",event:"getCurrentTime",listener,value:55}),
  })), latestId);
  await expect(dialog.getByRole("button", {name:"Add comment",exact:true})).toBeDisabled();
  await playerFrame.evaluate(() => parent.postMessage(JSON.stringify({
    context:"player.js",event:"getCurrentTime",
    listener:(window as any).playerState.requests.at(-1).listener,value:120.25,
  }),"*"));
  await expect(dialog).toHaveAccessibleName("Comment at 2:00");
  await expect(body).toHaveValue("Keep this draft.");
  await dialog.getByRole("button", {name:"Add comment",exact:true}).click();
  expect(saved[0]?.timestampSeconds).toBe(120.25);

  // Closing and reopening cancels the prior capture even if its response arrives later.
  await embed.locator(".compact-feedback__comment-button").click();
  await expect.poll(() => playerFrame.evaluate(() => (window as any).playerState.requests.length)).toBe(3);
  await embed.getByRole("button",{name:"Cancel comment",exact:true}).click();
  await expect(embed.getByRole("dialog")).toHaveCount(0);
  await embed.locator(".compact-feedback__comment-button").click();
  await expect.poll(() => playerFrame.evaluate(() => (window as any).playerState.requests.length)).toBe(4);
  dialog=embed.getByRole("dialog");
  await playerFrame.evaluate(() => parent.postMessage(JSON.stringify({
    context:"player.js",event:"getCurrentTime",
    listener:(window as any).playerState.requests[2].listener,value:1,
  }),"*"));
  await expect(dialog.getByRole("button",{name:"Add comment",exact:true})).toBeDisabled();
  await playerFrame.evaluate(() => parent.postMessage(JSON.stringify({
    context:"player.js",event:"getCurrentTime",
    listener:(window as any).playerState.requests[3].listener,value:3601.5,
  }),"*"));
  await expect(dialog).toHaveAccessibleName("Comment at 1:00:01");
  await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
  await expect(embed.locator(".compact-feedback__comment-button")).toBeFocused();
});

test("browser: native embed captures actual paused media time after playback and seeking", async ({page, baseURL}) => {
  await page.goto(baseURL!);
  const bytes = readFileSync(new URL("./fixtures/timestamp-video.mp4", import.meta.url));
  const saved: Array<Record<string, unknown>>=[];
  await page.route("**/native-timestamp.mp4", route => {
    const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
    const start = Number(range?.[1] ?? 0);
    const end = range?.[2] ? Number(range[2]) : bytes.length - 1;
    return route.fulfill({
      status: range ? 206 : 200,
      body: bytes.subarray(start, end + 1),
      contentType: "video/mp4",
      headers: {
        "accept-ranges": "bytes",
        ...(range ? { "content-range": `bytes ${start}-${end}/${bytes.length}` } : {}),
      },
    });
  });
  await page.route("**/api/public/share/timestamp_native**",async route=>{
    if(route.request().url().includes("/comments")){
      if(route.request().method()==="POST"){
        const input=route.request().postDataJSON();
        saved.push(input);
        await route.fulfill({status:201,json:{comment:{
          ...input,id:"native-comment",status:"open",authorRole:"guest",
          createdAt:"2026-09-21T00:00:00Z",updatedAt:"2026-09-21T00:00:00Z",
        },editToken:"native-edit-token"}});
      }else await route.fulfill({json:{comments:[]}});
      return;
    }
    await route.fulfill({json:{kind:"video",snapshot:{
      project:{id:"native-project",name:"Native review",clientName:"Client",shareSlug:"native-project"},
      video:{id:"native-video",assetId:"native-video",title:"Native timestamp",
        directVideoUrl:baseURL+"/native-timestamp.mp4",recommendedPlaybackSpeed:1.5,startTimeSeconds:1,
        durationSeconds:3,orderIndex:0,createdAt:"2026-09-21T00:00:00Z",updatedAt:"2026-09-21T00:00:00Z"},
    }}});
  });
  await page.goto("/embed/video/timestamp_native");
  const video=page.locator("video");
  await expect.poll(()=>video.evaluate(element=>element.readyState)).toBeGreaterThanOrEqual(2);
  await expect.poll(()=>video.evaluate(element=>element.currentTime)).toBeCloseTo(1,2);
  await page.getByRole("button",{name:/Start 1\.5x review/}).click();
  await expect.poll(()=>video.evaluate(element=>element.paused)).toBe(false);
  await page.locator(".compact-feedback__comment-button").click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName(/Comment at 0:0[1-3]/);
  expect(await video.evaluate(element=>element.paused)).toBe(true);
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  expect(await video.evaluate(element=>element.paused)).toBe(true);

  await video.evaluate(async element=>{
    const seeked=new Promise<void>(resolve=>element.addEventListener("seeked",()=>resolve(),{once:true}));
    element.currentTime=0.625;
    await seeked;
  });
  await page.locator(".compact-feedback__comment-button").click();
  const dialog=page.getByRole("dialog");
  await expect(dialog.getByRole("button",{name:"Add comment",exact:true})).toBeEnabled();
  await dialog.getByLabel("Name",{exact:true}).pressSequentially("Mira");
  await expect(dialog.getByLabel("Name",{exact:true})).toHaveValue("Mira");
  await dialog.getByRole("textbox",{name:"Comment",exact:true}).fill("Pause right here.");
  const pausedTime=await video.evaluate(element=>element.currentTime);
  expect(pausedTime).toBeCloseTo(0.625,3);
  await dialog.getByRole("button",{name:"Add comment",exact:true}).click();
  await expect(page.getByTestId("feedback-comment-card")).toContainText("Comment added at 0:00");
  expect(saved[0]?.timestampSeconds).toBe(pausedTime);
  expect(await video.evaluate(element=>element.paused)).toBe(true);
});
