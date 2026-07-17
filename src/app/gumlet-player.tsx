import * as React from "react";
import { LoaderCircle, WifiOff } from "lucide-react";

import type { PortalVideo } from "./portal-types";
import { buildGumletEmbedUrl } from "./portal-utils";
import {
  buildGumletDurationCommands,
  buildGumletReviewVerificationCommands,
  buildGumletSpeedCommands,
  buildGumletStartCommands,
  buildGumletSubscriptionCommands,
  gumletPlayerOrigin,
  type GumletPlayerMessage,
  parseGumletPlayerMessage,
  postGumletCommands,
} from "./gumlet-player-adapter";

type GumletPlayerProps = {
  autoplay?: boolean;
  onDuration?: (durationSeconds: number) => void;
  onPlaybackEvent?: (message: GumletPlayerMessage) => void;
  onReady?: () => void;
  seekSeconds?: number;
  video: PortalVideo;
};

type GumletPlayerState = "delayed" | "loading" | "ready";

const gumletPlayerLoadingTimeoutMs = 6500;

export type GumletPlayerHandle = {
  applyRecommendedSpeed: () => void;
  requestDuration: () => void;
  startReview: () => void;
};

function useLatestValue<TValue>(value: TValue): React.RefObject<TValue> {
  const ref = React.useRef(value);

  React.useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

export const GumletPlayer = React.forwardRef<GumletPlayerHandle, GumletPlayerProps>(
  function GumletPlayer(
    { autoplay = false, onDuration, onPlaybackEvent, onReady, seekSeconds, video },
    ref,
  ): React.JSX.Element {
    const frameRef = React.useRef<HTMLIFrameElement | null>(null);
    const readyRef = React.useRef(false);
    const [playerState, setPlayerState] = React.useState<GumletPlayerState>("loading");
    const onDurationRef = useLatestValue(onDuration);
    const onPlaybackEventRef = useLatestValue(onPlaybackEvent);
    const onReadyRef = useLatestValue(onReady);
    const startTime = seekSeconds ?? video.startTimeSeconds ?? 0;
    const embedUrl = buildGumletEmbedUrl(video.assetId, startTime, { autoplay });

    const setPlayerReady = React.useCallback(() => {
      if (readyRef.current) {
        return;
      }

      readyRef.current = true;
      setPlayerState("ready");
      onReadyRef.current?.();
    }, [onReadyRef]);

  const subscribeToPlayerEvents = React.useCallback(() => {
    postGumletCommands(frameRef.current, buildGumletSubscriptionCommands());
  }, []);

  const applyRecommendedSpeed = React.useCallback(() => {
    postGumletCommands(frameRef.current, buildGumletSpeedCommands(video.recommendedPlaybackSpeed));
  }, [video.recommendedPlaybackSpeed]);

  const requestDuration = React.useCallback(() => {
    postGumletCommands(frameRef.current, buildGumletDurationCommands());
  }, []);

  const startReview = React.useCallback(() => {
    postGumletCommands(frameRef.current, buildGumletStartCommands(video.recommendedPlaybackSpeed));

    for (const delay of [250, 750, 1500]) {
      window.setTimeout(() => {
        postGumletCommands(frameRef.current, [
          ...buildGumletReviewVerificationCommands(video.recommendedPlaybackSpeed),
        ]);
      }, delay);
    }
  }, [video.recommendedPlaybackSpeed]);

  React.useImperativeHandle(
    ref,
    () => ({
      applyRecommendedSpeed,
      requestDuration,
      startReview,
    }),
    [applyRecommendedSpeed, requestDuration, startReview],
  );

  React.useEffect(() => {
    function handlePlayerMessage(event: MessageEvent): void {
      if (event.origin && event.origin !== gumletPlayerOrigin) {
        return;
      }

      const message = parseGumletPlayerMessage(event.data);

      if (message.durationSeconds) {
        onDurationRef.current?.(message.durationSeconds);
      }

      if (
        message.error ||
        message.isReady ||
        message.muted !== undefined ||
        message.playbackRate !== undefined ||
        message.playbackStarted ||
        message.volume !== undefined
      ) {
        onPlaybackEventRef.current?.(message);
      }

      if (message.error) {
        setPlayerState("delayed");
        return;
      }

      if (
        message.isReady ||
        message.durationSeconds !== undefined ||
        message.muted !== undefined ||
        message.playbackRate !== undefined ||
        message.playbackStarted ||
        message.volume !== undefined
      ) {
        setPlayerReady();
      }

      if (message.isReady) {
        subscribeToPlayerEvents();
        applyRecommendedSpeed();
        requestDuration();
      }
    }

    window.addEventListener("message", handlePlayerMessage);

    return () => window.removeEventListener("message", handlePlayerMessage);
  }, [
    applyRecommendedSpeed,
    onDurationRef,
    onPlaybackEventRef,
    requestDuration,
    setPlayerReady,
    subscribeToPlayerEvents,
  ]);

  React.useEffect(() => {
    readyRef.current = false;
    setPlayerState("loading");

    const timeout = window.setTimeout(() => {
      setPlayerState((current) => (current === "loading" ? "delayed" : current));
    }, gumletPlayerLoadingTimeoutMs);

    return () => window.clearTimeout(timeout);
  }, [embedUrl]);

  React.useEffect(() => {
    if (!autoplay) {
      return undefined;
    }

    const timeout = window.setTimeout(startReview, 150);

    return () => window.clearTimeout(timeout);
  }, [autoplay, embedUrl, startReview]);

  return (
    <div
      aria-busy={playerState === "loading"}
      className="relative overflow-hidden rounded-lg border border-[color:var(--portal-border)] bg-black shadow-2xl shadow-black/30"
    >
      <iframe
        ref={frameRef}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        className="aspect-video w-full"
        loading="lazy"
        src={embedUrl}
        title={`${video.title} Gumlet video`}
      />
      {playerState !== "ready" ? (
        <div
          aria-live="polite"
          className="absolute inset-0 grid place-items-center bg-[color:var(--portal-surface-1)] px-6 text-center"
          role="status"
        >
          <div className="flex max-w-sm flex-col items-center gap-3">
            {playerState === "loading" ? (
              <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-blue-300" />
            ) : (
              <WifiOff aria-hidden="true" className="size-6 text-amber-300" />
            )}
            <p className="text-sm font-medium text-white">
              {playerState === "loading"
                ? "Loading video…"
                : "Video is taking longer than expected"}
            </p>
            {playerState === "delayed" ? (
              <p className="text-xs leading-5 text-[color:var(--muted-foreground)]">
                Check your connection. Player controls will appear here when Gumlet responds.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
});

GumletPlayer.displayName = "GumletPlayer";
