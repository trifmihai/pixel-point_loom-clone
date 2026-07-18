import * as React from "react";
import {
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Mail,
  MessageSquareReply,
  MoreHorizontal,
  RotateCcw,
  Trash2,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  FieldLabel,
  Separator,
  Textarea,
} from "@/toolcraft/ui";

import type { FeedbackComment } from "./feedback-types";
import { buildDirectFeedbackUrl } from "./feedback-utils";
import { getPortalApiErrorMessage, portalApi } from "./portal-api";
import type { PortalVideo } from "./portal-types";
import { formatDuration } from "./portal-utils";

type AdminFeedbackPanelProps = {
  enabled: boolean;
  onChanged: () => void | Promise<void>;
  publicAppUrl: string;
  video: PortalVideo;
};

function getFeedbackThreads(comments: FeedbackComment[]): Array<{
  comment: FeedbackComment;
  replies: FeedbackComment[];
}> {
  const repliesByParent = new Map<string, FeedbackComment[]>();

  for (const comment of comments) {
    if (comment.parentId) {
      const replies = repliesByParent.get(comment.parentId) ?? [];
      replies.push(comment);
      repliesByParent.set(comment.parentId, replies);
    }
  }

  return comments
    .filter((comment) => !comment.parentId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((comment) => ({
      comment,
      replies: (repliesByParent.get(comment.id) ?? []).sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      ),
    }));
}

