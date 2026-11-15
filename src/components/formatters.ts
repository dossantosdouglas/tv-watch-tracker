import type {
  CatalogEpisode,
  MediaItem,
  MediaType,
  MetadataProvider,
  SourceApp,
  WatchStatus,
} from "@/lib/types";

export function formatTimecode(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export function formatRelativeTimePt(isoDate: string | null | undefined): string {
  if (!isoDate) return "Sem registro";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "Sem registro";

  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 45) return "agora mesmo";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `há ${diffHour} h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "ontem";
  if (diffDay < 7) return `há ${diffDay} dias`;

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function formatAbsoluteTimePt(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getAppMeta(app: SourceApp | string | null | undefined): {
  label: string;
  badgeClass: string;
  barClass: string;
  textClass: string;
} {
  const normalized = (app || "manual").toLowerCase();
  if (normalized === "crunchyroll") {
    return {
      label: "Crunchyroll",
      badgeClass: "bg-[#F47521] text-[#0B0C0E] font-semibold",
      barClass: "bg-[#F47521]",
      textClass: "text-[#F47521]",
    };
  }
  if (normalized === "youcine") {
    return {
      label: "YouCine",
      badgeClass: "bg-[#1A1D24] text-[#F3F4F6] border border-[#22252D] font-medium",
      barClass: "bg-[#F47521]",
      textClass: "text-[#9CA3AF]",
    };
  }
  return {
    label: "Manual",
    badgeClass: "bg-[#1A1D24] text-[#9CA3AF] border border-[#22252D] font-medium",
    barClass: "bg-[#F47521]",
    textClass: "text-[#9CA3AF]",
  };
}

export function getStatusLabelPt(status: WatchStatus): string {
  switch (status) {
    case "watching":
      return "Assistindo";
    case "completed":
      return "Completo";
    case "on_hold":
      return "Pausado";
    case "plan_to_watch":
      return "Na fila";
    default:
      return status;
  }
}

export function getMediaTypeLabelPt(type: MediaType): string {
  switch (type) {
    case "anime":
      return "Anime";
    case "series":
      return "Série";
    case "movie":
      return "Filme";
    default:
      return type;
  }
}

export function getProviderLabel(provider: MetadataProvider): string {
  switch (provider) {
    case "anilist":
      return "AniList";
    case "jikan":
      return "MAL / Jikan";
    case "tvmaze":
      return "TVMaze";
    case "tmdb":
      return "TMDB";
    case "manual":
      return "Manual";
    default:
      return provider;
  }
}

export function getProgressPercent(
  currentEpisode: number,
  totalEpisodes: number | null
): number | null {
  if (!totalEpisodes || totalEpisodes <= 0) return null;
  const pct = Math.round((currentEpisode / totalEpisodes) * 100);
  return Math.max(0, Math.min(100, pct));
}

export function stripHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatReleaseDatePt(
  isoDate: string | null | undefined,
  includeTime = false
): string {
  if (!isoDate) return "";
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(isoDate.trim());
  const date = new Date(
    isDateOnly ? `${isoDate.trim()}T12:00:00Z` : isoDate
  );
  if (Number.isNaN(date.getTime())) return "";

  const datePart = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

  if (!includeTime || isDateOnly) {
    return datePart;
  }

  const timePart = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} às ${timePart}`;
}

export function formatSeasonEpisodeLabel(
  season: number,
  episode: number
): string {
  const sPad = String(Math.max(1, season)).padStart(2, "0");
  const epPad = String(Math.max(0, episode)).padStart(2, "0");
  return `Temporada ${sPad} · Episódio ${epPad}`;
}

export function getEpisodeAbsNumber(
  ep: CatalogEpisode,
  fallbackIndex = 0
): number {
  const candidate = (ep as CatalogEpisode & { abs_episode?: unknown })
    .abs_episode;
  if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
    return candidate;
  }
  return fallbackIndex > 0 ? fallbackIndex : ep.episode;
}

export function resolveCurrentEpisodePosition(item: MediaItem): {
  season: number;
  episode: number;
  absEpisode: number;
  totalEpisodes: number | null;
} {
  const catalog = Array.isArray(item.catalog_episodes)
    ? item.catalog_episodes
    : [];
  const totalFromCatalog = catalog.length > 0 ? catalog.length : null;
  const effectiveTotal =
    item.total_episodes && totalFromCatalog
      ? Math.max(item.total_episodes, totalFromCatalog)
      : item.total_episodes ?? totalFromCatalog;

  if (catalog.length > 0 && item.current_episode > 0) {
    const byExactAbsAndSeason = catalog.findIndex(
      (ep, idx) =>
        getEpisodeAbsNumber(ep, idx + 1) === item.current_episode &&
        ep.season === item.current_season
    );
    if (byExactAbsAndSeason >= 0) {
      const ep = catalog[byExactAbsAndSeason];
      return {
        season: ep.season,
        episode: ep.episode,
        absEpisode: getEpisodeAbsNumber(ep, byExactAbsAndSeason + 1),
        totalEpisodes: effectiveTotal,
      };
    }

    const byAbs = catalog.findIndex(
      (ep, idx) => getEpisodeAbsNumber(ep, idx + 1) === item.current_episode
    );
    if (byAbs >= 0) {
      const ep = catalog[byAbs];
      return {
        season: ep.season,
        episode: ep.episode,
        absEpisode: getEpisodeAbsNumber(ep, byAbs + 1),
        totalEpisodes: effectiveTotal,
      };
    }

    const bySeasonAndEp = catalog.findIndex(
      (ep) =>
        ep.season === item.current_season && ep.episode === item.current_episode
    );
    if (bySeasonAndEp >= 0) {
      const ep = catalog[bySeasonAndEp];
      return {
        season: ep.season,
        episode: ep.episode,
        absEpisode: getEpisodeAbsNumber(ep, bySeasonAndEp + 1),
        totalEpisodes: effectiveTotal,
      };
    }
  }

  return {
    season: Math.max(1, item.current_season || 1),
    episode: Math.max(0, item.current_episode || 0),
    absEpisode: Math.max(0, item.current_episode || 0),
    totalEpisodes: effectiveTotal,
  };
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
