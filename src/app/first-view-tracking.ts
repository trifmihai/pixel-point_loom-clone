import * as React from "react";

import { portalApi } from "./portal-api";

const guestIdentityStorageKey = "pixel-point.feedback.guest.v1";

type FirstViewTrackingOptions = {
  enabled: boolean;
  passcode?: string;
  token: string;
  videoId?: string;
};

function loadRememberedViewerIdentity(): {
  viewerEmail?: string;
  viewerName?: string;
} {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(guestIdentityStorageKey) ?? "{}",
    ) as { email?: unknown; name?: unknown };
    const viewerEmail = typeof parsed.email === "string" ? parsed.email.trim() : "";
    const viewerName = typeof parsed.name === "string" ? parsed.name.trim() : "";

    return {
      ...(viewerEmail ? { viewerEmail } : {}),
      ...(viewerName ? { viewerName } : {}),
    };
  } catch {
    return {};
  }
}

export function useFirstViewTracking({
  enabled,
  passcode,
  token,
  videoId,
}: FirstViewTrackingOptions): () => void {
  const recordedKeyRef = React.useRef("");
  const trackingKey = enabled && videoId ? `${token}:${videoId}` : "";

  React.useEffect(() => {
    if (recordedKeyRef.current !== trackingKey) {
      recordedKeyRef.current = "";
    }
  }, [trackingKey]);

  return React.useCallback(() => {
    if (!trackingKey || !videoId || recordedKeyRef.current === trackingKey) {
      return;
    }

    recordedKeyRef.current = trackingKey;
    void portalApi
      .recordFirstVideoView(
        token,
        {
          videoId,
          ...loadRememberedViewerIdentity(),
        },
        passcode,
      )
      .catch(() => {
        // Tracking is intentionally non-blocking; playback must remain unaffected.
      });
  }, [passcode, token, trackingKey, videoId]);
}
