import * as React from "react";
import { Clock3, Gauge, Play } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
} from "@/toolcraft/ui";

import { GumletPlayer, type GumletPlayerHandle } from "./gumlet-player";
import { getPortalApiErrorMessage, portalApi, type PublicShareResponse } from "./portal-api";
import { loadPortalData, savePortalData, updateVideo } from "./portal-store";
import type { PortalProject, PortalVideo, VideoShareSnapshot } from "./portal-types";
import { SharePasscodeGate } from "./share-passcode-gate";
import {
  calculatePlaybackSavings,
  decodeShareVideoSnapshot,
  formatDuration,
  formatSavedTime,
} from "./portal-utils";
import type { GumletPlayerMessage } from "./gumlet-player-adapter";

type VideoSharePortalProps = {
  encodedData?: string;
  slug: string;
};

type GumletPlaybackAttempt = {
  active: boolean;
  playbackStarted: boolean;
  speedConfirmed: boolean;
  unmutedConfirmed: boolean;
  volumeConfirmed: boolean;
};

const durationDetectionTimeoutMs = 6000;
const gumletPlaybackFallbackTimeoutMs = 4500;
const durationFallbackMessage =
  "Duration not detected yet. Add duration in the video settings to show time saved.";

function getSlugSuffix(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-/g, "")
      .slice(-8) || value.slice(-8)
  );
}

function loadVideoSnapshot(slug: string, encodedData?: string): VideoShareSnapshot | null {
  const decoded = encodedData ? decodeShareVideoSnapshot(encodedData) : null;

  if (decoded) {
    return decoded;
  }

  for (const project of loadPortalData().projects) {
    const video = project.videos.find((candidate) => slug.includes(getSlugSuffix(candidate.id)));

    if (video) {
      return {
        project: {
          clientName: project.clientName,
          id: project.id,
          name: project.name,
          shareSlug: project.shareSlug,
        },
        video,
      };
    }
  }

  return null;
}

function getVideoShareProject(project: PortalProject): VideoShareSnapshot["project"] {
  return {
    clientName: project.clientName,
    id: project.id,
    name: project.name,
    shareSlug: project.shareSlug,
  };
}

function getSnapshotFromPublicResponse(response: PublicShareResponse): VideoShareSnapshot | null {
  if ("requiresPasscode" in response && response.requiresPasscode) {
    return null;
  }

  if (response.kind === "video" && "snapshot" in response) {
    return response.snapshot;
  }

  if (response.kind === "share" && "project" in response) {
    const video = [...response.project.videos].sort(
      (left, right) => left.orderIndex - right.orderIndex,
    )[0];

    return video
      ? {
          project: getVideoShareProject(response.project),
          video,
        }
      : null;
  }

  return null;
}

function getDurationMeta(video: PortalVideo, durationSeconds: number | undefined): string {
  const pieces = [
    durationSeconds ? `${formatDuration(durationSeconds)} video` : null,
    `${video.recommendedPlaybackSpeed}x playback`,
  ].filter(Boolean);

  return pieces.join(" - ");
}

function getRoundedMetadataDuration(player: HTMLVideoElement | null): number | undefined {
  if (!player || !Number.isFinite(player.duration) || player.duration <= 0) {
    return undefined;
  }

  return Math.round(player.duration);
}

function persistResolvedDuration(
  projectId: string,
  videoId: string,
  durationSeconds: number,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const storedData = loadPortalData();
  const storedVideo = storedData.projects
    .find((project) => project.id === projectId)
    ?.videos.find((video) => video.id === videoId);

  if (!storedVideo || storedVideo.durationSeconds === durationSeconds) {
    return;
  }

  savePortalData(updateVideo(storedData, projectId, videoId, { durationSeconds }));
}

function getGumletPlaybackFallbackMessage(playbackSpeed: number): string {
  return `Playback was requested at ${playbackSpeed}x. If Gumlet still shows 1x or muted audio, use the player controls.`;
}

