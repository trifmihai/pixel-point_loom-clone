import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const portalUiPath = path.resolve(process.cwd(), "src/app/portal-ui.tsx");
const adminAuthGatePath = path.resolve(process.cwd(), "src/app/admin-auth-gate.tsx");
const adminPortalPath = path.resolve(process.cwd(), "src/app/admin-portal.tsx");
const sharePasscodeGatePath = path.resolve(process.cwd(), "src/app/share-passcode-gate.tsx");
const sharePortalPath = path.resolve(process.cwd(), "src/app/share-portal.tsx");
const videoSharePortalPath = path.resolve(process.cwd(), "src/app/video-share-portal.tsx");
const stylesPath = path.resolve(process.cwd(), "src/styles.css");

function readPortalUiSource(): string {
  return existsSync(portalUiPath) ? readFileSync(portalUiPath, "utf8") : "";
}

describe("Pixel Point portal presentation layer", () => {
  it("provides shared brand, state, status, speed, and time-savings components", () => {
    const source = readPortalUiSource();

    expect(source).toContain("export function PortalBrand");
    expect(source).toContain("export function PortalPageHeader");
    expect(source).toContain("export function PortalStateCard");
    expect(source).toContain("export function PortalStatus");
    expect(source).toContain("export function PlaybackSpeedControl");
    expect(source).toContain("export function TimeSavingsSummary");
    expect(source).toContain("Pixel Point");
  });

  it("announces status and exposes every supported viewer speed", () => {
    const source = readPortalUiSource();

    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("playbackSpeedOptions.map");
    expect(source).toContain("Recommended");
    expect(source).toContain("calculatePlaybackSavings");
    expect(source).toContain("portal-numeric");
  });

  it("defines the Pixel Point surface system and reduced-motion behavior", () => {
    const source = readFileSync(stylesPath, "utf8");

    expect(source).toContain("--portal-bg:");
    expect(source).toContain("--portal-surface-1:");
    expect(source).toContain("--portal-blue:");
    expect(source).toContain(".portal-skip-link");
    expect(source).toContain("env(safe-area-inset-top)");
    expect(source).toContain("prefers-reduced-motion: reduce");
  });

  it("uses the shared Pixel Point identity for protected admin and public access", () => {
    const adminGate = readFileSync(adminAuthGatePath, "utf8");
    const passcodeGate = readFileSync(sharePasscodeGatePath, "utf8");

    expect(adminGate).toContain("PortalBrand");
    expect(adminGate).toContain('name="password"');
    expect(passcodeGate).toContain("PortalBrand");
    expect(passcodeGate).toContain('name="passcode"');
  });

  it("keeps every portal flow on the text-only Pixel Point identity", () => {
    const portalUi = readPortalUiSource();
    const styles = readFileSync(stylesPath, "utf8");
    const identityConsumers = [
      adminAuthGatePath,
      adminPortalPath,
      sharePasscodeGatePath,
      sharePortalPath,
      videoSharePortalPath,
    ];

    expect(portalUi).toContain("Pixel Point");
    expect(portalUi).not.toContain("portal-brand-mark");
    expect(styles).not.toContain(".portal-brand-mark");

    for (const consumerPath of identityConsumers) {
      expect(readFileSync(consumerPath, "utf8")).toContain("PortalBrand");
    }
  });
});
