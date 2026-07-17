import * as React from "react";
import { AlertCircle, Clock3, Film, Gauge, LoaderCircle } from "lucide-react";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/toolcraft/ui";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/toolcraft/ui/components/primitives";

import type { PlaybackSpeed } from "./portal-types";
import {
  calculatePlaybackSavings,
  formatDuration,
  formatSavedTime,
  playbackSpeedOptions,
} from "./portal-utils";

type PortalBrandProps = {
  compact?: boolean;
  context?: string;
};

type PortalPageHeaderProps = {
  actions?: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  metadata?: React.ReactNode;
  title: React.ReactNode;
};

type PortalStateCardProps = {
  children?: React.ReactNode;
  description: React.ReactNode;
  loading?: boolean;
  title: React.ReactNode;
  tone?: "default" | "error";
};

type PortalStatusProps = {
  message?: string;
  tone?: "default" | "error" | "success";
};

type PlaybackSpeedControlProps = {
  label?: string;
  onChange: (speed: PlaybackSpeed) => void;
  recommendedSpeed: PlaybackSpeed;
  value: PlaybackSpeed;
};

type TimeSavingsSummaryProps = {
  compact?: boolean;
  durationSeconds?: number;
  speed: PlaybackSpeed;
};

const playbackSpeedItems = playbackSpeedOptions.map((speed) => ({
  label: `${speed}x`,
  value: String(speed),
}));

export function PortalBrand({ compact = false, context }: PortalBrandProps): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-3" translate="no">
      <span aria-hidden="true" className="portal-brand-mark">
        <span />
        <span />
        <span />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold tracking-[-0.015em] text-white">
          Pixel Point
        </span>
        {!compact && context ? (
          <span className="mt-0.5 block truncate text-xs text-[color:var(--muted-foreground)]">
            {context}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function PortalPageHeader({
  actions,
  description,
  eyebrow,
  metadata,
  title,
}: PortalPageHeaderProps): React.JSX.Element {
  return (
    <header className="portal-page-header">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-3 flex flex-wrap items-center gap-2">{eyebrow}</div> : null}
        <h1 className="max-w-4xl break-words text-2xl font-semibold tracking-[-0.035em] text-balance text-white sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <div className="mt-2 max-w-3xl text-sm leading-6 text-pretty text-[color:var(--muted-foreground)]">
            {description}
          </div>
        ) : null}
        {metadata ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[color:var(--muted-foreground)] sm:text-sm">
            {metadata}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function PortalStateCard({
  children,
  description,
  loading = false,
  title,
  tone = "default",
}: PortalStateCardProps): React.JSX.Element {
  const Icon = loading ? LoaderCircle : tone === "error" ? AlertCircle : Film;

  return (
    <Card className="w-full max-w-lg border-[color:var(--portal-border-strong)] bg-[color:var(--portal-surface-1)] shadow-2xl shadow-black/20">
      <CardHeader className="items-center text-center">
        <span
          aria-hidden="true"
          className={`mb-2 grid size-11 place-items-center rounded-xl border ${
            tone === "error"
              ? "border-red-400/25 bg-red-400/10 text-red-300"
              : "border-blue-400/25 bg-blue-400/10 text-blue-200"
          }`}
        >
          <Icon className={loading ? "size-5 animate-spin" : "size-5"} />
        </span>
        <CardTitle className="text-xl text-balance">{title}</CardTitle>
        <CardDescription className="max-w-sm text-sm leading-6 text-pretty">
          {description}
        </CardDescription>
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
}

export function PortalStatus({
  message,
  tone = "default",
}: PortalStatusProps): React.JSX.Element {
  return (
    <div
      aria-live="polite"
      className={`min-h-5 text-xs leading-5 ${
        tone === "error"
          ? "text-red-300"
          : tone === "success"
            ? "text-emerald-300"
            : "text-[color:var(--muted-foreground)]"
      }`}
      role="status"
    >
      {message ?? ""}
    </div>
  );
}

export function PlaybackSpeedControl({
  label = "Playback speed",
  onChange,
  recommendedSpeed,
  value,
}: PlaybackSpeedControlProps): React.JSX.Element {
  const selected = playbackSpeedItems.find((item) => item.value === String(value));

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="min-w-0">
        <span className="block text-xs font-medium text-white">{label}</span>
        <span className="mt-0.5 block text-[11px] text-[color:var(--muted-foreground)]">
          {value === recommendedSpeed ? "Recommended" : `Recommended ${recommendedSpeed}x`}
        </span>
      </div>
      <Select
        items={playbackSpeedItems}
        onValueChange={(nextValue) => onChange(Number(nextValue) as PlaybackSpeed)}
        value={String(value)}
      >
        <SelectTrigger aria-label={label} className="ml-auto w-24 justify-between" size="lg">
          <Gauge aria-hidden="true" className="size-4" />
          <SelectValue>{() => selected?.label ?? `${value}x`}</SelectValue>
        </SelectTrigger>
        <SelectContent align="end" alignItemWithTrigger={false}>
          <SelectGroup>
            {playbackSpeedOptions.map((speed) => (
              <SelectItem key={speed} value={String(speed)}>
                {speed}x{speed === recommendedSpeed ? " · Recommended" : ""}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function TimeSavingsSummary({
  compact = false,
  durationSeconds,
  speed,
}: TimeSavingsSummaryProps): React.JSX.Element {
  const savings = calculatePlaybackSavings(durationSeconds, speed);

  if (!savings) {
    return (
      <span className="inline-flex items-center gap-2 text-xs text-[color:var(--muted-foreground)]">
        <Clock3 aria-hidden="true" className="size-4" />
        Duration unavailable
      </span>
    );
  }

  return (
    <div className={`portal-numeric flex flex-wrap items-center ${compact ? "gap-2" : "gap-3"}`}>
      <Badge className="gap-1.5" variant="mutedOutline">
        <Clock3 aria-hidden="true" className="size-3.5" />
        {formatDuration(savings.originalSeconds)} source
      </Badge>
      <Badge className="gap-1.5" variant="secondary">
        {formatDuration(savings.fasterSeconds)} at {speed}x
      </Badge>
      {savings.savedSeconds > 0 ? (
        <span className="text-xs font-medium text-emerald-300">
          Save {formatSavedTime(savings.savedSeconds)}
        </span>
      ) : null}
    </div>
  );
}
