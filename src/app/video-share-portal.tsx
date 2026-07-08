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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Separator,
} from "@/toolcraft/ui";

import { GumletPlayer } from "./gumlet-player";
import { loadPortalData } from "./portal-store";
import type { PortalVideo, VideoShareSnapshot } from "./portal-types";
import {
  decodeShareVideoSnapshot,
  estimateTimeSavedSeconds,
  estimateWatchTimeSeconds,
  formatDuration,
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

function getWatchTimeLabel(video: PortalVideo): string | null {
  const watchTime = estimateWatchTimeSeconds(
    video.durationSeconds,
    video.recommendedPlaybackSpeed,
  );

  return watchTime ? `Watch in about ${formatDuration(watchTime)}` : null;
}

function getSavedTimeLabel(video: PortalVideo): string | null {
  const savedTime = estimateTimeSavedSeconds(
    video.durationSeconds,
    video.recommendedPlaybackSpeed,
  );

  return savedTime > 0 ? `Save about ${formatDuration(savedTime)}` : null;
}

function getDurationMeta(video: PortalVideo): string {
  const pieces = [
    video.durationSeconds ? `${formatDuration(video.durationSeconds)} video` : null,
    `${video.recommendedPlaybackSpeed}x playback`,
  ].filter(Boolean);

  return pieces.join(" - ");
}

export function VideoSharePortal({
  encodedData,
  slug,
}: VideoSharePortalProps): React.JSX.Element {
  const [snapshot] = React.useState<VideoShareSnapshot | null>(() =>
    loadVideoSnapshot(slug, encodedData),
  );
  const [started, setStarted] = React.useState(false);
  const nativeVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const video = snapshot?.video ?? null;
  const project = snapshot?.project ?? null;
  const savedTimeLabel = video ? getSavedTimeLabel(video) : null;
  const watchTimeLabel = video ? getWatchTimeLabel(video) : null;

  const applyNativePlaybackSettings = React.useCallback(() => {
    const player = nativeVideoRef.current;

    if (!player || !video) {
      return;
    }

    player.playbackRate = video.recommendedPlaybackSpeed;

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

  function handleStart(): void {
    setStarted(true);
    applyNativePlaybackSettings();

    void nativeVideoRef.current?.play().catch(() => {
      applyNativePlaybackSettings();
    });
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
              {project.name} - {getDurationMeta(video)}
            </CardDescription>
          </CardHeader>
        </Card>

        <section className="relative min-w-0 overflow-hidden rounded-lg border border-white/10 bg-black shadow-2xl shadow-black/30">
          {video.directVideoUrl ? (
            <video
              ref={nativeVideoRef}
              className="aspect-video w-full bg-black"
              controls
              onLoadedMetadata={applyNativePlaybackSettings}
              poster={video.thumbnailUrl}
              preload="metadata"
              src={video.directVideoUrl}
              title={`${video.title} video`}
            />
          ) : (
            <GumletPlayer autoplay={started} video={video} />
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
                    Start {video.recommendedPlaybackSpeed}x review
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Review details</CardTitle>
            <CardDescription className="text-sm">{getDurationMeta(video)}</CardDescription>
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
