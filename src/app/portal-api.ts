import type { PortalData, PortalProject, VideoShareSnapshot } from "./portal-types";
import type {
  CreateAdminReplyInput,
  CreatePublicFeedbackInput,
  CreatePublicFeedbackResponse,
  DeletePublicFeedbackResponse,
  FeedbackComment,
  FeedbackSummaryResponse,
  PublicFeedbackComment,
  UpdateFeedbackInput,
  UpdatePublicFeedbackInput,
} from "./feedback-types";
import type { FirstViewActivityResponse } from "./first-view-types";

export type PortalApiState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

export type CreateShareLinkInput = {
  expiresAt?: string;
  passcode?: string;
  projectId: string;
  videoId?: string | null;
};

export type CreateShareLinkResponse = {
  kind: "share" | "video";
  reused: boolean;
  token: string;
  url: string;
};

export type PublicShareResponse =
  | {
      kind: "share";
      project: PortalProject;
    }
  | {
      kind: "share" | "video";
      requiresPasscode: true;
    }
  | {
      kind: "video";
      snapshot: VideoShareSnapshot;
    };

export type AdminSessionResponse = {
  adminEmail: string;
  authenticated: boolean;
};

export type RecordFirstVideoViewInput = {
  videoId: string;
  viewerEmail?: string;
  viewerName?: string;
};

type PortalApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class PortalApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, options: { code: string; status: number }) {
    super(message);
    this.name = "PortalApiError";
    this.code = options.code;
    this.status = options.status;
  }
}

export function createPortalApiState<T>(data: T | null = null): PortalApiState<T> {
  return {
    data,
    error: null,
    loading: false,
  };
}

export function getPortalApiErrorMessage(error: unknown): string {
  if (error instanceof PortalApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The portal API request failed.";
}

async function readErrorBody(response: Response): Promise<PortalApiErrorBody> {
  try {
    return (await response.json()) as PortalApiErrorBody;
  } catch {
    return {};
  }
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  headers.set("Accept", "application/json");

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers,
  });

  if (!response.ok) {
    const body = await readErrorBody(response);

    throw new PortalApiError(body.error?.message ?? "The portal API request failed.", {
      code: body.error?.code ?? "api_request_failed",
      status: response.status,
    });
  }

  return (await response.json()) as T;
}

