import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  ExternalLink,
  Plus,
  Trash2,
} from "lucide-react";

import { GumletPlayer } from "./gumlet-player";
import {
  addProject,
  addVideoToProject,
  deleteProject,
  emptyPortalData,
  loadPortalData,
  moveVideo,
  removeVideo,
  savePortalData,
  updateProject,
  updateVideo,
} from "./portal-store";
import type { PlaybackSpeed, PortalData, PortalProject, PortalVideo } from "./portal-types";
import {
  createShareUrl,
  estimateTimeSavedSeconds,
  estimateWatchTimeSeconds,
  formatDuration,
  playbackSpeedOptions,
} from "./portal-utils";

type ProjectDraft = {
  clientName: string;
  description: string;
  name: string;
};

type VideoDraft = {
  assetId: string;
  description: string;
  durationSeconds: string;
  recommendedPlaybackSpeed: PlaybackSpeed;
  startTimeSeconds: string;
  thumbnailUrl: string;
  title: string;
};

const emptyProjectDraft: ProjectDraft = {
  clientName: "",
  description: "",
  name: "",
};

const emptyVideoDraft: VideoDraft = {
  assetId: "",
  description: "",
  durationSeconds: "",
  recommendedPlaybackSpeed: 1.5,
  startTimeSeconds: "",
  thumbnailUrl: "",
  title: "",
};

