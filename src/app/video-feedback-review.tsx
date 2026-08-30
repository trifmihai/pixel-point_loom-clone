import * as React from "react";
import {
  CheckCircle2,
  Clock3,
  MessageSquarePlus,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
import {
  getFeedbackEditToken,
  removeFeedbackEditToken,
  saveFeedbackEditToken,
} from "./feedback-ownership";
import { calculateVideoPositionPercent, validatePublicFeedbackInput } from "./feedback-utils";
import { shouldHandleFeedbackShortcut } from "./feedback-timeline";
import { getPortalApiErrorMessage, portalApi, PortalApiError } from "./portal-api";
import { formatDuration } from "./portal-utils";

type ReviewFilter = "all" | "open" | "resolved";

type DraftPlacement = {
  positionX?: number;
  positionY?: number;
  timestampSeconds: number;
};

type VideoFeedbackReviewProps = {
  children: React.ReactNode;
  currentTimeSeconds: number;
  directCommentId?: string;
  enabled: boolean;
  onCommentingChange?: (commenting: boolean) => void;
  onPause: () => void;
  playbackRevision?: number;
  onRequestCurrentTime: (onCaptured?: (seconds: number) => void) => void;
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
  onCommentingChange,
  onPause,
  playbackRevision = 0,
  onRequestCurrentTime,
  onSeek,
  passcode,
  token,
  videoId,
}: VideoFeedbackReviewProps): React.JSX.Element {
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
  const [editingIdentity, setEditingIdentity] = React.useState(false);
  const [emailExpanded, setEmailExpanded] = React.useState(false);
  const [submitError, setSubmitError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [editingCommentId, setEditingCommentId] = React.useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const [liveMessage, setLiveMessage] = React.useState("Watching");
  const [editBody, setEditBody] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<PublicFeedbackComment | null>(null);
  const [mutatingCommentId, setMutatingCommentId] = React.useState<string | null>(null);
  const [mutationError, setMutationError] = React.useState<{
    id: string;
    message: string;
  } | null>(null);
  const commentRefs = React.useRef(new Map<string, HTMLElement>());
  const directHandledRef = React.useRef<string | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const nameRef = React.useRef<HTMLInputElement | null>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement | null>(null);
  const previousPlaybackRevisionRef = React.useRef(playbackRevision);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const pendingFocusCommentIdRef = React.useRef<string | null>(null);
  const composerSessionRef = React.useRef(0);
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

  React.useLayoutEffect(() => {
    if (!enabled || discardOpen || deleteTarget) {
      return undefined;
    }

    function handleShortcut(event: KeyboardEvent): void {

      const editable =
        event.target instanceof Element &&
        Boolean(
          event.target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
          ),
        );

      if (
        shouldHandleFeedbackShortcut({
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          editable,
          key: event.key,
          metaKey: event.metaKey,
          repeat: event.repeat,
        })
      ) {
        event.preventDefault();
        openComposer();
        return;
      }

      if (event.key === "Escape" && placement && !deleteTarget && !discardOpen) {
        event.preventDefault();
        requestCloseComposer();
      }
    }

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  });


  React.useEffect(() => {
    const pendingId = pendingFocusCommentIdRef.current;
    if (placement || !pendingId || selectedCommentId !== pendingId) {
      return;
    }

    const target = commentRefs.current.get(pendingId);
    if (!target) {
      return;
    }

    pendingFocusCommentIdRef.current = null;
    target.focus({ preventScroll: true });
  }, [comments, filter, placement, selectedCommentId]);

  React.useEffect(() => {
    if (previousPlaybackRevisionRef.current === playbackRevision) {
      return;
    }
    previousPlaybackRevisionRef.current = playbackRevision;
    if (!placement) {
      setSelectedCommentId(null);
      setLiveMessage("Watching");
    }
  }, [placement, playbackRevision]);

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
    setFilter("all");
    setSelectedCommentId(parent.id);
    onPause();
    onSeek(parent.timestampSeconds);

    window.setTimeout(() => {
      commentRefs.current.get(parent.id)?.focus();
      commentRefs.current.get(parent.id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 0);
  }, [comments, commentsLoading, directCommentId, onPause, onSeek]);

  function openComposer(): void {
    if (placement) {
      (identity.name.trim() ? bodyRef.current : nameRef.current)?.focus({ preventScroll: true });
      return;
    }

    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const session = ++composerSessionRef.current;
    onPause();
    setSelectedCommentId(null);
    setPlacement({ timestampSeconds: Math.max(0, currentTimeSeconds) });
    onRequestCurrentTime((timestampSeconds) => {
      if (composerSessionRef.current !== session) {
        return;
      }
      setPlacement((current) =>
        current
          ? { ...current, timestampSeconds: Math.max(0, timestampSeconds) }
          : current,
      );
    });
    setSubmitError("");
    setLiveMessage(`Commenting at ${formatDuration(Math.max(0, currentTimeSeconds))}`);
    onCommentingChange?.(true);
    window.setTimeout(
      () => (identity.name.trim() ? bodyRef.current : nameRef.current)?.focus({ preventScroll: true }),
      0,
    );
  }

  function closeComposer(): void {
    composerSessionRef.current += 1;
    setPlacement(null);
    setBody("");
    setSubmitError("");
    setDiscardOpen(false);
    setEditingIdentity(false);
    setEmailExpanded(false);
    setLiveMessage("Watching");
    onCommentingChange?.(false);
    window.setTimeout(() => returnFocusRef.current?.focus({ preventScroll: true }), 0);
  }

  function requestCloseComposer(): void {
    if (body.trim()) {
      setDiscardOpen(true);
    } else {
      closeComposer();
    }
  }


  function trapDialogFocus(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled])',
      ) ?? [],
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  function handlePlacement(event: React.MouseEvent<HTMLButtonElement>): void {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = calculateVideoPositionPercent(event, bounds);

    onPause();
    setPlacement((current) => ({
      positionX: Math.round(position.x * 100) / 100,
      positionY: Math.round(position.y * 100) / 100,
      timestampSeconds: current?.timestampSeconds ?? Math.max(0, currentTimeSeconds),
    }));
    setSubmitError("");
  }

  function selectComment(comment: PublicFeedbackComment): void {
    if (placement) {
      return;
    }

    setSelectedCommentId(comment.id);
    onCommentingChange?.(false);
    onPause();
    onSeek(comment.timestampSeconds);
    setLiveMessage(`Reviewing comment at ${formatDuration(comment.timestampSeconds)}`);
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
      ...(placement.positionX !== undefined && placement.positionY !== undefined
        ? {
            positionX: placement.positionX,
            positionY: placement.positionY,
          }
        : {}),
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
      saveFeedbackEditToken(
        window.localStorage,
        token,
        created.comment.id,
        created.editToken,
      );
      pendingFocusCommentIdRef.current = created.comment.id;
      setFilter("open");
      setComments((current) => [...current, created.comment]);
      setSelectedCommentId(created.comment.id);
      saveGuestIdentity({ email: identity.email.trim(), name: identity.name.trim() });
      setIdentity((current) => ({
        email: current.email.trim(),
        name: current.name.trim(),
      }));
      setBody("");
      composerSessionRef.current += 1;
      setPlacement(null);
      setEditingIdentity(false);
      setEmailExpanded(false);
      onCommentingChange?.(false);
      setLiveMessage(`Comment saved at ${formatDuration(created.comment.timestampSeconds)}`);
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

  function beginEdit(comment: PublicFeedbackComment): void {
    setEditingCommentId(comment.id);
    setEditBody(comment.body);
    setMutationError(null);
  }

  function cancelEdit(): void {
    setEditingCommentId(null);
    setEditBody("");
    setMutationError(null);
  }

  async function saveEdit(comment: PublicFeedbackComment): Promise<void> {
    const trimmedBody = editBody.trim();

    if (!trimmedBody || trimmedBody.length > 1000) {
      setMutationError({
        id: comment.id,
        message: "Feedback must be between 1 and 1000 characters.",
      });
      return;
    }

    const editToken = getFeedbackEditToken(window.localStorage, token, comment.id);

    if (!editToken) {
      setMutationError({
        id: comment.id,
        message: "This browser no longer has permission to edit that comment.",
      });
      return;
    }

    setMutatingCommentId(comment.id);
    setMutationError(null);

    try {
      const updated = await portalApi.updatePublicComment(
        token,
        videoId,
        comment.id,
        { body: trimmedBody },
        editToken,
        passcode,
      );
      setComments((current) =>
        current.map((candidate) => (candidate.id === updated.id ? updated : candidate)),
      );
      setEditingCommentId(null);
      setEditBody("");
    } catch (error) {
      setMutationError({
        id: comment.id,
        message: getPortalApiErrorMessage(error),
      });
    } finally {
      setMutatingCommentId(null);
    }
  }

  async function deleteComment(comment: PublicFeedbackComment): Promise<void> {
    const editToken = getFeedbackEditToken(window.localStorage, token, comment.id);

    if (!editToken) {
      setMutationError({
        id: comment.id,
        message: "This browser no longer has permission to delete that comment.",
      });
      return;
    }

    setMutatingCommentId(comment.id);
    setMutationError(null);

    try {
      await portalApi.deletePublicComment(
        token,
        videoId,
        comment.id,
        editToken,
        passcode,
      );
      setComments((current) =>
        current.filter(
          (candidate) => candidate.id !== comment.id && candidate.parentId !== comment.id,
        ),
      );
      setSelectedCommentId((current) => (current === comment.id ? null : current));
      removeFeedbackEditToken(window.localStorage, comment.id);
      setDeleteTarget(null);
      setEditingCommentId((current) => (current === comment.id ? null : current));
    } catch (error) {
      setMutationError({
        id: comment.id,
        message: getPortalApiErrorMessage(error),
      });
    } finally {
      setMutatingCommentId(null);
    }
  }

  if (!enabled) {
    return <div id="video-player">{children}</div>;
  }

  return (
    <section
      aria-keyshortcuts="C"
      aria-label="Video feedback review"
      className="space-y-3"
      id="video-player"
    >
      <p aria-live="polite" className="sr-only">
        {liveMessage}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-white">
            {placement
              ? `Commenting at ${formatDuration(placement.timestampSeconds)}`
              : selectedCommentId
                ? "Inspecting feedback"
                : "Watching"}
          </p>
          <p className="text-xs text-[color:var(--muted-foreground)]">
            {placement
              ? "Add an optional pin by clicking the video, then write your comment."
              : "Press C or use Comment to leave timestamped feedback."}
          </p>
        </div>
        <Button
          aria-label="Comment at current time"
          className="min-h-11 sm:min-w-40"
          onClick={openComposer}
          size="sm"
          type="button"
          variant="secondary"
        >
          <MessageSquarePlus aria-hidden="true" />
          Comment <kbd className="rounded border border-white/20 px-1 text-[0.65rem]">C</kbd>
        </Button>
      </div>

      <div
        className={`relative rounded-xl transition-[box-shadow] duration-200 ${
          placement || selectedCommentId
            ? "shadow-[0_0_0_2px_rgba(125,211,252,0.45),0_0_28px_rgba(56,189,248,0.14)]"
            : ""
        }`}
        data-commenting={Boolean(placement)}
        data-inspecting={Boolean(selectedCommentId)}
        data-testid="video-review-frame"
      >
        {children}

          <>
            {placement ? (
            <Button
              aria-label="Place feedback on video"
              className="absolute inset-0 z-30 !h-auto w-full cursor-crosshair rounded-xl bg-sky-400/[0.025] p-0 hover:bg-sky-400/[0.05]"
              onClick={handlePlacement}
              type="button"
              variant="ghost-static"
            />
            ) : null}

            {threads.map(({ comment }, index) =>
              comment.positionX !== undefined && comment.positionY !== undefined ? (
                <Button
                  aria-label={`Open feedback ${index + 1} at ${formatDuration(comment.timestampSeconds)}`}
                  className={`absolute z-40 min-h-10 min-w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border p-0 text-xs font-semibold shadow-lg ${
                    selectedCommentId === comment.id
                      ? "border-white bg-sky-500 text-white"
                      : "border-sky-200/60 bg-sky-500/85 text-white"
                  }`}
                  disabled={Boolean(placement)}
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
                aria-label={`Add comment at ${formatDuration(placement.timestampSeconds)}`}
                className="fixed inset-x-3 bottom-3 top-auto z-[45] max-h-[calc(100dvh-1.5rem)] overflow-y-auto border-sky-300/40 shadow-2xl sm:absolute sm:bottom-3 sm:left-auto sm:right-3 sm:w-[min(22rem,calc(100%-1.5rem))]"
                onKeyDown={trapDialogFocus}
                ref={dialogRef}
                role="dialog"
              >
                <CardHeader className="gap-3 pr-14">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MessageSquarePlus className="size-4 text-sky-300" />
                      Add feedback
                    </CardTitle>
                    <CardDescription>
                      Commenting at {formatDuration(placement.timestampSeconds)}. Click the video to add an optional pin.
                    </CardDescription>
                  </div>
                  <Button
                    aria-label="Cancel feedback"
                    className="absolute right-3 top-3"
                    onClick={requestCloseComposer}
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
                      {identity.name.trim() && !editingIdentity ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                          <span className="truncate text-sm text-white/85">
                            Commenting as {identity.name.trim()}
                          </span>
                          <Button
                            onClick={() => setEditingIdentity(true)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Change name
                          </Button>
                        </div>
                      ) : (
                        <Field>
                          <FieldLabel htmlFor="feedback-author-name">Name</FieldLabel>
                          <Input
                            autoComplete="name"
                            id="feedback-author-name"
                            maxLength={80}
                            onChange={(event) =>
                              setIdentity((current) => ({ ...current, name: event.target.value }))
                            }
                            ref={nameRef}
                            required
                            size="lg"
                            value={identity.name}
                          />
                        </Field>
                      )}
                      <Button
                        aria-expanded={emailExpanded}
                        className="justify-start"
                        onClick={() => setEmailExpanded((current) => !current)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {identity.email.trim() ? "Edit email (optional)" : "Add email (optional)"}
                      </Button>
                      {emailExpanded ? (
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
                      ) : null}
                      <Field>
                        <FieldLabel htmlFor="feedback-body">Comment</FieldLabel>
                        <Textarea
                          id="feedback-body"
                          maxLength={1000}
                          onChange={(event) => setBody(event.target.value)}
                          placeholder="What should change here?"
                          ref={bodyRef}
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
                        onClick={requestCloseComposer}
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
      </div>

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
                      disabled={Boolean(placement)}
                      onClick={() => selectComment(comment)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Clock3 />
                      {formatDuration(comment.timestampSeconds)}
                    </Button>
                  </div>
                  {editingCommentId === comment.id ? (
                    <form
                      className="mt-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveEdit(comment);
                      }}
                    >
                      <Field>
                        <FieldLabel htmlFor={`feedback-edit-${comment.id}`}>
                          Edit comment
                        </FieldLabel>
                        <Textarea
                          autoFocus
                          id={`feedback-edit-${comment.id}`}
                          maxLength={1000}
                          onChange={(event) => setEditBody(event.target.value)}
                          required
                          rows={4}
                          value={editBody}
                        />
                      </Field>
                      {mutationError?.id === comment.id ? (
                        <p
                          aria-live="polite"
                          className="mt-2 text-sm text-red-300"
                          role="alert"
                        >
                          {mutationError.message}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <Button
                          disabled={mutatingCommentId === comment.id}
                          onClick={cancelEdit}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Cancel
                        </Button>
                        <Button
                          disabled={mutatingCommentId === comment.id}
                          size="sm"
                          type="submit"
                        >
                          {mutatingCommentId === comment.id ? "Saving…" : "Save changes"}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/90">
                        {comment.body}
                      </p>
                      {getFeedbackEditToken(window.localStorage, token, comment.id) ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            onClick={() => beginEdit(comment)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Pencil />
                            Edit
                          </Button>
                          <Button
                            onClick={() => {
                              setMutationError(null);
                              setDeleteTarget(comment);
                            }}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 />
                            Delete
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
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

      <AlertDialog onOpenChange={setDiscardOpen} open={discardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              Your comment has not been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={closeComposer}
              variant="destructive"
            >
              Discard draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !mutatingCommentId) {
            setDeleteTarget(null);
            setMutationError(null);
          }
        }}
        open={Boolean(deleteTarget)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              The comment, its video pin, and its replies will disappear from this review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteTarget && mutationError?.id === deleteTarget.id ? (
            <p aria-live="polite" className="text-sm text-red-300" role="alert">
              {mutationError.message}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(mutatingCommentId)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteTarget || mutatingCommentId === deleteTarget.id}
              onClick={() => deleteTarget && void deleteComment(deleteTarget)}
              variant="destructive"
            >
              {deleteTarget && mutatingCommentId === deleteTarget.id
                ? "Deleting…"
                : "Delete comment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
