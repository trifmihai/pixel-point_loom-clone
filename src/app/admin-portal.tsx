import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Cloud,
  CloudOff,
  Copy,
  ExternalLink,
  FolderOpen,
  HardDriveUpload,
  Link2,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
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
import { AdminFeedbackPanel } from "./admin-feedback-panel";
import type { FeedbackVideoSummary } from "./feedback-types";
import { GumletPlayer, type GumletPlayerHandle } from "./gumlet-player";
import { PortalBrand, PortalPageHeader, PortalStatus, TimeSavingsSummary } from "./portal-ui";
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
  sanitizePublicPortalUrl,
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

type ShareDialogTarget = {
  projectId: string;
  videoId?: string;
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

function isProductionPagesHost(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.hostname === "pixel-point-loom-clone.pages.dev"
  );
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

function VideoFeedbackBadges({
  summary,
}: {
  summary?: FeedbackVideoSummary;
}): React.JSX.Element | null {
  if (!summary) {
    return null;
  }

  return (
    <span className="mt-1 flex flex-wrap gap-1.5">
      {summary.unreadCount > 0 ? <Badge>{summary.unreadCount} new</Badge> : null}
      <Badge variant="mutedOutline">{summary.openCount} open</Badge>
      {summary.resolvedCount > 0 ? (
        <Badge variant="secondary">{summary.resolvedCount} resolved</Badge>
      ) : null}
    </span>
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
  const [createProjectOpen, setCreateProjectOpen] = React.useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = React.useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = React.useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = React.useState(false);
  const [addVideoOpen, setAddVideoOpen] = React.useState(false);
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
  const [shareDialogTarget, setShareDialogTarget] = React.useState<ShareDialogTarget | null>(null);
  const [shareLoading, setShareLoading] = React.useState(false);
  const [cloudStatus, setCloudStatus] = React.useState<CloudSyncStatus>(
    config.cloudSyncEnabled ? "loading" : "local",
  );
  const [cloudMessage, setCloudMessage] = React.useState(
    config.cloudSyncEnabled
      ? "Connecting to Cloudflare D1."
      : "Local projects are stored only in this browser.",
  );
  const [browserHasLocalProjects, setBrowserHasLocalProjects] = React.useState(hasLocalProjects);
  const [feedbackSummaries, setFeedbackSummaries] = React.useState<FeedbackVideoSummary[]>([]);
  const [feedbackApiAvailable, setFeedbackApiAvailable] = React.useState(
    config.cloudSyncEnabled,
  );
  const cloudReadyRef = React.useRef(!config.cloudSyncEnabled);
  const cloudSaveTimeoutRef = React.useRef<number | null>(null);
  const previewPlayerRef = React.useRef<GumletPlayerHandle | null>(null);
  const productionCloudSyncDisabled = isProductionPagesHost() && !config.cloudSyncEnabled;
  const adminSessionExpected = config.cloudSyncEnabled || isProductionPagesHost();
  const cloudBusy = config.cloudSyncEnabled && (cloudStatus === "loading" || cloudStatus === "saving");

  const loadFeedbackSummaries = React.useCallback(async () => {
    try {
      const response = await portalApi.getAdminFeedback();
      setFeedbackSummaries(response.videos);
      setFeedbackApiAvailable(true);
    } catch {
      setFeedbackSummaries([]);
      setFeedbackApiAvailable(config.cloudSyncEnabled);
    }
  }, [config.cloudSyncEnabled]);

  React.useEffect(() => {
    void loadFeedbackSummaries();
  }, [loadFeedbackSummaries]);

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
  const shareDialogProject = shareDialogTarget
    ? data.projects.find((project) => project.id === shareDialogTarget.projectId) ?? null
    : null;
  const shareDialogVideo = shareDialogTarget?.videoId
    ? shareDialogProject?.videos.find((video) => video.id === shareDialogTarget.videoId) ?? null
    : null;
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
    setCreateProjectOpen(false);
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
    setAddVideoOpen(false);
  }

  async function createReviewLink(
    project: PortalProject,
    video?: PortalVideo,
    passcode = "",
  ): Promise<string> {
    if (!config.cloudSyncEnabled) {
      return sanitizePublicPortalUrl(
        video ? createVideoShareUrl(project, video, appOrigin) : createShareUrl(project, appOrigin),
      );
    }

    if (!cloudReadyRef.current) {
      throw new Error("Cloud sync is not connected yet.");
    }

    const response = await portalApi.createShareLink({
      passcode: passcode.trim() || undefined,
      projectId: project.id,
      videoId: video?.id,
    });

    return sanitizePublicPortalUrl(response.url);
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

  async function resolveShareDialogLink(
    project: PortalProject,
    video?: PortalVideo,
    passcode = "",
  ): Promise<void> {
    setShareLoading(true);
    setShareStatus("Preparing link…");

    try {
      const url = await createReviewLink(project, video, passcode);

      setShareUrl(url);
      setShareStatus(
        passcode.trim()
          ? "Protected link ready"
          : video
            ? "Video link ready"
            : "Client link ready",
      );
    } catch (error) {
      setShareStatus(`Could not prepare link: ${getPortalApiErrorMessage(error)}`);
    } finally {
      setShareLoading(false);
    }
  }

  function openShareDialog(project: PortalProject, video?: PortalVideo): void {
    setSharePasscode("");
    setShareUrl("");
    setShareDialogTarget({ projectId: project.id, videoId: video?.id });
    void resolveShareDialogLink(project, video);
  }

  async function handleCopyResolvedLink(): Promise<void> {
    if (!shareUrl) {
      return;
    }

    await writeShareLinkToClipboard(shareUrl, "Link copied", "Link ready to copy");
  }

  function handleDeleteProject(): void {
    if (!selectedProject) {
      return;
    }

    setData((current) => deleteProject(current, selectedProject.id));
    setSelectedProjectId(null);
    setActiveVideoId(null);
    setDeleteProjectOpen(false);
    setProjectSettingsOpen(false);
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

  async function handleSignOut(): Promise<void> {
    try {
      await portalApi.logoutAdmin();
    } finally {
      window.location.assign("/admin");
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
    <main className="portal-shell">
      <a className="portal-skip-link" href="#main-content">
        Skip to project
      </a>
      <div className="mx-auto grid w-full max-w-[1440px] gap-5 px-4 py-4 min-[1200px]:grid-cols-[264px_minmax(0,1fr)] min-[1200px]:px-6">
        <aside aria-label="Projects" className="hidden min-[1200px]:block">
          <Card className="sticky top-4 border-[color:var(--portal-border)]">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <PortalBrand context="Client video portal" />
                {adminSessionExpected ? (
                  <Button
                    aria-label="Sign out"
                    onClick={() => void handleSignOut()}
                    size="icon-lg"
                    type="button"
                    variant="outline"
                  >
                    <LogOut />
                  </Button>
                ) : null}
              </div>
              <div className="rounded-md border border-white/10 bg-black/10 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="gap-2" variant="secondary">
                    {config.cloudSyncEnabled ? <Cloud className="size-4" /> : <CloudOff className="size-4" />}
                    {config.cloudSyncEnabled ? "Cloud sync" : "Local only"}
                  </Badge>
                  <Badge className="gap-2" variant="mutedOutline">
                    <ShieldCheck className="size-4" />
                    Admin
                  </Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-[color:var(--muted-foreground)]">
                  {cloudMessage}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted-foreground)]">
                  Projects
                </h2>
                <Badge variant="mutedOutline">{data.projects.length}</Badge>
              </div>
              <Button
                className="w-full"
                onClick={() => setCreateProjectOpen(true)}
                size="xl"
                type="button"
              >
                <Plus />
                New project
              </Button>

              <details className="rounded-md border border-white/10 bg-black/10 p-3 text-xs">
                <summary className="cursor-pointer font-medium text-white">System status</summary>
                <dl className="mt-3 grid gap-2">
                  <div>
                    <dt className="text-[color:var(--muted-foreground)]">Cloud sync enabled</dt>
                    <dd className="font-medium text-white">{config.cloudSyncEnabled ? "true" : "false"}</dd>
                  </div>
                  <div>
                    <dt className="text-[color:var(--muted-foreground)]">Local mode</dt>
                    <dd className="font-medium text-white">{config.localMode ? "true" : "false"}</dd>
                  </div>
                  <div>
                    <dt className="text-[color:var(--muted-foreground)]">Public app URL</dt>
                    <dd className="break-all font-medium text-white">{config.publicAppUrl}</dd>
                  </div>
                  <div>
                    <dt className="text-[color:var(--muted-foreground)]">Cloud sync status</dt>
                    <dd className="font-medium text-white">
                      {cloudStatus}: {cloudMessage}
                    </dd>
                  </div>
                </dl>
              </details>

              {productionCloudSyncDisabled ? (
                <Alert variant="destructive">
                  <AlertTitle>Production build warning</AlertTitle>
                  <AlertDescription>
                    Cloud sync is disabled in this production build. Do not send ?data= links to clients.
                  </AlertDescription>
                </Alert>
              ) : null}

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
                      Import
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

              <Separator />
              <div className="space-y-2">
                {data.projects.length > 0 ? (
                  data.projects.map((project) => (
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
                        <span className="w-full truncate text-sm font-medium">{project.name}</span>
                        <span className="text-xs text-[color:var(--muted-foreground)]">
                          {project.videos.length} videos
                        </span>
                      </span>
                    </Button>
                  ))
                ) : (
                  <Empty className="min-h-[180px]" variant="outline">
                    <EmptyHeader>
                      <EmptyTitle>No projects</EmptyTitle>
                      <EmptyDescription>Create a project to start.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>

        <div className="min-w-0 space-y-4" id="main-content">
          <div className="min-[1200px]:hidden">
            <Card className="border-[color:var(--portal-border)]">
              <CardHeader className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <PortalBrand compact context="Client video portal" />
                  <div className="flex items-center gap-2">
                    <Button
                      aria-label="Open projects"
                      onClick={() => setProjectPickerOpen(true)}
                      size="icon-lg"
                      type="button"
                      variant="outline"
                    >
                      <FolderOpen />
                    </Button>
                    {adminSessionExpected ? (
                      <Button
                        aria-label="Sign out"
                        onClick={() => void handleSignOut()}
                        size="icon-lg"
                        type="button"
                        variant="outline"
                      >
                        <LogOut />
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    className="min-w-0 flex-1 justify-start"
                    onClick={() => setProjectPickerOpen(true)}
                    size="lg"
                    type="button"
                    variant="outline"
                  >
                    <FolderOpen />
                    <span className="truncate">{selectedProject?.name ?? "Choose a project"}</span>
                  </Button>
                  <Button
                    aria-label="New project"
                    onClick={() => setCreateProjectOpen(true)}
                    size="icon-lg"
                    type="button"
                  >
                    <Plus />
                  </Button>
                </div>
              </CardHeader>
            </Card>

            <Sheet onOpenChange={setProjectPickerOpen} open={projectPickerOpen}>
              <SheetContent className="w-[min(90vw,22rem)] bg-[color:var(--portal-surface-1)]" side="left">
                <SheetHeader>
                  <SheetTitle className="text-lg">Projects</SheetTitle>
                  <SheetDescription>
                    Choose a client workspace or create a new project.
                  </SheetDescription>
                </SheetHeader>
                <nav aria-label="Project list" className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
                  {data.projects.map((project) => (
                    <Button
                      className="!h-auto w-full justify-start whitespace-normal px-3 py-3 text-left"
                      key={project.id}
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setActiveVideoId(project.videos[0]?.id ?? null);
                        setShareStatus("");
                        setProjectPickerOpen(false);
                      }}
                      type="button"
                      variant={selectedProject?.id === project.id ? "secondary" : "outline"}
                    >
                      <span className="flex min-w-0 flex-col items-start gap-1">
                        <span className="line-clamp-2 text-sm font-medium">{project.name}</span>
                        <span className="text-xs text-[color:var(--muted-foreground)]">
                          {project.videos.length} videos
                        </span>
                      </span>
                    </Button>
                  ))}
                </nav>
                <div className="space-y-3 border-t border-[color:var(--portal-border)] p-4">
                  <Button
                    className="w-full"
                    onClick={() => {
                      setProjectPickerOpen(false);
                      setCreateProjectOpen(true);
                    }}
                    size="xl"
                    type="button"
                  >
                    <Plus />
                    New project
                  </Button>
                  <PortalStatus message={cloudMessage} tone={cloudStatus === "error" ? "error" : "default"} />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {selectedProject ? (
            <>
              <PortalPageHeader
                actions={
                  <>
                    <Button
                      disabled={cloudBusy}
                      onClick={() => openShareDialog(selectedProject)}
                      size="lg"
                      type="button"
                    >
                      <Link2 />
                      Share project
                    </Button>
                    <Button
                      onClick={() => setAddVideoOpen(true)}
                      size="lg"
                      type="button"
                      variant="outline"
                    >
                      <Plus />
                      Add video
                    </Button>
                    <Button
                      aria-label="Project settings"
                      onClick={() => setProjectSettingsOpen(true)}
                      size="icon-lg"
                      type="button"
                      variant="outline"
                    >
                      <Settings2 />
                    </Button>
                  </>
                }
                description={selectedProject.description || "A private client video workspace."}
                eyebrow={
                  <Badge className="w-fit" variant="mutedOutline">
                    {selectedProject.clientName || "Client workspace"}
                  </Badge>
                }
                metadata={
                  <>
                    <span>{videos.length} videos</span>
                    <span>Updated {formatDate(selectedProject.updatedAt)}</span>
                    <PortalStatus
                      message={
                        cloudStatus === "saving"
                          ? "Saving…"
                          : config.cloudSyncEnabled
                            ? cloudStatus === "error"
                              ? cloudMessage
                              : "Saved to cloud"
                            : "Saved on this device"
                      }
                      tone={cloudStatus === "error" ? "error" : "success"}
                    />
                  </>
                }
                title={selectedProject.name}
              />

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="order-last min-w-0 space-y-4 xl:order-first">
                  {isLocalShareOrigin ? (
                    <Alert variant="destructive">
                      <AlertTitle>Local-only share links</AlertTitle>
                      <AlertDescription>
                        This is a local-only link. Deploy to Cloudflare Pages and set the public app URL before sending to clients.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <PortalStatus
                    message={shareDialogTarget ? "" : shareStatus}
                    tone={shareStatus.startsWith("Could not") ? "error" : "success"}
                  />

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-white">Video review</h2>
                      <p className="text-sm text-[color:var(--muted-foreground)]">
                        Preview the selected Gumlet video and copy a single-video client link.
                      </p>
                    </div>
                    <Button
                      className="w-full sm:w-auto"
                      onClick={() => setAddVideoOpen(true)}
                      size="xl"
                      type="button"
                    >
                      <Plus />
                      Add Gumlet video
                    </Button>
                  </div>

                  {activeVideo ? (
                    <div className="space-y-4">
                      <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
                        <GumletPlayer
                          ref={previewPlayerRef}
                          onDuration={(durationSeconds) =>
                            handlePreviewDuration(activeVideo, durationSeconds)
                          }
                          video={activeVideo}
                        />
                      </div>
                      <Card>
                        <CardHeader className="gap-3 md:grid-cols-[1fr_auto]">
                          <div className="min-w-0">
                            <CardTitle aria-level={2} className="text-2xl" role="heading">
                              {activeVideo.title}
                            </CardTitle>
                            <CardDescription className="text-sm">
                              {getVideoMeta(activeVideo)}
                            </CardDescription>
                            <div className="mt-3">
                              <TimeSavingsSummary
                                compact
                                durationSeconds={activeVideo.durationSeconds}
                                speed={activeVideo.recommendedPlaybackSpeed}
                              />
                            </div>
                          </div>
                          <CardAction className="static col-auto row-auto flex flex-col gap-2 sm:flex-row">
                            <Button
                              className="w-full sm:w-auto"
                              disabled={cloudBusy}
                              onClick={() => openShareDialog(selectedProject, activeVideo)}
                              size="lg"
                              type="button"
                              variant="outline"
                            >
                              <Link2 />
                              Share video
                            </Button>
                          </CardAction>
                        </CardHeader>
                        <CardContent className="text-sm leading-6 text-[color:var(--muted-foreground)]">
                          {activeVideo.description || "No description added."}
                        </CardContent>
                      </Card>
                      <AdminFeedbackPanel
                        enabled={feedbackApiAvailable}
                        onChanged={loadFeedbackSummaries}
                        publicAppUrl={config.publicAppUrl}
                        video={activeVideo}
                      />
                    </div>
                  ) : (
                    <Empty className="min-h-[320px]" variant="outline">
                      <EmptyHeader>
                        <EmptyTitle>Add a Gumlet video</EmptyTitle>
                        <EmptyDescription>
                          Add a Gumlet video to preview it here.
                        </EmptyDescription>
                      </EmptyHeader>
                      <Button onClick={() => setAddVideoOpen(true)} size="xl" type="button">
                        <Plus />
                        Add Gumlet video
                      </Button>
                    </Empty>
                  )}
                </section>

                <aside className="order-first min-w-0 space-y-4 xl:order-last">
                  <Card>
                    <CardHeader>
                      <CardTitle>Video list</CardTitle>
                      <CardDescription>{videos.length} videos in this project</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {videos.length > 0 ? (
                        videos.map((video, index) => (
                          <div
                            className={`rounded-lg border p-3 ${
                              activeVideo?.id === video.id
                                ? "border-sky-400/60 bg-sky-400/10"
                                : "border-white/10 bg-black/10"
                            }`}
                            key={video.id}
                          >
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                              <Button
                                className="!h-auto w-full justify-start whitespace-normal px-0 py-0 text-left"
                                onClick={() => setActiveVideoId(video.id)}
                                type="button"
                                variant="ghost-static"
                              >
                                <span className="flex min-w-0 flex-col items-start gap-1">
                                  <span className="w-full truncate font-semibold text-white">
                                    {video.title}
                                  </span>
                                  <span className="text-xs text-[color:var(--muted-foreground)]">
                                    {getVideoMeta(video)}
                                  </span>
                                  <VideoFeedbackBadges
                                    summary={feedbackSummaries.find(
                                      (summary) => summary.videoId === video.id,
                                    )}
                                  />
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
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
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
                              <span className="min-w-0 rounded-md border border-white/10 bg-black/10 px-2 py-1 text-xs text-[color:var(--muted-foreground)]">
                                {video.durationSeconds
                                  ? `${formatDuration(video.durationSeconds)} source`
                                  : "Detect duration"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <Empty className="min-h-[220px]" variant="outline">
                          <EmptyHeader>
                            <EmptyTitle>No videos yet</EmptyTitle>
                            <EmptyDescription>Add a Gumlet video to build the review.</EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      )}
                    </CardContent>
                  </Card>

                  <Alert>
                    <AlertTitle>Unlisted link security</AlertTitle>
                    <AlertDescription>
                      Anyone with a token link can view the shared client page. Keep sensitive context out of titles and descriptions unless Gumlet access is restricted.
                    </AlertDescription>
                  </Alert>
                </aside>
              </div>
            </>
          ) : (
            <Empty className="min-h-[520px]" variant="outline">
              <EmptyHeader>
                <EmptyTitle className="text-2xl">Create your first project</EmptyTitle>
                <EmptyDescription className="max-w-md text-sm leading-6">
                  Projects group Gumlet videos for one client review link. Start with a project, then add the videos you want reviewed.
                </EmptyDescription>
              </EmptyHeader>
              <Button onClick={() => setCreateProjectOpen(true)} size="xl" type="button">
                <Plus />
                New project
              </Button>
            </Empty>
          )}
        </div>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setShareDialogTarget(null);
            setSharePasscode("");
          }
        }}
        open={shareDialogProject !== null}
      >
        <DialogContent layout="sections" size="xl">
          <DialogHeader>
            <DialogTitle>
              Share {shareDialogVideo?.title ?? shareDialogProject?.name ?? "review"}
            </DialogTitle>
            <DialogDescription>
              {shareDialogVideo
                ? "Send a focused link to this video. Existing active links are reused."
                : "Send the complete client collection. Existing active links are reused."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field>
              <FieldLabel htmlFor="share-dialog-url">Share URL</FieldLabel>
              <Input
                aria-label="Share URL"
                className="portal-numeric"
                id="share-dialog-url"
                name="share-url"
                readOnly
                size="lg"
                value={shareUrl}
              />
            </Field>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                disabled={!shareUrl || shareLoading}
                onClick={() => void handleCopyResolvedLink()}
                size="lg"
                type="button"
              >
                <Copy />
                Copy link
              </Button>
              <Button
                disabled={!shareUrl || shareLoading}
                onClick={() => window.open(shareUrl, "_blank", "noreferrer")}
                size="lg"
                type="button"
                variant="outline"
              >
                <ExternalLink />
                Open link
              </Button>
            </div>
            <PortalStatus
              message={shareStatus}
              tone={shareStatus.startsWith("Could not") ? "error" : "success"}
            />
            <Separator />
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Optional passcode</h3>
                <p className="mt-1 text-xs leading-5 text-[color:var(--muted-foreground)]">
                  Create a separate protected link only when the client needs a passcode.
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor="share-dialog-passcode">Passcode</FieldLabel>
                <Input
                  autoComplete="new-password"
                  disabled={!config.cloudSyncEnabled}
                  id="share-dialog-passcode"
                  name="share-passcode"
                  onChange={(event) => setSharePasscode(event.target.value)}
                  placeholder={config.cloudSyncEnabled ? "Enter a client passcode…" : "Cloud sync only"}
                  size="lg"
                  type="password"
                  value={sharePasscode}
                />
              </Field>
              <Button
                disabled={
                  !config.cloudSyncEnabled ||
                  !sharePasscode.trim() ||
                  shareLoading ||
                  !shareDialogProject
                }
                onClick={() => {
                  if (shareDialogProject) {
                    void resolveShareDialogLink(
                      shareDialogProject,
                      shareDialogVideo ?? undefined,
                      sharePasscode,
                    );
                  }
                }}
                type="button"
                variant="outline"
              >
                <ShieldCheck />
                Create protected link
              </Button>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setProjectSettingsOpen} open={projectSettingsOpen && Boolean(selectedProject)}>
        <DialogContent layout="sections" size="xl">
          <DialogHeader>
            <DialogTitle>Project settings</DialogTitle>
            <DialogDescription>
              Edit the client-facing project name and description.
            </DialogDescription>
          </DialogHeader>
          {selectedProject ? (
            <DialogBody className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="selected-project-name">Project name</FieldLabel>
                <Input
                  aria-label="Selected project name"
                  autoComplete="off"
                  id="selected-project-name"
                  name="project-name"
                  onChange={(event) => updateSelectedProject({ name: event.target.value })}
                  required
                  size="lg"
                  value={selectedProject.name}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="selected-client-name">Client name</FieldLabel>
                <Input
                  aria-label="Selected client name"
                  autoComplete="organization"
                  id="selected-client-name"
                  name="client-name"
                  onChange={(event) => updateSelectedProject({ clientName: event.target.value })}
                  placeholder="Client name…"
                  size="lg"
                  value={selectedProject.clientName ?? ""}
                />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="selected-project-description">Project description</FieldLabel>
                <Textarea
                  aria-label="Selected project description"
                  id="selected-project-description"
                  name="project-description"
                  onChange={(event) => updateSelectedProject({ description: event.target.value })}
                  placeholder="What should the client know about this collection?…"
                  size="lg"
                  value={selectedProject.description ?? ""}
                />
              </Field>
            </DialogBody>
          ) : null}
          <DialogFooter className="justify-between sm:justify-between">
            <Button
              onClick={() => setDeleteProjectOpen(true)}
              type="button"
              variant="destructive"
            >
              <Trash2 />
              Delete project
            </Button>
            <Button onClick={() => setProjectSettingsOpen(false)} type="button">
              <CheckCircle2 />
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setDeleteProjectOpen} open={deleteProjectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedProject?.name ?? "this project"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the project and its video metadata from Pixel Point. Gumlet assets are not deleted, but active client links can stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject} type="button" variant="destructive">
              <Trash2 />
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog onOpenChange={setCreateProjectOpen} open={createProjectOpen}>
        <DialogContent layout="sections" size="xl">
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>
              Create a client review workspace. You can edit these details later.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateProject}>
            <DialogBody className="grid gap-3 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="project-name">Project name</FieldLabel>
                <Input
                  autoComplete="off"
                  id="project-name"
                  name="project-name"
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
                  autoComplete="organization"
                  id="project-client-name"
                  name="client-name"
                  onChange={(event) =>
                    setProjectDraft((draft) => ({ ...draft, clientName: event.target.value }))
                  }
                  size="lg"
                  value={projectDraft.clientName}
                />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="project-description">Project description</FieldLabel>
                <Textarea
                  id="project-description"
                  name="project-description"
                  onChange={(event) =>
                    setProjectDraft((draft) => ({ ...draft, description: event.target.value }))
                  }
                  size="lg"
                  value={projectDraft.description}
                />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setCreateProjectOpen(false)} type="button" variant="outline">
                Cancel
              </Button>
              <Button size="xl" type="submit">
                <Plus />
                Create project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setAddVideoOpen} open={addVideoOpen}>
        <DialogContent layout="sections" size="2xl">
          <DialogHeader>
            <DialogTitle>Add Gumlet video</DialogTitle>
            <DialogDescription>
              Paste an existing Gumlet asset ID, watch link, embed code, or MP4 URL.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddVideo}>
            <DialogBody className="grid gap-3 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="gumlet-asset-id">Gumlet URL or asset ID</FieldLabel>
                <Input
                  autoComplete="off"
                  id="gumlet-asset-id"
                  name="gumlet-input"
                  onChange={(event) =>
                    setVideoDraft((draft) => ({ ...draft, assetId: event.target.value }))
                  }
                  required
                  size="lg"
                  spellCheck={false}
                  value={videoDraft.assetId}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="video-title">Video title</FieldLabel>
                <Input
                  autoComplete="off"
                  id="video-title"
                  name="video-title"
                  onChange={(event) =>
                    setVideoDraft((draft) => ({ ...draft, title: event.target.value }))
                  }
                  required
                  size="lg"
                  value={videoDraft.title}
                />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="video-description">Video description</FieldLabel>
                <Input
                  autoComplete="off"
                  id="video-description"
                  name="video-description"
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
                  autoComplete="url"
                  id="thumbnail-url"
                  name="thumbnail-url"
                  onChange={(event) =>
                    setVideoDraft((draft) => ({
                      ...draft,
                      thumbnailUrl: event.target.value,
                    }))
                  }
                  size="lg"
                  type="url"
                  value={videoDraft.thumbnailUrl}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="duration-seconds">Duration in seconds</FieldLabel>
                <Input
                  id="duration-seconds"
                  inputMode="numeric"
                  min={0}
                  name="duration-seconds"
                  onChange={(event) =>
                    setVideoDraft((draft) => ({
                      ...draft,
                      durationSeconds: event.target.value,
                    }))
                  }
                  size="lg"
                  step={1}
                  type="number"
                  value={videoDraft.durationSeconds}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="start-time-seconds">Start time in seconds</FieldLabel>
                <Input
                  id="start-time-seconds"
                  inputMode="numeric"
                  min={0}
                  name="start-time-seconds"
                  onChange={(event) =>
                    setVideoDraft((draft) => ({
                      ...draft,
                      startTimeSeconds: event.target.value,
                    }))
                  }
                  size="lg"
                  step={1}
                  type="number"
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
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setAddVideoOpen(false)} type="button" variant="outline">
                Cancel
              </Button>
              <Button disabled={!selectedProject} size="xl" type="submit">
                <Plus />
                Add video
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
                  autoComplete="off"
                  id="edit-video-title"
                  name="edit-video-title"
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
                  autoComplete="off"
                  id="edit-gumlet-asset-id"
                  name="edit-gumlet-input"
                  onChange={(event) =>
                    setEditVideoDraft((draft) => ({ ...draft, assetId: event.target.value }))
                  }
                  required
                  size="lg"
                  spellCheck={false}
                  value={editVideoDraft.assetId}
                />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="edit-video-description">Edit video description</FieldLabel>
                <Textarea
                  id="edit-video-description"
                  name="edit-video-description"
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
                  autoComplete="url"
                  id="edit-thumbnail-url"
                  name="edit-thumbnail-url"
                  onChange={(event) =>
                    setEditVideoDraft((draft) => ({ ...draft, thumbnailUrl: event.target.value }))
                  }
                  size="lg"
                  type="url"
                  value={editVideoDraft.thumbnailUrl}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-duration-seconds">Edit duration in seconds</FieldLabel>
                <Input
                  id="edit-duration-seconds"
                  inputMode="numeric"
                  min={0}
                  name="edit-duration-seconds"
                  onChange={(event) => {
                    setEditDurationTouched(true);
                    setEditVideoDraft((draft) => ({
                      ...draft,
                      durationSeconds: event.target.value,
                    }));
                  }}
                  size="lg"
                  step={1}
                  type="number"
                  value={editVideoDraft.durationSeconds}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-start-time-seconds">Edit start time in seconds</FieldLabel>
                <Input
                  id="edit-start-time-seconds"
                  inputMode="numeric"
                  min={0}
                  name="edit-start-time-seconds"
                  onChange={(event) =>
                    setEditVideoDraft((draft) => ({
                      ...draft,
                      startTimeSeconds: event.target.value,
                    }))
                  }
                  size="lg"
                  step={1}
                  type="number"
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
                ? `${deleteVideo.title} will be removed from this Pixel Point project. The Gumlet asset will not be deleted, but an active single-video portal link can stop working.`
                : "This video will be removed from the project. The Gumlet asset will not be deleted, but an active single-video portal link can stop working."}
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