function parseOptionalSeconds(value: string): number | undefined {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function getSortedVideos(project: PortalProject): PortalVideo[] {
  return [...project.videos].sort((left, right) => left.orderIndex - right.orderIndex);
}

function getVideoMeta(video: PortalVideo): string {
  const watchTime = estimateWatchTimeSeconds(
    video.durationSeconds,
    video.recommendedPlaybackSpeed,
  );
  const savedTime = estimateTimeSavedSeconds(
    video.durationSeconds,
    video.recommendedPlaybackSpeed,
  );

  if (!video.durationSeconds || !watchTime) {
    return `Suggested ${video.recommendedPlaybackSpeed}x`;
  }

  return `${formatDuration(video.durationSeconds)} video · Suggested ${
    video.recommendedPlaybackSpeed
  }x · Watch in about ${formatDuration(watchTime)} · Saves about ${formatDuration(savedTime)}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function loadInitialData(): PortalData {
  if (typeof window === "undefined") {
    return emptyPortalData;
  }

  return loadPortalData();
}

export function AdminPortal(): React.JSX.Element {
  const [data, setData] = React.useState<PortalData>(loadInitialData);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(
    () => loadInitialData().projects[0]?.id ?? null,
  );
  const [projectDraft, setProjectDraft] = React.useState<ProjectDraft>(emptyProjectDraft);
  const [videoDraft, setVideoDraft] = React.useState<VideoDraft>(emptyVideoDraft);
  const [activeVideoId, setActiveVideoId] = React.useState<string | null>(null);
  const [shareUrl, setShareUrl] = React.useState("");
  const [shareStatus, setShareStatus] = React.useState("");

  React.useEffect(() => {
    savePortalData(data);
  }, [data]);

  const selectedProject =
    data.projects.find((project) => project.id === selectedProjectId) ?? data.projects[0] ?? null;
  const videos = selectedProject ? getSortedVideos(selectedProject) : [];
  const activeVideo =
    videos.find((video) => video.id === activeVideoId) ?? videos[0] ?? null;

  React.useEffect(() => {
    if (selectedProject && !selectedProjectId) {
      setSelectedProjectId(selectedProject.id);
    }
  }, [selectedProject, selectedProjectId]);

  function handleCreateProject(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const nextData = addProject(data, projectDraft);
    setData(nextData);
    setSelectedProjectId(nextData.projects[0]?.id ?? null);
    setProjectDraft(emptyProjectDraft);
    setShareStatus("");
  }

  function handleAddVideo(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!selectedProject || !videoDraft.assetId.trim()) {
      return;
    }

    const nextData = addVideoToProject(data, selectedProject.id, {
      assetId: videoDraft.assetId,
      description: videoDraft.description,
      durationSeconds: parseOptionalSeconds(videoDraft.durationSeconds),
      recommendedPlaybackSpeed: videoDraft.recommendedPlaybackSpeed,
      startTimeSeconds: parseOptionalSeconds(videoDraft.startTimeSeconds),
      thumbnailUrl: videoDraft.thumbnailUrl,
      title: videoDraft.title,
    });
    const nextProject = nextData.projects.find((project) => project.id === selectedProject.id);
    const nextVideo = getSortedVideos(nextProject ?? selectedProject).at(-1);

    setData(nextData);
    setActiveVideoId(nextVideo?.id ?? null);
    setVideoDraft(emptyVideoDraft);
  }

  async function handleCopyShareLink(project: PortalProject): Promise<void> {
    const url = createShareUrl(project, window.location.origin);

    setShareUrl(url);
    setShareStatus("Share link ready");

    try {
      await navigator.clipboard?.writeText(url);
      setShareStatus("Share link copied");
    } catch {
      setShareStatus("Share link ready");
    }
  }

  function updateSelectedProject(patch: Parameters<typeof updateProject>[2]): void {
    if (!selectedProject) {
      return;
    }

    setData((current) => updateProject(current, selectedProject.id, patch));
  }

  return (
    <main className="min-h-dvh bg-[#101214] text-neutral-50">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col gap-5 px-4 py-4 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:px-6">
        <aside className="rounded-lg border border-white/10 bg-[#171a1d] p-4">
          <div className="mb-4">
            <p className="text-xs font-medium uppercase tracking-normal text-sky-300">Gumlet portal</p>
            <h1 className="mt-1 text-2xl font-semibold">Client video reviews</h1>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Organize existing Gumlet videos, set suggested speed, and send unlisted review links.
            </p>
          </div>

          <form className="space-y-3 border-t border-white/10 pt-4" onSubmit={handleCreateProject}>
            <label className="block text-sm font-medium text-neutral-200">
              Project name
              <input
                className="mt-1 w-full rounded-md border border-white/10 bg-[#0d0f11] px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                onChange={(event) =>
                  setProjectDraft((draft) => ({ ...draft, name: event.target.value }))
                }
                required
                value={projectDraft.name}
              />
            </label>
            <label className="block text-sm font-medium text-neutral-200">
              Client name
              <input
                className="mt-1 w-full rounded-md border border-white/10 bg-[#0d0f11] px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                onChange={(event) =>
                  setProjectDraft((draft) => ({ ...draft, clientName: event.target.value }))
                }
                value={projectDraft.clientName}
              />
            </label>
            <label className="block text-sm font-medium text-neutral-200">
              Project description
              <textarea
                className="mt-1 min-h-20 w-full rounded-md border border-white/10 bg-[#0d0f11] px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                onChange={(event) =>
                  setProjectDraft((draft) => ({ ...draft, description: event.target.value }))
                }
                value={projectDraft.description}
              />
            </label>
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-400"
              type="submit"
            >
              <Plus size={16} />
              Create project
            </button>
          </form>

          <div className="mt-5 space-y-2">
            {data.projects.map((project) => (
              <button
                className={`w-full rounded-lg border p-3 text-left transition ${
                  selectedProject?.id === project.id
                    ? "border-sky-400/60 bg-sky-400/10"
                    : "border-white/10 bg-[#111315] hover:border-white/20"
                }`}
                key={project.id}
                onClick={() => {
                  setSelectedProjectId(project.id);
                  setActiveVideoId(project.videos[0]?.id ?? null);
                  setShareStatus("");
                }}
                type="button"
              >
                <span className="block font-medium text-white">{project.name}</span>
                <span className="mt-1 block text-xs text-neutral-400">
                  {project.clientName ? `${project.clientName} · ` : ""}
                  {project.videos.length} videos · Updated {formatDate(project.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 rounded-lg border border-white/10 bg-[#151719] p-4 lg:p-5">
          {selectedProject ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 border-b border-white/10 pb-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <h2 className="text-3xl font-semibold text-white">{selectedProject.name}</h2>
                  <input
                    aria-label="Selected project name"
                    className="mt-3 w-full rounded-md border border-white/10 bg-[#0d0f11] px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                    onChange={(event) => updateSelectedProject({ name: event.target.value })}
                    value={selectedProject.name}
                  />
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <input
                      aria-label="Selected client name"
                      className="rounded-md border border-white/10 bg-[#0d0f11] px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                      onChange={(event) =>
                        updateSelectedProject({ clientName: event.target.value })
                      }
                      placeholder="Client name"
                      value={selectedProject.clientName ?? ""}
                    />
                    <input
                      aria-label="Share URL"
                      className="rounded-md border border-white/10 bg-[#0d0f11] px-3 py-2 text-sm text-neutral-300 outline-none"
                      readOnly
                      value={shareUrl}
                    />
                  </div>
                  <textarea
                    aria-label="Selected project description"
                    className="mt-2 min-h-16 w-full rounded-md border border-white/10 bg-[#0d0f11] px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                    onChange={(event) =>
                      updateSelectedProject({ description: event.target.value })
                    }
                    placeholder="Project description"
                    value={selectedProject.description ?? ""}
                  />
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
                    onClick={() => void handleCopyShareLink(selectedProject)}
                    type="button"
                  >
                    <Copy size={16} />
                    Copy client link
                  </button>
                  <a
                    className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
                    href={shareUrl || createShareUrl(selectedProject, window.location.origin)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLink size={16} />
                    Open
                  </a>
                  <button
                    className="inline-flex items-center gap-2 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100 hover:bg-red-500/20"
                    onClick={() => {
                      setData((current) => deleteProject(current, selectedProject.id));
                      setSelectedProjectId(null);
                    }}
                    type="button"
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </div>

              {shareStatus ? (
                <div className="inline-flex items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
                  <CheckCircle2 size={16} />
                  {shareStatus}
                </div>
              ) : null}

              <form
                className="grid gap-3 rounded-lg border border-white/10 bg-[#101214] p-4 md:grid-cols-2 xl:grid-cols-4"
                onSubmit={handleAddVideo}
              >
                <label className="block text-sm font-medium text-neutral-200">
                  Gumlet asset ID
                  <input
                    className="mt-1 w-full rounded-md border border-white/10 bg-[#090a0b] px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                    onChange={(event) =>
                      setVideoDraft((draft) => ({ ...draft, assetId: event.target.value }))
                    }
                    required
                    value={videoDraft.assetId}
                  />
                </label>
                <label className="block text-sm font-medium text-neutral-200">
                  Video title
                  <input
                    className="mt-1 w-full rounded-md border border-white/10 bg-[#090a0b] px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                    onChange={(event) =>
                      setVideoDraft((draft) => ({ ...draft, title: event.target.value }))
                    }
                    required
                    value={videoDraft.title}
                  />
                </label>
                <label className="block text-sm font-medium text-neutral-200 xl:col-span-2">
                  Video description
                  <input
                    className="mt-1 w-full rounded-md border border-white/10 bg-[#090a0b] px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                    onChange={(event) =>
                      setVideoDraft((draft) => ({ ...draft, description: event.target.value }))
                    }
                    value={videoDraft.description}
                  />
                </label>
                <label className="block text-sm font-medium text-neutral-200">
                  Thumbnail URL
                  <input
                    className="mt-1 w-full rounded-md border border-white/10 bg-[#090a0b] px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                    onChange={(event) =>
                      setVideoDraft((draft) => ({ ...draft, thumbnailUrl: event.target.value }))
                    }
                    value={videoDraft.thumbnailUrl}
                  />
                </label>
                <label className="block text-sm font-medium text-neutral-200">
                  Duration in seconds
                  <input
                    className="mt-1 w-full rounded-md border border-white/10 bg-[#090a0b] px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                    inputMode="numeric"
                    onChange={(event) =>
                      setVideoDraft((draft) => ({ ...draft, durationSeconds: event.target.value }))
                    }
                    value={videoDraft.durationSeconds}
                  />
                </label>
                <label className="block text-sm font-medium text-neutral-200">
                  Start time in seconds
                  <input
                    className="mt-1 w-full rounded-md border border-white/10 bg-[#090a0b] px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                    inputMode="numeric"
                    onChange={(event) =>
                      setVideoDraft((draft) => ({ ...draft, startTimeSeconds: event.target.value }))
                    }
                    value={videoDraft.startTimeSeconds}
                  />
                </label>
                <label className="block text-sm font-medium text-neutral-200">
                  Recommended speed
                  <select
                    className="mt-1 w-full rounded-md border border-white/10 bg-[#090a0b] px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                    onChange={(event) =>
                      setVideoDraft((draft) => ({
                        ...draft,
                        recommendedPlaybackSpeed: Number(event.target.value) as PlaybackSpeed,
                      }))
                    }
                    value={videoDraft.recommendedPlaybackSpeed}
                  >
                    {playbackSpeedOptions.map((speed) => (
                      <option key={speed} value={speed}>
                        {speed}x
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-400 md:self-end"
                  type="submit"
                >
                  <Plus size={16} />
                  Add video
                </button>
              </form>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0">
                  {activeVideo ? (
                    <div className="space-y-3">
                      <GumletPlayer video={activeVideo} />
                      <div>
                        <h2 className="text-2xl font-semibold">{activeVideo.title}</h2>
                        <p className="mt-1 text-sm text-neutral-300">{getVideoMeta(activeVideo)}</p>
                        <p className="mt-2 text-sm leading-6 text-neutral-400">
                          {activeVideo.description || "No description added."}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-white/15 bg-[#101214] p-8 text-center text-neutral-400">
                      Add a Gumlet video to preview it here.
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {videos.map((video, index) => (
                    <article
                      className={`rounded-lg border p-3 ${
                        activeVideo?.id === video.id
                          ? "border-sky-400/60 bg-sky-400/10"
                          : "border-white/10 bg-[#101214]"
                      }`}
                      key={video.id}
                    >
                      <button
                        className="block w-full text-left"
                        onClick={() => setActiveVideoId(video.id)}
                        type="button"
                      >
                        <span className="block font-semibold text-white">{video.title}</span>
                        <p className="mt-1 text-xs text-neutral-400">{getVideoMeta(video)}</p>
                      </button>
                      <div className="mt-3 grid gap-2">
                        <input
                          aria-label={`${video.title} title`}
                          className="rounded-md border border-white/10 bg-[#090a0b] px-2 py-1.5 text-sm text-white"
                          onChange={(event) =>
                            setData((current) =>
                              updateVideo(current, selectedProject.id, video.id, {
                                title: event.target.value,
                              }),
                            )
                          }
                          value={video.title}
                        />
                        <input
                          aria-label={`${video.title} asset ID`}
                          className="rounded-md border border-white/10 bg-[#090a0b] px-2 py-1.5 text-sm text-white"
                          onChange={(event) =>
                            setData((current) =>
                              updateVideo(current, selectedProject.id, video.id, {
                                assetId: event.target.value,
                              }),
                            )
                          }
                          value={video.assetId}
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            aria-label={`${video.title} duration`}
                            className="rounded-md border border-white/10 bg-[#090a0b] px-2 py-1.5 text-sm text-white"
                            inputMode="numeric"
                            onChange={(event) =>
                              setData((current) =>
                                updateVideo(current, selectedProject.id, video.id, {
                                  durationSeconds: parseOptionalSeconds(event.target.value),
                                }),
                              )
                            }
                            value={video.durationSeconds ?? ""}
                          />
                          <input
                            aria-label={`${video.title} start time`}
                            className="rounded-md border border-white/10 bg-[#090a0b] px-2 py-1.5 text-sm text-white"
                            inputMode="numeric"
                            onChange={(event) =>
                              setData((current) =>
                                updateVideo(current, selectedProject.id, video.id, {
                                  startTimeSeconds: parseOptionalSeconds(event.target.value),
                                }),
                              )
                            }
                            value={video.startTimeSeconds ?? ""}
                          />
                          <select
                            aria-label={`${video.title} speed`}
                            className="rounded-md border border-white/10 bg-[#090a0b] px-2 py-1.5 text-sm text-white"
                            onChange={(event) =>
                              setData((current) =>
                                updateVideo(current, selectedProject.id, video.id, {
                                  recommendedPlaybackSpeed: Number(
                                    event.target.value,
                                  ) as PlaybackSpeed,
                                }),
                              )
                            }
                            value={video.recommendedPlaybackSpeed}
                          >
                            {playbackSpeedOptions.map((speed) => (
                              <option key={speed} value={speed}>
                                {speed}x
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          aria-label={`Move ${video.title} up`}
                          className="rounded-md border border-white/10 p-2 text-neutral-200 hover:bg-white/10 disabled:opacity-40"
                          disabled={index === 0}
                          onClick={() =>
                            setData((current) => moveVideo(current, selectedProject.id, video.id, "up"))
                          }
                          type="button"
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          aria-label={`Move ${video.title} down`}
                          className="rounded-md border border-white/10 p-2 text-neutral-200 hover:bg-white/10 disabled:opacity-40"
                          disabled={index === videos.length - 1}
                          onClick={() =>
                            setData((current) =>
                              moveVideo(current, selectedProject.id, video.id, "down"),
                            )
                          }
                          type="button"
                        >
                          <ArrowDown size={15} />
                        </button>
                        <button
                          className="ml-auto inline-flex items-center gap-2 rounded-md border border-red-400/30 px-2 py-1.5 text-sm text-red-100 hover:bg-red-500/20"
                          onClick={() =>
                            setData((current) => removeVideo(current, selectedProject.id, video.id))
                          }
                          type="button"
                        >
                          <Trash2 size={15} />
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[480px] items-center justify-center rounded-lg border border-dashed border-white/15 bg-[#101214] p-8 text-center">
              <div>
                <h2 className="text-2xl font-semibold">Create your first project</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-neutral-400">
                  Projects group Gumlet videos for one client review link. Add a project from the
                  left panel to start.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
