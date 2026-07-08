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

import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Separator,
  Textarea,
} from "@/toolcraft/ui";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/toolcraft/ui/components/primitives";

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

type SpeedSelectProps = {
  ariaLabel: string;
  onValueChange: (value: PlaybackSpeed) => void;
  value: PlaybackSpeed;
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

const playbackSpeedItems = playbackSpeedOptions.map((speed) => ({
  label: `${speed}x`,
  value: String(speed),
}));

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

  return `${formatDuration(video.durationSeconds)} video - Suggested ${
    video.recommendedPlaybackSpeed
  }x - Watch in about ${formatDuration(watchTime)} - Saves about ${formatDuration(savedTime)}`;
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

function SpeedSelect({ ariaLabel, onValueChange, value }: SpeedSelectProps): React.JSX.Element {
  const selected = playbackSpeedItems.find((item) => item.value === String(value));

  return (
    <Select
      items={playbackSpeedItems}
      onValueChange={(nextValue) => onValueChange(Number(nextValue) as PlaybackSpeed)}
      value={String(value)}
    >
      <SelectTrigger aria-label={ariaLabel} className="w-full justify-between" size="lg">
        <SelectValue>{() => selected?.label ?? `${value}x`}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        <SelectGroup>
          {playbackSpeedItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
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
    <main className="min-h-dvh bg-[color:var(--background)] text-[color:var(--foreground)]">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col gap-5 px-4 py-4 lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:px-6">
        <Card className="h-fit">
          <CardHeader>
            <Badge className="w-fit" variant="emphasisOutline">
              Gumlet portal
            </Badge>
            <CardTitle aria-level={1} className="mt-1 text-2xl font-semibold" role="heading">
              Client video reviews
            </CardTitle>
            <CardDescription className="text-sm leading-6">
              Organize existing Gumlet videos, set suggested speed, and send unlisted review links.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form className="space-y-4" onSubmit={handleCreateProject}>
              <Separator />
              <FieldGroup className="gap-3">
                <Field>
                  <FieldLabel htmlFor="project-name">Project name</FieldLabel>
                  <Input
                    id="project-name"
                    onChange={(event) =>
                      setProjectDraft((draft) => ({ ...draft, name: event.target.value }))
                    }
                    required
                    size="lg"
                    value={projectDraft.name}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="project-client-name">Client name</FieldLabel>
                  <Input
                    id="project-client-name"
                    onChange={(event) =>
                      setProjectDraft((draft) => ({ ...draft, clientName: event.target.value }))
                    }
                    size="lg"
                    value={projectDraft.clientName}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="project-description">Project description</FieldLabel>
                  <Textarea
                    id="project-description"
                    onChange={(event) =>
                      setProjectDraft((draft) => ({ ...draft, description: event.target.value }))
                    }
                    size="lg"
                    value={projectDraft.description}
                  />
                </Field>
              </FieldGroup>
              <Button className="w-full" size="xl" type="submit">
                <Plus />
                Create project
              </Button>
            </form>
          </CardContent>

          <CardContent className="space-y-2">
            {data.projects.map((project) => (
              <Button
                className={`!h-auto w-full justify-start whitespace-normal px-3 py-3 text-left ${
                  selectedProject?.id === project.id
                    ? "border-sky-400/60 bg-sky-400/10 text-white"
                    : "text-white"
                }`}
                key={project.id}
                onClick={() => {
                  setSelectedProjectId(project.id);
                  setActiveVideoId(project.videos[0]?.id ?? null);
                  setShareStatus("");
                }}
                type="button"
                variant="outline"
              >
                <span className="flex min-w-0 flex-col items-start gap-1">
                  <span className="truncate text-sm font-medium">{project.name}</span>
                  <span className="text-xs text-[color:var(--muted-foreground)]">
                    {project.clientName ? `${project.clientName} - ` : ""}
                    {project.videos.length} videos - Updated {formatDate(project.updatedAt)}
                  </span>
                </span>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          {selectedProject ? (
            <>
              <CardHeader className="gap-4 xl:grid-cols-[1fr_auto]">
                <div className="min-w-0 space-y-3">
                  <CardTitle
                    aria-level={1}
                    className="text-3xl font-semibold text-white"
                    role="heading"
                  >
                    {selectedProject.name}
                  </CardTitle>
                  <FieldGroup className="grid gap-2 md:grid-cols-2">
                    <Field className="md:col-span-2">
                      <FieldLabel htmlFor="selected-project-name">Project name</FieldLabel>
                      <Input
                        aria-label="Selected project name"
                        id="selected-project-name"
                        onChange={(event) => updateSelectedProject({ name: event.target.value })}
                        size="lg"
                        value={selectedProject.name}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="selected-client-name">Client name</FieldLabel>
                      <Input
                        aria-label="Selected client name"
                        id="selected-client-name"
                        onChange={(event) =>
                          updateSelectedProject({ clientName: event.target.value })
                        }
                        placeholder="Client name"
                        size="lg"
                        value={selectedProject.clientName ?? ""}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="share-url">Share URL</FieldLabel>
                      <Input
                        aria-label="Share URL"
                        id="share-url"
                        readOnly
                        size="lg"
                        value={shareUrl}
                      />
                    </Field>
                    <Field className="md:col-span-2">
                      <FieldLabel htmlFor="selected-project-description">
                        Project description
                      </FieldLabel>
                      <Textarea
                        aria-label="Selected project description"
                        id="selected-project-description"
                        onChange={(event) =>
                          updateSelectedProject({ description: event.target.value })
                        }
                        placeholder="Project description"
                        size="lg"
                        value={selectedProject.description ?? ""}
                      />
                    </Field>
                  </FieldGroup>
                </div>

                <CardAction className="static col-auto row-auto flex flex-wrap gap-2 justify-self-start xl:justify-self-end">
                  <Button
                    onClick={() => void handleCopyShareLink(selectedProject)}
                    size="lg"
                    type="button"
                    variant="outline"
                  >
                    <Copy />
                    Copy client link
                  </Button>
                  <Button
                    nativeButton={false}
                    render={
                      <a
                        href={shareUrl || createShareUrl(selectedProject, window.location.origin)}
                        rel="noreferrer"
                        target="_blank"
                      />
                    }
                    size="lg"
                    variant="outline"
                  >
                    <ExternalLink />
                    Open
                  </Button>
                  <Button
                    onClick={() => {
                      setData((current) => deleteProject(current, selectedProject.id));
                      setSelectedProjectId(null);
                    }}
                    size="lg"
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 />
                    Delete
                  </Button>
                </CardAction>
              </CardHeader>

              <CardContent className="space-y-5">
                <Separator />

                {shareStatus ? (
                  <Badge className="gap-2 px-3 py-2 text-sm" variant="secondary">
                    <CheckCircle2 className="size-4" />
                    {shareStatus}
                  </Badge>
                ) : null}

                <Card>
                  <CardHeader>
                    <CardTitle>Add Gumlet video</CardTitle>
                    <CardDescription>
                      Paste an existing Gumlet asset ID and metadata for the client playlist.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form
                      className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
                      onSubmit={handleAddVideo}
                    >
                      <Field>
                        <FieldLabel htmlFor="gumlet-asset-id">Gumlet asset ID</FieldLabel>
                        <Input
                          id="gumlet-asset-id"
                          onChange={(event) =>
                            setVideoDraft((draft) => ({ ...draft, assetId: event.target.value }))
                          }
                          required
                          size="lg"
                          value={videoDraft.assetId}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="video-title">Video title</FieldLabel>
                        <Input
                          id="video-title"
                          onChange={(event) =>
                            setVideoDraft((draft) => ({ ...draft, title: event.target.value }))
                          }
                          required
                          size="lg"
                          value={videoDraft.title}
                        />
                      </Field>
                      <Field className="xl:col-span-2">
                        <FieldLabel htmlFor="video-description">Video description</FieldLabel>
                        <Input
                          id="video-description"
                          onChange={(event) =>
                            setVideoDraft((draft) => ({
                              ...draft,
                              description: event.target.value,
                            }))
                          }
                          size="lg"
                          value={videoDraft.description}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="thumbnail-url">Thumbnail URL</FieldLabel>
                        <Input
                          id="thumbnail-url"
                          onChange={(event) =>
                            setVideoDraft((draft) => ({
                              ...draft,
                              thumbnailUrl: event.target.value,
                            }))
                          }
                          size="lg"
                          value={videoDraft.thumbnailUrl}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="duration-seconds">Duration in seconds</FieldLabel>
                        <Input
                          id="duration-seconds"
                          inputMode="numeric"
                          onChange={(event) =>
                            setVideoDraft((draft) => ({
                              ...draft,
                              durationSeconds: event.target.value,
                            }))
                          }
                          size="lg"
                          value={videoDraft.durationSeconds}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="start-time-seconds">Start time in seconds</FieldLabel>
                        <Input
                          id="start-time-seconds"
                          inputMode="numeric"
                          onChange={(event) =>
                            setVideoDraft((draft) => ({
                              ...draft,
                              startTimeSeconds: event.target.value,
                            }))
                          }
                          size="lg"
                          value={videoDraft.startTimeSeconds}
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Recommended speed</FieldLabel>
                        <SpeedSelect
                          ariaLabel="Recommended speed"
                          onValueChange={(recommendedPlaybackSpeed) =>
                            setVideoDraft((draft) => ({
                              ...draft,
                              recommendedPlaybackSpeed,
                            }))
                          }
                          value={videoDraft.recommendedPlaybackSpeed}
                        />
                      </Field>
                      <Button className="md:self-end" size="xl" type="submit">
                        <Plus />
                        Add video
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="min-w-0">
                    {activeVideo ? (
                      <div className="space-y-3">
                        <GumletPlayer video={activeVideo} />
                        <Card>
                          <CardHeader>
                          <CardTitle aria-level={2} className="text-2xl" role="heading">
                            {activeVideo.title}
                          </CardTitle>
                            <CardDescription className="text-sm">
                              {getVideoMeta(activeVideo)}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="text-sm leading-6 text-[color:var(--muted-foreground)]">
                            {activeVideo.description || "No description added."}
                          </CardContent>
                        </Card>
                      </div>
                    ) : (
                      <Empty className="min-h-[260px]" variant="outline">
                        <EmptyHeader>
                          <EmptyTitle>Add a Gumlet video</EmptyTitle>
                          <EmptyDescription>
                            Add a Gumlet video to preview it here.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                  </div>

                  <div className="space-y-3">
                    {videos.map((video, index) => (
                      <Card
                        className={
                          activeVideo?.id === video.id
                            ? "border border-sky-400/60 bg-sky-400/10"
                            : undefined
                        }
                        key={video.id}
                        size="sm"
                      >
                        <CardHeader>
                          <Button
                            className="!h-auto w-full justify-start whitespace-normal px-0 py-0 text-left"
                            onClick={() => setActiveVideoId(video.id)}
                            type="button"
                            variant="ghost-static"
                          >
                            <span className="flex min-w-0 flex-col items-start gap-1">
                              <span className="font-semibold text-white">{video.title}</span>
                              <span className="text-xs text-[color:var(--muted-foreground)]">
                                {getVideoMeta(video)}
                              </span>
                            </span>
                          </Button>
                        </CardHeader>
                        <CardContent className="grid gap-2">
                          <Input
                            aria-label={`${video.title} title`}
                            onChange={(event) =>
                              setData((current) =>
                                updateVideo(current, selectedProject.id, video.id, {
                                  title: event.target.value,
                                }),
                              )
                            }
                            size="lg"
                            value={video.title}
                          />
                          <Input
                            aria-label={`${video.title} asset ID`}
                            onChange={(event) =>
                              setData((current) =>
                                updateVideo(current, selectedProject.id, video.id, {
                                  assetId: event.target.value,
                                }),
                              )
                            }
                            size="lg"
                            value={video.assetId}
                          />
                          <div className="grid grid-cols-3 gap-2">
                            <Input
                              aria-label={`${video.title} duration`}
                              inputMode="numeric"
                              onChange={(event) =>
                                setData((current) =>
                                  updateVideo(current, selectedProject.id, video.id, {
                                    durationSeconds: parseOptionalSeconds(event.target.value),
                                  }),
                                )
                              }
                              size="lg"
                              value={video.durationSeconds ?? ""}
                            />
                            <Input
                              aria-label={`${video.title} start time`}
                              inputMode="numeric"
                              onChange={(event) =>
                                setData((current) =>
                                  updateVideo(current, selectedProject.id, video.id, {
                                    startTimeSeconds: parseOptionalSeconds(event.target.value),
                                  }),
                                )
                              }
                              size="lg"
                              value={video.startTimeSeconds ?? ""}
                            />
                            <SpeedSelect
                              ariaLabel={`${video.title} speed`}
                              onValueChange={(recommendedPlaybackSpeed) =>
                                setData((current) =>
                                  updateVideo(current, selectedProject.id, video.id, {
                                    recommendedPlaybackSpeed,
                                  }),
                                )
                              }
                              value={video.recommendedPlaybackSpeed}
                            />
                          </div>
                        </CardContent>
                        <CardContent className="flex gap-2">
                          <Button
                            aria-label={`Move ${video.title} up`}
                            disabled={index === 0}
                            onClick={() =>
                              setData((current) =>
                                moveVideo(current, selectedProject.id, video.id, "up"),
                              )
                            }
                            size="icon"
                            type="button"
                            variant="outline"
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            aria-label={`Move ${video.title} down`}
                            disabled={index === videos.length - 1}
                            onClick={() =>
                              setData((current) =>
                                moveVideo(current, selectedProject.id, video.id, "down"),
                              )
                            }
                            size="icon"
                            type="button"
                            variant="outline"
                          >
                            <ArrowDown />
                          </Button>
                          <Button
                            className="ml-auto"
                            onClick={() =>
                              setData((current) =>
                                removeVideo(current, selectedProject.id, video.id),
                              )
                            }
                            size="lg"
                            type="button"
                            variant="destructive"
                          >
                            <Trash2 />
                            Remove
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent>
              <Empty className="min-h-[480px]" variant="outline">
                <EmptyHeader>
                  <EmptyTitle className="text-2xl">Create your first project</EmptyTitle>
                  <EmptyDescription className="max-w-md text-sm leading-6">
                    Projects group Gumlet videos for one client review link. Add a project from the
                    left panel to start.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          )}
        </Card>
      </div>
    </main>
  );
}
