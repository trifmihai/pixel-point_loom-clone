import { createShareSlug, parseGumletInput } from "./portal-utils";
import type {
  PlaybackSpeed,
  PortalData,
  PortalProject,
  PortalVideo,
} from "./portal-types";

export const portalStorageKey = "loomish.gumlet.portal.v1";

export const emptyPortalData: PortalData = {
  projects: [],
};

type ProjectDraft = {
  clientName?: string;
  description?: string;
  name: string;
};

type VideoDraft = {
  assetId: string;
  description?: string;
  directVideoUrl?: string;
  durationSeconds?: null | number;
  recommendedPlaybackSpeed: PlaybackSpeed;
  startTimeSeconds?: number;
  thumbnailUrl?: string;
  title: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2, 14)}`;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";

  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeVideos(videos: PortalVideo[]): PortalVideo[] {
  return videos.map((video, orderIndex) => ({
    ...video,
    orderIndex,
  }));
}

function touchProject(project: PortalProject, patch: Partial<PortalProject>): PortalProject {
  return {
    ...project,
    ...patch,
    updatedAt: nowIso(),
  };
}

export function addProject(data: PortalData, draft: ProjectDraft): PortalData {
  const createdAt = nowIso();
  const id = createId("project");
  const name = draft.name.trim() || "Untitled project";
  const project: PortalProject = {
    clientName: normalizeOptionalText(draft.clientName),
    createdAt,
    description: normalizeOptionalText(draft.description),
    id,
    name,
    shareSlug: createShareSlug(name, id),
    updatedAt: createdAt,
    videos: [],
    visibility: "unlisted",
  };

  return {
    projects: [project, ...data.projects],
  };
}

export function updateProject(
  data: PortalData,
  projectId: string,
  patch: Partial<ProjectDraft>,
): PortalData {
  return {
    projects: data.projects.map((project) => {
      if (project.id !== projectId) {
        return project;
      }

      return touchProject(project, {
        clientName:
          patch.clientName === undefined ? project.clientName : normalizeOptionalText(patch.clientName),
        description:
          patch.description === undefined
            ? project.description
            : normalizeOptionalText(patch.description),
        name: patch.name?.trim() || project.name,
      });
    }),
  };
}

export function deleteProject(data: PortalData, projectId: string): PortalData {
  return {
    projects: data.projects.filter((project) => project.id !== projectId),
  };
}

export function addVideoToProject(
  data: PortalData,
  projectId: string,
  draft: VideoDraft,
): PortalData {
  const createdAt = nowIso();

  return {
    projects: data.projects.map((project) => {
      if (project.id !== projectId) {
        return project;
      }

      const parsedInput = parseGumletInput(draft.assetId);
      const video: PortalVideo = {
        ...parsedInput,
        createdAt,
        description: normalizeOptionalText(draft.description),
        directVideoUrl: normalizeOptionalText(draft.directVideoUrl) ?? parsedInput.directVideoUrl,
        durationSeconds: draft.durationSeconds ?? undefined,
        id: createId("video"),
        orderIndex: project.videos.length,
        recommendedPlaybackSpeed: draft.recommendedPlaybackSpeed,
        startTimeSeconds: draft.startTimeSeconds,
        thumbnailUrl: normalizeOptionalText(draft.thumbnailUrl),
        title: draft.title.trim() || "Untitled video",
        updatedAt: createdAt,
      };

      return touchProject(project, {
        videos: normalizeVideos([...project.videos, video]),
      });
    }),
  };
}

export function updateVideo(
  data: PortalData,
  projectId: string,
  videoId: string,
  patch: Partial<VideoDraft>,
): PortalData {
  return {
    projects: data.projects.map((project) => {
      if (project.id !== projectId) {
        return project;
      }

      const videos = project.videos.map((video) => {
        if (video.id !== videoId) {
          return video;
        }

        const parsedInput = patch.assetId === undefined ? null : parseGumletInput(patch.assetId);

        return {
          ...video,
          ...(patch.assetId === undefined
            ? {}
            : {
                ...parsedInput,
              }),
          description:
            patch.description === undefined
              ? video.description
              : normalizeOptionalText(patch.description),
          directVideoUrl:
            patch.directVideoUrl === undefined
              ? patch.assetId === undefined
                ? video.directVideoUrl
                : parsedInput?.directVideoUrl
              : normalizeOptionalText(patch.directVideoUrl),
          durationSeconds:
            patch.durationSeconds === undefined
              ? video.durationSeconds
              : patch.durationSeconds ?? undefined,
          recommendedPlaybackSpeed:
            patch.recommendedPlaybackSpeed ?? video.recommendedPlaybackSpeed,
          startTimeSeconds:
            patch.startTimeSeconds === undefined ? video.startTimeSeconds : patch.startTimeSeconds,
          thumbnailUrl:
            patch.thumbnailUrl === undefined
              ? video.thumbnailUrl
              : normalizeOptionalText(patch.thumbnailUrl),
          title: patch.title?.trim() || video.title,
          updatedAt: nowIso(),
        };
      });

      return touchProject(project, {
        videos: normalizeVideos(videos),
      });
    }),
  };
}

export function removeVideo(
  data: PortalData,
  projectId: string,
  videoId: string,
): PortalData {
  return {
    projects: data.projects.map((project) => {
      if (project.id !== projectId) {
        return project;
      }

      return touchProject(project, {
        videos: normalizeVideos(project.videos.filter((video) => video.id !== videoId)),
      });
    }),
  };
}

export function moveVideo(
  data: PortalData,
  projectId: string,
  videoId: string,
  direction: "down" | "up",
): PortalData {
  return {
    projects: data.projects.map((project) => {
      if (project.id !== projectId) {
        return project;
      }

      const videos = [...project.videos].sort((left, right) => left.orderIndex - right.orderIndex);
      const index = videos.findIndex((video) => video.id === videoId);
      const targetIndex = direction === "up" ? index - 1 : index + 1;

      if (index < 0 || targetIndex < 0 || targetIndex >= videos.length) {
        return project;
      }

      const [video] = videos.splice(index, 1);
      videos.splice(targetIndex, 0, video!);

      return touchProject(project, {
        videos: normalizeVideos(videos),
      });
    }),
  };
}

export function loadPortalData(storage: Storage = window.localStorage): PortalData {
  try {
    const rawValue = storage.getItem(portalStorageKey);

    if (!rawValue) {
      return emptyPortalData;
    }

    const parsed = JSON.parse(rawValue) as Partial<PortalData>;

    return Array.isArray(parsed.projects) ? { projects: parsed.projects as PortalProject[] } : emptyPortalData;
  } catch {
    return emptyPortalData;
  }
}

export function savePortalData(
  data: PortalData,
  storage: Storage = window.localStorage,
): void {
  storage.setItem(portalStorageKey, JSON.stringify(data));
}
