import * as React from "react";
import { ChevronLeft, ChevronRight, Mail, MessageSquarePlus, Pencil, Trash2, X } from "lucide-react";

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
  Field,
  FieldLabel,
  Input,
  Textarea,
} from "@/toolcraft/ui";

import {
  buildFeedbackTimelineClusters,
  buildVideoReviewHref,
  shouldHandleFeedbackShortcut,
} from "./feedback-timeline";
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
import { validatePublicFeedbackInput } from "./feedback-utils";
import { getPortalApiErrorMessage, portalApi, PortalApiError } from "./portal-api";
import { formatDuration } from "./portal-utils";

type CompactVideoFeedbackProps = {
  children: React.ReactNode;
  currentTimeSeconds: number;
  durationSeconds?: number;
  enabled: boolean;
  onCommentingChange?: (commenting: boolean) => void;
  onPause: () => void;
  onPlaybackRevision?: number;
  onRequestCurrentTime: (onCaptured?: (seconds: number) => void) => void;
  onSeek: (seconds: number) => void;
  passcode?: string;
  reviewHref: string;
  token: string;
  videoId: string;
};

type DraftComment = {
  timestampSeconds: number;
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
  try {
    window.localStorage.setItem(guestIdentityStorageKey, JSON.stringify(identity));
  } catch {
    // Feedback creation remains usable when browser storage is blocked.
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'),
    )
  );
}

function getReplyCount(comments: PublicFeedbackComment[], commentId: string): number {
  return comments.filter((comment) => comment.parentId === commentId).length;
}

