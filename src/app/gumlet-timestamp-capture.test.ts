import { afterEach, describe, expect, it, vi } from "vitest";
import { captureGumletTimestamp, parseGumletPlayerMessage } from "./gumlet-player-adapter";

describe("confirmed Gumlet timestamp capture", () => {
  afterEach(() => vi.useRealTimers());

  function setup() {
    vi.useFakeTimers();
    const events = new EventTarget();
    const postMessage = vi.fn();
    const source = { postMessage };
    const frame = { contentWindow: source } as unknown as HTMLIFrameElement;
    const host = Object.assign(events, {
      setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    }) as unknown as Window;
    const controller = new AbortController();
    const capture = () => captureGumletTimestamp(frame, controller.signal, host);
    const commands = () => postMessage.mock.calls.map(([data]) => JSON.parse(data) as Record<string, unknown>);
    const reply = (event: string, value: unknown, listener: unknown, overrides = {}) => {
      const message = new Event("message");
      Object.defineProperties(message, Object.fromEntries(Object.entries({
        origin: "https://play.gumlet.io", source,
        data: JSON.stringify({ context: "player.js", event, value, listener }),
        ...overrides,
      }).map(([key, entry]) => [key, { value: entry }])));
      events.dispatchEvent(message);
    };
    return { capture, commands, controller, reply };
  }

  it("waits for confirmed pause and the correlated fractional current time", async () => {
    const { capture, commands, reply } = setup();
    const pending = capture();
    expect(commands().map(({ method }) => method)).toEqual(["pause", "getPaused"]);
    const pauseId = commands().at(-1)!.listener;
    reply("getPaused", false, pauseId);
    await vi.advanceTimersByTimeAsync(50);
    expect(commands().at(-1)!.method).toBe("getPaused");
    reply("getPaused", true, pauseId);
    const timeId = commands().at(-1)!.listener;
    expect(commands().at(-1)!.method).toBe("getCurrentTime");
    reply("getCurrentTime", 84.625, timeId);
    await expect(pending).resolves.toBe(84.625);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores timeupdate, wrong session, wrong iframe, wrong origin, and invalid values", async () => {
    const { capture, commands, reply } = setup();
    const pending = capture();
    const pauseId = commands().at(-1)!.listener;
    reply("getPaused", true, pauseId, { source: {} });
    reply("getPaused", true, pauseId, { origin: "https://example.com" });
    expect(commands()).toHaveLength(2);
    reply("getPaused", true, pauseId);
    const timeId = commands().at(-1)!.listener;
    const resolved = vi.fn();
    void pending.then(resolved);
    reply("timeupdate", { seconds: 99 }, timeId);
    reply("getCurrentTime", 99, "old-session");
    reply("getCurrentTime", null, timeId);
    reply("getCurrentTime", -1, timeId);
    reply("getCurrentTime", "84", timeId);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    reply("getCurrentTime", 0, timeId);
    await expect(pending).resolves.toBe(0);
  });

  it("times out after two seconds and ignores a late reply in the next session", async () => {
    const { capture, commands, reply } = setup();
    const pending = capture();
    const oldId = commands().at(-1)!.listener;
    const failure = expect(pending).rejects.toThrow("timestamp");
    await vi.advanceTimersByTimeAsync(2000);
    await failure;
    const next = capture();
    const nextId = commands().at(-1)!.listener;
    expect(nextId).not.toBe(oldId);
    reply("getPaused", true, oldId);
    expect(commands().at(-1)!.method).toBe("getPaused");
    reply("getPaused", true, nextId);
    reply("getCurrentTime", 120.25, commands().at(-1)!.listener);
    await expect(next).resolves.toBe(120.25);
  });

  it("keeps capture replies out of ordinary playback and muted state", () => {
    expect(parseGumletPlayerMessage({ context: "player.js", event: "getPaused", listener: "feedback-capture-1-paused", value: true })).toEqual({});
    expect(parseGumletPlayerMessage({ context: "player.js", event: "getCurrentTime", listener: "feedback-capture-1-time", value: 42 })).toEqual({});
  });

  it("aborts immediately and releases the pending timer", async () => {
    const { capture, controller } = setup();
    const pending = capture();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
    await expect(capture()).rejects.toMatchObject({ name: "AbortError" });
  });
});
