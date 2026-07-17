import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

const executablePath = chromium.executablePath();

if (existsSync(executablePath)) {
  console.log(`[toolcraft] Chromium is already installed at ${executablePath}`);
  process.exit(0);
}

console.log("[toolcraft] Chromium is missing; installing the browser required by Playwright.");

const playwrightCliPath = path.resolve("node_modules/playwright/cli.js");
const result = spawnSync(process.execPath, [playwrightCliPath, "install", "chromium"], {
  stdio: "inherit",
});

if (result.error) {
  console.error(`[toolcraft] Could not start the Playwright installer: ${result.error.message}`);
}

process.exit(result.status ?? 1);