export function VideoSharePortal({
  encodedData,
  slug,
}: VideoSharePortalProps): React.JSX.Element {
  const [snapshot, setSnapshot] = React.useState<VideoShareSnapshot | null>(() =>
    loadVideoSnapshot(slug, encodedData),
  );
  const [tokenStatus, setTokenStatus] = React.useState<
    "error" | "idle" | "loading" | "passcode"
  >(() => (snapshot || encodedData ? "idle" : "loading"));
  const [tokenError, setTokenError] = React.useState("");
  const [passcodeDraft, setPasscodeDraft] = React.useState("");
  const [passcodeLoading, setPasscodeLoading] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  const [gumletStartPending, setGumletStartPending] = React.useState(false);
  const [gumletPlaybackStatus, setGumletPlaybackStatus] = React.useState("");
  const [durationDetectionTimedOut, setDurationDetectionTimedOut] = React.useState(false);
  const [metadataDurationSeconds, setMetadataDurationSeconds] = React.useState<
    number | undefined
  >();
  const gumletPlayerRef = React.useRef<GumletPlayerHandle | null>(null);
  const gumletAttemptRef = React.useRef<GumletPlaybackAttempt>({
    active: false,
    playbackStarted: false,
    speedConfirmed: false,
    unmutedConfirmed: false,
    volumeConfirmed: false,
  });
  const gumletFallbackTimeoutRef = React.useRef<number | null>(null);
  const nativeVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const video = snapshot?.video ?? null;
  const project = snapshot?.project ?? null;
  const effectiveDurationSeconds = video?.durationSeconds ?? metadataDurationSeconds;
  const playbackSavings = video
    ? calculatePlaybackSavings(effectiveDurationSeconds, video.recommendedPlaybackSpeed)
    : null;
  const savedTimeLabel =
    playbackSavings && playbackSavings.savedSeconds > 0
      ? `Save about ${formatSavedTime(playbackSavings.savedSeconds)}`
      : null;
  const watchTimeLabel = playbackSavings
    ? `Watch in about ${formatDuration(playbackSavings.fasterSeconds)}`
    : null;
  const durationButtonMeta = durationDetectionTimedOut ? durationFallbackMessage : "Loading duration";

  React.useEffect(() => {
    const legacySnapshot = loadVideoSnapshot(slug, encodedData);

    if (legacySnapshot) {
      setSnapshot(legacySnapshot);
      setTokenStatus("idle");
      setTokenError("");
      return undefined;
    }

    if (encodedData) {
      return undefined;
    }

    let cancelled = false;

    setTokenStatus("loading");
    setTokenError("");

    void portalApi
      .getPublicShare(slug)
      .then((response) => {
        if (cancelled) {
          return;
        }

        if ("requiresPasscode" in response && response.requiresPasscode) {
          setTokenStatus("passcode");
          return;
        }

        const nextSnapshot = getSnapshotFromPublicResponse(response);

        if (!nextSnapshot) {
          setTokenStatus("error");
          setTokenError("This share token did not include a video.");
          return;
        }

        setSnapshot(nextSnapshot);
        setTokenStatus("idle");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setTokenStatus("error");
        setTokenError(getPortalApiErrorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, [encodedData, slug]);

  const clearGumletFallbackTimer = React.useCallback(() => {
    if (gumletFallbackTimeoutRef.current !== null) {
      window.clearTimeout(gumletFallbackTimeoutRef.current);
      gumletFallbackTimeoutRef.current = null;
    }
  }, []);

  const handleResolvedDuration = React.useCallback(
    (durationSeconds: number) => {
      if (!video || !project) {
        return;
      }

      setMetadataDurationSeconds(durationSeconds);
      setSnapshot((current) => {
        if (!current || current.video.id !== video.id) {
          return current;
        }

        if (current.video.durationSeconds === durationSeconds) {
          return current;
        }

        return {
          ...current,
          video: {
            ...current.video,
            durationSeconds,
          },
        };
      });
      persistResolvedDuration(project.id, video.id, durationSeconds);
    },
    [project, video],
  );

  React.useEffect(() => {
    setStarted(false);
    setGumletStartPending(false);
    setGumletPlaybackStatus("");
    setMetadataDurationSeconds(undefined);
    setDurationDetectionTimedOut(false);
    gumletAttemptRef.current = {
      active: false,
      playbackStarted: false,
      speedConfirmed: false,
      unmutedConfirmed: false,
      volumeConfirmed: false,
    };
    clearGumletFallbackTimer();
  }, [clearGumletFallbackTimer, video?.assetId, video?.directVideoUrl, video?.id]);

  React.useEffect(() => {
    if (!video || effectiveDurationSeconds) {
      setDurationDetectionTimedOut(false);
      return undefined;
    }

    setDurationDetectionTimedOut(false);

    const timeout = window.setTimeout(() => {
      setDurationDetectionTimedOut(true);
    }, durationDetectionTimeoutMs);

    return () => window.clearTimeout(timeout);
  }, [effectiveDurationSeconds, video]);

  React.useEffect(() => () => clearGumletFallbackTimer(), [clearGumletFallbackTimer]);

  const applyNativePlaybackSettings = React.useCallback((options?: { audible?: boolean }) => {
    const player = nativeVideoRef.current;

    if (!player || !video) {
      return;
    }

    player.defaultPlaybackRate = video.recommendedPlaybackSpeed;
    player.playbackRate = video.recommendedPlaybackSpeed;

    if (options?.audible) {
      player.defaultMuted = false;
      player.muted = false;
      player.volume = 1;
    }

    if (video.startTimeSeconds && player.currentTime < video.startTimeSeconds) {
      try {
        player.currentTime = video.startTimeSeconds;
      } catch {
        // Some browsers reject seeking before metadata is ready; loadedmetadata retries this.
      }
    }
  }, [video]);

  React.useEffect(() => {
    applyNativePlaybackSettings();
  }, [applyNativePlaybackSettings]);

  function handleNativeMetadata(): void {
    applyNativePlaybackSettings();

    const durationSeconds = getRoundedMetadataDuration(nativeVideoRef.current);

    if (durationSeconds) {
      handleResolvedDuration(durationSeconds);
    }
  }

  function handleGumletPlaybackEvent(message: GumletPlayerMessage): void {
    if (!video || video.directVideoUrl) {
      return;
    }

    const wasActiveAttempt = gumletAttemptRef.current.active;
    const nextAttempt = {
      ...gumletAttemptRef.current,
      playbackStarted:
        gumletAttemptRef.current.playbackStarted || message.playbackStarted === true,
      speedConfirmed:
        gumletAttemptRef.current.speedConfirmed ||
        (message.playbackRate !== undefined &&
          Math.abs(message.playbackRate - video.recommendedPlaybackSpeed) < 0.01),
      unmutedConfirmed:
        gumletAttemptRef.current.unmutedConfirmed || message.muted === false,
      volumeConfirmed:
        gumletAttemptRef.current.volumeConfirmed ||
        (message.volume !== undefined && message.volume > 0),
    };

    gumletAttemptRef.current = nextAttempt;

    if (
      !wasActiveAttempt &&
      nextAttempt.playbackStarted &&
      nextAttempt.speedConfirmed &&
      (nextAttempt.unmutedConfirmed || nextAttempt.volumeConfirmed)
    ) {
      setGumletPlaybackStatus(
        `Playback confirmed at ${video.recommendedPlaybackSpeed}x with sound on.`,
      );
      return;
    }

    if (!wasActiveAttempt) {
      return;
    }

    if (nextAttempt.playbackStarted && nextAttempt.speedConfirmed) {
      gumletAttemptRef.current = {
        ...nextAttempt,
        active: false,
      };
      clearGumletFallbackTimer();
      setStarted(true);
      setGumletStartPending(false);
      setGumletPlaybackStatus(
        nextAttempt.unmutedConfirmed || nextAttempt.volumeConfirmed
          ? `Playback confirmed at ${video.recommendedPlaybackSpeed}x with sound on.`
          : `Playback confirmed at ${video.recommendedPlaybackSpeed}x. Sound was requested at full volume.`,
      );
    }
  }

  function handleStart(): void {
    const player = nativeVideoRef.current;

    setGumletPlaybackStatus("");

    if (!video?.directVideoUrl) {
      if (!video) {
        return;
      }

      clearGumletFallbackTimer();
      setGumletStartPending(true);
      setGumletPlaybackStatus(
        `Attempting to start playback at ${video.recommendedPlaybackSpeed}x with sound.`,
      );
      gumletAttemptRef.current = {
        active: true,
        playbackStarted: false,
        speedConfirmed: false,
        unmutedConfirmed: false,
        volumeConfirmed: false,
      };
      gumletPlayerRef.current?.startReview();
      gumletFallbackTimeoutRef.current = window.setTimeout(() => {
        if (!gumletAttemptRef.current.active) {
          return;
        }

        gumletAttemptRef.current = {
          ...gumletAttemptRef.current,
          active: false,
        };
        setGumletStartPending(false);
        setGumletPlaybackStatus(
          getGumletPlaybackFallbackMessage(video.recommendedPlaybackSpeed),
        );
      }, gumletPlaybackFallbackTimeoutMs);
      return;
    }

    setStarted(true);
    applyNativePlaybackSettings({ audible: true });
    void player?.play().then(
      () => applyNativePlaybackSettings({ audible: true }),
      () => {
        applyNativePlaybackSettings({ audible: true });
        setStarted(false);
      },
    );
  }

  async function handleSubmitPasscode(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPasscodeLoading(true);
    setTokenError("");

    try {
      const response = await portalApi.unlockPublicShare(slug, passcodeDraft);
      const nextSnapshot = getSnapshotFromPublicResponse(response);

      if (!nextSnapshot) {
        setTokenStatus("passcode");
        setTokenError("This passcode did not unlock a video.");
        return;
      }

      setSnapshot(nextSnapshot);
      setTokenStatus("idle");
      setPasscodeDraft("");
    } catch (error) {
      setTokenError(getPortalApiErrorMessage(error));
    } finally {
      setPasscodeLoading(false);
    }
  }

  if (tokenStatus === "loading") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[color:var(--background)] px-4 text-[color:var(--foreground)]">
        <Card className="max-w-md text-center">
          <CardHeader>
            <CardTitle aria-level={1} className="text-2xl" role="heading">
              Loading video link
            </CardTitle>
            <CardDescription className="text-sm leading-6">
              Checking this secure video token.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (tokenStatus === "passcode") {
    return (
      <SharePasscodeGate
        description="Enter the passcode provided with this video link."
        error={tokenError}
        loading={passcodeLoading}
        onPasscodeChange={setPasscodeDraft}
        onSubmit={(event) => void handleSubmitPasscode(event)}
        passcode={passcodeDraft}
        title="Protected video"
      />
    );
  }

  if (!video || !project) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[color:var(--background)] px-4 text-[color:var(--foreground)]">
        <Card className="max-w-md text-center">
          <CardHeader>
            <CardTitle aria-level={1} className="text-2xl" role="heading">
              Video link not found
            </CardTitle>
            <CardDescription className="text-sm leading-6">
              {tokenError ||
                "This link does not include a video snapshot, and no local video matches this slug."}
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[color:var(--background)] text-[color:var(--foreground)]">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-5 px-4 py-5 lg:px-6">
        <Card>
          <CardHeader>
            <Badge className="w-fit" variant="emphasisOutline">
              {project.clientName || "Client review"}
            </Badge>
            <CardTitle aria-level={1} className="text-3xl font-semibold" role="heading">
              {video.title}
            </CardTitle>
            <CardDescription className="text-sm leading-6">
              {project.name} - {getDurationMeta(video, effectiveDurationSeconds)}
            </CardDescription>
          </CardHeader>
        </Card>

        <section className="relative min-w-0 overflow-hidden rounded-lg border border-white/10 bg-black shadow-2xl shadow-black/30">
          {video.directVideoUrl ? (
            <video
              ref={nativeVideoRef}
              className="aspect-video w-full bg-black"
              controls
              onLoadedMetadata={handleNativeMetadata}
              onPlay={() => applyNativePlaybackSettings({ audible: true })}
              poster={video.thumbnailUrl}
              playsInline
              preload="metadata"
              src={video.directVideoUrl}
              title={`${video.title} video`}
            />
          ) : (
            <GumletPlayer
              ref={gumletPlayerRef}
              onDuration={handleResolvedDuration}
              onPlaybackEvent={handleGumletPlaybackEvent}
              video={video}
            />
          )}

          {!started ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 px-4">
              <Card className="w-full max-w-sm border-sky-400/50 bg-black/80 text-center backdrop-blur">
                <CardHeader className="items-center">
                  <Badge className="gap-2" variant="secondary">
                    <Gauge className="size-4" />
                    {video.recommendedPlaybackSpeed}x review
                  </Badge>
                  <CardTitle className="text-xl">Start faster review</CardTitle>
                  <CardDescription className="space-y-2 text-sm">
                    {watchTimeLabel ? (
                      <span className="flex items-center justify-center gap-2">
                        <Clock3 className="size-4" />
                        {watchTimeLabel}
                      </span>
                    ) : null}
                    {savedTimeLabel ? <span className="block">{savedTimeLabel}</span> : null}
                    {!playbackSavings && durationDetectionTimedOut ? (
                      <span className="block">{durationFallbackMessage}</span>
                    ) : null}
                    {gumletStartPending ? (
                      <span className="block">
                        Attempting to start playback at {video.recommendedPlaybackSpeed}x.
                      </span>
                    ) : null}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" onClick={handleStart} size="xl" type="button">
                    <Play />
                    <span className="flex min-w-0 flex-col items-start gap-1 text-left">
                      <span>
                        {gumletStartPending ? "Starting" : "Start"}{" "}
                        {video.recommendedPlaybackSpeed}x review
                      </span>
                      {playbackSavings && playbackSavings.savedSeconds > 0 ? (
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium">
                          <del className="text-white/70">
                            {formatDuration(playbackSavings.originalSeconds)}
                          </del>
                          <span>{formatDuration(playbackSavings.fasterSeconds)}</span>
                          <span>saves {formatSavedTime(playbackSavings.savedSeconds)}</span>
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-white/70">
                          {durationButtonMeta}
                        </span>
                      )}
                    </span>
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </section>

        {gumletPlaybackStatus ? (
          <Badge className="w-fit gap-2 px-3 py-2 text-sm" variant="secondary">
            <Gauge className="size-4" />
            {gumletPlaybackStatus}
          </Badge>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Review details</CardTitle>
            <CardDescription className="text-sm">
              {getDurationMeta(video, effectiveDurationSeconds)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-[color:var(--muted-foreground)]">
            <Separator />
            <p>{video.description || "No description added."}</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
