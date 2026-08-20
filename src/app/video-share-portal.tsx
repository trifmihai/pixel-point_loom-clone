import * as React from "react";
import { Clock3, ExternalLink, Gauge, Play } from "lucide-react";

import {
  Badge,
  Button,
  buttonVariants,
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
import type {
  PlaybackSpeed,
  PortalProject,
  PortalVideo,
  VideoShareSnapshot,
} from "./portal-types";
import {
  PlaybackSpeedControl,
  PortalBrand,
  PortalPageHeader,
  PortalStateCard,
  PortalStatus,
  TimeSavingsSummary,
} from "./portal-ui";
import { SharePasscodeGate } from "./share-passcode-gate";
import { VideoFeedbackReview } from "./video-feedback-review";
import {
  calculatePlaybackSavings,
  decodeShareVideoSnapshot,
  formatDuration,
  formatSavedTime,
} from "./portal-utils";
import type { GumletPlayerMessage } from "./gumlet-player-adapter";
import { useFirstViewTracking } from "./first-view-tracking";

type VideoSharePortalProps = {
  directCommentId?: string;
  encodedData?: string;
  presentation?: "embed" | "review";
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

function getSnapshotFromPublicResponse(
  response: PublicShareResponse,
  options: { allowProjectFallback: boolean },
): VideoShareSnapshot | null {
  if ("requiresPasscode" in response && response.requiresPasscode) {
    return null;
  }

  if (response.kind === "video" && "snapshot" in response) {
    return response.snapshot;
  }

  if (options.allowProjectFallback && response.kind === "share" && "project" in response) {
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

function getDurationMeta(
  video: PortalVideo,
  durationSeconds: number | undefined,
  playbackSpeed: PlaybackSpeed,
): string {
  const pieces = [
    durationSeconds ? `${formatDuration(durationSeconds)} video` : null,
    `${playbackSpeed}x playback`,
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
  directCommentId,
  encodedData,
  presentation = "review",
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
  const [feedbackPasscode, setFeedbackPasscode] = React.useState<string | undefined>();
  const [cloudTokenResolved, setCloudTokenResolved] = React.useState(false);
  const [passcodeLoading, setPasscodeLoading] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  const [gumletStartPending, setGumletStartPending] = React.useState(false);
  const [gumletPlaybackStatus, setGumletPlaybackStatus] = React.useState("");
  const [durationDetectionTimedOut, setDurationDetectionTimedOut] = React.useState(false);
  const [metadataDurationSeconds, setMetadataDurationSeconds] = React.useState<
    number | undefined
  >();
  const [viewerSpeed, setViewerSpeed] = React.useState<PlaybackSpeed>(
    () => snapshot?.video.recommendedPlaybackSpeed ?? 1.5,
  );
  const [reviewTimestampSeconds, setReviewTimestampSeconds] = React.useState(0);
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
  const isEmbed = presentation === "embed";
  const recordFirstView = useFirstViewTracking({
    enabled: cloudTokenResolved,
    passcode: feedbackPasscode,
    token: slug,
    videoId: video?.id,
  });
  const playbackVideo = video
    ? {
        ...video,
        recommendedPlaybackSpeed: viewerSpeed,
      }
    : null;
  const effectiveDurationSeconds = video?.durationSeconds ?? metadataDurationSeconds;
  const playbackSavings = video
    ? calculatePlaybackSavings(effectiveDurationSeconds, viewerSpeed)
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
      setCloudTokenResolved(false);
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

        const nextSnapshot = getSnapshotFromPublicResponse(response, {
          allowProjectFallback: !isEmbed,
        });

        if (!nextSnapshot) {
          setTokenStatus("error");
          setTokenError("This share token did not include a video.");
          return;
        }

        setSnapshot(nextSnapshot);
        setCloudTokenResolved(true);
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
  }, [encodedData, isEmbed, slug]);

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
    setReviewTimestampSeconds(video?.startTimeSeconds ?? 0);
    gumletAttemptRef.current = {
      active: false,
      playbackStarted: false,
      speedConfirmed: false,
      unmutedConfirmed: false,
      volumeConfirmed: false,
    };
    clearGumletFallbackTimer();
    setViewerSpeed(video?.recommendedPlaybackSpeed ?? 1.5);
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

    player.defaultPlaybackRate = viewerSpeed;
    player.playbackRate = viewerSpeed;

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
  }, [video, viewerSpeed]);

  React.useEffect(() => {
    applyNativePlaybackSettings();
  }, [applyNativePlaybackSettings]);

  function handleNativeMetadata(): void {
    applyNativePlaybackSettings();

    setReviewTimestampSeconds(nativeVideoRef.current?.currentTime ?? 0);

    const durationSeconds = getRoundedMetadataDuration(nativeVideoRef.current);

    if (durationSeconds) {
      handleResolvedDuration(durationSeconds);
    }
  }

  function handleReviewPause(): void {
    const nativePlayer = nativeVideoRef.current;

    if (nativePlayer) {
      nativePlayer.pause();
      setReviewTimestampSeconds(nativePlayer.currentTime);
      return;
    }

    gumletPlayerRef.current?.pause();
    gumletPlayerRef.current?.requestCurrentTime();
  }

  function handleReviewRequestCurrentTime(): void {
    const nativePlayer = nativeVideoRef.current;

    if (nativePlayer) {
      setReviewTimestampSeconds(nativePlayer.currentTime);
      return;
    }

    gumletPlayerRef.current?.requestCurrentTime();
  }

  function handleReviewSeek(seconds: number): void {
    const safeSeconds = Math.max(0, seconds);
    const nativePlayer = nativeVideoRef.current;

    setReviewTimestampSeconds(safeSeconds);

    if (nativePlayer) {
      try {
        nativePlayer.currentTime = safeSeconds;
      } catch {
        // Metadata may still be loading; the selected feedback remains highlighted.
      }
      nativePlayer.pause();
      return;
    }

    gumletPlayerRef.current?.seekTo(safeSeconds);
    gumletPlayerRef.current?.pause();
  }

  function handleGumletPlaybackEvent(message: GumletPlayerMessage): void {
    if (!video || video.directVideoUrl) {
      return;
    }

    if (message.playbackStarted) {
      recordFirstView();
    }

    const wasActiveAttempt = gumletAttemptRef.current.active;
    const nextAttempt = {
      ...gumletAttemptRef.current,
      playbackStarted:
        gumletAttemptRef.current.playbackStarted || message.playbackStarted === true,
      speedConfirmed:
        gumletAttemptRef.current.speedConfirmed ||
        (message.playbackRate !== undefined &&
          Math.abs(message.playbackRate - viewerSpeed) < 0.01),
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
        `Playback confirmed at ${viewerSpeed}x with sound on.`,
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
          ? `Playback confirmed at ${viewerSpeed}x with sound on.`
          : `Playback confirmed at ${viewerSpeed}x. Sound was requested at full volume.`,
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
        `Attempting to start playback at ${viewerSpeed}x with sound.`,
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
        getGumletPlaybackFallbackMessage(viewerSpeed),
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
      const nextSnapshot = getSnapshotFromPublicResponse(response, {
        allowProjectFallback: !isEmbed,
      });

      if (!nextSnapshot) {
        setTokenStatus("passcode");
        setTokenError("This passcode did not unlock a video.");
        return;
      }

      setSnapshot(nextSnapshot);
      setCloudTokenResolved(true);
      setFeedbackPasscode(passcodeDraft);
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
      <main className="portal-shell flex items-center justify-center px-4 py-8">
        <PortalStateCard
          description="Checking this secure video token."
          loading
          title="Loading video…"
        />
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
      <main className="portal-shell flex items-center justify-center px-4 py-8">
        <PortalStateCard
          description={
            tokenError ||
            "The link may have expired, been mistyped, or no longer point to a shared video. Ask the sender for the current link."
          }
          title="This video link is not available"
          tone="error"
        />
      </main>
    );
  }

  const videoPlayer = video.directVideoUrl ? (
    <video
      ref={nativeVideoRef}
      className="aspect-video w-full bg-black"
      controls
      onLoadedMetadata={handleNativeMetadata}
      onPlay={() => {
        applyNativePlaybackSettings({ audible: true });
        recordFirstView();
      }}
      onTimeUpdate={(event) => setReviewTimestampSeconds(event.currentTarget.currentTime)}
      poster={video.thumbnailUrl}
      playsInline
      preload="metadata"
      src={video.directVideoUrl}
      title={`${video.title} video`}
    />
  ) : playbackVideo ? (
    <GumletPlayer
      ref={gumletPlayerRef}
      onCurrentTime={setReviewTimestampSeconds}
      onDuration={handleResolvedDuration}
      onPlaybackEvent={handleGumletPlaybackEvent}
      video={playbackVideo}
    />
  ) : null;

  if (isEmbed) {
    const reviewSearch = encodedData
      ? `?${new URLSearchParams({ data: encodedData }).toString()}`
      : "";
    const reviewPath = `/video/${encodeURIComponent(slug)}${reviewSearch}`;

    return (
      <main
        className="flex min-h-dvh items-center bg-[color:var(--portal-bg)] p-2 text-white sm:p-3"
        data-testid="notion-video-embed"
      >
        <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-xl border border-[color:var(--portal-border-strong)] bg-[color:var(--portal-surface-1)] shadow-2xl shadow-black/30">
          <header className="flex min-w-0 items-start justify-between gap-3 border-b border-[color:var(--portal-border)] px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-[color:var(--muted-foreground)]">
                {project.name}
              </p>
              <h1 className="truncate text-sm font-semibold text-white sm:text-base">
                {video.title}
              </h1>
            </div>
            <a
              className={buttonVariants({ size: "sm", variant: "ghost" })}
              href={reviewPath}
              target="_blank"
            >
              <ExternalLink aria-hidden="true" />
              <span className="hidden sm:inline">Open full review</span>
              <span className="sr-only sm:hidden">Open full review</span>
            </a>
          </header>

          <div className="relative bg-black">
            <section
              className="min-w-0 overflow-hidden bg-black"
              data-testid="video-player-frame"
            >
              {videoPlayer}
            </section>

            {!started ? (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/55 p-3"
                data-testid="review-start-panel"
              >
                <div className="w-full max-w-sm rounded-xl border border-blue-300/30 bg-[color:color-mix(in_oklab,var(--portal-surface-1)_90%,transparent)] p-3 text-center shadow-2xl backdrop-blur-md sm:p-4">
                  <div className="flex flex-col items-center gap-2.5">
                    <Badge className="gap-2" variant="secondary">
                      <Gauge aria-hidden="true" className="size-4" />
                      Recommended {viewerSpeed}x
                    </Badge>
                    <div className="space-y-1 text-xs text-[color:var(--muted-foreground)] sm:text-sm">
                      {watchTimeLabel ? (
                        <span className="flex items-center justify-center gap-2">
                          <Clock3 aria-hidden="true" className="size-4" />
                          {watchTimeLabel}
                        </span>
                      ) : null}
                      {savedTimeLabel ? <span className="block">{savedTimeLabel}</span> : null}
                      {!playbackSavings && durationDetectionTimedOut ? (
                        <span className="block">{durationFallbackMessage}</span>
                      ) : null}
                    </div>
                    <Button className="min-h-10 w-full" onClick={handleStart} size="lg" type="button">
                      <Play />
                      <span>
                        {gumletStartPending ? "Starting" : "Start"} {viewerSpeed}x review
                      </span>
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <footer className="flex min-h-9 items-center justify-between gap-3 px-3 py-2 text-xs text-[color:var(--muted-foreground)] sm:px-4">
            <span>{project.clientName || "Client review"}</span>
            <PortalStatus
              message={gumletPlaybackStatus}
              tone={gumletPlaybackStatus.startsWith("Playback confirmed") ? "success" : "default"}
            />
          </footer>
        </div>
      </main>
    );
  }

  return (
    <main className="portal-shell">
      <a className="portal-skip-link" href="#video-player">
        Skip to video
      </a>
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 py-4 sm:py-6 lg:px-6">
        <div className="flex items-center justify-between px-1 py-1">
          <PortalBrand context="Client video portal" />
          <Badge variant="mutedOutline">Shared video</Badge>
        </div>

        <PortalPageHeader
          actions={
            <div className="min-w-[15rem] rounded-xl border border-[color:var(--portal-border)] bg-black/10 p-3">
              <PlaybackSpeedControl
                onChange={setViewerSpeed}
                recommendedSpeed={video.recommendedPlaybackSpeed}
                value={viewerSpeed}
              />
            </div>
          }
          description={project.name}
          eyebrow={
            <Badge className="w-fit" variant="emphasisOutline">
              {project.clientName || "Client review"}
            </Badge>
          }
          metadata={
            <>
              <Badge className="gap-2" variant="secondary">
                <Gauge aria-hidden="true" className="size-4" />
                Recommended {video.recommendedPlaybackSpeed}x
              </Badge>
              <TimeSavingsSummary
                compact
                durationSeconds={effectiveDurationSeconds}
                speed={viewerSpeed}
              />
            </>
          }
          title={video.title}
        />

        <VideoFeedbackReview
          currentTimeSeconds={reviewTimestampSeconds}
          directCommentId={directCommentId}
          enabled={cloudTokenResolved}
          onModeChange={(mode) => {
            if (mode === "review") {
              setStarted(true);
            }
          }}
          onPause={handleReviewPause}
          onRequestCurrentTime={handleReviewRequestCurrentTime}
          onSeek={handleReviewSeek}
          passcode={feedbackPasscode}
          token={slug}
          videoId={video.id}
        >
          <section
            className="min-w-0 overflow-hidden rounded-xl border border-[color:var(--portal-border-strong)] bg-black shadow-2xl shadow-black/30"
            data-testid="video-player-frame"
          >
            {videoPlayer}
          </section>

          {!started ? (
            <div
              className="mt-3 flex items-center justify-center sm:absolute sm:inset-0 sm:mt-0 sm:bg-black/50 sm:px-4"
              data-testid="review-start-panel"
            >
              <div className="w-full max-w-md rounded-xl border border-blue-300/30 bg-[color:var(--portal-surface-1)] p-4 text-center shadow-2xl sm:bg-[color:color-mix(in_oklab,var(--portal-surface-1)_88%,transparent)] sm:p-5 sm:backdrop-blur-md">
                <div className="flex flex-col items-center gap-3">
                  <Badge className="gap-2" variant="secondary">
                    <Gauge aria-hidden="true" className="size-4" />
                    {viewerSpeed}x review
                  </Badge>
                  <h2 className="text-xl font-semibold text-white">Start faster review</h2>
                  <div className="space-y-2 text-sm text-[color:var(--muted-foreground)]">
                    {watchTimeLabel ? (
                      <span className="flex items-center justify-center gap-2">
                        <Clock3 aria-hidden="true" className="size-4" />
                        {watchTimeLabel}
                      </span>
                    ) : null}
                    {savedTimeLabel ? <span className="block">{savedTimeLabel}</span> : null}
                    {!playbackSavings && durationDetectionTimedOut ? (
                      <span className="block">{durationFallbackMessage}</span>
                    ) : null}
                    {gumletStartPending ? (
                      <span className="block">
                        Attempting to start playback at {viewerSpeed}x.
                      </span>
                    ) : null}
                  </div>
                  <Button className="min-h-11 w-full" onClick={handleStart} size="xl" type="button">
                    <Play />
                    <span className="flex min-w-0 flex-col items-start gap-1 text-left">
                      <span>
                        {gumletStartPending ? "Starting" : "Start"}{" "}
                        {viewerSpeed}x review
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
                </div>
              </div>
            </div>
          ) : null}
        </VideoFeedbackReview>

        <PortalStatus
          message={gumletPlaybackStatus}
          tone={gumletPlaybackStatus.startsWith("Playback confirmed") ? "success" : "default"}
        />

        <Card className="border-[color:var(--portal-border)]">
          <CardHeader>
            <CardTitle className="text-xl">Review details</CardTitle>
            <CardDescription className="text-sm">
              {getDurationMeta(video, effectiveDurationSeconds, viewerSpeed)}
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
