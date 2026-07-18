import * as React from "react";
import { CheckCircle2, Clock3, MessageSquarePlus, RotateCcw, X } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Separator,
  Textarea,
} from "@/toolcraft/ui";

import type {
  CreatePublicFeedbackInput,
  GuestFeedbackIdentity,
  PublicFeedbackComment,
} from "./feedback-types";
import { calculateVideoPositionPercent, validatePublicFeedbackInput } from "./feedback-utils";
import { getPortalApiErrorMessage, portalApi, PortalApiError } from "./portal-api";
import { formatDuration } from "./portal-utils";

type ReviewMode = "review" | "watch";
type ReviewFilter = "all" | "open" | "resolved";

type DraftPlacement = {
  positionX: number;
  positionY: number;
  timestampSeconds: number;
};

type VideoFeedbackReviewProps = {
  children: React.ReactNode;
  currentTimeSeconds: number;
  directCommentId?: string;
  enabled: boolean;
  onModeChange?: (mode: ReviewMode) => void;
  onPause: () => void;
  onRequestCurrentTime: () => void;
  onSeek: (seconds: number) => void;
  passcode?: string;
  token: string;
  videoId: string;
};

const guestIdentityStorageKey = "pixel-point.feedback.guest.v1";

function loadGuestIdentity(): GuestFeedbackIdentity {
  if (typeof window === "undefined") {
    return { email: "", name: "" };
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(guestIdentityStorageKey) ?? "{}",
    ) as Partial<GuestFeedbackIdentity>;

    return {
      email: typeof parsed.email === "string" ? parsed.email : "",
      name: typeof parsed.name === "string" ? parsed.name : "",
    };
  } catch {
    return { email: "", name: "" };
  }
}

function saveGuestIdentity(identity: GuestFeedbackIdentity): void {
  window.localStorage.setItem(guestIdentityStorageKey, JSON.stringify(identity));
}

function getThreads(comments: PublicFeedbackComment[]): Array<{
  comment: PublicFeedbackComment;
  replies: PublicFeedbackComment[];
}> {
  const repliesByParent = new Map<string, PublicFeedbackComment[]>();

  for (const comment of comments) {
    if (comment.parentId) {
      const replies = repliesByParent.get(comment.parentId) ?? [];
      replies.push(comment);
      repliesByParent.set(comment.parentId, replies);
    }
  }

  return comments
    .filter((comment) => !comment.parentId)
    .sort(
      (left, right) =>
        left.timestampSeconds - right.timestampSeconds ||
        left.createdAt.localeCompare(right.createdAt),
    )
    .map((comment) => ({
      comment,
      replies: (repliesByParent.get(comment.id) ?? []).sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      ),
    }));
}

