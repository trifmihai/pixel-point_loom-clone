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
import { loadPortalData } from "./portal-store";
import type {
  PortalComment,
  PortalProject,
  PortalVideo,
  ViewingProgressStatus,
} from "./portal-types";
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
  const [project] = React.useState<PortalProject | null>(() => loadProject(slug, encodedData));
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

  if (!project) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[color:var(--background)] px-4 text-[color:var(--foreground)]">
        <Card className="max-w-md text-center">
          <CardHeader>
            <CardTitle aria-level={1} className="text-2xl" role="heading">
              Share link not found
            </CardTitle>
            <CardDescription className="text-sm leading-6">
              This link does not include a project snapshot, and no local project matches this slug.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[color:var(--background)] text-[color:var(--foreground)]">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 py-5 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:px-6">
        <section className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <Badge className="w-fit" variant="emphasisOutline">
                {project.clientName || "Client review"}
              </Badge>
              <CardTitle aria-level={1} className="text-3xl font-semibold" role="heading">
                {project.name}
              </CardTitle>
              {project.description ? (
                <CardDescription className="max-w-3xl text-sm leading-6">
                  {project.description}
                </CardDescription>
              ) : null}
            </CardHeader>
          </Card>

          {selectedVideo ? (
            <>
              <GumletPlayer seekSeconds={seekSeconds} video={selectedVideo} />
              <Card>
                <CardHeader className="gap-3 md:grid-cols-[1fr_auto]">
                  <div>
                    <CardTitle aria-level={2} className="text-2xl" role="heading">
                      {selectedVideo.title}
                    </CardTitle>
                    <CardDescription className="text-sm">
                      {getVideoMeta(selectedVideo)}
                    </CardDescription>
                    {selectedVideo.description ? (
                      <p className="mt-3 text-sm leading-6 text-[color:var(--muted-foreground)]">
                        {selectedVideo.description}
                      </p>
                    ) : null}
                  </div>
                  <CardAction className="static col-auto row-auto justify-self-start md:justify-self-end">
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
                  <CardTitle className="text-lg">Feedback</CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSubmitFeedback}>
                    <Field>
                      <FieldLabel htmlFor="feedback-author-name">Your name</FieldLabel>
                      <Input
                        id="feedback-author-name"
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
                        id="feedback-author-email"
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
                        onChange={(event) =>
                          setFeedbackDraft((draft) => ({
                            ...draft,
                            timestampSeconds: event.target.value,
                          }))
                        }
                        size="lg"
                        value={feedbackDraft.timestampSeconds}
                      />
                    </Field>
                    <Field className="md:col-span-2">
                      <FieldLabel htmlFor="feedback-comment">Feedback</FieldLabel>
                      <Textarea
                        id="feedback-comment"
                        onChange={(event) =>
                          setFeedbackDraft((draft) => ({
                            ...draft,
                            commentText: event.target.value,
                          }))
                        }
                        required
                        size="xl"
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

        <Card className="h-fit lg:sticky lg:top-5">
          <CardHeader>
            <CardTitle className="text-lg">Videos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {videos.map((video) => (
              <Button
                className={`!h-auto w-full justify-start whitespace-normal px-3 py-3 text-left ${
                  selectedVideo?.id === video.id
                    ? "border-emerald-400/60 bg-emerald-400/10 text-white"
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
                  <span className="text-xs text-[color:var(--muted-foreground)]">
                    {getVideoMeta(video)}
                  </span>
                  <Badge variant={getStatusVariant(progress[video.id])}>
                    {getStatusLabel(progress[video.id])}
                  </Badge>
                </span>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
