import * as React from "react";
import { CheckCircle2, MessageSquarePlus } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldLabel,
  Input,
  Separator,
  Textarea,
} from "@/toolcraft/ui";

import { GumletPlayer } from "./gumlet-player";
import { getPortalApiErrorMessage, portalApi, type PublicShareResponse } from "./portal-api";
import { loadPortalData } from "./portal-store";
import type {
  PlaybackSpeed,
  PortalComment,
  PortalProject,
  PortalVideo,
  VideoShareSnapshot,
  ViewingProgressStatus,
} from "./portal-types";
import {
  PlaybackSpeedControl,
  PortalBrand,
  PortalPageHeader,
  PortalStateCard,
  TimeSavingsSummary,
} from "./portal-ui";
import { SharePasscodeGate } from "./share-passcode-gate";
import {
  decodeShareProject,
  estimateTimeSavedSeconds,
  estimateWatchTimeSeconds,
  formatDuration,
} from "./portal-utils";

type SharePortalProps = {
  encodedData?: string;
  slug: string;
};

type FeedbackDraft = {
  authorEmail: string;
  authorName: string;
  commentText: string;
  timestampSeconds: string;
};

const emptyFeedbackDraft: FeedbackDraft = {
  authorEmail: "",
  authorName: "",
  commentText: "",
  timestampSeconds: "",
};

function getSortedVideos(project: PortalProject): PortalVideo[] {
  return [...project.videos].sort((left, right) => left.orderIndex - right.orderIndex);
}

function getShareCommentsKey(projectId: string): string {
  return `loomish.gumlet.portal.feedback.${projectId}`;
}

function getShareProgressKey(projectId: string): string {
  return `loomish.gumlet.portal.progress.${projectId}`;
}

function loadProject(slug: string, encodedData?: string): PortalProject | null {
  const decoded = encodedData ? decodeShareProject(encodedData) : null;

  if (decoded) {
    return decoded;
  }

  return loadPortalData().projects.find((project) => project.shareSlug === slug) ?? null;
}

function createProjectFromVideoSnapshot(snapshot: VideoShareSnapshot): PortalProject {
  return {
    clientName: snapshot.project.clientName,
    createdAt: snapshot.video.createdAt,
    description: undefined,
    id: snapshot.project.id,
    name: snapshot.project.name,
    shareSlug: snapshot.project.shareSlug,
    updatedAt: snapshot.video.updatedAt,
    videos: [snapshot.video],
    visibility: "unlisted",
  };
}

function getProjectFromPublicResponse(response: PublicShareResponse): PortalProject | null {
  if ("requiresPasscode" in response && response.requiresPasscode) {
    return null;
  }

  if (response.kind === "share" && "project" in response) {
    return response.project;
  }

  if (response.kind === "video" && "snapshot" in response) {
    return createProjectFromVideoSnapshot(response.snapshot);
  }

  return null;
}

function loadComments(projectId: string): PortalComment[] {
  try {
    const rawValue = window.localStorage.getItem(getShareCommentsKey(projectId));

    return rawValue ? (JSON.parse(rawValue) as PortalComment[]) : [];
  } catch {
    return [];
  }
}

function loadProgress(projectId: string): Record<string, ViewingProgressStatus> {
  try {
    const rawValue = window.localStorage.getItem(getShareProgressKey(projectId));

    return rawValue ? (JSON.parse(rawValue) as Record<string, ViewingProgressStatus>) : {};
  } catch {
    return {};
  }
}