export function CompactVideoFeedback({
  children,
  currentTimeSeconds,
  durationSeconds,
  enabled,
  onCommentingChange,
  onPause,
  onPlaybackRevision = 0,
  onRequestCurrentTime,
  onSeek,
  passcode,
  reviewHref,
  token,
  videoId,
}: CompactVideoFeedbackProps): React.JSX.Element {
  const [comments, setComments] = React.useState<PublicFeedbackComment[]>([]);
  const [commentsError, setCommentsError] = React.useState("");
  const [commentsLoading, setCommentsLoading] = React.useState(enabled);
  const [draft, setDraft] = React.useState<DraftComment | null>(null);
  const [body, setBody] = React.useState("");
  const [identity, setIdentity] = React.useState<GuestFeedbackIdentity>(loadGuestIdentity);
  const [editingIdentity, setEditingIdentity] = React.useState(false);
  const [emailExpanded, setEmailExpanded] = React.useState(false);
  const [selectedCommentId, setSelectedCommentId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState("");
  const [editingCommentId, setEditingCommentId] = React.useState<string | null>(null);
  const [editBody, setEditBody] = React.useState("");
  const [mutatingCommentId, setMutatingCommentId] = React.useState<string | null>(null);
  const [mutationError, setMutationError] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<PublicFeedbackComment | null>(null);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const [railWidth, setRailWidth] = React.useState(0);
  const [liveMessage, setLiveMessage] = React.useState("Watching");
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const nameRef = React.useRef<HTMLInputElement | null>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement | null>(null);
  const selectedCardRef = React.useRef<HTMLElement | null>(null);
  const pendingFocusCommentIdRef = React.useRef<string | null>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const composerSessionRef = React.useRef(0);
  const previousPlaybackRevisionRef = React.useRef(onPlaybackRevision);

  const clusters = React.useMemo(
    () => buildFeedbackTimelineClusters(comments, durationSeconds ?? 0, railWidth),
    [comments, durationSeconds, railWidth],
  );
  const topLevelComments = React.useMemo(
    () => comments.filter((comment) => !comment.parentId),
    [comments],
  );
  const selectedComment =
    topLevelComments.find((comment) => comment.id === selectedCommentId) ?? null;
  const selectedCluster = clusters.find((cluster) =>
    cluster.items.some((item) => item.comment.id === selectedCommentId),
  );
  const selectedClusterIndex =
    selectedCluster?.items.findIndex((item) => item.comment.id === selectedCommentId) ?? -1;
  const railVisible =
    !commentsLoading && Number.isFinite(durationSeconds) && (durationSeconds ?? 0) > 0;

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
    const rail = railRef.current;
    if (!rail) {
      return undefined;
    }

    const updateWidth = () => setRailWidth(rail.getBoundingClientRect().width);
    updateWidth();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateWidth);
    observer?.observe(rail);
    return () => observer?.disconnect();
  }, [railVisible]);

  React.useEffect(() => {
    if (previousPlaybackRevisionRef.current === onPlaybackRevision) {
      return;
    }
    previousPlaybackRevisionRef.current = onPlaybackRevision;
    if (!draft) {
      setSelectedCommentId(null);
      setLiveMessage("Watching");
    }
  }, [draft, onPlaybackRevision]);


  React.useEffect(() => {
    if (!draft) {
      return;
    }
    const timeout = window.setTimeout(() => {
      (identity.name.trim() ? bodyRef.current : nameRef.current)?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [draft, identity.name]);

  React.useEffect(() => {
    const pendingId = pendingFocusCommentIdRef.current;
    if (draft || !pendingId || selectedCommentId !== pendingId || !selectedCardRef.current) {
      return;
    }

    pendingFocusCommentIdRef.current = null;
    selectedCardRef.current.focus({ preventScroll: true });
  }, [comments, draft, selectedCommentId]);

  function openComposer(): void {
    if (draft) {
      (identity.name.trim() ? bodyRef.current : nameRef.current)?.focus({ preventScroll: true });
      return;
    }

    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const session = ++composerSessionRef.current;
    onPause();
    setSelectedCommentId(null);
    setDraft({ timestampSeconds: Math.max(0, currentTimeSeconds) });
    onRequestCurrentTime((timestampSeconds) => {
      if (composerSessionRef.current !== session) {
        return;
      }
      setDraft((current) =>
        current ? { timestampSeconds: Math.max(0, timestampSeconds) } : current,
      );
    });
    setSubmitError("");
    setMutationError("");
    setLiveMessage(`Commenting at ${formatDuration(Math.max(0, currentTimeSeconds))}`);
    onCommentingChange?.(true);
  }

  function closeComposer(): void {
    composerSessionRef.current += 1;
    setDraft(null);
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


  React.useLayoutEffect(() => {
    if (!enabled || discardOpen || deleteTarget) {
      return undefined;
    }

    function handleShortcut(event: KeyboardEvent): void {

      if (
        shouldHandleFeedbackShortcut({
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          editable: isEditableTarget(event.target),
          key: event.key,
          metaKey: event.metaKey,
          repeat: event.repeat,
        })
      ) {
        event.preventDefault();
        openComposer();
        return;
      }

      if (event.key === "Escape" && draft && !deleteTarget && !discardOpen) {
        event.preventDefault();
        requestCloseComposer();
      }
    }

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  });

  function selectComment(comment: PublicFeedbackComment): void {
    if (draft) {
      return;
    }

    setSelectedCommentId(comment.id);
    setEditingCommentId(null);
    setMutationError("");
    onPause();
    onSeek(comment.timestampSeconds);
    setLiveMessage(`Comment by ${comment.authorName} at ${formatDuration(comment.timestampSeconds)}`);
  }

  function moveWithinCluster(direction: -1 | 1): void {
    if (!selectedCluster || selectedCluster.items.length < 2) {
      return;
    }
    const nextIndex =
      (selectedClusterIndex + direction + selectedCluster.items.length) %
      selectedCluster.items.length;
    selectComment(selectedCluster.items[nextIndex]!.comment);
  }

  async function submitComment(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!draft) {
      return;
    }

    const input: CreatePublicFeedbackInput = {
      ...(identity.email.trim() ? { authorEmail: identity.email.trim() } : {}),
      authorName: identity.name,
      body,
      timestampSeconds: draft.timestampSeconds,
      videoId,
    };
    const validation = validatePublicFeedbackInput(input);
    if (!validation.input) {
      setSubmitError(validation.issues[0]?.message ?? "Check the comment fields.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      const created = await portalApi.createPublicComment(token, validation.input, passcode);
      saveFeedbackEditToken(window.localStorage, token, created.comment.id, created.editToken);
      pendingFocusCommentIdRef.current = created.comment.id;
      setComments((current) => [...current, created.comment]);
      setSelectedCommentId(created.comment.id);
      const nextIdentity = { email: identity.email.trim(), name: identity.name.trim() };
      saveGuestIdentity(nextIdentity);
      setIdentity(nextIdentity);
      composerSessionRef.current += 1;
      setDraft(null);
      setBody("");
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
    setMutationError("");
  }

  async function saveEdit(comment: PublicFeedbackComment): Promise<void> {
    const trimmedBody = editBody.trim();
    if (!trimmedBody || trimmedBody.length > 1000) {
      setMutationError("Comment must be between 1 and 1000 characters.");
      return;
    }
    const editToken = getFeedbackEditToken(window.localStorage, token, comment.id);
    if (!editToken) {
      setMutationError("This browser no longer has permission to edit that comment.");
      return;
    }

    setMutatingCommentId(comment.id);
    setMutationError("");
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
      setLiveMessage("Comment updated");
    } catch (error) {
      setMutationError(getPortalApiErrorMessage(error));
    } finally {
      setMutatingCommentId(null);
    }
  }

  async function deleteComment(comment: PublicFeedbackComment): Promise<void> {
    const editToken = getFeedbackEditToken(window.localStorage, token, comment.id);
    if (!editToken) {
      setMutationError("This browser no longer has permission to delete that comment.");
      return;
    }

    setMutatingCommentId(comment.id);
    setMutationError("");
    try {
      await portalApi.deletePublicComment(token, videoId, comment.id, editToken, passcode);
      setComments((current) =>
        current.filter(
          (candidate) => candidate.id !== comment.id && candidate.parentId !== comment.id,
        ),
      );
      removeFeedbackEditToken(window.localStorage, comment.id);
      setSelectedCommentId(null);
      setDeleteTarget(null);
      setEditingCommentId(null);
      setLiveMessage("Comment deleted");
    } catch (error) {
      setMutationError(getPortalApiErrorMessage(error));
    } finally {
      setMutatingCommentId(null);
    }
  }

  function trapDialogFocus(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled])',
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

  if (!enabled) {
    return <div className="feedback-review__frame">{children}</div>;
  }

  return (
    <section
      aria-keyshortcuts="C"
      aria-label="Video feedback review"
      className="compact-feedback"
    >
      <p aria-live="polite" className="sr-only">{liveMessage}</p>
      <div
        className="feedback-review__frame"
        data-commenting={Boolean(draft)}
        data-inspecting={Boolean(selectedComment)}
        data-testid="video-review-frame"
      >
        {children}

        <div className="compact-feedback__status" aria-hidden="true">
          {draft ? `Commenting at ${formatDuration(draft.timestampSeconds)}` : "Watching"}
        </div>
        <Button
          aria-label="Comment at current time"
          className="compact-feedback__comment-button"
          onClick={openComposer}
          size="sm"
          type="button"
          variant="secondary"
        >
          <MessageSquarePlus />
          Comment <kbd>C</kbd>
        </Button>

        {railVisible ? (
          <div
            aria-label="Video comments"
            className="compact-feedback__rail"
            ref={railRef}
            role="group"
          >
            <span aria-hidden="true" className="compact-feedback__rail-line" />
            {clusters.map((cluster) => {
              const first = cluster.items[0]!.comment;
              const active = cluster.items.some((item) => item.comment.id === selectedCommentId);
              const label =
                cluster.items.length === 1
                  ? `Open comment by ${first.authorName} at ${formatDuration(first.timestampSeconds)}: ${first.body}`
                  : `Open ${cluster.items.length} comments around ${formatDuration(first.timestampSeconds)}`;

              return (
                <Button
                  aria-label={label}
                  aria-pressed={active}
                  className="compact-feedback__marker"
                  data-clustered={cluster.items.length > 1}
                  disabled={Boolean(draft)}
                  key={cluster.items.map((item) => item.comment.id).join("-")}
                  onClick={() => selectComment(first)}
                  style={{ left: `${cluster.positionPercent}%` }}
                  type="button"
                  variant="ghost-static"
                >
                  <span className="compact-feedback__marker-label">
                    {cluster.items.length > 1
                      ? cluster.items.length
                      : formatDuration(first.timestampSeconds)}
                  </span>
                </Button>
              );
            })}
          </div>
        ) : null}

        {commentsError ? (
          <div className="compact-feedback__notice" role="alert">
            <span>{commentsError}</span>
            <Button onClick={() => void loadComments()} size="sm" type="button" variant="outline">
              Retry
            </Button>
          </div>
        ) : null}

        {selectedComment && !draft ? (
          <article
            className="compact-feedback__card"
            data-testid="feedback-comment-card"
            ref={selectedCardRef}
            tabIndex={-1}
          >
            <div className="compact-feedback__card-header">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{selectedComment.authorName}</p>
                <p className="text-xs text-sky-200">{formatDuration(selectedComment.timestampSeconds)}</p>
              </div>
              <div className="flex items-center gap-1">
                {selectedCluster && selectedCluster.items.length > 1 ? (
                  <>
                    <Button aria-label="Previous nearby comment" onClick={() => moveWithinCluster(-1)} size="icon-sm" type="button" variant="ghost"><ChevronLeft /></Button>
                    <span className="text-xs text-white/60">{selectedClusterIndex + 1}/{selectedCluster.items.length}</span>
                    <Button aria-label="Next nearby comment" onClick={() => moveWithinCluster(1)} size="icon-sm" type="button" variant="ghost"><ChevronRight /></Button>
                  </>
                ) : null}
                <Button aria-label="Close comment" onClick={() => setSelectedCommentId(null)} size="icon-sm" type="button" variant="ghost"><X /></Button>
              </div>
            </div>

            {editingCommentId === selectedComment.id ? (
              <form className="mt-3" onSubmit={(event) => { event.preventDefault(); void saveEdit(selectedComment); }}>
                <Field>
                  <FieldLabel htmlFor={`compact-feedback-edit-${selectedComment.id}`}>Edit comment</FieldLabel>
                  <Textarea autoFocus id={`compact-feedback-edit-${selectedComment.id}`} maxLength={1000} onChange={(event) => setEditBody(event.target.value)} required rows={3} value={editBody} />
                </Field>
                {mutationError ? <p className="mt-2 text-xs text-red-300" role="alert">{mutationError}</p> : null}
                <div className="mt-3 flex justify-end gap-2">
                  <Button onClick={() => setEditingCommentId(null)} size="sm" type="button" variant="outline">Cancel</Button>
                  <Button disabled={mutatingCommentId === selectedComment.id} size="sm" type="submit">{mutatingCommentId ? "Saving…" : "Save changes"}</Button>
                </div>
              </form>
            ) : (
              <>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-5 text-white/90">{selectedComment.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {getReplyCount(comments, selectedComment.id) > 0 ? (
                    <Badge variant="mutedOutline">{getReplyCount(comments, selectedComment.id)} {getReplyCount(comments, selectedComment.id) === 1 ? "reply" : "replies"}</Badge>
                  ) : null}
                  {getFeedbackEditToken(window.localStorage, token, selectedComment.id) ? (
                    <>
                      <Button onClick={() => beginEdit(selectedComment)} size="sm" type="button" variant="ghost"><Pencil />Edit</Button>
                      <Button onClick={() => { setMutationError(""); setDeleteTarget(selectedComment); }} size="sm" type="button" variant="ghost"><Trash2 />Delete</Button>
                    </>
                  ) : null}
                  <a className="compact-feedback__review-link" href={buildVideoReviewHref(reviewHref, selectedComment.timestampSeconds, selectedComment.id)} rel="noreferrer" target="_blank">Open full review</a>
                </div>
              </>
            )}
          </article>
        ) : null}

        {draft ? (
          <div
            aria-label={`Add comment at ${formatDuration(draft.timestampSeconds)}`}
            aria-modal="true"
            className="compact-feedback__composer"
            onKeyDown={trapDialogFocus}
            ref={dialogRef}
            role="dialog"
          >
            <div className="compact-feedback__composer-header">
              <div>
                <p className="text-sm font-semibold text-white">Commenting at {formatDuration(draft.timestampSeconds)}</p>
                <p className="text-xs text-white/55">Playback is paused.</p>
              </div>
              <Button aria-label="Cancel comment" onClick={requestCloseComposer} size="icon-sm" type="button" variant="ghost"><X /></Button>
            </div>
            <form className="mt-3 space-y-3" onSubmit={(event) => void submitComment(event)}>
              {identity.name.trim() && !editingIdentity ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-white/10 px-3 py-2">
                  <span className="truncate text-xs text-white/75">Commenting as {identity.name.trim()}</span>
                  <Button onClick={() => setEditingIdentity(true)} size="sm" type="button" variant="ghost">Change</Button>
                </div>
              ) : (
                <Field>
                  <FieldLabel htmlFor="compact-feedback-name">Name</FieldLabel>
                  <Input id="compact-feedback-name" maxLength={80} onChange={(event) => setIdentity((current) => ({ ...current, name: event.target.value }))} ref={nameRef} required value={identity.name} />
                </Field>
              )}
              {emailExpanded ? (
                <Field>
                  <FieldLabel htmlFor="compact-feedback-email">Email (optional)</FieldLabel>
                  <Input id="compact-feedback-email" maxLength={254} onChange={(event) => setIdentity((current) => ({ ...current, email: event.target.value }))} type="email" value={identity.email} />
                </Field>
              ) : (
                <Button onClick={() => setEmailExpanded(true)} size="sm" type="button" variant="ghost"><Mail />Add email (optional)</Button>
              )}
              <Field>
                <FieldLabel htmlFor="compact-feedback-body">Comment</FieldLabel>
                <Textarea id="compact-feedback-body" maxLength={1000} onChange={(event) => setBody(event.target.value)} placeholder="What should change here?" ref={bodyRef} required rows={3} value={body} />
              </Field>
              {submitError ? <p className="text-xs text-red-300" role="alert">{submitError}</p> : null}
              <div className="compact-feedback__composer-actions">
                <a className="compact-feedback__review-link" href={buildVideoReviewHref(reviewHref, draft.timestampSeconds)} rel="noreferrer" target="_blank">Open full review</a>
                <Button onClick={requestCloseComposer} size="sm" type="button" variant="outline">Cancel</Button>
                <Button disabled={submitting} size="sm" type="submit">{submitting ? "Saving…" : "Add comment"}</Button>
              </div>
            </form>
          </div>
        ) : null}
      </div>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Discard this comment?</AlertDialogTitle><AlertDialogDescription>Your unsaved comment will be removed.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={closeComposer} variant="destructive">Discard comment</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !mutatingCommentId) { setDeleteTarget(null); setMutationError(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this comment?</AlertDialogTitle><AlertDialogDescription>The comment, its marker, and its replies will disappear from this review.</AlertDialogDescription></AlertDialogHeader>
          {mutationError ? <p className="text-sm text-red-300" role="alert">{mutationError}</p> : null}
          <AlertDialogFooter><AlertDialogCancel disabled={Boolean(mutatingCommentId)}>Cancel</AlertDialogCancel><AlertDialogAction disabled={!deleteTarget || Boolean(mutatingCommentId)} onClick={() => deleteTarget && void deleteComment(deleteTarget)} variant="destructive">{mutatingCommentId ? "Deleting…" : "Delete comment"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
