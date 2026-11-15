import { MediaType, ScrobblePayload, SourceApp } from "./types";

export interface ParsedScrobble {
  app: SourceApp;
  title: string;
  normalizedTitle: string;
  season: number;
  episode: number | null;
  episodeTitle: string | null;
  positionSec: number | null;
  durationSec: number | null;
  state: string;
  mediaTypeHint: MediaType;
}

const NOISE_BRACKET_REGEX =
  /\[(?:dublado|legendado|dual[\s_-]*[aá]udio|pt[\s_-]*br|4k|uhd|hd|fhd|full[\s_-]*hd|1080p|720p|480p|cam|ts|sub|dub|eng|esp|latino)[^\]]*\]|\((?:dublado|legendado|dual[\s_-]*[aá]udio|pt[\s_-]*br|4k|uhd|hd|fhd|full[\s_-]*hd|1080p|720p|480p|cam|sub|dub)\)/gi;

const NOISE_STANDALONE_REGEX =
  /\b(?:4k(?:\s*uhd)?|ultra\s*hd|full\s*hd|fhd|uhd|1080p|720p|480p|dublado|legendado|dual\s*[aá]udio|pt[\s_-]*br)\b/gi;

export function normalizeApp(app?: string | null): SourceApp {
  const lower = (app || "").toLowerCase();
  if (lower.includes("crunchyroll")) return "crunchyroll";
  if (lower.includes("youcine")) return "youcine";
  return "manual";
}

