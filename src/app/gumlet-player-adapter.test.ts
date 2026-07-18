import { describe, expect, it, vi } from "vitest";

import {
  buildGumletCurrentTimeCommands,
  buildGumletPauseCommands,
  buildGumletSeekCommands,
  buildGumletStartCommands,
  parseGumletPlayerMessage,
  postGumletCommands,
} from "./gumlet-player-adapter";

function parsePlayerJsCommands(commands: unknown[]): Array<Record<string, unknown>> {
  return commands
    .filter((command): command is string => typeof command === "string")
    .map((command) => JSON.parse(command) as Record<string, unknown>)
    .filter((command) => command.context === "player.js");
}

describe("gumlet player adapter", () => {
  it("builds confirmed player.js start commands plus legacy fallbacks", () => {
    const commands = buildGumletStartCommands(1.5);
    const playerJsCommands = parsePlayerJsCommands(commands);

    expect(playerJsCommands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "play" }),
        expect.objectContaining({ method: "unmute" }),
        expect.objectContaining({ method: "setVolume", value: 100 }),
        expect.objectContaining({ method: "setPlaybackRate", value: 1.5 }),
        expect.objectContaining({ method: "getDuration" }),
        expect.objectContaining({ method: "getPlaybackRate" }),
        expect.objectContaining({ method: "getMuted" }),
        expect.objectContaining({ method: "getVolume" }),
      ]),
    );
    expect(commands).toEqual(
      expect.arrayContaining([
        { event: "command", func: "play", args: [] },
        { event: "command", func: "setPlaybackRate", args: [1.5] },
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
      expect.stringContaining('"method":"setPlaybackRate"'),
      "https://play.gumlet.io",
    );
  });

  it("parses duration from confirmed player.js and fallback message shapes", () => {
    expect(
      parseGumletPlayerMessage(
        JSON.stringify({
          context: "player.js",
          event: "getDuration",
          value: 103.979,
          version: "3.0",
        }),
      ),
    ).toEqual({ durationSeconds: 104 });
    expect(parseGumletPlayerMessage({ event: "durationchange", duration: 103.4 })).toEqual({
      durationSeconds: 103,
    });
    expect(parseGumletPlayerMessage({ data: { duration: 104 } })).toEqual({
      durationSeconds: 104,
    });
    expect(parseGumletPlayerMessage(JSON.stringify({ type: "ready", duration: 105 }))).toEqual({
      durationSeconds: 105,
      isReady: true,
    });
    expect(parseGumletPlayerMessage({ event: "ready" })).toEqual({ isReady: true });
  });

  it("parses real player.js ready and playback confirmation events", () => {
    expect(
      parseGumletPlayerMessage(
        JSON.stringify({
          context: "player.js",
          event: "ready",
          value: {
            events: ["ready", "play", "playbackRateChange"],
            methods: ["play", "unmute", "setPlaybackRate", "getDuration"],
          },
          version: "3.0",
        }),
      ),
    ).toEqual({
      isReady: true,
      supportedEvents: ["ready", "play", "playbackRateChange"],
      supportedMethods: ["play", "unmute", "setPlaybackRate", "getDuration"],
    });
    expect(
      parseGumletPlayerMessage(
        JSON.stringify({
          context: "player.js",
          event: "playbackRateChange",
          value: { speed: 1.5 },
          version: "3.0",
        }),
      ),
    ).toEqual({ playbackRate: 1.5 });
    expect(
      parseGumletPlayerMessage(
        JSON.stringify({
          context: "player.js",
          event: "play",
          value: null,
          version: "3.0",
        }),
      ),
    ).toEqual({ playbackStarted: true });
    expect(
      parseGumletPlayerMessage(
        JSON.stringify({
          context: "player.js",
          event: "getMuted",
          value: false,
          version: "3.0",
        }),
      ),
    ).toEqual({ muted: false });
  });

  it("parses current time and builds review pause, time, and seek commands", () => {
    expect(
      parseGumletPlayerMessage({
        context: "player.js",
        event: "getCurrentTime",
        value: 42.25,
        version: "3.0",
      }),
    ).toEqual({ currentTimeSeconds: 42.25 });
    expect(
      parseGumletPlayerMessage({
        context: "player.js",
        event: "timeupdate",
        value: { seconds: 18.5 },
        version: "3.0",
      }),
    ).toEqual({ currentTimeSeconds: 18.5 });

    expect(parsePlayerJsCommands(buildGumletCurrentTimeCommands())).toEqual(
      expect.arrayContaining([expect.objectContaining({ method: "getCurrentTime" })]),
    );
    expect(parsePlayerJsCommands(buildGumletPauseCommands())).toEqual(
      expect.arrayContaining([expect.objectContaining({ method: "pause" })]),
    );
    expect(parsePlayerJsCommands(buildGumletSeekCommands(31.75))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "setCurrentTime", value: 31.75 }),
      ]),
    );
  });
});
