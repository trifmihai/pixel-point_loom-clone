import {
  createD1PortalDatabase,
  handlePortalApiRequest,
  type D1DatabaseLike,
  type PortalCloudDatabase,
} from "../../src/app/portal-cloud-api";

type PagesEnv = {
  ADMIN_EMAIL?: string;
  DB?: D1DatabaseLike;
  PUBLIC_APP_URL?: string;
  VITE_ADMIN_EMAIL?: string;
  VITE_PUBLIC_APP_URL?: string;
};

type PagesContext = {
  env: PagesEnv;
  request: Request;
};

const defaultAdminEmail = "trifmihai.business@gmail.com";

const unavailableDatabase: PortalCloudDatabase = {
  createShareLink: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  getShareLink: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  listProjects: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  replaceProjects: () => {
    throw new Error("D1 binding DB is not configured.");
  },
  revokeShareLink: () => {
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
    db: context.env.DB ? createD1PortalDatabase(context.env.DB) : unavailableDatabase,
    publicAppUrl:
      context.env.PUBLIC_APP_URL ??
      context.env.VITE_PUBLIC_APP_URL ??
      new URL(context.request.url).origin,
  });
}
