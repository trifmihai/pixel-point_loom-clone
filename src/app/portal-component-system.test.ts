import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const portalFiles = ["admin-portal.tsx", "share-portal.tsx"] as const;

function readPortalFile(fileName: (typeof portalFiles)[number]): string {
  return readFileSync(resolve(process.cwd(), "src/app", fileName), "utf8");
}

describe("portal component system usage", () => {
  test.each(portalFiles)("%s uses the shared Toolcraft UI component layer", (fileName) => {
    const source = readPortalFile(fileName);

    expect(source).toContain('from "@/toolcraft/ui"');
    expect(source).toMatch(/\b(Button|Input|Textarea|Select|Card|Badge)\b/);
  });

  test.each(portalFiles)("%s does not hand-roll available form primitives", (fileName) => {
    const source = readPortalFile(fileName);

    expect(source).not.toMatch(/<button\b/);
    expect(source).not.toMatch(/<input\b/);
    expect(source).not.toMatch(/<textarea\b/);
    expect(source).not.toMatch(/<select\b/);
    expect(source).not.toMatch(/<option\b/);
  });

  test.each(portalFiles)("%s lets shared card surfaces own their styling", (fileName) => {
    const source = readPortalFile(fileName);

    expect(source).not.toMatch(/<Card[^>]*className={[^}]*bg-\[color:color-mix/);
    expect(source).not.toMatch(/<Card[^>]*className="[^"]*bg-\[/);
  });
});