export function AdminFeedbackPanel({
  enabled,
  onChanged,
  publicAppUrl,
  video,
}: AdminFeedbackPanelProps): React.JSX.Element {
  const [comments, setComments] = React.useState<FeedbackComment[]>([]);
  const [loading, setLoading] = React.useState(enabled);
  const [error, setError] = React.useState("");
  const [actionStatus, setActionStatus] = React.useState("");
  const [replyingToId, setReplyingToId] = React.useState<string | null>(null);
  const [replyBody, setReplyBody] = React.useState("");
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<FeedbackComment | null>(null);
  const threads = React.useMemo(() => getFeedbackThreads(comments), [comments]);

  const loadFeedback = React.useCallback(async () => {
    if (!enabled) {
      setComments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await portalApi.getVideoFeedback(video.id);
      await portalApi.markVideoFeedbackRead(video.id);
      const readAt = new Date().toISOString();
      setComments(
        response.comments.map((comment) =>
          !comment.parentId && comment.authorRole === "guest"
            ? { ...comment, adminReadAt: comment.adminReadAt ?? readAt }
            : comment,
        ),
      );
      await onChanged();
    } catch (loadError) {
      setError(getPortalApiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [enabled, onChanged, video.id]);

  React.useEffect(() => {
    setReplyingToId(null);
    setReplyBody("");
    setActionStatus("");
    void loadFeedback();
  }, [loadFeedback]);

  function getDirectLink(comment: FeedbackComment): string {
    return buildDirectFeedbackUrl(publicAppUrl, comment.shareToken, comment.id);
  }

  async function copyDirectLink(comment: FeedbackComment): Promise<void> {
    try {
      await navigator.clipboard.writeText(getDirectLink(comment));
      setActionStatus("Direct feedback link copied.");
    } catch {
      setActionStatus("Could not copy the direct link. Open it and copy from the browser.");
    }
  }

  function openDirectLink(comment: FeedbackComment): void {
    window.open(getDirectLink(comment), "_blank", "noopener,noreferrer");
  }

  async function updateComment(
    comment: FeedbackComment,
    patch: { deleted?: boolean; status?: "open" | "resolved" },
  ): Promise<void> {
    setPendingId(comment.id);
    setActionStatus("");

    try {
      await portalApi.updateFeedbackComment(comment.id, patch);
      await loadFeedback();
      await onChanged();
      setActionStatus(
        patch.deleted
          ? "Feedback deleted."
          : patch.status === "resolved"
            ? "Feedback resolved."
            : "Feedback reopened.",
      );
    } catch (updateError) {
      setActionStatus(getPortalApiErrorMessage(updateError));
    } finally {
      setPendingId(null);
      setDeleteTarget(null);
    }
  }

  async function submitReply(
    event: React.FormEvent<HTMLFormElement>,
    comment: FeedbackComment,
  ): Promise<void> {
    event.preventDefault();
    const trimmedBody = replyBody.trim();

    if (!trimmedBody) {
      setActionStatus("Write a reply before sending.");
      return;
    }

    setPendingId(comment.id);
    setActionStatus("");

    try {
      await portalApi.createAdminReply(comment.id, { body: trimmedBody });
      setReplyBody("");
      setReplyingToId(null);
      await loadFeedback();
      setActionStatus("Reply added.");
    } catch (replyError) {
      setActionStatus(getPortalApiErrorMessage(replyError));
    } finally {
      setPendingId(null);
    }
  }

  if (!enabled) {
    return (
      <Card data-testid="admin-feedback-panel">
        <CardHeader>
          <CardTitle className="text-xl">Feedback</CardTitle>
          <CardDescription>
            Timestamped visual feedback is available after this project is connected to cloud sync.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card data-testid="admin-feedback-panel">
        <CardHeader className="gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <CardTitle className="text-xl">Feedback</CardTitle>
            <CardDescription>
              Review timestamped client notes for {video.title}.
            </CardDescription>
          </div>
          <Badge variant="mutedOutline">
            {threads.length} {threads.length === 1 ? "comment" : "comments"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {actionStatus ? (
            <p aria-live="polite" className="text-sm text-sky-200" role="status">
              {actionStatus}
            </p>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-red-300/25 bg-red-400/5 p-4">
              <p className="text-sm text-red-200">{error}</p>
              <Button className="mt-3 min-h-10" onClick={() => void loadFeedback()} type="button" variant="outline">
                <RotateCcw />
                Retry
              </Button>
            </div>
          ) : null}

          {loading ? (
            <p aria-live="polite" className="text-sm text-[color:var(--muted-foreground)]">
              Loading feedback…
            </p>
          ) : threads.length > 0 ? (
            threads.map(({ comment, replies }) => (
              <article className="rounded-lg border border-white/10 bg-black/10 p-4" key={comment.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{comment.authorName}</span>
                      <Badge variant={comment.status === "resolved" ? "secondary" : "warning"}>
                        {comment.status}
                      </Badge>
                      {!comment.adminReadAt ? <Badge>New</Badge> : null}
                    </div>
                    {comment.authorEmail ? (
                      <a
                        className="mt-1 inline-flex min-h-10 items-center gap-2 text-xs text-[color:var(--muted-foreground)] hover:text-white"
                        href={`mailto:${comment.authorEmail}`}
                      >
                        <Mail className="size-3.5" />
                        {comment.authorEmail}
                      </a>
                    ) : null}
                  </div>
                  <Button
                    className="min-h-10"
                    onClick={() => openDirectLink(comment)}
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
                {comment.positionX !== undefined && comment.positionY !== undefined ? (
                  <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
                    Position {Math.round(comment.positionX)}% × {Math.round(comment.positionY)}%
                  </p>
                ) : null}

                {replies.length > 0 ? (
                  <div className="mt-4 space-y-3 border-l border-sky-300/25 pl-4">
                    {replies.map((reply) => (
                      <div key={reply.id}>
                        <div className="flex items-center gap-2 text-xs font-medium text-sky-200">
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

                <Separator className="my-4" />

                <div className="hidden flex-wrap gap-2 sm:flex">
                  <Button
                    className="min-h-10"
                    onClick={() => {
                      setReplyingToId(comment.id);
                      setReplyBody("");
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <MessageSquareReply />
                    Reply
                  </Button>
                  <Button
                    className="min-h-10"
                    disabled={pendingId === comment.id}
                    onClick={() =>
                      void updateComment(comment, {
                        status: comment.status === "resolved" ? "open" : "resolved",
                      })
                    }
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {comment.status === "resolved" ? <RotateCcw /> : <CheckCircle2 />}
                    {comment.status === "resolved" ? "Reopen" : "Resolve"}
                  </Button>
                  <Button className="min-h-10" onClick={() => void copyDirectLink(comment)} size="sm" type="button" variant="outline">
                    <Copy />
                    Copy link
                  </Button>
                  <Button className="min-h-10" onClick={() => openDirectLink(comment)} size="sm" type="button" variant="outline">
                    <ExternalLink />
                    Open
                  </Button>
                  <Button className="min-h-10" onClick={() => setDeleteTarget(comment)} size="sm" type="button" variant="destructive">
                    <Trash2 />
                    Delete
                  </Button>
                </div>

                <div className="sm:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button className="min-h-11 w-full" type="button" variant="outline" />
                      }
                    >
                      <MoreHorizontal />
                      Feedback actions
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuItem
                        onClick={() => {
                          setReplyingToId(comment.id);
                          setReplyBody("");
                        }}
                      >
                        <MessageSquareReply />
                        Reply
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          void updateComment(comment, {
                            status: comment.status === "resolved" ? "open" : "resolved",
                          })
                        }
                      >
                        {comment.status === "resolved" ? <RotateCcw /> : <CheckCircle2 />}
                        {comment.status === "resolved" ? "Reopen" : "Resolve"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void copyDirectLink(comment)}>
                        <Copy />
                        Copy direct link
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openDirectLink(comment)}>
                        <ExternalLink />
                        Open direct link
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDeleteTarget(comment)} variant="destructive">
                        <Trash2 />
                        Delete feedback
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {replyingToId === comment.id ? (
                  <form className="mt-4 space-y-3" onSubmit={(event) => void submitReply(event, comment)}>
                    <Field>
                      <FieldLabel htmlFor={`feedback-reply-${comment.id}`}>Admin reply</FieldLabel>
                      <Textarea
                        autoFocus
                        id={`feedback-reply-${comment.id}`}
                        maxLength={1000}
                        onChange={(event) => setReplyBody(event.target.value)}
                        placeholder="Write a concise update for the client."
                        rows={3}
                        value={replyBody}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                      <Button
                        className="min-h-11"
                        onClick={() => setReplyingToId(null)}
                        type="button"
                        variant="outline"
                      >
                        Cancel
                      </Button>
                      <Button className="min-h-11" disabled={pendingId === comment.id} type="submit">
                        Add reply
                      </Button>
                    </div>
                  </form>
                ) : null}
              </article>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 px-4 py-10 text-center">
              <p className="text-sm font-medium text-white">No feedback yet</p>
              <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                Send the client link to collect comments.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog onOpenChange={(open) => !open && setDeleteTarget(null)} open={Boolean(deleteTarget)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this feedback?</AlertDialogTitle>
            <AlertDialogDescription>
              The comment and its replies will disappear from the client review. This is a soft delete in D1.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteTarget || pendingId === deleteTarget.id}
              onClick={() => deleteTarget && void updateComment(deleteTarget, { deleted: true })}
            >
              Delete feedback
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
