import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Cloud,
  CloudOff,
  Copy,
  ExternalLink,
  HardDriveUpload,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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

import { getAppConfig } from "./app-config";
import { GumletPlayer, type GumletPlayerHandle } from "./gumlet-player";
import { getPortalApiErrorMessage, portalApi } from "./portal-api";
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
  createVideoShareUrl,
  createShareUrl,
  estimateTimeSavedSeconds,
  estimateWatchTimeSeconds,
  formatDuration,
  getPortalAppOrigin,
  isLocalAppOrigin,
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

type CloudSyncStatus = "error" | "loading" | "local" | "saving" | "synced";

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

function getDraftFromVideo(video: PortalVideo): VideoDraft {
  return {
    assetId: video.directVideoUrl ?? video.assetId,
    description: video.description ?? "",
    durationSeconds: video.durationSeconds ? String(video.durationSeconds) : "",
    recommendedPlaybackSpeed: video.recommendedPlaybackSpeed,
    startTimeSeconds: video.startTimeSeconds ? String(video.startTimeSeconds) : "",
    thumbnailUrl: video.thumbnailUrl ?? "",
    title: video.title,
  };
}

function parseOptionalSeconds(value: string): number | undefined {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function getEditDurationPatch(
  editingVideo: PortalVideo,
  editVideoDraft: VideoDraft,
  durationTouched: boolean,
): null | number | undefined {
  const originalAssetInput = getDraftFromVideo(editingVideo).assetId.trim();
  const assetChanged = editVideoDraft.assetId.trim() !== originalAssetInput;

  if (assetChanged && !durationTouched) {
    return null;
  }

  if (!editVideoDraft.durationSeconds.trim()) {
    return durationTouched || assetChanged ? null : undefined;
  }

  return parseOptionalSeconds(editVideoDraft.durationSeconds) ?? null;
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

function hasLocalProjects(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return loadPortalData().projects.length > 0;
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
  const config = React.useMemo(() => getAppConfig(), []);
  const [data, setData] = React.useState<PortalData>(loadInitialData);
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(
    () => loadInitialData().projects[0]?.id ?? null,
  );
  const [projectDraft, setProjectDraft] = React.useState<ProjectDraft>(emptyProjectDraft);
  const [videoDraft, setVideoDraft] = React.useState<VideoDraft>(emptyVideoDraft);
  const [editVideoDraft, setEditVideoDraft] = React.useState<VideoDraft>(emptyVideoDraft);
  const [editDurationTouched, setEditDurationTouched] = React.useState(false);
  const [editingVideoId, setEditingVideoId] = React.useState<string | null>(null);
  const [deleteVideoId, setDeleteVideoId] = React.useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = React.useState<string | null>(null);
  const [durationRefreshRequest, setDurationRefreshRequest] = React.useState<{
    nonce: number;
    videoId: string;
  } | null>(null);
  const [shareUrl, setShareUrl] = React.useState("");
  const [shareStatus, setShareStatus] = React.useState("");
  const [sharePasscode, setSharePasscode] = React.useState("");
  const [cloudStatus, setCloudStatus] = React.useState<CloudSyncStatus>(
    config.cloudSyncEnabled ? "loading" : "local",
  );
  const [cloudMessage, setCloudMessage] = React.useState(
    config.cloudSyncEnabled
      ? "Connecting to Cloudflare D1."
      : "Local projects are stored only in this browser.",
  );
  const [browserHasLocalProjects, setBrowserHasLocalProjects] = React.useState(hasLocalProjects);
  const cloudReadyRef = React.useRef(!config.cloudSyncEnabled);
  const cloudSaveTimeoutRef = React.useRef<number | null>(null);
  const previewPlayerRef = React.useRef<GumletPlayerHandle | null>(null);

  React.useEffect(() => {
    if (!config.cloudSyncEnabled) {
      savePortalData(data);
      setBrowserHasLocalProjects(data.projects.length > 0);
    }

    if (!config.cloudSyncEnabled || !cloudReadyRef.current) {
      return undefined;
    }

    setCloudStatus("saving");
    setCloudMessage("Saving project metadata to Cloudflare D1.");

    if (cloudSaveTimeoutRef.current !== null) {
      window.clearTimeout(cloudSaveTimeoutRef.current);
    }

    cloudSaveTimeoutRef.current = window.setTimeout(() => {
      void portalApi
        .saveAdminProjects(data)
        .then(() => {
          setCloudStatus("synced");
          setCloudMessage("Cloud sync saved.");
        })
        .catch((error: unknown) => {
          setCloudStatus("error");
          setCloudMessage(getPortalApiErrorMessage(error));
        });
    }, 500);

    return () => {
      if (cloudSaveTimeoutRef.current !== null) {
        window.clearTimeout(cloudSaveTimeoutRef.current);
      }
    };
  }, [config.cloudSyncEnabled, data]);

  React.useEffect(() => {
    if (!config.cloudSyncEnabled) {
      cloudReadyRef.current = true;
      setCloudStatus("local");
      return undefined;
    }

    let cancelled = false;

    cloudReadyRef.current = false;
    setCloudStatus("loading");
    setCloudMessage("Loading projects from Cloudflare D1.");

    void portalApi
      .getAdminProjects()
      .then((cloudData) => {
        if (cancelled) {
          return;
        }

        cloudReadyRef.current = true;
        setData(cloudData);
        setSelectedProjectId(cloudData.projects[0]?.id ?? null);
        setCloudStatus("synced");
        setCloudMessage("Cloud sync connected.");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        cloudReadyRef.current = false;
        setCloudStatus("error");
        setCloudMessage(getPortalApiErrorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, [config.cloudSyncEnabled]);

  const selectedProject =
    data.projects.find((project) => project.id === selectedProjectId) ?? data.projects[0] ?? null;
  const videos = selectedProject ? getSortedVideos(selectedProject) : [];
  const activeVideo =
    videos.find((video) => video.id === activeVideoId) ?? videos[0] ?? null;
  const editingVideo = videos.find((video) => video.id === editingVideoId) ?? null;
  const deleteVideo = videos.find((video) => video.id === deleteVideoId) ?? null;
  const appOrigin = getPortalAppOrigin();
  const isLocalShareOrigin = isLocalAppOrigin(appOrigin);

  React.useEffect(() => {
    if (selectedProject && !selectedProjectId) {
      setSelectedProjectId(selectedProject.id);
    }
  }, [selectedProject, selectedProjectId]);

  React.useEffect(() => {
    if (!durationRefreshRequest || activeVideo?.id !== durationRefreshRequest.videoId) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      previewPlayerRef.current?.requestDuration();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [activeVideo?.id, durationRefreshRequest]);

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

  async function createReviewLink(project: PortalProject, video?: PortalVideo): Promise<string> {
    if (!config.cloudSyncEnabled) {
      return video ? createVideoShareUrl(project, video, appOrigin) : createShareUrl(project, appOrigin);
    }

    if (!cloudReadyRef.current) {
      throw new Error("Cloud sync is not connected yet.");
    }

    const response = await portalApi.createShareLink({
      passcode: sharePasscode.trim() || undefined,
      projectId: project.id,
      videoId: video?.id,
    });

    return response.url;
  }

  async function writeShareLinkToClipboard(url: string, copiedMessage: string, readyMessage: string): Promise<void> {
    setShareUrl(url);
    setShareStatus(readyMessage);

    try {
      await navigator.clipboard?.writeText(url);
      setShareStatus(copiedMessage);
    } catch {
      setShareStatus(readyMessage);
    }
  }

  async function handleCopyShareLink(project: PortalProject): Promise<void> {
    try {
      const url = await createReviewLink(project);
      const passcodeLabel =
        config.cloudSyncEnabled && sharePasscode.trim() ? " passcode-protected" : "";

      await writeShareLinkToClipboard(
        url,
        config.cloudSyncEnabled
          ? `Cloud${passcodeLabel} client link copied`
          : isLocalShareOrigin
            ? "Local-only share link copied"
            : "Share link copied",
        config.cloudSyncEnabled
          ? `Cloud${passcodeLabel} client link ready`
          : isLocalShareOrigin
            ? "Local-only share link ready"
            : "Share link ready",
      );
    } catch (error) {
      setShareStatus(`Could not create client link: ${getPortalApiErrorMessage(error)}`);
    }
  }

  async function handleOpenShareLink(project: PortalProject): Promise<void> {
    try {
      const url = await createReviewLink(project);

      setShareUrl(url);
      setShareStatus("Client link opened");
      window.open(url, "_blank", "noreferrer");
    } catch (error) {
      setShareStatus(`Could not open client link: ${getPortalApiErrorMessage(error)}`);
    }
  }

  async function handleCopyVideoLink(project: PortalProject, video: PortalVideo): Promise<void> {
    try {
      const url = await createReviewLink(project, video);
      const passcodeLabel =
        config.cloudSyncEnabled && sharePasscode.trim() ? " passcode-protected" : "";

      await writeShareLinkToClipboard(
        url,
        config.cloudSyncEnabled
          ? `Cloud${passcodeLabel} video link copied`
          : isLocalShareOrigin
            ? "Local-only video link copied"
            : "Video link copied",
        config.cloudSyncEnabled
          ? `Cloud${passcodeLabel} video link ready`
          : isLocalShareOrigin
            ? "Local-only video link ready"
            : "Video link ready",
      );
    } catch (error) {
      setShareStatus(`Could not create video link: ${getPortalApiErrorMessage(error)}`);
    }
  }

  async function handleOpenVideoLink(project: PortalProject, video: PortalVideo): Promise<void> {
    try {
      const url = await createReviewLink(project, video);

      setShareUrl(url);
      setShareStatus("Video link opened");
      window.open(url, "_blank", "noreferrer");
    } catch (error) {
      setShareStatus(`Could not open video link: ${getPortalApiErrorMessage(error)}`);
    }
  }

  async function handleImportLocalProjects(): Promise<void> {
    const localData = loadPortalData();

    if (localData.projects.length === 0) {
      setBrowserHasLocalProjects(false);
      setCloudMessage("No local projects found in this browser.");
      return;
    }

    setCloudStatus("loading");
    setCloudMessage("Importing local projects to Cloudflare D1.");

    try {
      const importedData = await portalApi.importLocalProjects(localData);

      cloudReadyRef.current = true;
      setData(importedData);
      setSelectedProjectId(importedData.projects[0]?.id ?? null);
      setBrowserHasLocalProjects(localData.projects.length > 0);
      setCloudStatus("synced");
      setCloudMessage("Local projects imported to cloud storage. Local data was left in this browser.");
    } catch (error) {
      setCloudStatus("error");
      setCloudMessage(getPortalApiErrorMessage(error));
    }
  }

  function updateSelectedProject(patch: Parameters<typeof updateProject>[2]): void {
    if (!selectedProject) {
      return;
    }

    setData((current) => updateProject(current, selectedProject.id, patch));
  }

  function openEditVideo(video: PortalVideo): void {
    setEditVideoDraft(getDraftFromVideo(video));
    setEditDurationTouched(false);
    setEditingVideoId(video.id);
  }

  function closeEditVideo(): void {
    setEditingVideoId(null);
    setEditVideoDraft(emptyVideoDraft);
    setEditDurationTouched(false);
  }

  function handleSubmitEditVideo(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!selectedProject || !editingVideoId || !editingVideo) {
      return;
    }

    setData((current) =>
      updateVideo(current, selectedProject.id, editingVideoId, {
        assetId: editVideoDraft.assetId,
        description: editVideoDraft.description,
        durationSeconds: getEditDurationPatch(
          editingVideo,
          editVideoDraft,
          editDurationTouched,
        ),
        recommendedPlaybackSpeed: editVideoDraft.recommendedPlaybackSpeed,
        startTimeSeconds: parseOptionalSeconds(editVideoDraft.startTimeSeconds),
        thumbnailUrl: editVideoDraft.thumbnailUrl,
        title: editVideoDraft.title,
      }),
    );
    closeEditVideo();
  }

  function handleDeleteVideo(): void {
    if (!selectedProject || !deleteVideo) {
      return;
    }

    const remainingVideos = videos.filter((video) => video.id !== deleteVideo.id);
    const deleteIndex = videos.findIndex((video) => video.id === deleteVideo.id);
    const nextActiveVideoId =
      remainingVideos[deleteIndex]?.id ?? remainingVideos[deleteIndex - 1]?.id ?? null;

    setData((current) => removeVideo(current, selectedProject.id, deleteVideo.id));
    setActiveVideoId(activeVideo?.id === deleteVideo.id ? nextActiveVideoId : activeVideoId);
    setDeleteVideoId(null);
  }

  function handleRefreshVideoDuration(video: PortalVideo): void {
    setActiveVideoId(video.id);
    setShareStatus(`Duration refresh requested for ${video.title}`);
    setDurationRefreshRequest({
      nonce: Date.now(),
      videoId: video.id,
    });
  }

  function handlePreviewDuration(video: PortalVideo, durationSeconds: number): void {
    if (!selectedProject || video.durationSeconds === durationSeconds) {
      return;
    }

    setData((current) =>
      updateVideo(current, selectedProject.id, video.id, {
        durationSeconds,
      }),
    );
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

          <CardContent className="space-y-3">
            <div className="space-y-3 rounded-md border border-white/10 bg-black/10 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="gap-2" variant="secondary">
                  {config.cloudSyncEnabled ? (
                    <Cloud className="size-4" />
                  ) : (
                    <CloudOff className="size-4" />
                  )}
                  {config.cloudSyncEnabled ? "Cloud sync" : "Local only"}
                </Badge>
                <Badge className="gap-2" variant="mutedOutline">
                  <ShieldCheck className="size-4" />
                  Admin access
                </Badge>
              </div>
              <p className="leading-6 text-[color:var(--muted-foreground)]">
                {config.cloudSyncEnabled
                  ? `${cloudMessage} Cloudflare Access should restrict /admin to ${config.adminEmail}.`
                  : "Local mode stores projects only in this browser. Cloudflare Access is configured outside this app when cloud sync is enabled."}
              </p>
              {config.cloudSyncEnabled ? (
                <p className="text-xs leading-5 text-[color:var(--muted-foreground)]">
                  Access login and logout are controlled by Cloudflare Access.
                </p>
              ) : null}
            </div>

            {config.cloudSyncEnabled && browserHasLocalProjects ? (
              <Alert>
                <AlertTitle>Local projects found</AlertTitle>
                <AlertDescription className="space-y-3">
                  <span className="block">{config.securityCopy.localImport}</span>
                  <Button
                    onClick={() => void handleImportLocalProjects()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <HardDriveUpload />
                    Import local projects to cloud
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}

            {config.cloudSyncEnabled && cloudStatus === "error" ? (
              <Alert variant="destructive">
                <AlertTitle>Cloud sync needs attention</AlertTitle>
                <AlertDescription>{cloudMessage}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>

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
                    <Field>
                      <FieldLabel htmlFor="share-passcode">Optional share passcode</FieldLabel>
                      <Input
                        aria-label="Optional share passcode"
                        disabled={!config.cloudSyncEnabled}
                        id="share-passcode"
                        onChange={(event) => setSharePasscode(event.target.value)}
                        placeholder={
                          config.cloudSyncEnabled ? "No passcode" : "Cloud sync only"
                        }
                        size="lg"
                        type="password"
                        value={sharePasscode}
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
                    onClick={() => void handleOpenShareLink(selectedProject)}
                    size="lg"
                    type="button"
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

                {isLocalShareOrigin ? (
                  <Alert variant="destructive">
                    <AlertTitle>Local-only share links</AlertTitle>
                    <AlertDescription>
                      This is a local-only link. Deploy to Cloudflare Pages and set the public app
                      URL before sending to clients.
                    </AlertDescription>
                  </Alert>
                ) : null}

                <Alert>
                  <AlertTitle>Unlisted link security</AlertTitle>
                  <AlertDescription>
                    Anyone with this link can view the shared video page. Do not include sensitive
                    information in titles, descriptions, or URL data unless Gumlet access is
                    restricted.
                  </AlertDescription>
                </Alert>

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
                      Paste an existing Gumlet asset ID, watch link, embed code, or MP4 URL.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form
                      className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
                      onSubmit={handleAddVideo}
                    >
                      <Field>
                        <FieldLabel htmlFor="gumlet-asset-id">Gumlet URL or asset ID</FieldLabel>
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
                        <GumletPlayer
                          ref={previewPlayerRef}
                          onDuration={(durationSeconds) =>
                            handlePreviewDuration(activeVideo, durationSeconds)
                          }
                          video={activeVideo}
                        />
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
                        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
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
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  aria-label={`Video actions for ${video.title}`}
                                  size="icon"
                                  type="button"
                                  variant="outline"
                                />
                              }
                            >
                              <MoreHorizontal />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => handleRefreshVideoDuration(video)}>
                                <RefreshCw />
                                Refresh duration
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditVideo(video)}>
                                <Pencil />
                                Edit video
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteVideoId(video.id)}
                                variant="destructive"
                              >
                                <Trash2 />
                                Delete video
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="min-w-0 rounded-md border border-white/10 bg-black/10 px-3 py-2 text-xs leading-5 text-[color:var(--muted-foreground)]">
                            <p className="truncate text-white">{video.assetId}</p>
                            <p>
                              {video.durationSeconds
                                ? `${formatDuration(video.durationSeconds)} source length`
                                : "Duration will be detected from Gumlet when available."}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={() => void handleCopyVideoLink(selectedProject, video)}
                            size="lg"
                            type="button"
                            variant="outline"
                          >
                            <Copy />
                            Copy video link
                          </Button>
                          <Button
                            onClick={() => void handleOpenVideoLink(selectedProject, video)}
                            size="lg"
                            type="button"
                            variant="outline"
                          >
                            <ExternalLink />
                            Open video link
                          </Button>
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
                          </div>
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

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            closeEditVideo();
          }
        }}
        open={editingVideo !== null}
      >
        <DialogContent layout="sections" size="xl">
          <DialogHeader>
            <DialogTitle>Edit video</DialogTitle>
            <DialogDescription>
              Update the local review metadata. This does not change the Gumlet asset.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitEditVideo}>
            <DialogBody className="grid gap-3 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="edit-video-title">Edit video title</FieldLabel>
                <Input
                  id="edit-video-title"
                  onChange={(event) =>
                    setEditVideoDraft((draft) => ({ ...draft, title: event.target.value }))
                  }
                  required
                  size="lg"
                  value={editVideoDraft.title}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-gumlet-asset-id">Edit Gumlet URL or asset ID</FieldLabel>
                <Input
                  id="edit-gumlet-asset-id"
                  onChange={(event) =>
                    setEditVideoDraft((draft) => ({ ...draft, assetId: event.target.value }))
                  }
                  required
                  size="lg"
                  value={editVideoDraft.assetId}
                />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="edit-video-description">Edit video description</FieldLabel>
                <Textarea
                  id="edit-video-description"
                  onChange={(event) =>
                    setEditVideoDraft((draft) => ({ ...draft, description: event.target.value }))
                  }
                  size="lg"
                  value={editVideoDraft.description}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-thumbnail-url">Edit thumbnail URL</FieldLabel>
                <Input
                  id="edit-thumbnail-url"
                  onChange={(event) =>
                    setEditVideoDraft((draft) => ({ ...draft, thumbnailUrl: event.target.value }))
                  }
                  size="lg"
                  value={editVideoDraft.thumbnailUrl}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-duration-seconds">Edit duration in seconds</FieldLabel>
                <Input
                  id="edit-duration-seconds"
                  inputMode="numeric"
                  onChange={(event) => {
                    setEditDurationTouched(true);
                    setEditVideoDraft((draft) => ({
                      ...draft,
                      durationSeconds: event.target.value,
                    }));
                  }}
                  size="lg"
                  value={editVideoDraft.durationSeconds}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-start-time-seconds">Edit start time in seconds</FieldLabel>
                <Input
                  id="edit-start-time-seconds"
                  inputMode="numeric"
                  onChange={(event) =>
                    setEditVideoDraft((draft) => ({
                      ...draft,
                      startTimeSeconds: event.target.value,
                    }))
                  }
                  size="lg"
                  value={editVideoDraft.startTimeSeconds}
                />
              </Field>
              <Field>
                <FieldLabel>Edit default speed</FieldLabel>
                <SpeedSelect
                  ariaLabel="Edit default speed"
                  onValueChange={(recommendedPlaybackSpeed) =>
                    setEditVideoDraft((draft) => ({
                      ...draft,
                      recommendedPlaybackSpeed,
                    }))
                  }
                  value={editVideoDraft.recommendedPlaybackSpeed}
                />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button onClick={closeEditVideo} type="button" variant="outline">
                Cancel
              </Button>
              <Button type="submit">
                <CheckCircle2 />
                Save video
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteVideoId(null);
          }
        }}
        open={deleteVideo !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this video from the project?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteVideo
                ? `${deleteVideo.title} will be removed from this local review project only. The Gumlet asset will not be deleted.`
                : "This video will be removed from this local review project only."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVideo} type="button" variant="destructive">
              <Trash2 />
              Delete video
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
