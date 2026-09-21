import type { PlaybackSpeed } from "./portal-types";

export const gumletPlayerOrigin = "https://play.gumlet.io";

type GumletCommand = Record<string, unknown> | string;

export type GumletPlayerMessage = {
  currentTimeSeconds?: number;
  durationSeconds?: number;
  error?: boolean;
  isReady?: boolean;
  muted?: boolean;
  playbackRate?: number;
  playbackStarted?: boolean;
  supportedEvents?: string[];
  supportedMethods?: string[];
  volume?: number;
};

const playerJsContext = "player.js";
const playerJsVersion = "3.0";

function normalizeDuration(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.round(parsed);
}

function normalizeCurrentTime(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

function parseMessageData(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter((item): item is string => typeof item === "string");

  return strings.length > 0 ? strings : undefined;
}

function normalizePlaybackRate(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function normalizeVolume(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

function compactMessage(message: GumletPlayerMessage): GumletPlayerMessage {
  return Object.fromEntries(
    Object.entries(message).filter(([, messageValue]) => messageValue !== undefined),
  ) as GumletPlayerMessage;
}

function findDuration(data: unknown): number | undefined {
  const record = getRecord(data);

  if (!record) {
    return undefined;
  }

  const directDuration = normalizeDuration(record.duration ?? record.durationSeconds);

  if (directDuration) {
    return directDuration;
  }

  return (
    findDuration(record.data) ??
    findDuration(record.info) ??
    findDuration(record.payload) ??
    findDuration(record.video)
  );
}

export function parseGumletPlayerMessage(value: unknown): GumletPlayerMessage {
  const data = parseMessageData(value);
  const record = getRecord(data);

  if (!record) {
    return {};
  }

  // Capture replies belong exclusively to their cancellable request. In particular,
  // getPaused must never be treated as a getMuted response or a live time update.
  if (typeof record.listener === "string" && record.listener.startsWith("feedback-capture-")) {
    return {};
  }

  const durationSeconds = findDuration(record);
  const eventName = typeof record.event === "string" ? record.event : "";
  const payload = record.value ?? record.data ?? record.payload;
  const payloadRecord = getRecord(payload);
  const isPlayerJsMessage = record.context === playerJsContext;
  const playbackRate = normalizePlaybackRate(
    eventName === "getPlaybackRate"
      ? payload
      : payloadRecord?.speed ?? payloadRecord?.playbackRate ?? record.playbackRate ?? record.speed,
  );
  const muted =
    typeof payload === "boolean"
      ? payload
      : typeof payloadRecord?.muted === "boolean"
        ? payloadRecord.muted
        : typeof record.muted === "boolean"
          ? record.muted
          : undefined;
  const volume = normalizeVolume(
    eventName === "getVolume" ? payload : payloadRecord?.volume ?? record.volume,
  );
  const currentTimeSeconds = normalizeCurrentTime(
    eventName === "getCurrentTime"
      ? payload
      : eventName === "timeupdate"
        ? payloadRecord?.seconds ?? payloadRecord?.currentTime ?? payload
        : payloadRecord?.currentTime ?? record.currentTime,
  );

  return compactMessage({
    currentTimeSeconds,
    durationSeconds:
      eventName === "getDuration" ? normalizeDuration(payload) ?? durationSeconds : durationSeconds,
    error: eventName === "error" ? true : undefined,
    isReady: eventName === "ready" || record.type === "ready" ? true : undefined,
    muted,
    playbackRate,
    playbackStarted: eventName === "play" || record.type === "play" ? true : undefined,
    supportedEvents:
      isPlayerJsMessage && payloadRecord ? normalizeStringArray(payloadRecord.events) : undefined,
    supportedMethods:
      isPlayerJsMessage && payloadRecord ? normalizeStringArray(payloadRecord.methods) : undefined,
    volume,
  });
}

export function buildGumletSpeedCommands(playbackSpeed: PlaybackSpeed): GumletCommand[] {
  return [
    buildPlayerJsCommand("setPlaybackRate", playbackSpeed, "set-playback-rate"),
    buildPlayerJsCommand("getPlaybackRate", undefined, "get-playback-rate"),
    { type: "setPlaybackRate", playbackRate: playbackSpeed },
    { method: "setPlaybackRate", value: playbackSpeed },
    { event: "command", func: "setPlaybackRate", args: [playbackSpeed] },
    { type: "setSpeed", speed: playbackSpeed },
    { method: "setSpeed", value: playbackSpeed },
  ];
}

export function buildGumletDurationCommands(): GumletCommand[] {
  return [
    buildPlayerJsCommand("getDuration", undefined, "get-duration"),
    { type: "getDuration" },
    { method: "getDuration" },
    { event: "command", func: "getDuration", args: [] },
  ];
}

export function buildGumletCurrentTimeCommands(): GumletCommand[] {
  return [
    buildPlayerJsCommand("getCurrentTime", undefined, "get-current-time"),
    { type: "getCurrentTime" },
    { method: "getCurrentTime" },
    { event: "command", func: "getCurrentTime", args: [] },
  ];
}

export function buildGumletPauseCommands(): GumletCommand[] {
  return [
    buildPlayerJsCommand("pause", undefined, "review-pause"),
    { type: "pause" },
    { method: "pause" },
    { event: "command", func: "pause", args: [] },
  ];
}

export function buildGumletSeekCommands(seconds: number): GumletCommand[] {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);

  return [
    buildPlayerJsCommand("setCurrentTime", safeSeconds, "review-seek"),
    { type: "setCurrentTime", currentTime: safeSeconds },
    { method: "setCurrentTime", value: safeSeconds },
    { event: "command", func: "setCurrentTime", args: [safeSeconds] },
  ];
}

export function buildGumletSubscriptionCommands(): GumletCommand[] {
  return [
    buildPlayerJsCommand("addEventListener", "play", "listen-play"),
    buildPlayerJsCommand("addEventListener", "playbackRateChange", "listen-playback-rate"),
    buildPlayerJsCommand("addEventListener", "volumeChange", "listen-volume"),
    buildPlayerJsCommand("addEventListener", "error", "listen-error"),
    buildPlayerJsCommand("addEventListener", "timeupdate", "listen-time-update"),
  ];
}

export function buildGumletStartCommands(playbackSpeed: PlaybackSpeed): GumletCommand[] {
  return [
    ...buildGumletSubscriptionCommands(),
    ...buildGumletDurationCommands(),
    buildPlayerJsCommand("setPlaybackRate", playbackSpeed, "start-set-playback-rate"),
    buildPlayerJsCommand("unmute", undefined, "start-unmute"),
    buildPlayerJsCommand("setVolume", 100, "start-set-volume"),
    buildPlayerJsCommand("play", undefined, "start-play"),
    buildPlayerJsCommand("getPlaybackRate", undefined, "start-get-playback-rate"),
    buildPlayerJsCommand("getMuted", undefined, "start-get-muted"),
    buildPlayerJsCommand("getVolume", undefined, "start-get-volume"),
    { type: "unmute", muted: false },
    { method: "unMute" },
    { event: "command", func: "unMute", args: [] },
    { type: "setMuted", muted: false },
    { method: "setMuted", value: false },
    { event: "command", func: "setMuted", args: [false] },
    { type: "setVolume", volume: 1 },
    { method: "setVolume", value: 1 },
    { event: "command", func: "setVolume", args: [1] },
    ...buildGumletSpeedCommands(playbackSpeed),
    { type: "play" },
    { method: "play" },
    { event: "command", func: "play", args: [] },
    ...buildGumletDurationCommands(),
  ];
}

export function buildGumletReviewVerificationCommands(
  playbackSpeed: PlaybackSpeed,
): GumletCommand[] {
  return [
    buildPlayerJsCommand("setPlaybackRate", playbackSpeed, "verify-set-playback-rate"),
    buildPlayerJsCommand("unmute", undefined, "verify-unmute"),
    buildPlayerJsCommand("setVolume", 100, "verify-set-volume"),
    buildPlayerJsCommand("getPlaybackRate", undefined, "verify-get-playback-rate"),
    buildPlayerJsCommand("getMuted", undefined, "verify-get-muted"),
    buildPlayerJsCommand("getVolume", undefined, "verify-get-volume"),
    ...buildGumletDurationCommands(),
  ];
}

function buildPlayerJsCommand(
  method: string,
  value?: unknown,
  listener?: string,
): string {
  return JSON.stringify({
    context: playerJsContext,
    ...(listener ? { listener } : {}),
    method,
    ...(value === undefined ? {} : { value }),
    version: playerJsVersion,
  });
}

export function postGumletCommands(
  frame: HTMLIFrameElement | null,
  commands: GumletCommand[],
): void {
  const target = frame?.contentWindow;

  if (!target) {
    return;
  }

  for (const command of commands) {
    // Gumlet's current embed includes a confirmed player.js v3 receiver that accepts
    // JSON-string commands. Object-shaped commands are posted too as legacy fallback.
    target.postMessage(command, gumletPlayerOrigin);
  }
}

let timestampCaptureSequence = 0;

/** Pause and capture one confirmed time; unsolicited playback events never settle this request. */
export function captureGumletTimestamp(
  frame: HTMLIFrameElement | null,
  signal: AbortSignal,
  host: Window = window,
): Promise<number> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Timestamp capture cancelled", "AbortError"));
  }
  const target = frame?.contentWindow;
  if (!target) {
    return Promise.reject(new Error("Could not confirm timestamp"));
  }
  const requestId = `feedback-capture-${++timestampCaptureSequence}`;
  const pauseId = `${requestId}-paused`;
  const timeId = `${requestId}-time`;

  return new Promise<number>((resolve, reject) => {
    let waitingForTime = false;
    let pollTimer: number | undefined;
    const timeout = host.setTimeout(() => fail(new Error("Could not confirm timestamp")), 2000);

    function cleanup(): void {
      host.clearTimeout(timeout);
      host.clearTimeout(pollTimer);
      host.removeEventListener("message", receive);
      signal.removeEventListener("abort", abort);
    }
    function fail(error: Error): void {
      cleanup();
      reject(error);
    }
    function abort(): void {
      fail(new DOMException("Timestamp capture cancelled", "AbortError"));
    }
    function askPaused(): void {
      target!.postMessage(buildPlayerJsCommand("getPaused", undefined, pauseId), gumletPlayerOrigin);
    }
    function receive(event: MessageEvent): void {
      if (event.origin !== gumletPlayerOrigin || event.source !== target) {
        return;
      }
      const reply = getRecord(parseMessageData(event.data));
      if (reply?.context !== playerJsContext) {
        return;
      }
      if (!waitingForTime && reply.event === "getPaused" && reply.listener === pauseId) {
        if (reply.value === true) {
          waitingForTime = true;
          host.clearTimeout(pollTimer);
          target!.postMessage(buildPlayerJsCommand("getCurrentTime", undefined, timeId), gumletPlayerOrigin);
        } else if (reply.value === false) {
          host.clearTimeout(pollTimer);
          pollTimer = host.setTimeout(askPaused, 50);
        }
      } else if (
        waitingForTime && reply.event === "getCurrentTime" && reply.listener === timeId &&
        typeof reply.value === "number" && Number.isFinite(reply.value) && reply.value >= 0
      ) {
        cleanup();
        resolve(reply.value);
      }
    }
    host.addEventListener("message", receive);
    signal.addEventListener("abort", abort, { once: true });
    try {
      target.postMessage(buildPlayerJsCommand("pause"), gumletPlayerOrigin);
      askPaused();
    } catch {
      fail(new Error("Could not confirm timestamp"));
    }
  });
}
