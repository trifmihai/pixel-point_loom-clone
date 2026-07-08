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
import { loadPortalData, savePortalData, updateVideo } from "./portal-store";
import type { PortalVideo, VideoShareSnapshot } from "./portal-types";
import {
  calculatePlaybackSavings,
  decodeShareVideoSnapshot,
  formatDuration,
  formatSavedTime,
} from "./portal-utils";

type VideoSharePortalProps = {
  encodedData?: string;
  slug: string;
};

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

export function VideoSharePortal({
  encodedData,
  slug,
}: VideoSharePortalProps): React.JSX.Element {
  const [snapshot, setSnapshot] = React.useState<VideoShareSnapshot | null>(() =>
    loadVideoSnapshot(slug, encodedData),
  );
  const [started, setStarted] = React.useState(false);
  const [gumletPlaybackStatus, setGumletPlaybackStatus] = React.useState("");
  const [metadataDurationSeconds, setMetadataDurationSeconds] = React.useState<
    number | undefined
  >();
  const gumletPlayerRef = React.useRef<GumletPlayerHandle | null>(null);
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

  function handleStart(): void {
    const player = nativeVideoRef.current;

    setStarted(true);
    setGumletPlaybackStatus("");

    if (!video?.directVideoUrl) {
      gumletPlayerRef.current?.startReview();
      setGumletPlaybackStatus(
        `Requested unmuted playback at ${video?.recommendedPlaybackSpeed ?? 1}x. If Gumlet still asks to enable sound, use the player sound control.`,
      );
      return;
    }

    applyNativePlaybackSettings({ audible: true });
    void player?.play().then(
      () => applyNativePlaybackSettings({ audible: true }),
      () => {
        applyNativePlaybackSettings({ audible: true });
        setStarted(false);
      },
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
              This link does not include a video snapshot, and no local video matches this slug.
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
              autoplay={started}
              onDuration={handleResolvedDuration}
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
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full" onClick={handleStart} size="xl" type="button">
                    <Play />
                    <span className="flex min-w-0 flex-col items-start gap-1 text-left">
                      <span>Start {video.recommendedPlaybackSpeed}x review</span>
                      {playbackSavings && playbackSavings.savedSeconds > 0 ? (
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium">
                          <del className="text-white/70">
                            {formatDuration(playbackSavings.originalSeconds)}
                          </del>
                          <span>{formatDuration(playbackSavings.fasterSeconds)}</span>
                          <span>saves {formatSavedTime(playbackSavings.savedSeconds)}</span>
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-white/70">Loading duration</span>
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
