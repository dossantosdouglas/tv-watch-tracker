import type {
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
      badgeClass: "bg-[#F47521] text-[#0B0C10] font-bold",
      barClass: "bg-[#F47521]",
      textClass: "text-[#FF9248]",
    };
  }
  if (normalized === "youcine") {
    return {
      label: "YouCine",
      badgeClass: "bg-[#BE123C] text-[#FFFFFF] font-bold",
      barClass: "bg-[#E11D48]",
      textClass: "text-[#FDA4AF]",
    };
  }
  return {
    label: "Manual",
    badgeClass: "bg-[#1B1E28] text-[#38BDF8] border border-[#38BDF8]/40 font-semibold",
    barClass: "bg-[#38BDF8]",
    textClass: "text-[#38BDF8]",
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
