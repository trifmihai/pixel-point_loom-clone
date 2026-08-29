import {
  createD1PortalDatabase,
  handlePortalApiRequest,
  type D1DatabaseLike,
  type PortalCloudDatabase,
} from "../../src/app/portal-cloud-api";

type PagesEnv = {
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  AUTH_SECRET?: string;
  DB?: D1DatabaseLike;
  PUBLIC_APP_URL?: string;
  VITE_ADMIN_EMAIL?: string;
  VITE_PUBLIC_APP_URL?: string;
};

type PagesContext = {
  env: PagesEnv;
  request: Request;
  waitUntil?: (promise: Promise<unknown>) => void;
};

const defaultAdminEmail = "trifmihai.business@gmail.com";

const unavailableDatabase: PortalCloudDatabase = {
  createFeedbackComment: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  createFirstVideoView: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  createShareLink: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  findReusableShareLink: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  getShareLink: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  getFeedbackComment: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  getFeedbackCountsByVideo: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  listFeedbackForShareToken: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  listFeedbackForVideo: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  listFirstVideoViews: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  listProjects: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  markVideoFeedbackRead: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  markFirstVideoViewsRead: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  replaceProjects: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  revokeShareLink: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  updateFeedbackComment: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  updatePublicFeedbackComment: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  updateFirstVideoViewEmailStatus: () => {
    throw new Error("D1 binding DB is not configured.");
  },
};

export async function onRequest(context: PagesContext): Promise<Response> {
  const isHealthCheck = new URL(context.request.url).pathname === "/api/health";

  if (!context.env.DB && !isHealthCheck) {
    return new Response(
      JSON.stringify({
        error: {
          code: "d1_missing",
          message: "Cloudflare D1 binding DB is not configured.",
        },
      }),
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8",
        },
        status: 500,
      },
    );
  }

  return handlePortalApiRequest(context.request, {
    adminEmail: context.env.ADMIN_EMAIL ?? context.env.VITE_ADMIN_EMAIL ?? defaultAdminEmail,
    adminPassword: context.env.ADMIN_PASSWORD,
    authSecret: context.env.AUTH_SECRET,
    db: context.env.DB ? createD1PortalDatabase(context.env.DB) : unavailableDatabase,
    ...(context.waitUntil ? { defer: context.waitUntil } : {}),
    publicAppUrl:
      context.env.PUBLIC_APP_URL ??
      context.env.VITE_PUBLIC_APP_URL ??
      new URL(context.request.url).origin,
  });
}