function parseTimestamp(value: string): number | undefined {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function createCommentId(): string {
  return `comment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getVideoMeta(video: PortalVideo): string {
  const watchTime = estimateWatchTimeSeconds(
    video.durationSeconds,
    video.recommendedPlaybackSpeed,
  );
  const savedTime = estimateTimeSavedSeconds(
    video.durationSeconds,
    video.recommendedPlaybackSpeed,
  );

  if (!video.durationSeconds || !watchTime) {
    return `Suggested ${video.recommendedPlaybackSpeed}x`;
  }

  return `${formatDuration(video.durationSeconds)} video - Suggested ${
    video.recommendedPlaybackSpeed
  }x - Watch in about ${formatDuration(watchTime)} - Saves about ${formatDuration(savedTime)}`;
}

function getStatusLabel(status: ViewingProgressStatus | undefined): string {
  switch (status) {
    case "in-progress":
      return "In progress";
    case "watched":
      return "Watched";
    default:
      return "Not started";
  }
}

function getStatusVariant(
  status: ViewingProgressStatus | undefined,
): React.ComponentProps<typeof Badge>["variant"] {
  switch (status) {
    case "watched":
      return "secondary";
    case "in-progress":
      return "emphasisOutline";
    default:
      return "mutedOutline";
  }
}

export function SharePortal({ encodedData, slug }: SharePortalProps): React.JSX.Element {
  const [project, setProject] = React.useState<PortalProject | null>(() =>
    loadProject(slug, encodedData),
  );
  const [tokenStatus, setTokenStatus] = React.useState<
    "error" | "idle" | "loading" | "passcode"
  >(() => (project || encodedData ? "idle" : "loading"));
  const [tokenError, setTokenError] = React.useState("");
  const [passcodeDraft, setPasscodeDraft] = React.useState("");
  const [passcodeLoading, setPasscodeLoading] = React.useState(false);
  const videos = project ? getSortedVideos(project) : [];
  const [selectedVideoId, setSelectedVideoId] = React.useState(() => videos[0]?.id ?? "");
  const [feedbackDraft, setFeedbackDraft] = React.useState<FeedbackDraft>(emptyFeedbackDraft);
  const [comments, setComments] = React.useState<PortalComment[]>(() =>
    project ? loadComments(project.id) : [],
  );
  const [progress, setProgress] = React.useState<Record<string, ViewingProgressStatus>>(() =>
    project ? loadProgress(project.id) : {},
  );
  const [seekSeconds, setSeekSeconds] = React.useState<number | undefined>();

  const selectedVideo = videos.find((video) => video.id === selectedVideoId) ?? videos[0] ?? null;
  const selectedComments = comments.filter((comment) => comment.videoId === selectedVideo?.id);
  const [viewerSpeed, setViewerSpeed] = React.useState<PlaybackSpeed>(
    () => selectedVideo?.recommendedPlaybackSpeed ?? 1.5,
  );
  const playbackVideo = selectedVideo
    ? {
        ...selectedVideo,
        recommendedPlaybackSpeed: viewerSpeed,
      }
    : null;

  React.useEffect(() => {
    const legacyProject = loadProject(slug, encodedData);

    if (legacyProject) {
      setProject(legacyProject);
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

        const nextProject = getProjectFromPublicResponse(response);

        if (!nextProject) {
          setTokenStatus("error");
          setTokenError("This share token did not include a project.");
          return;
        }

        setProject(nextProject);
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

  React.useEffect(() => {
    if (!project) {
      return;
    }

    setComments(loadComments(project.id));
    setProgress(loadProgress(project.id));
  }, [project]);

  React.useEffect(() => {
    if (!videos.length) {
      setSelectedVideoId("");
      return;
    }

    if (!videos.some((video) => video.id === selectedVideoId)) {
      setSelectedVideoId(videos[0]?.id ?? "");
    }
  }, [selectedVideoId, videos]);

  React.useEffect(() => {
    if (!project || !selectedVideo) {
      return;
    }

    setProgress((current) => {
      if (current[selectedVideo.id] === "watched") {
        return current;
      }

      return {
        ...current,
        [selectedVideo.id]: "in-progress",
      };
    });
  }, [project, selectedVideo]);

  React.useEffect(() => {
    setViewerSpeed(selectedVideo?.recommendedPlaybackSpeed ?? 1.5);
  }, [selectedVideo?.id, selectedVideo?.recommendedPlaybackSpeed]);

  React.useEffect(() => {
    if (!project) {
      return;
    }

    window.localStorage.setItem(getShareCommentsKey(project.id), JSON.stringify(comments));
  }, [comments, project]);

  React.useEffect(() => {
    if (!project) {
      return;
    }

    window.localStorage.setItem(getShareProgressKey(project.id), JSON.stringify(progress));
  }, [progress, project]);

  function handleSubmitFeedback(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!project || !selectedVideo || !feedbackDraft.commentText.trim()) {
      return;
    }

    const comment: PortalComment = {
      authorEmail: feedbackDraft.authorEmail.trim() || undefined,
      authorName: feedbackDraft.authorName.trim() || "Client",
      commentText: feedbackDraft.commentText.trim(),
      createdAt: new Date().toISOString(),
      id: createCommentId(),
      projectId: project.id,
      status: "open",
      timestampSeconds: parseTimestamp(feedbackDraft.timestampSeconds),
      videoId: selectedVideo.id,
    };

    setComments((current) => [comment, ...current]);
    setFeedbackDraft(emptyFeedbackDraft);
  }

  async function handleSubmitPasscode(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPasscodeLoading(true);
    setTokenError("");

    try {
      const response = await portalApi.unlockPublicShare(slug, passcodeDraft);
      const nextProject = getProjectFromPublicResponse(response);

      if (!nextProject) {
        setTokenStatus("passcode");
        setTokenError("This passcode did not unlock a project.");
        return;
      }

      setProject(nextProject);
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
          description="Checking this secure project token."
          loading
          title="Loading review…"
        />
      </main>
    );
  }

  if (tokenStatus === "passcode") {
    return (
      <SharePasscodeGate
        description="Enter the passcode provided with this review link."
        error={tokenError}
        loading={passcodeLoading}
        onPasscodeChange={setPasscodeDraft}
        onSubmit={(event) => void handleSubmitPasscode(event)}
        passcode={passcodeDraft}
        title="Protected review"
      />
    );
  }

  if (!project) {
    return (
      <main className="portal-shell flex items-center justify-center px-4 py-8">
        <PortalStateCard
          description={
            tokenError ||
            "The link may have expired, been mistyped, or no longer point to a shared project. Ask the sender for the current link."
          }
          title="This project link is not available"
          tone="error"
        />
      </main>
    );
  }

  const videoList = videos.map((video) => (
    <Button
      aria-current={selectedVideo?.id === video.id ? "true" : undefined}
      className={`!h-auto w-full justify-start whitespace-normal px-3 py-3 text-left ${
        selectedVideo?.id === video.id
          ? "border-blue-400/60 bg-blue-400/10 text-white"
          : "text-white"
      }`}
      key={video.id}
      onClick={() => {
        setSelectedVideoId(video.id);
        setSeekSeconds(undefined);
      }}
      type="button"
      variant="outline"
    >
      <span className="flex min-w-0 flex-col items-start gap-2">
        <span className="font-medium">{video.title}</span>
        <span className="portal-numeric text-xs text-[color:var(--muted-foreground)]">
          {getVideoMeta(video)}
        </span>
        <Badge variant={getStatusVariant(progress[video.id])}>
          {getStatusLabel(progress[video.id])}
        </Badge>
      </span>
    </Button>
  ));

  return (
    <main className="portal-shell">
      <a className="portal-skip-link" href="#collection-player">
        Skip to video
      </a>
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 py-4 sm:py-6 lg:px-6">
        <div className="flex items-center justify-between px-1 py-1">
          <PortalBrand context="Client project portal" />
          <Badge variant="mutedOutline">Shared project</Badge>
        </div>

        <PortalPageHeader
          description={project.description}
          eyebrow={
            <Badge className="w-fit" variant="emphasisOutline">
              {project.clientName || "Client review"}
            </Badge>
          }
          metadata={
            <span className="portal-numeric">
              {videos.length} {videos.length === 1 ? "video" : "videos"} in this review
            </span>
          }
          title={project.name}
        />

        <nav aria-label="Video collection" className="lg:hidden">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Choose a video</CardTitle>
              <CardDescription>Review progress stays on this device.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">{videoList}</CardContent>
          </Card>
        </nav>

        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <section className="min-w-0 space-y-4">
            {selectedVideo && playbackVideo ? (
              <>
                <div data-testid="collection-player" id="collection-player">
                  <GumletPlayer seekSeconds={seekSeconds} video={playbackVideo} />
                </div>
                <Card>
                  <CardHeader className="gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                    <div>
                      <CardTitle aria-level={2} className="text-2xl" role="heading">
                        {selectedVideo.title}
                      </CardTitle>
                      <CardDescription className="mt-1 text-sm">
                        {getVideoMeta(selectedVideo)}
                      </CardDescription>
                      <div className="mt-3">
                        <TimeSavingsSummary
                          durationSeconds={selectedVideo.durationSeconds}
                          speed={viewerSpeed}
                        />
                      </div>
                      {selectedVideo.description ? (
                        <p className="mt-3 text-sm leading-6 text-[color:var(--muted-foreground)]">
                          {selectedVideo.description}
                        </p>
                      ) : null}
                    </div>
                    <CardAction className="static col-auto row-auto flex w-full flex-col items-stretch gap-3 md:w-64 md:justify-self-end">
                      <div className="rounded-xl border border-[color:var(--portal-border)] bg-black/10 p-3">
                        <PlaybackSpeedControl
                          onChange={setViewerSpeed}
                          recommendedSpeed={selectedVideo.recommendedPlaybackSpeed}
                          value={viewerSpeed}
                        />
                      </div>
                      <Button
                        onClick={() =>
                          setProgress((current) => ({
                            ...current,
                            [selectedVideo.id]: "watched",
                          }))
                        }
                        size="lg"
                        type="button"
                        variant="outline"
                      >
                        <CheckCircle2 />
                        Mark watched
                      </Button>
                    </CardAction>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Notes on this device</CardTitle>
                    <CardDescription id="feedback-storage-note" className="leading-6">
                      Add timestamped review notes. These notes stay in this browser and are not
                      sent to the administrator.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form
                      aria-describedby="feedback-storage-note"
                      className="grid gap-3 md:grid-cols-2"
                      onSubmit={handleSubmitFeedback}
                    >
                    <Field>
                      <FieldLabel htmlFor="feedback-author-name">Your name</FieldLabel>
                      <Input
                        autoComplete="name"
                        id="feedback-author-name"
                        name="name"
                        onChange={(event) =>
                          setFeedbackDraft((draft) => ({
                            ...draft,
                            authorName: event.target.value,
                          }))
                        }
                        required
                        size="lg"
                        value={feedbackDraft.authorName}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="feedback-author-email">Email</FieldLabel>
                      <Input
                        autoComplete="email"
                        id="feedback-author-email"
                        name="email"
                        onChange={(event) =>
                          setFeedbackDraft((draft) => ({
                            ...draft,
                            authorEmail: event.target.value,
                          }))
                        }
                        size="lg"
                        type="email"
                        value={feedbackDraft.authorEmail}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="feedback-timestamp">Timestamp</FieldLabel>
                      <Input
                        id="feedback-timestamp"
                        inputMode="numeric"
                        min="0"
                        name="timestamp"
                        onChange={(event) =>
                          setFeedbackDraft((draft) => ({
                            ...draft,
                            timestampSeconds: event.target.value,
                          }))
                        }
                        size="lg"
                        step="1"
                        type="number"
                        value={feedbackDraft.timestampSeconds}
                      />
                    </Field>
                    <Field className="md:col-span-2">
                      <FieldLabel htmlFor="feedback-comment">Feedback</FieldLabel>
                      <Textarea
                        id="feedback-comment"
                        name="feedback"
                        onChange={(event) =>
                          setFeedbackDraft((draft) => ({
                            ...draft,
                            commentText: event.target.value,
                          }))
                        }
                        required
                        size="xl"
                        spellCheck
                        value={feedbackDraft.commentText}
                      />
                    </Field>
                    <Button className="md:w-fit" size="xl" type="submit">
                      <MessageSquarePlus />
                      Add comment at current time
                    </Button>
                    </form>

                    <Separator className="my-4" />

                    <div className="space-y-3">
                    {selectedComments.length > 0 ? (
                      selectedComments.map((comment) => (
                        <Card key={comment.id} size="sm">
                          <CardHeader>
                            <CardTitle className="flex flex-wrap items-center gap-2">
                              <span>{comment.authorName}</span>
                              {comment.timestampSeconds ? (
                                <Button
                                  onClick={() => setSeekSeconds(comment.timestampSeconds)}
                                  size="xs"
                                  type="button"
                                  variant="outline"
                                >
                                  {formatDuration(comment.timestampSeconds)}
                                </Button>
                              ) : null}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="text-sm leading-6 text-[color:var(--muted-foreground)]">
                            {comment.commentText}
                          </CardContent>
                        </Card>
                      ))
                    ) : (
                      <Empty className="min-h-32" variant="outline">
                        <EmptyHeader>
                          <EmptyTitle>No feedback yet</EmptyTitle>
                          <EmptyDescription>No feedback on this video yet.</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Empty className="min-h-[320px]" variant="outline">
                <EmptyHeader>
                  <EmptyTitle>No videos available</EmptyTitle>
                  <EmptyDescription>No videos are available in this share link.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </section>

          <nav aria-label="Video collection" className="hidden lg:block lg:sticky lg:top-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Videos</CardTitle>
                <CardDescription>Choose the next item in this review.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">{videoList}</CardContent>
            </Card>
          </nav>
        </div>
      </div>
    </main>
  );
}
