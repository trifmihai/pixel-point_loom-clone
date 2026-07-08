import * as React from "react";

import type { PortalVideo } from "./portal-types";
import { buildGumletEmbedUrl } from "./portal-utils";

type GumletPlayerProps = {
  seekSeconds?: number;
  video: PortalVideo;
};

const gumletOrigin = "https://play.gumlet.io";

function postPlaybackRateCommand(frame: HTMLIFrameElement, rate: number): void {
  const target = frame.contentWindow;

  if (!target) {
    return;
  }

  const commands = [
    { type: "setPlaybackRate", playbackRate: rate },
    { event: "command", func: "setPlaybackRate", args: [rate] },
    { method: "setPlaybackRate", value: rate },
  ];

  for (const command of commands) {
    target.postMessage(command, gumletOrigin);
  }
}

export function GumletPlayer({ seekSeconds, video }: GumletPlayerProps): React.JSX.Element {
  const frameRef = React.useRef<HTMLIFrameElement | null>(null);
  const startTime = seekSeconds ?? video.startTimeSeconds ?? 0;
  const embedUrl = buildGumletEmbedUrl(video.assetId, startTime);

  const applyRecommendedSpeed = React.useCallback(() => {
    const frame = frameRef.current;

    if (!frame) {
      return;
    }

    postPlaybackRateCommand(frame, video.recommendedPlaybackSpeed);
  }, [video.recommendedPlaybackSpeed]);

  React.useEffect(() => {
    const retry = window.setTimeout(applyRecommendedSpeed, 400);

    return () => window.clearTimeout(retry);
  }, [applyRecommendedSpeed, embedUrl]);

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black shadow-2xl shadow-black/30">
      <iframe
        ref={frameRef}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        className="aspect-video w-full"
        loading="lazy"
        onLoad={applyRecommendedSpeed}
        src={embedUrl}
        title={`${video.title} Gumlet video`}
      />
    </div>
  );
}
