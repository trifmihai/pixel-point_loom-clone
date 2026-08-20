import * as React from "react";
import { Bell, Eye, Mail, RotateCcw } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/toolcraft/ui";

import type { FirstViewActivity, FirstViewActivityResponse } from "./first-view-types";
import { getPortalApiErrorMessage, portalApi } from "./portal-api";

type AdminActivityPanelProps = {
  onOpenChange: (open: boolean) => void;
  onOpenVideo: (projectId: string, videoId: string) => void;
  onUnreadCountChange: (count: number) => void;
  open: boolean;
};

const activityPollIntervalMs = 30_000;

function formatActivityTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getViewerLabel(activity: FirstViewActivity): string {
  return activity.viewerName || activity.viewerEmail || "Anonymous viewer";
}

export function AdminActivityPanel({
  onOpenChange,
  onOpenVideo,
  onUnreadCountChange,
  open,
}: AdminActivityPanelProps): React.JSX.Element {
  const [activity, setActivity] = React.useState<FirstViewActivityResponse | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  const loadActivity = React.useCallback(async (markRead = false) => {
    setLoading(true);
    setError("");

    try {
      const response = await portalApi.getAdminActivity();
      setActivity(response);
      onUnreadCountChange(response.unreadCount);

      if (markRead && response.unreadCount > 0) {
        await portalApi.markActivityRead();
        setActivity({
          ...response,
          events: response.events.map((event) => ({
            ...event,
            adminReadAt: event.adminReadAt ?? new Date().toISOString(),
          })),
          unreadCount: 0,
        });
        onUnreadCountChange(0);
      }
    } catch (loadError) {
      setError(getPortalApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [onUnreadCountChange]);

  React.useEffect(() => {
    void loadActivity(false);

    const interval = window.setInterval(() => {
      if (!document.hidden) {
        void loadActivity(false);
      }
    }, activityPollIntervalMs);

    return () => window.clearInterval(interval);
  }, [loadActivity]);

  React.useEffect(() => {
    if (open) {
      void loadActivity(true);
    }
  }, [loadActivity, open]);

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-[min(94vw,30rem)] bg-[color:var(--portal-surface-1)]" side="right">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-lg">
            <Bell className="size-5 text-sky-300" />
            Activity
          </SheetTitle>
          <SheetDescription>
            The first time an external viewer starts each shared video.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          {activity && !activity.emailConfigured ? (
            <Alert>
              <Mail className="size-4" />
              <AlertTitle>In-app notifications active</AlertTitle>
              <AlertDescription>
                In-app activity is on. Email notifications aren't connected.
              </AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Activity could not load</AlertTitle>
              <AlertDescription className="space-y-3">
                <span className="block">{error}</span>
                <Button onClick={() => void loadActivity(open)} size="sm" type="button" variant="outline">
                  <RotateCcw />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {loading && !activity ? (
            <p aria-live="polite" className="text-sm text-[color:var(--muted-foreground)]">
              Loading activity...
            </p>
          ) : activity?.events.length ? (
            activity.events.map((event) => (
              <Card className="border-[color:var(--portal-border)]" key={event.id} size="sm">
                <CardHeader className="gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{event.videoTitle}</CardTitle>
                      <CardDescription className="mt-1">
                        {event.projectName} - {formatActivityTime(event.firstViewedAt)}
                      </CardDescription>
                    </div>
                    {!event.adminReadAt ? <Badge>New</Badge> : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-white">
                    <Eye className="size-4 text-sky-300" />
                    <span>{getViewerLabel(event)}</span>
                  </div>
                  {event.viewerName && event.viewerEmail ? (
                    <a
                      className="block break-all text-xs text-[color:var(--muted-foreground)] hover:text-white"
                      href={`mailto:${event.viewerEmail}`}
                    >
                      {event.viewerEmail}
                    </a>
                  ) : null}
                  <Button
                    className="w-full"
                    onClick={() => {
                      onOpenVideo(event.projectId, event.videoId);
                      onOpenChange(false);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Open video
                  </Button>
                </CardContent>
              </Card>
            ))
          ) : !error ? (
            <Empty className="min-h-64" variant="outline">
              <EmptyHeader>
                <EmptyTitle>No client views yet</EmptyTitle>
                <EmptyDescription>
                  Activity appears after someone starts a video from a cloud share link.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
