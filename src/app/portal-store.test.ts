import { describe, expect, it } from "vitest";

import {
  addProject,
  addVideoToProject,
  deleteProject,
  moveVideo,
  updateProject,
  updateVideo,
} from "./portal-store";
import type { PortalData } from "./portal-types";

const emptyData: PortalData = { projects: [] };

describe("portal store reducers", () => {
  it("creates projects with unlisted slugs and timestamps", () => {
    const data = addProject(emptyData, {
      clientName: "Acme",
      description: "Review queue",
      name: "Launch Review",
    });

    expect(data.projects).toHaveLength(1);
    expect(data.projects[0]).toMatchObject({
      clientName: "Acme",
      description: "Review queue",
      name: "Launch Review",
      visibility: "unlisted",
      videos: [],
    });
    expect(data.projects[0]?.shareSlug).toMatch(/^launch-review-/);
  });

  it("updates and deletes projects without mutating the original data", () => {
    const created = addProject(emptyData, { name: "Original" });
    const projectId = created.projects[0]!.id;
    const updated = updateProject(created, projectId, {
      clientName: "Client",
      name: "Renamed",
    });

    expect(created.projects[0]?.name).toBe("Original");
    expect(updated.projects[0]).toMatchObject({
      clientName: "Client",
      name: "Renamed",
    });
    expect(deleteProject(updated, projectId).projects).toEqual([]);
  });

  it("adds, edits, removes, and reorders videos inside a project", () => {
    const withProject = addProject(emptyData, { name: "Walkthrough" });
    const projectId = withProject.projects[0]!.id;
    const first = addVideoToProject(withProject, projectId, {
      assetId: "asset-a",
      durationSeconds: 600,
      recommendedPlaybackSpeed: 1.5,
      title: "First",
    });
    const second = addVideoToProject(first, projectId, {
      assetId: "asset-b",
      recommendedPlaybackSpeed: 2,
      title: "Second",
    });
    const firstVideoId = second.projects[0]!.videos[0]!.id;
    const secondVideoId = second.projects[0]!.videos[1]!.id;
    const edited = updateVideo(second, projectId, firstVideoId, {
      title: "Intro",
    });
    const reordered = moveVideo(edited, projectId, secondVideoId, "up");

    expect(edited.projects[0]?.videos[0]?.title).toBe("Intro");
    expect(reordered.projects[0]?.videos.map((video) => video.id)).toEqual([
      secondVideoId,
      firstVideoId,
    ]);
    expect(reordered.projects[0]?.videos.map((video) => video.orderIndex)).toEqual([0, 1]);
  });
});
