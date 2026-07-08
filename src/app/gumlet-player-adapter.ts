import type { PlaybackSpeed } from "./portal-types";

export const gumletPlayerOrigin = "https://play.gumlet.io";

type GumletCommand = Record<string, unknown>;

export type GumletPlayerMessage = {
  durationSeconds?: number;
};

function normalizeDuration(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.round(parsed);
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

function findDuration(data: unknown): number | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const record = data as Record<string, unknown>;
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
  return {
    durationSeconds: findDuration(parseMessageData(value)),
  };
}

export function buildGumletSpeedCommands(playbackSpeed: PlaybackSpeed): GumletCommand[] {
  return [
    { type: "setPlaybackRate", playbackRate: playbackSpeed },
    { method: "setPlaybackRate", value: playbackSpeed },
    { event: "command", func: "setPlaybackRate", args: [playbackSpeed] },
    { type: "setSpeed", speed: playbackSpeed },
    { method: "setSpeed", value: playbackSpeed },
  ];
}

export function buildGumletDurationCommands(): GumletCommand[] {
  return [
    { type: "getDuration" },
    { method: "getDuration" },
    { event: "command", func: "getDuration", args: [] },
  ];
}

export function buildGumletStartCommands(playbackSpeed: PlaybackSpeed): GumletCommand[] {
  return [
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

export function postGumletCommands(
  frame: HTMLIFrameElement | null,
  commands: GumletCommand[],
): void {
  const target = frame?.contentWindow;

  if (!target) {
    return;
  }

  for (const command of commands) {
    target.postMessage(command, gumletPlayerOrigin);
  }
}
