import { describe, expect, it, vi } from "vitest";

import {
  buildGumletStartCommands,
  parseGumletPlayerMessage,
  postGumletCommands,
} from "./gumlet-player-adapter";

describe("gumlet player adapter", () => {
  it("builds start commands that request play, unmute, volume, duration, and speed", () => {
    const commands = buildGumletStartCommands(1.5);

    expect(commands).toEqual(
      expect.arrayContaining([
        { event: "command", func: "play", args: [] },
        { event: "command", func: "unMute", args: [] },
        { event: "command", func: "setVolume", args: [1] },
        { event: "command", func: "setPlaybackRate", args: [1.5] },
        { event: "command", func: "getDuration", args: [] },
      ]),
    );
  });

  it("posts Gumlet commands to the embed origin", () => {
    const postMessage = vi.fn();
    const frame = {
      contentWindow: { postMessage },
    } as unknown as HTMLIFrameElement;

    postGumletCommands(frame, buildGumletStartCommands(2));

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ func: "setPlaybackRate" }),
      "https://play.gumlet.io",
    );
  });

  it("parses duration from common Gumlet/player message shapes", () => {
    expect(parseGumletPlayerMessage({ event: "durationchange", duration: 103.4 })).toEqual({
      durationSeconds: 103,
    });
    expect(parseGumletPlayerMessage({ data: { duration: 104 } })).toEqual({
      durationSeconds: 104,
    });
    expect(parseGumletPlayerMessage(JSON.stringify({ type: "ready", duration: 105 }))).toEqual({
      durationSeconds: 105,
    });
    expect(parseGumletPlayerMessage({ event: "ready" })).toEqual({});
  });
});
