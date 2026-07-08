import * as React from "react";
import { CheckCircle2, MessageSquarePlus } from "lucide-react";

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

  return `${formatDuration(video.durationSeconds)} video · Suggested ${
    video.recommendedPlaybackSpeed
  }x · Watch in about ${formatDuration(watchTime)} · Saves about ${formatDuration(savedTime)}`;
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
      <main className="flex min-h-dvh items-center justify-center bg-[#101214] px-4 text-neutral-50">
        <div className="max-w-md rounded-lg border border-white/10 bg-[#171a1d] p-6 text-center">
          <h1 className="text-2xl font-semibold">Share link not found</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            This link does not include a project snapshot, and no local project matches this slug.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[#101214] text-neutral-50">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 py-5 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:px-6">
        <section className="min-w-0 space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-normal text-emerald-300">
              {project.clientName || "Client review"}
            </p>
            <h1 className="mt-1 text-3xl font-semibold">{project.name}</h1>
            {project.description ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-400">
                {project.description}
              </p>
            ) : null}
          </div>

          {selectedVideo ? (
            <>
              <GumletPlayer seekSeconds={seekSeconds} video={selectedVideo} />
              <div className="rounded-lg border border-white/10 bg-[#171a1d] p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold">{selectedVideo.title}</h2>
                    <p className="mt-1 text-sm text-neutral-300">{getVideoMeta(selectedVideo)}</p>
                    {selectedVideo.description ? (
                      <p className="mt-3 text-sm leading-6 text-neutral-400">
                        {selectedVideo.description}
                      </p>
                    ) : null}
                  </div>
                  <button
                    className="inline-flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-500/20"
                    onClick={() =>
                      setProgress((current) => ({
                        ...current,
                        [selectedVideo.id]: "watched",
                      }))
                    }
                    type="button"
                  >
                    <CheckCircle2 size={16} />
                    Mark watched
                  </button>
                </div>
              </div>

              <section className="rounded-lg border border-white/10 bg-[#171a1d] p-4">
                <h3 className="text-lg font-semibold">Feedback</h3>
                <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={handleSubmitFeedback}>
                  <label className="block text-sm font-medium text-neutral-200">
                    Your name
                    <input
                      className="mt-1 w-full rounded-md border border-white/10 bg-[#0d0f11] px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                      onChange={(event) =>
                        setFeedbackDraft((draft) => ({
                          ...draft,
                          authorName: event.target.value,
                        }))
                      }
                      required
                      value={feedbackDraft.authorName}
                    />
                  </label>
                  <label className="block text-sm font-medium text-neutral-200">
                    Email
                    <input
                      className="mt-1 w-full rounded-md border border-white/10 bg-[#0d0f11] px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                      onChange={(event) =>
                        setFeedbackDraft((draft) => ({
                          ...draft,
                          authorEmail: event.target.value,
                        }))
                      }
                      type="email"
                      value={feedbackDraft.authorEmail}
                    />
                  </label>
                  <label className="block text-sm font-medium text-neutral-200">
                    Timestamp
                    <input
                      className="mt-1 w-full rounded-md border border-white/10 bg-[#0d0f11] px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                      inputMode="numeric"
                      onChange={(event) =>
                        setFeedbackDraft((draft) => ({
                          ...draft,
                          timestampSeconds: event.target.value,
                        }))
                      }
                      value={feedbackDraft.timestampSeconds}
                    />
                  </label>
                  <label className="block text-sm font-medium text-neutral-200 md:col-span-2">
                    Feedback
                    <textarea
                      className="mt-1 min-h-24 w-full rounded-md border border-white/10 bg-[#0d0f11] px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                      onChange={(event) =>
                        setFeedbackDraft((draft) => ({
                          ...draft,
                          commentText: event.target.value,
                        }))
                      }
                      required
                      value={feedbackDraft.commentText}
                    />
                  </label>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400 md:w-fit"
                    type="submit"
                  >
                    <MessageSquarePlus size={16} />
                    Add comment at current time
                  </button>
                </form>

                <div className="mt-4 space-y-3">
                  {selectedComments.length > 0 ? (
                    selectedComments.map((comment) => (
                      <article
                        className="rounded-md border border-white/10 bg-[#101214] p-3"
                        key={comment.id}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold text-white">{comment.authorName}</span>
                          {comment.timestampSeconds ? (
                            <button
                              className="rounded bg-white/10 px-2 py-1 text-xs text-emerald-100 hover:bg-white/15"
                              onClick={() => setSeekSeconds(comment.timestampSeconds)}
                              type="button"
                            >
                              {formatDuration(comment.timestampSeconds)}
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-neutral-300">
                          {comment.commentText}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="text-sm text-neutral-400">No feedback on this video yet.</p>
                  )}
                </div>
              </section>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-white/15 bg-[#171a1d] p-8 text-center text-neutral-400">
              No videos are available in this share link.
            </div>
          )}
        </section>

        <aside className="space-y-3 rounded-lg border border-white/10 bg-[#171a1d] p-4 lg:sticky lg:top-5 lg:self-start">
          <h2 className="text-lg font-semibold">Videos</h2>
          {videos.map((video) => (
            <button
              className={`w-full rounded-lg border p-3 text-left ${
                selectedVideo?.id === video.id
                  ? "border-emerald-400/60 bg-emerald-400/10"
                  : "border-white/10 bg-[#101214] hover:border-white/20"
              }`}
              key={video.id}
              onClick={() => {
                setSelectedVideoId(video.id);
                setSeekSeconds(undefined);
              }}
              type="button"
            >
              <span className="block font-medium text-white">{video.title}</span>
              <span className="mt-1 block text-xs text-neutral-400">{getVideoMeta(video)}</span>
              <span className="mt-2 inline-flex rounded-full bg-white/10 px-2 py-1 text-xs text-neutral-300">
                {getStatusLabel(progress[video.id])}
              </span>
            </button>
          ))}
        </aside>
      </div>
    </main>
  );
}
