import { getPortalAppOrigin, isLocalAppOrigin } from "./portal-utils";

export type AppConfig = {
  adminEmail: string;
  appName: string;
  cloudSyncEnabled: boolean;
  localMode: boolean;
  publicAppUrl: string;
  securityCopy: {
    adminAccess: string;
    cloudSync: string;
    localImport: string;
    shareLinks: string;
  };
};

const defaultAdminEmail = "trifmihai.business@gmail.com";

function getEnvValue(key: "VITE_ADMIN_EMAIL" | "VITE_CLOUD_SYNC_ENABLED"): string | undefined {
  return import.meta.env[key];
}

function getCurrentOriginFallback(): string {
  return typeof window === "undefined"
    ? "https://pixel-point-loom-clone.pages.dev"
    : window.location.origin;
}

export function getAppConfig(currentOrigin = getCurrentOriginFallback()): AppConfig {
  const publicAppUrl = getPortalAppOrigin(currentOrigin);
  const cloudSyncEnabled = getEnvValue("VITE_CLOUD_SYNC_ENABLED") === "true";
  const localMode = !cloudSyncEnabled || isLocalAppOrigin(publicAppUrl);

  return {
    adminEmail: getEnvValue("VITE_ADMIN_EMAIL")?.trim() || defaultAdminEmail,
    appName: "Gumlet Client Video Portal",
    cloudSyncEnabled,
    localMode,
    publicAppUrl,
    securityCopy: {
      adminAccess:
        "Admin APIs require the signed session cookie created by the app login.",
      cloudSync:
        "Cloud sync stores project metadata in Cloudflare D1. Gumlet remains the video host.",
      localImport:
        "This browser has local projects. Import them to cloud storage to access them from any device.",
      shareLinks:
        "Client links are unlisted. New cloud links use server-issued tokens and optional passcodes.",
    },
  };
}

export const appConfig = getAppConfig();