export function cleanMediaTitle(raw: string): string {
  let cleaned = raw
    .replace(NOISE_BRACKET_REGEX, " ")
    .replace(NOISE_STANDALONE_REGEX, " ")
    .replace(/\(\s*(?:19|20)\d{2}\s*\)/g, " ")
    .replace(/\bS\d{1,2}\s*E\d{1,4}\b.*$/i, "")
    .replace(/\b\d{1,2}x\d{1,4}\b.*$/i, "")
    .replace(/\b(?:Temporada|Season)\s*\d+\b.*$/i, "")
    .replace(/\b(?:Epis[oó]dio|Ep\.?)\s*\d+\b.*$/i, "")
    .replace(/[\s\-–—:|•]+$/g, "")
    .replace(/^[\s\-–—:|•]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Handle trailing punctuation like periods left from "Dragon Ball Super: Beerus."
  cleaned = cleaned.replace(/\.+$/g, "").trim();
  return cleaned;
}

export function normalizeTitle(title: string): string {
  return cleanMediaTitle(title)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractSeasonEpisodeFromText(text: string): {
  season: number | null;
  episode: number | null;
  episodeTitle: string | null;
  seriesTitle: string | null;
} {
  let season: number | null = null;
  let episode: number | null = null;
  let episodeTitle: string | null = null;
  let seriesTitle: string | null = null;

  const trimmed = text.trim();
  if (!trimmed) {
    return { season, episode, episodeTitle, seriesTitle };
  }

  // Pattern 1: Crunchyroll accessibility string:
  // "Você está assistindo Dragon Ball Super: Beerus. \nTemporada 1Episódio 5. O Deus da Destruição e Son Goku"
  const crunchyMatch = trimmed.match(
    /Voc[eê]\s+est[aá]\s+assistindo\s+(.+?)\.\s*(?:\r?\n|\s)*Temporada\s+(\d+)\s*Epis[oó]dio\s+(\d+)(?:\.\s*(.+))?/i
  );
  if (crunchyMatch) {
    seriesTitle = cleanMediaTitle(crunchyMatch[1]);
    season = parseInt(crunchyMatch[2], 10);
    episode = parseInt(crunchyMatch[3], 10);
    episodeTitle = crunchyMatch[4]?.trim() || null;
    return { season, episode, episodeTitle, seriesTitle };
  }

  // Pattern 2: "S01E05 - Title" or "S1 E5 - Title"
  const sxeMatch = trimmed.match(
    /(?:^|[\s\-|])S(\d{1,2})\s*[-_.]?\s*E(\d{1,4})(?:\s*[-–—:.]\s*(.+))?$/i
  );
  if (sxeMatch) {
    season = parseInt(sxeMatch[1], 10);
    episode = parseInt(sxeMatch[2], 10);
    episodeTitle = sxeMatch[3]?.trim() || null;
    return { season, episode, episodeTitle, seriesTitle };
  }

  // Inline S01E05 anywhere
  const inlineSxe = trimmed.match(/\bS(\d{1,2})\s*E(\d{1,4})\b(?:\s*[-–—:.]\s*(.+))?/i);
  if (inlineSxe) {
    season = parseInt(inlineSxe[1], 10);
    episode = parseInt(inlineSxe[2], 10);
    episodeTitle = inlineSxe[3]?.trim() || null;
    const prefix = trimmed.slice(0, inlineSxe.index).trim();
    if (prefix) seriesTitle = cleanMediaTitle(prefix);
    return { season, episode, episodeTitle, seriesTitle };
  }

  // Pattern 3: "1x05"
  const nxnMatch = trimmed.match(/\b(\d{1,2})x(\d{1,4})\b(?:\s*[-–—:.]\s*(.+))?/i);
  if (nxnMatch) {
    season = parseInt(nxnMatch[1], 10);
    episode = parseInt(nxnMatch[2], 10);
    episodeTitle = nxnMatch[3]?.trim() || null;
    const prefix = trimmed.slice(0, nxnMatch.index).trim();
    if (prefix) seriesTitle = cleanMediaTitle(prefix);
    return { season, episode, episodeTitle, seriesTitle };
  }

  // Pattern 4: "Temporada X" / "Season X" / "T1"
  const seasonMatch = trimmed.match(
    /(?:Temporada|Season|Temp\.?)\s*(\d{1,2})|(\d{1,2})[ªa°]?\s*Temporada|\bT(\d{1,2})\b/i
  );
  if (seasonMatch) {
    const sVal = seasonMatch[1] || seasonMatch[2] || seasonMatch[3];
    if (sVal) season = parseInt(sVal, 10);
  }

  // Pattern 5: "Episódio 5", "Ep. 05", "E5 - O Deus da Destruição..."
  const epMatch = trimmed.match(
    /(?:^|[\s\-|•])(?:Epis[oó]dio|Ep\.?|E)\s*0*(\d{1,4})\b(?:\s*[-–—:.]\s*(.+))?/i
  );
  if (epMatch) {
    episode = parseInt(epMatch[1], 10);
    episodeTitle = epMatch[2]?.trim() || null;
    const prefix = trimmed.slice(0, epMatch.index).trim();
    if (prefix && !/^(?:Temporada|Season|T\d+)/i.test(prefix)) {
      seriesTitle = cleanMediaTitle(prefix);
    }
    return { season, episode, episodeTitle, seriesTitle };
  }

  // Pattern 6: Standalone trailing number like "Dragon Ball Super 05" or "05"
  const onlyNumMatch = trimmed.match(/^0*(\d{1,4})$/);
  if (onlyNumMatch) {
    episode = parseInt(onlyNumMatch[1], 10);
  }

  return { season, episode, episodeTitle, seriesTitle };
}

export function cleanEpisodeTitle(
  rawEpisodeTitle?: string | null,
  parsedEpisodeTitle?: string | null
): string | null {
  const candidate = parsedEpisodeTitle || rawEpisodeTitle || "";
  if (!candidate.trim()) return null;

  const cleaned = candidate
    .replace(/^\s*(?:S\d{1,2}\s*E\d{1,4}|E\d{1,4}|Ep\.?\s*\d{1,4}|Epis[oó]dio\s*\d{1,4})\s*[-–—:.]?\s*/i, "")
    .replace(NOISE_BRACKET_REGEX, "")
    .trim();

  return cleaned || null;
}

export function parseScrobbleInput(payload: ScrobblePayload): ParsedScrobble {
  const app = normalizeApp(payload.app);

  const fromRaw = payload.rawText
    ? extractSeasonEpisodeFromText(payload.rawText)
    : { season: null, episode: null, episodeTitle: null, seriesTitle: null };

  const fromEpTitle = payload.episodeTitle
    ? extractSeasonEpisodeFromText(payload.episodeTitle)
    : { season: null, episode: null, episodeTitle: null, seriesTitle: null };

  const fromTitle = payload.title
    ? extractSeasonEpisodeFromText(payload.title)
    : { season: null, episode: null, episodeTitle: null, seriesTitle: null };

  // Determine the best clean series/anime title
  const rawTitleCandidate =
    cleanMediaTitle(payload.title || "") ||
    fromRaw.seriesTitle ||
    fromEpTitle.seriesTitle ||
    fromTitle.seriesTitle ||
    cleanMediaTitle(payload.episodeTitle || "") ||
    "Título Desconhecido";

  const season =
    (typeof payload.season === "number" && payload.season > 0
      ? payload.season
      : null) ??
    fromEpTitle.season ??
    fromRaw.season ??
    fromTitle.season ??
    1;

  const episode =
    (typeof payload.episode === "number" && payload.episode > 0
      ? payload.episode
      : null) ??
    fromEpTitle.episode ??
    fromRaw.episode ??
    fromTitle.episode ??
    null;

  const episodeTitle = cleanEpisodeTitle(
    payload.episodeTitle,
    fromEpTitle.episodeTitle || fromRaw.episodeTitle || fromTitle.episodeTitle
  );

  // Crunchyroll is always anime; YouCine could be series, anime, or movie
  let mediaTypeHint: MediaType = "anime";
  if (app === "youcine") {
    if (episode === null && !payload.episodeTitle && !/temporada|season|s\d+e\d+|ep/i.test(payload.rawText || "")) {
      mediaTypeHint = "series"; // We'll check anime + series during metadata search
    } else {
      mediaTypeHint = "series";
    }
  }

  return {
    app,
    title: rawTitleCandidate,
    normalizedTitle: normalizeTitle(rawTitleCandidate),
    season,
    episode,
    episodeTitle,
    positionSec:
      typeof payload.positionSec === "number" && Number.isFinite(payload.positionSec)
        ? Math.max(0, Math.round(payload.positionSec))
        : null,
    durationSec:
      typeof payload.durationSec === "number" && Number.isFinite(payload.durationSec)
        ? Math.max(0, Math.round(payload.durationSec))
        : null,
    state: (payload.state || "playing").toLowerCase(),
    mediaTypeHint,
  };
}
