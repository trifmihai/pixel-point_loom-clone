import type { PortalData, PortalProject, VideoShareSnapshot } from "./portal-types";

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
  createShareLink(input: CreateShareLinkInput): Promise<CreateShareLinkResponse> {
    return requestJson<CreateShareLinkResponse>("/api/admin/share-links", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },

  getAdminProjects(): Promise<PortalData> {
    return requestJson<PortalData>("/api/admin/projects");
  },

  getAdminSession(): Promise<AdminSessionResponse> {
    return requestJson<AdminSessionResponse>("/api/auth/session");
  },

  getPublicShare(token: string): Promise<PublicShareResponse> {
    return requestJson<PublicShareResponse>(`/api/public/share/${encodeURIComponent(token)}`);
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
};
