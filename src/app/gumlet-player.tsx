import * as React from "react";

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
  seekSeconds?: number;
  video: PortalVideo;
};

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
    { autoplay = false, onDuration, onPlaybackEvent, seekSeconds, video },
    ref,
  ): React.JSX.Element {
  const frameRef = React.useRef<HTMLIFrameElement | null>(null);
  const onDurationRef = useLatestValue(onDuration);
  const onPlaybackEventRef = useLatestValue(onPlaybackEvent);
  const startTime = seekSeconds ?? video.startTimeSeconds ?? 0;
  const embedUrl = buildGumletEmbedUrl(video.assetId, startTime, { autoplay });

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
    subscribeToPlayerEvents,
  ]);

  React.useEffect(() => {
    const timeouts = [250, 750, 1500].map((delay) =>
      window.setTimeout(() => {
        subscribeToPlayerEvents();
        applyRecommendedSpeed();
        requestDuration();
      }, delay),
    );

    return () => {
      for (const timeout of timeouts) {
        window.clearTimeout(timeout);
      }
    };
  }, [applyRecommendedSpeed, embedUrl, requestDuration, subscribeToPlayerEvents]);

  React.useEffect(() => {
    if (!autoplay) {
      return undefined;
    }

    const timeout = window.setTimeout(startReview, 150);

    return () => window.clearTimeout(timeout);
  }, [autoplay, embedUrl, startReview]);

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black shadow-2xl shadow-black/30">
      <iframe
        ref={frameRef}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        className="aspect-video w-full"
        loading="lazy"
        onLoad={() => {
          subscribeToPlayerEvents();
          applyRecommendedSpeed();
          requestDuration();
        }}
        src={embedUrl}
        title={`${video.title} Gumlet video`}
      />
    </div>
  );
});

GumletPlayer.displayName = "GumletPlayer";