export function VideoFeedbackReview({
  children,
  currentTimeSeconds,
  directCommentId,
  enabled,
  onModeChange,
  onPause,
  onRequestCurrentTime,
  onSeek,
  passcode,
  token,
  videoId,
}: VideoFeedbackReviewProps): React.JSX.Element {
  const [mode, setMode] = React.useState<ReviewMode>(directCommentId ? "review" : "watch");
  const [filter, setFilter] = React.useState<ReviewFilter>("open");
  const [comments, setComments] = React.useState<PublicFeedbackComment[]>([]);
  const [commentsLoading, setCommentsLoading] = React.useState(enabled);
  const [commentsError, setCommentsError] = React.useState("");
  const [selectedCommentId, setSelectedCommentId] = React.useState<string | null>(
    directCommentId ?? null,
  );
  const [placement, setPlacement] = React.useState<DraftPlacement | null>(null);
  const [identity, setIdentity] = React.useState<GuestFeedbackIdentity>(loadGuestIdentity);
  const [body, setBody] = React.useState("");
  const [submitError, setSubmitError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const commentRefs = React.useRef(new Map<string, HTMLElement>());
  const directHandledRef = React.useRef<string | null>(null);
  const threads = React.useMemo(() => getThreads(comments), [comments]);
  const filteredThreads = threads.filter(
    ({ comment }) => filter === "all" || comment.status === filter,
  );

  const loadComments = React.useCallback(async () => {
    if (!enabled) {
      return;
    }

    setCommentsLoading(true);
    setCommentsError("");

    try {
      const response = await portalApi.getPublicComments(token, videoId, passcode);
      setComments(response.comments);
    } catch (error) {
      setCommentsError(getPortalApiErrorMessage(error));
    } finally {
      setCommentsLoading(false);
    }
  }, [enabled, passcode, token, videoId]);

  React.useEffect(() => {
    void loadComments();
  }, [loadComments]);

  React.useEffect(() => {
    if (!placement || !Number.isFinite(currentTimeSeconds)) {
      return;
    }

    setPlacement((current) =>
      current ? { ...current, timestampSeconds: Math.max(0, currentTimeSeconds) } : current,
    );
  }, [currentTimeSeconds, placement?.positionX, placement?.positionY]);

  React.useEffect(() => {
    if (!directCommentId || directHandledRef.current === directCommentId || commentsLoading) {
      return;
    }

    const directComment = comments.find((comment) => comment.id === directCommentId);

    if (!directComment) {
      setCommentsError("This feedback comment is no longer available.");
      directHandledRef.current = directCommentId;
      return;
    }

    const parent = directComment.parentId
      ? comments.find((comment) => comment.id === directComment.parentId) ?? directComment
      : directComment;

    directHandledRef.current = directCommentId;
    setMode("review");
    setFilter("all");
    setSelectedCommentId(parent.id);
    onModeChange?.("review");
    onPause();
    onSeek(parent.timestampSeconds);

    window.setTimeout(() => {
      commentRefs.current.get(parent.id)?.focus();
      commentRefs.current.get(parent.id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 0);
  }, [comments, commentsLoading, directCommentId, onModeChange, onPause, onSeek]);

  function changeMode(nextMode: ReviewMode): void {
    setMode(nextMode);
    setPlacement(null);
    setSubmitError("");
    onModeChange?.(nextMode);

    if (nextMode === "review") {
      onPause();
      onRequestCurrentTime();
    }
  }

  function handlePlacement(event: React.MouseEvent<HTMLButtonElement>): void {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = calculateVideoPositionPercent(event, bounds);

    onPause();
    onRequestCurrentTime();
    setPlacement({
      positionX: Math.round(position.x * 100) / 100,
      positionY: Math.round(position.y * 100) / 100,
      timestampSeconds: Math.max(0, currentTimeSeconds),
    });
    setSubmitError("");
  }

  function selectComment(comment: PublicFeedbackComment): void {
    setSelectedCommentId(comment.id);
    setPlacement(null);
    onPause();
    onSeek(comment.timestampSeconds);
    commentRefs.current.get(comment.id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!placement) {
      return;
    }

    const draft: CreatePublicFeedbackInput = {
      ...(identity.email.trim() ? { authorEmail: identity.email.trim() } : {}),
      authorName: identity.name,
      body,
      positionX: placement.positionX,
      positionY: placement.positionY,
      timestampSeconds: placement.timestampSeconds,
      videoId,
    };
    const validation = validatePublicFeedbackInput(draft);

    if (!validation.input) {
      setSubmitError(validation.issues[0]?.message ?? "Check the comment fields.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      const created = await portalApi.createPublicComment(token, validation.input, passcode);
      setComments((current) => [...current, created]);
      setSelectedCommentId(created.id);
      saveGuestIdentity({ email: identity.email.trim(), name: identity.name.trim() });
      setIdentity((current) => ({
        email: current.email.trim(),
        name: current.name.trim(),
      }));
      setBody("");
      setPlacement(null);
    } catch (error) {
      setSubmitError(
        error instanceof PortalApiError
          ? getPortalApiErrorMessage(error)
          : "Could not save feedback. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!enabled) {
    return <div id="video-player">{children}</div>;
  }

  return (
    <section aria-label="Video feedback review" className="space-y-3" id="video-player">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-white">Viewing mode</p>
          <p className="text-xs text-[color:var(--muted-foreground)]">
            Place feedback directly on the video in Review mode.
          </p>
        </div>
        <div
          aria-label="Viewing mode"
          className="grid min-h-11 grid-cols-2 rounded-lg border border-[color:var(--portal-border)] bg-black/20 p-1 sm:w-56"
          role="group"
        >
          <Button
            aria-pressed={mode === "watch"}
            className="min-h-9"
            onClick={() => changeMode("watch")}
            size="sm"
            type="button"
            variant={mode === "watch" ? "secondary" : "ghost"}
          >
            Watch
          </Button>
          <Button
            aria-pressed={mode === "review"}
            className="min-h-9"
            onClick={() => changeMode("review")}
            size="sm"
            type="button"
            variant={mode === "review" ? "secondary" : "ghost"}
          >
            Review
          </Button>
        </div>
      </div>

      <div className="relative">
        {children}

        {mode === "review" ? (
          <>
            <Button
              aria-label="Place feedback on video"
              className="absolute inset-0 z-30 !h-auto w-full cursor-crosshair rounded-xl bg-sky-400/[0.025] p-0 hover:bg-sky-400/[0.05]"
              onClick={handlePlacement}
              type="button"
              variant="ghost-static"
            />

            {threads.map(({ comment }, index) =>
              comment.positionX !== undefined && comment.positionY !== undefined ? (
                <Button
                  aria-label={`Open feedback ${index + 1} at ${formatDuration(comment.timestampSeconds)}`}
                  className={`absolute z-40 min-h-10 min-w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border p-0 text-xs font-semibold shadow-lg ${
                    selectedCommentId === comment.id
                      ? "border-white bg-sky-500 text-white"
                      : "border-sky-200/60 bg-sky-500/85 text-white"
                  }`}
                  key={comment.id}
                  onClick={() => selectComment(comment)}
                  style={{ left: `${comment.positionX}%`, top: `${comment.positionY}%` }}
                  type="button"
                  variant="ghost-static"
                >
                  {index + 1}
                </Button>
              ) : null,
            )}

            {placement ? (
              <Card
                className="fixed inset-x-3 bottom-3 top-auto z-[70] max-h-[calc(100dvh-1.5rem)] overflow-y-auto border-sky-300/40 shadow-2xl sm:absolute sm:bottom-auto sm:left-[var(--feedback-left)] sm:right-auto sm:top-[var(--feedback-top)] sm:w-[min(22rem,calc(100%-1.5rem))]"
                style={
                  {
                    "--feedback-left": `clamp(0.75rem, ${placement.positionX}%, calc(100% - 22.75rem))`,
                    "--feedback-top": `clamp(0.75rem, ${placement.positionY}%, calc(100% - 25rem))`,
                  } as React.CSSProperties
                }
              >
                <CardHeader className="gap-3 pr-14">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MessageSquarePlus className="size-4 text-sky-300" />
                      Add feedback
                    </CardTitle>
                    <CardDescription>
                      At {formatDuration(placement.timestampSeconds)} on this point.
                    </CardDescription>
                  </div>
                  <Button
                    aria-label="Cancel feedback"
                    className="absolute right-3 top-3"
                    onClick={() => setPlacement(null)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <X />
                  </Button>
                </CardHeader>
                <CardContent>
                  <form onSubmit={(event) => void handleSubmit(event)}>
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="feedback-author-name">Name</FieldLabel>
                        <Input
                          autoComplete="name"
                          id="feedback-author-name"
                          maxLength={80}
                          onChange={(event) =>
                            setIdentity((current) => ({ ...current, name: event.target.value }))
                          }
                          required
                          size="lg"
                          value={identity.name}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="feedback-author-email">Email (optional)</FieldLabel>
                        <Input
                          autoComplete="email"
                          id="feedback-author-email"
                          maxLength={254}
                          onChange={(event) =>
                            setIdentity((current) => ({ ...current, email: event.target.value }))
                          }
                          size="lg"
                          type="email"
                          value={identity.email}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="feedback-body">Comment</FieldLabel>
                        <Textarea
                          id="feedback-body"
                          maxLength={1000}
                          onChange={(event) => setBody(event.target.value)}
                          placeholder="What should change here?"
                          required
                          rows={4}
                          value={body}
                        />
                      </Field>
                    </FieldGroup>
                    {submitError ? (
                      <p aria-live="polite" className="mt-3 text-sm text-red-300" role="alert">
                        {submitError}
                      </p>
                    ) : null}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button
                        className="min-h-11"
                        disabled={submitting}
                        onClick={() => setPlacement(null)}
                        type="button"
                        variant="outline"
                      >
                        Cancel
                      </Button>
                      <Button className="min-h-11" disabled={submitting} type="submit">
                        {submitting ? "Saving…" : "Add comment"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>

      {mode === "review" ? (
        <Card className="border-[color:var(--portal-border)]" data-testid="public-feedback-panel">
          <CardHeader className="gap-4 md:grid-cols-[1fr_auto]">
            <div>
              <CardTitle className="text-xl">Feedback</CardTitle>
              <CardDescription>
                {threads.length} {threads.length === 1 ? "comment" : "comments"} on this video
              </CardDescription>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-[color:var(--portal-border)] p-1">
              {(["open", "resolved", "all"] as const).map((item) => (
                <Button
                  aria-pressed={filter === item}
                  className="min-h-9 capitalize"
                  key={item}
                  onClick={() => setFilter(item)}
                  size="sm"
                  type="button"
                  variant={filter === item ? "secondary" : "ghost"}
                >
                  {item}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {commentsError ? (
              <div className="rounded-lg border border-red-300/25 bg-red-400/5 p-4">
                <p className="text-sm text-red-200">{commentsError}</p>
                <Button className="mt-3 min-h-10" onClick={() => void loadComments()} type="button" variant="outline">
                  <RotateCcw />
                  Retry
                </Button>
              </div>
            ) : null}

            {commentsLoading ? (
              <p aria-live="polite" className="text-sm text-[color:var(--muted-foreground)]">
                Loading feedback…
              </p>
            ) : filteredThreads.length > 0 ? (
              filteredThreads.map(({ comment, replies }, index) => (
                <article
                  className={`rounded-lg border p-4 outline-none transition-colors ${
                    selectedCommentId === comment.id
                      ? "border-sky-400/60 bg-sky-400/10"
                      : "border-white/10 bg-black/10"
                  }`}
                  key={comment.id}
                  ref={(node) => {
                    if (node) {
                      commentRefs.current.set(comment.id, node);
                    } else {
                      commentRefs.current.delete(comment.id);
                    }
                  }}
                  tabIndex={-1}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sky-500/20 text-xs font-semibold text-sky-100">
                        {threads.findIndex((thread) => thread.comment.id === comment.id) + 1 || index + 1}
                      </span>
                      <span className="truncate text-sm font-semibold text-white">
                        {comment.authorName}
                      </span>
                      <Badge variant={comment.status === "resolved" ? "secondary" : "mutedOutline"}>
                        {comment.status}
                      </Badge>
                    </div>
                    <Button
                      className="min-h-10"
                      onClick={() => selectComment(comment)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Clock3 />
                      {formatDuration(comment.timestampSeconds)}
                    </Button>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/90">
                    {comment.body}
                  </p>
                  {replies.length > 0 ? (
                    <div className="mt-4 space-y-3 border-l border-sky-300/25 pl-4">
                      {replies.map((reply) => (
                        <div key={reply.id}>
                          <div className="flex items-center gap-2 text-xs text-sky-200">
                            <CheckCircle2 className="size-3.5" />
                            {reply.authorName}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[color:var(--muted-foreground)]">
                            {reply.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 px-4 py-8 text-center">
                <p className="text-sm font-medium text-white">
                  {threads.length === 0 ? "No feedback yet" : `No ${filter} feedback`}
                </p>
                <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                  Click the video to leave a timestamped note.
                </p>
              </div>
            )}
            <Separator />
            <p className="text-xs leading-5 text-[color:var(--muted-foreground)]">
              Your name and optional email are remembered only on this device for convenience.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