export const portalApi = {
  createAdminReply(
    commentId: string,
    input: CreateAdminReplyInput,
  ): Promise<FeedbackComment> {
    return requestJson<FeedbackComment>(
      `/api/admin/feedback/${encodeURIComponent(commentId)}/replies`,
      { body: JSON.stringify(input), method: "POST" },
    );
  },

  createPublicComment(
    token: string,
    input: CreatePublicFeedbackInput,
    passcode?: string,
  ): Promise<CreatePublicFeedbackResponse> {
    return requestJson<CreatePublicFeedbackResponse>(
      `/api/public/share/${encodeURIComponent(token)}/comments`,
      {
        body: JSON.stringify(input),
        headers: passcode ? { "X-Share-Passcode": passcode } : undefined,
        method: "POST",
      },
    );
  },

  deletePublicComment(
    token: string,
    videoId: string,
    commentId: string,
    editToken: string,
    passcode?: string,
  ): Promise<DeletePublicFeedbackResponse> {
    const query = new URLSearchParams({ videoId });

    return requestJson<DeletePublicFeedbackResponse>(
      `/api/public/share/${encodeURIComponent(token)}/comments/${encodeURIComponent(
        commentId,
      )}?${query.toString()}`,
      {
        headers: {
          "X-Feedback-Edit-Token": editToken,
          ...(passcode ? { "X-Share-Passcode": passcode } : {}),
        },
        method: "DELETE",
      },
    );
  },

  createShareLink(input: CreateShareLinkInput): Promise<CreateShareLinkResponse> {
    return requestJson<CreateShareLinkResponse>("/api/admin/share-links", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },

  getAdminProjects(): Promise<PortalData> {
    return requestJson<PortalData>("/api/admin/projects");
  },

  getAdminFeedback(): Promise<FeedbackSummaryResponse> {
    return requestJson<FeedbackSummaryResponse>("/api/admin/feedback");
  },

  getAdminActivity(): Promise<FirstViewActivityResponse> {
    return requestJson<FirstViewActivityResponse>("/api/admin/activity");
  },

  getAdminSession(): Promise<AdminSessionResponse> {
    return requestJson<AdminSessionResponse>("/api/auth/session");
  },

  getPublicShare(token: string): Promise<PublicShareResponse> {
    return requestJson<PublicShareResponse>(`/api/public/share/${encodeURIComponent(token)}`);
  },

  getPublicComments(
    token: string,
    videoId: string,
    passcode?: string,
  ): Promise<{ comments: PublicFeedbackComment[] }> {
    const query = new URLSearchParams({ videoId });

    return requestJson<{ comments: PublicFeedbackComment[] }>(
      `/api/public/share/${encodeURIComponent(token)}/comments?${query.toString()}`,
      { headers: passcode ? { "X-Share-Passcode": passcode } : undefined },
    );
  },

  getVideoFeedback(videoId: string): Promise<{ comments: FeedbackComment[] }> {
    return requestJson<{ comments: FeedbackComment[] }>(
      `/api/admin/videos/${encodeURIComponent(videoId)}/feedback`,
    );
  },

  importLocalProjects(data: PortalData): Promise<PortalData> {
    return requestJson<PortalData>("/api/admin/import", {
      body: JSON.stringify({ data }),
      method: "POST",
    });
  },

  loginAdmin(password: string): Promise<AdminSessionResponse> {
    return requestJson<AdminSessionResponse>("/api/auth/login", {
      body: JSON.stringify({ password }),
      method: "POST",
    });
  },

  logoutAdmin(): Promise<AdminSessionResponse> {
    return requestJson<AdminSessionResponse>("/api/auth/logout", {
      method: "POST",
    });
  },

  markVideoFeedbackRead(videoId: string): Promise<{ read: true }> {
    return requestJson<{ read: true }>(
      `/api/admin/videos/${encodeURIComponent(videoId)}/feedback/read`,
      { method: "POST" },
    );
  },

  markActivityRead(): Promise<{ read: true }> {
    return requestJson<{ read: true }>("/api/admin/activity/read", {
      method: "POST",
    });
  },

  recordFirstVideoView(
    token: string,
    input: RecordFirstVideoViewInput,
    passcode?: string,
  ): Promise<{ recorded: boolean }> {
    return requestJson<{ recorded: boolean }>(
      `/api/public/share/${encodeURIComponent(token)}/view`,
      {
        body: JSON.stringify(input),
        headers: passcode ? { "X-Share-Passcode": passcode } : undefined,
        method: "POST",
      },
    );
  },

  saveAdminProjects(data: PortalData): Promise<PortalData> {
    return requestJson<PortalData>("/api/admin/projects", {
      body: JSON.stringify({ data }),
      method: "PUT",
    });
  },

  unlockPublicShare(token: string, passcode: string): Promise<PublicShareResponse> {
    return requestJson<PublicShareResponse>(
      `/api/public/share/${encodeURIComponent(token)}/passcode`,
      {
        body: JSON.stringify({ passcode }),
        method: "POST",
      },
    );
  },

  updatePublicComment(
    token: string,
    videoId: string,
    commentId: string,
    input: UpdatePublicFeedbackInput,
    editToken: string,
    passcode?: string,
  ): Promise<PublicFeedbackComment> {
    const query = new URLSearchParams({ videoId });

    return requestJson<PublicFeedbackComment>(
      `/api/public/share/${encodeURIComponent(token)}/comments/${encodeURIComponent(
        commentId,
      )}?${query.toString()}`,
      {
        body: JSON.stringify(input),
        headers: {
          "X-Feedback-Edit-Token": editToken,
          ...(passcode ? { "X-Share-Passcode": passcode } : {}),
        },
        method: "PATCH",
      },
    );
  },

  updateFeedbackComment(
    commentId: string,
    patch: UpdateFeedbackInput,
  ): Promise<FeedbackComment> {
    return requestJson<FeedbackComment>(
      `/api/admin/feedback/${encodeURIComponent(commentId)}`,
      { body: JSON.stringify(patch), method: "PATCH" },
    );
  },
};
