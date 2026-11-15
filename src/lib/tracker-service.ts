import {
  enrichTMDBResult,
  fetchCatalogEpisodes,
  fetchMediaCatalogAndAiring,
  findBestMetadataMatch,
  RawCatalogEpisode,
  titleSimilarityScore,
} from "./metadata";
import { normalizeTitle, parseScrobbleInput } from "./parser";
import { getSupabaseAdmin } from "./supabase";
import {
  CatalogEpisode,
  MediaItem,
  MediaPatchAction,
  MediaType,
  ScrobbleLog,
  ScrobblePayload,
  SearchResult,
  SourceApp,
  WatchedEpisode,
  WatchStatus,
} from "./types";

function computeNextStatus(
  currentStatus: WatchStatus,
  currentEpisode: number,
  totalEpisodes?: number | null,
  airingStatus?: string | null
): WatchStatus {
  const isReleasing = airingStatus === "RELEASING";
  if (
    totalEpisodes !== null &&
    totalEpisodes !== undefined &&
    totalEpisodes > 0 &&
    currentEpisode >= totalEpisodes &&
    !isReleasing
  ) {
    return "completed";
  }
  if (
    (currentStatus === "plan_to_watch" || currentStatus === "completed") &&
    currentEpisode > 0 &&
    (isReleasing || !totalEpisodes || currentEpisode < totalEpisodes)
  ) {
    return "watching";
  }
  return currentStatus;
}

function cleanEpisodeTitleForMatch(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .replace(/^(?:E|Ep\.?|Epis[oó]dio|Episode)\s*\d+\s*[-–—:.]?\s*/i, "")
    .replace(/^\d+\s*[-–—.]\s*/, "")
    .trim();
}

function ensureSequentialAbsEpisodes(
  catalog: Array<RawCatalogEpisode | CatalogEpisode>
): CatalogEpisode[] {
  const sorted = [...catalog]
    .filter((ep) => ep.episode > 0)
    .sort((a, b) =>
      a.season !== b.season ? a.season - b.season : a.episode - b.episode
    );
  return sorted.map((ep, idx) => ({
    season: ep.season,
    episode: ep.episode,
    abs_episode: idx + 1,
    title: ep.title ?? `Episódio ${ep.episode}`,
    aired_at: ep.aired_at ?? null,
    air_date: ep.air_date ?? ep.aired_at ?? null,
    is_upcoming: ep.is_upcoming ?? isAirDateUpcoming(ep.air_date ?? ep.aired_at),
    duration_min: ep.duration_min ?? null,
    thumbnail: ep.thumbnail ?? null,
    overview: ep.overview ?? null,
    watched: "watched" in ep ? ep.watched : false,
    watched_at: "watched_at" in ep ? ep.watched_at : null,
    source_app: "source_app" in ep ? ep.source_app : null,
    position_sec: "position_sec" in ep ? ep.position_sec : null,
    duration_sec: "duration_sec" in ep ? ep.duration_sec : null,
  }));
}

function resolveTargetCatalogEpisode(
  rawCatalog: Array<RawCatalogEpisode | CatalogEpisode> | null | undefined,
  parsedSeason: number,
  parsedEpisode: number | null,
  episodeTitle?: string | null
): {
  season: number;
  episode: number;
  abs_episode: number;
  catalog: CatalogEpisode[];
  extended: boolean;
} {
  const catalog = ensureSequentialAbsEpisodes(rawCatalog || []);
  const targetSeason = Math.max(1, parsedSeason || 1);

  if (catalog.length === 0) {
    const epNum = parsedEpisode !== null && parsedEpisode > 0 ? parsedEpisode : 0;
    return {
      season: targetSeason,
      episode: epNum,
      abs_episode: epNum,
      catalog,
      extended: false,
    };
  }

  // 1. Try matching by normalized episodeTitle across all seasons (best for Crunchyroll cour discrepancies)
  const cleanTitle = cleanEpisodeTitleForMatch(episodeTitle);
  if (cleanTitle.length >= 3) {
    let bestEp: CatalogEpisode | null = null;
    let bestScore = 0;
    for (const ep of catalog) {
      if (!ep.title) continue;
      const score = titleSimilarityScore(cleanTitle, [ep.title]);
      if (
        score > bestScore ||
        (score === bestScore &&
          bestEp &&
          parsedEpisode !== null &&
          Math.abs((ep.abs_episode || 0) - parsedEpisode) <
            Math.abs((bestEp.abs_episode || 0) - parsedEpisode))
      ) {
        bestScore = score;
        bestEp = ep;
      }
    }
    if (bestEp && bestScore >= 70) {
      return {
        season: bestEp.season,
        episode: bestEp.episode,
        abs_episode: bestEp.abs_episode || bestEp.episode,
        catalog,
        extended: false,
      };
    }
  }

  if (parsedEpisode === null || parsedEpisode <= 0) {
    return {
      season: targetSeason,
      episode: 0,
      abs_episode: 0,
      catalog,
      extended: false,
    };
  }

  // 2. Exact (season, episode) match (e.g. Mushoku Tensei S3E10 -> abs_episode 57)
  const exactMatch = catalog.find(
    (ep) => ep.season === targetSeason && ep.episode === parsedEpisode
  );
  if (exactMatch) {
    return {
      season: exactMatch.season,
      episode: exactMatch.episode,
      abs_episode: exactMatch.abs_episode || exactMatch.episode,
      catalog,
      extended: false,
    };
  }

  // 3. Cumulative abs_episode match (e.g. Jujutsu Kaisen "Temporada 5 Episódio 50" -> abs_episode 50)
  const maxCatalogSeason = catalog.reduce((m, e) => Math.max(m, e.season), 1);
  const s1MaxEp = catalog.reduce(
    (m, e) => (e.season === 1 ? Math.max(m, e.episode) : m),
    0
  );
  if (parsedEpisode > s1MaxEp || targetSeason > maxCatalogSeason) {
    const absMatch = catalog.find((ep) => ep.abs_episode === parsedEpisode);
    if (absMatch) {
      return {
        season: absMatch.season,
        episode: absMatch.episode,
        abs_episode: absMatch.abs_episode || parsedEpisode,
        catalog,
        extended: false,
      };
    }
  }

  // 4. Extend catalog if incoming episode goes beyond all known episodes/seasons
  const nextCatalog = [...catalog];
  if (targetSeason > maxCatalogSeason) {
    for (let s = maxCatalogSeason + 1; s <= targetSeason; s++) {
      const len =
        s === targetSeason ? Math.min(Math.max(12, parsedEpisode), 100) : 12;
      for (let ep = 1; ep <= len; ep++) {
        nextCatalog.push({
          season: s,
          episode: ep,
          title: `Episódio ${ep}`,
          aired_at: null,
          air_date: null,
          is_upcoming: false,
          duration_min: null,
          thumbnail: null,
          overview: null,
          watched: false,
          watched_at: null,
          source_app: null,
          position_sec: null,
          duration_sec: null,
        });
      }
    }
  } else {
    const maxInTargetSeason = nextCatalog.reduce(
      (m, e) => (e.season === targetSeason ? Math.max(m, e.episode) : m),
      0
    );
    for (
      let ep = maxInTargetSeason + 1;
      ep <= Math.min(parsedEpisode, maxInTargetSeason + 100);
      ep++
    ) {
      nextCatalog.push({
        season: targetSeason,
        episode: ep,
        title: `Episódio ${ep}`,
        aired_at: null,
        air_date: null,
        is_upcoming: false,
        duration_min: null,
        thumbnail: null,
        overview: null,
        watched: false,
        watched_at: null,
        source_app: null,
        position_sec: null,
        duration_sec: null,
      });
    }
  }

  const rebuilt = ensureSequentialAbsEpisodes(nextCatalog);
  const created =
    rebuilt.find(
      (ep) => ep.season === targetSeason && ep.episode === parsedEpisode
    ) || rebuilt[rebuilt.length - 1];

  return {
    season: created?.season ?? targetSeason,
    episode: created?.episode ?? parsedEpisode,
    abs_episode: created?.abs_episode ?? parsedEpisode,
    catalog: rebuilt,
    extended: true,
  };
}

async function markCatalogEpisodesWatchedUpTo(params: {
  mediaId: string;
  catalog: CatalogEpisode[];
  upToAbsEpisode: number;
  latestTarget: { season: number; episode: number };
  sourceApp: SourceApp;
  nowIso: string;
  latestEpisodeTitle?: string | null;
  positionSec?: number | null;
  durationSec?: number | null;
}): Promise<void> {
  const {
    mediaId,
    catalog,
    upToAbsEpisode,
    latestTarget,
    sourceApp,
    nowIso,
    latestEpisodeTitle,
    positionSec,
    durationSec,
  } = params;
  if (!Number.isFinite(upToAbsEpisode) || upToAbsEpisode < 1) return;

  const supabase = getSupabaseAdmin();
  const clampedMax = Math.min(Math.floor(upToAbsEpisode), 1000);

  const targets: Array<{ season: number; episode: number; isLatest: boolean }> =
    [];
  if (catalog.length > 0) {
    for (const ep of catalog) {
      const abs = ep.abs_episode ?? ep.episode;
      if (abs <= clampedMax) {
        targets.push({
          season: ep.season,
          episode: ep.episode,
          isLatest:
            ep.season === latestTarget.season &&
            ep.episode === latestTarget.episode,
        });
      }
    }
  }
  if (
    !targets.some(
      (t) =>
        t.season === latestTarget.season && t.episode === latestTarget.episode
    )
  ) {
    if (catalog.length === 0) {
      for (let ep = 1; ep <= Math.min(latestTarget.episode, 500); ep++) {
        targets.push({
          season: latestTarget.season,
          episode: ep,
          isLatest: ep === latestTarget.episode,
        });
      }
    } else {
      targets.push({
        season: latestTarget.season,
        episode: latestTarget.episode,
        isLatest: true,
      });
    }
  }

  const { data: existingRows } = await supabase
    .from("tv_watch_episodes")
    .select("season, episode, watched, episode_title")
    .eq("media_id", mediaId);

  const existingMap = new Map<
    string,
    { watched: boolean; episode_title: string | null }
  >();
  for (const row of existingRows || []) {
    existingMap.set(`${row.season}:${row.episode}`, {
      watched: Boolean(row.watched),
      episode_title: row.episode_title ?? null,
    });
  }

  const upsertRows: Array<{
    media_id: string;
    season: number;
    episode: number;
    episode_title?: string | null;
    watched: boolean;
    source_app: SourceApp;
    position_sec?: number | null;
    duration_sec?: number | null;
    watched_at: string;
  }> = [];

  for (const t of targets) {
    const prev = existingMap.get(`${t.season}:${t.episode}`);
    if (t.isLatest) {
      upsertRows.push({
        media_id: mediaId,
        season: t.season,
        episode: t.episode,
        episode_title: latestEpisodeTitle ?? prev?.episode_title ?? null,
        watched: true,
        source_app: sourceApp,
        position_sec: positionSec ?? null,
        duration_sec: durationSec ?? null,
        watched_at: nowIso,
      });
    } else if (!prev || !prev.watched) {
      upsertRows.push({
        media_id: mediaId,
        season: t.season,
        episode: t.episode,
        watched: true,
        source_app: sourceApp,
        watched_at: nowIso,
      });
    }
  }

  if (upsertRows.length > 0) {
    await supabase
      .from("tv_watch_episodes")
      .upsert(upsertRows, { onConflict: "media_id,season,episode" });
  }
}

function isAirDateUpcoming(airDate?: string | null): boolean {
  if (!airDate) return false;
  const d = new Date(airDate);
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
}

function mergeCatalogWithWatched(
  rawCatalog: Array<RawCatalogEpisode | CatalogEpisode> | null | undefined,
  watchedRows: WatchedEpisode[]
): CatalogEpisode[] {
  const watchedMap = new Map<string, WatchedEpisode>();
  for (const w of watchedRows) {
    watchedMap.set(`${w.season}:${w.episode}`, w);
  }

  const merged: CatalogEpisode[] = (rawCatalog || [])
    .filter((ep) => ep.episode > 0)
    .map((ep) => {
      const w = watchedMap.get(`${ep.season}:${ep.episode}`);
      if (w) watchedMap.delete(`${ep.season}:${ep.episode}`);
      const airDate = ep.air_date ?? ep.aired_at ?? null;
      return {
        season: ep.season,
        episode: ep.episode,
        title: ep.title || w?.episode_title || `Episódio ${ep.episode}`,
        aired_at: ep.aired_at ?? (airDate ? airDate.slice(0, 10) : null),
        air_date: airDate,
        is_upcoming: isAirDateUpcoming(airDate),
        duration_min: ep.duration_min ?? null,
        thumbnail: ep.thumbnail ?? null,
        overview: ep.overview ?? null,
        watched: w ? w.watched : false,
        watched_at: w?.watched ? w.watched_at : null,
        source_app: w?.source_app ?? null,
        position_sec: w?.position_sec ?? null,
        duration_sec: w?.duration_sec ?? null,
      };
    });

  for (const w of watchedMap.values()) {
    merged.push({
      season: w.season,
      episode: w.episode,
      title: w.episode_title || `Episódio ${w.episode}`,
      aired_at: null,
      air_date: null,
      is_upcoming: false,
      duration_min: null,
      thumbnail: null,
      overview: null,
      watched: w.watched,
      watched_at: w?.watched ? w.watched_at : null,
      source_app: w.source_app,
      position_sec: w.position_sec,
      duration_sec: w.duration_sec,
    });
  }

  merged.sort((a, b) =>
    a.season !== b.season ? a.season - b.season : a.episode - b.episode
  );

  return merged.map((ep, idx) => ({
    ...ep,
    abs_episode: idx + 1,
  }));
}

export async function syncMediaCatalogCache(
  media: MediaItem
): Promise<MediaItem> {
  const supabase = getSupabaseAdmin();
  const { episodes, next_airing, airing_status, total_episodes } =
    await fetchMediaCatalogAndAiring({
      provider: media.provider,
      external_id: media.external_id,
      mal_id: media.mal_id,
      media_type: media.media_type,
      total_episodes: media.total_episodes,
      current_season: media.current_season,
      current_episode: media.current_episode,
      title: media.title,
      aliases: media.aliases,
    });
  const nowIso = new Date().toISOString();
  const catalogWithAbs = ensureSequentialAbsEpisodes(episodes);
  const nextTotal =
    total_episodes !== null
      ? total_episodes
      : airing_status === "RELEASING"
        ? null
        : catalogWithAbs.length > 0
          ? catalogWithAbs.length
          : media.total_episodes;

  const { data: updated, error } = await supabase
    .from("tv_watch_media")
    .update({
      catalog_episodes: catalogWithAbs,
      catalog_updated_at: nowIso,
      next_airing,
      airing_status,
      total_episodes: nextTotal,
      status: computeNextStatus(
        media.status,
        media.current_episode,
        nextTotal,
        airing_status
      ),
    })
    .eq("id", media.id)
    .select("*")
    .single();

  if (error || !updated) {
    return {
      ...media,
      catalog_episodes: catalogWithAbs,
      catalog_updated_at: nowIso,
      next_airing,
      airing_status,
      total_episodes: nextTotal,
    };
  }

  return updated as MediaItem;
}

async function findMatchingMedia(
  normalized: string,
  externalProvider?: string | null,
  externalId?: string | null
): Promise<MediaItem | null> {
  const supabase = getSupabaseAdmin();

  if (externalProvider && externalId) {
    const { data: byExt } = await supabase
      .from("tv_watch_media")
      .select("*")
      .eq("provider", externalProvider)
      .eq("external_id", externalId)
      .limit(1)
      .maybeSingle();
    if (byExt) return byExt as MediaItem;
  }

  if (!normalized) return null;

  const { data: exact } = await supabase
    .from("tv_watch_media")
    .select("*")
    .eq("normalized_title", normalized)
    .limit(1)
    .maybeSingle();
  if (exact) return exact as MediaItem;

  const { data: allRows } = await supabase
    .from("tv_watch_media")
    .select("*")
    .order("last_watched_at", { ascending: false })
    .limit(200);

  if (!allRows) return null;

  for (const row of allRows as MediaItem[]) {
    const candidates = [row.title, ...(row.aliases || [])];
    for (const c of candidates) {
      if (normalizeTitle(c) === normalized) {
        return row;
      }
    }
  }

  return null;
}

export async function processScrobble(payload: ScrobblePayload): Promise<{
  media: MediaItem | null;
  log: ScrobbleLog;
}> {
  const supabase = getSupabaseAdmin();
  const parsed = parseScrobbleInput(payload);
  const nowIso = payload.timestamp
    ? new Date(payload.timestamp).toISOString()
    : new Date().toISOString();

  let media = await findMatchingMedia(parsed.normalizedTitle);
  let matchedMetadata: SearchResult | null = null;

  if (!media && parsed.title !== "Título Desconhecido") {
    matchedMetadata = await findBestMetadataMatch(
      parsed.title,
      parsed.app,
      parsed.mediaTypeHint
    );
    if (matchedMetadata) {
      media = await findMatchingMedia(
        normalizeTitle(matchedMetadata.title),
        matchedMetadata.provider,
        matchedMetadata.external_id
      );
    }
  }

  let resolvedTarget: {
    season: number;
    episode: number;
    abs_episode: number;
    catalog: CatalogEpisode[];
  } | null = null;

  if (!media && parsed.title !== "Título Desconhecido") {
    const initialSeason = Math.max(1, parsed.season || 1);
    const initialEp =
      parsed.episode ?? (matchedMetadata?.media_type === "movie" ? 1 : 0);
    const resolvedType = matchedMetadata?.media_type || parsed.mediaTypeHint;
    const resolvedProvider = matchedMetadata?.provider || "manual";

    const aliases = Array.from(
      new Set([parsed.title, ...(matchedMetadata?.aliases || [])].filter(Boolean))
    );

    const insertRow = {
      title: matchedMetadata?.title || parsed.title,
      normalized_title: normalizeTitle(matchedMetadata?.title || parsed.title),
      aliases,
      media_type: resolvedType,
      status: "watching" as WatchStatus,
      current_season: initialSeason,
      current_episode: initialEp,
      total_episodes: matchedMetadata?.total_episodes ?? null,
      cover_image: matchedMetadata?.cover_image || null,
      banner_image: matchedMetadata?.banner_image || null,
      synopsis: matchedMetadata?.synopsis || null,
      genres: matchedMetadata?.genres || [],
      release_year: matchedMetadata?.release_year || null,
      score: matchedMetadata?.score || null,
      provider: resolvedProvider,
      external_id: matchedMetadata?.external_id || null,
      mal_id: matchedMetadata?.mal_id || null,
      last_app: parsed.app,
      last_episode_title: parsed.episodeTitle,
      last_position_sec: parsed.positionSec,
      last_duration_sec: parsed.durationSec,
      last_watched_at: nowIso,
    };

    const { data: created, error: createErr } = await supabase
      .from("tv_watch_media")
      .insert(insertRow)
      .select("*")
      .single();

    if (createErr) throw createErr;
    media = await syncMediaCatalogCache(created as MediaItem);

    const resolved = resolveTargetCatalogEpisode(
      media.catalog_episodes,
      initialSeason,
      initialEp > 0 ? initialEp : null,
      parsed.episodeTitle
    );
    resolvedTarget = resolved;

    const finalAbs = resolved.abs_episode > 0 ? resolved.abs_episode : initialEp;
    const finalTotal = resolved.extended
      ? resolved.catalog.length
      : media.total_episodes;
    const finalStatus = computeNextStatus(
      "watching",
      finalAbs,
      finalTotal,
      media.airing_status
    );

    const { data: finalized } = await supabase
      .from("tv_watch_media")
      .update({
        current_season: resolved.season,
        current_episode: finalAbs,
        total_episodes: finalTotal,
        catalog_episodes: resolved.extended
          ? resolved.catalog
          : media.catalog_episodes,
        status: finalStatus,
      })
      .eq("id", media.id)
      .select("*")
      .single();

    if (finalized) media = finalized as MediaItem;
  } else if (media) {
    const cacheEmpty =
      !media.catalog_episodes || media.catalog_episodes.length === 0;
    const cacheStale =
      !media.catalog_updated_at ||
      Date.now() - new Date(media.catalog_updated_at).getTime() >
        6 * 60 * 60 * 1000;
    if (cacheEmpty || cacheStale) {
      media = await syncMediaCatalogCache(media);
    }

    const resolved = resolveTargetCatalogEpisode(
      media.catalog_episodes,
      parsed.season,
      parsed.episode,
      parsed.episodeTitle
    );
    resolvedTarget = resolved;

    const nextSeason =
      resolved.abs_episode > 0 ? resolved.season : media.current_season;
    const nextEpisode =
      resolved.abs_episode > 0 ? resolved.abs_episode : media.current_episode;

    let nextTotal = resolved.extended
      ? resolved.catalog.length
      : media.total_episodes;
    if (nextTotal !== null && nextEpisode > nextTotal) {
      nextTotal = media.airing_status === "RELEASING" ? null : nextEpisode;
    }

    const updatedAliases = Array.from(
      new Set([...(media.aliases || []), parsed.title].filter(Boolean))
    );

    const nextStatus = computeNextStatus(
      media.status === "plan_to_watch" ? "watching" : media.status,
      nextEpisode,
      nextTotal,
      media.airing_status
    );

    const updatePayload: Record<string, unknown> = {
      aliases: updatedAliases,
      current_season: nextSeason,
      current_episode: nextEpisode,
      total_episodes: nextTotal,
      status: nextStatus,
      last_app: parsed.app,
      last_episode_title:
        parsed.episodeTitle ?? media.last_episode_title,
      last_position_sec: parsed.positionSec ?? media.last_position_sec,
      last_duration_sec: parsed.durationSec ?? media.last_duration_sec,
      last_watched_at: nowIso,
    };
    if (resolved.extended) {
      updatePayload.catalog_episodes = resolved.catalog;
    }

    const { data: updated, error: updateErr } = await supabase
      .from("tv_watch_media")
      .update(updatePayload)
      .eq("id", media.id)
      .select("*")
      .single();

    if (updateErr) throw updateErr;
    media = updated as MediaItem;
  }

  if (media && resolvedTarget && resolvedTarget.abs_episode > 0) {
    await markCatalogEpisodesWatchedUpTo({
      mediaId: media.id,
      catalog: resolvedTarget.catalog,
      upToAbsEpisode: resolvedTarget.abs_episode,
      latestTarget: {
        season: resolvedTarget.season,
        episode: resolvedTarget.episode,
      },
      sourceApp: parsed.app,
      nowIso,
      latestEpisodeTitle: parsed.episodeTitle,
      positionSec: parsed.positionSec,
      durationSec: parsed.durationSec,
    });
  }

  const { data: logRow, error: logErr } = await supabase
    .from("tv_watch_scrobble_logs")
    .insert({
      media_id: media?.id || null,
      app: parsed.app,
      raw_title: payload.title || null,
      raw_episode_title: payload.episodeTitle || null,
      raw_text: payload.rawText || null,
      parsed_title: parsed.title,
      parsed_season: parsed.season,
      parsed_episode: parsed.episode,
      position_sec: parsed.positionSec,
      duration_sec: parsed.durationSec,
      playback_state: parsed.state,
      matched: Boolean(media),
    })
    .select("*")
    .single();

  if (logErr) throw logErr;

  return {
    media,
    log: logRow as ScrobbleLog,
  };
}

export async function listMediaWithDetails(filters?: {
  status?: string | null;
  type?: string | null;
  q?: string | null;
}): Promise<{
  media: MediaItem[];
  logs: ScrobbleLog[];
  stats: {
    total: number;
    watching: number;
    completed: number;
    episodesWatched: number;
  };
}> {
  const supabase = getSupabaseAdmin();

  const [mediaRes, epsRes, logsRes] = await Promise.all([
    supabase
      .from("tv_watch_media")
      .select("*")
      .order("last_watched_at", { ascending: false }),
    supabase
      .from("tv_watch_episodes")
      .select("*")
      .eq("watched", true)
      .order("season", { ascending: true })
      .order("episode", { ascending: true }),
    supabase
      .from("tv_watch_scrobble_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  if (mediaRes.error) throw mediaRes.error;
  if (epsRes.error) throw epsRes.error;
  if (logsRes.error) throw logsRes.error;

  const allMedia = (mediaRes.data || []) as MediaItem[];
  const allEpisodes = (epsRes.data || []) as WatchedEpisode[];

  const epsByMedia = new Map<string, WatchedEpisode[]>();
  for (const ep of allEpisodes) {
    const arr = epsByMedia.get(ep.media_id) || [];
    arr.push(ep);
    epsByMedia.set(ep.media_id, arr);
  }

  const enrichedAll = allMedia.map((m) => {
    const watchedEps = epsByMedia.get(m.id) || [];
    return {
      ...m,
      watched_episodes: watchedEps,
      catalog_episodes: mergeCatalogWithWatched(m.catalog_episodes, watchedEps),
    };
  });

  const stats = {
    total: enrichedAll.length,
    watching: enrichedAll.filter((m) => m.status === "watching").length,
    completed: enrichedAll.filter((m) => m.status === "completed").length,
    episodesWatched: allEpisodes.length,
  };

  let filtered = enrichedAll;
  if (filters?.status && filters.status !== "all") {
    filtered = filtered.filter((m) => m.status === filters.status);
  }
  if (filters?.type && filters.type !== "all") {
    if (filters.type === "series") {
      filtered = filtered.filter(
        (m) => m.media_type === "series" || m.media_type === "movie"
      );
    } else {
      filtered = filtered.filter((m) => m.media_type === filters.type);
    }
  }
  if (filters?.q && filters.q.trim()) {
    const nq = normalizeTitle(filters.q);
    filtered = filtered.filter((m) => {
      const hay = [m.title, ...(m.aliases || [])].map(normalizeTitle).join(" ");
      return hay.includes(nq);
    });
  }

  return {
    media: filtered,
    logs: (logsRes.data || []) as ScrobbleLog[],
    stats,
  };
}

export async function createManualMedia(input: {
  searchResult?: SearchResult;
  title?: string;
  media_type?: MediaType;
  current_season?: number;
  current_episode?: number;
  total_episodes?: number | null;
  status?: WatchStatus;
}): Promise<MediaItem> {
  const supabase = getSupabaseAdmin();
  const sr =
    input.searchResult?.provider === "tmdb"
      ? await enrichTMDBResult(input.searchResult)
      : input.searchResult;

  const title = sr?.title || input.title?.trim() || "Nova Obra";
  const normalized = normalizeTitle(title);

  if (sr?.provider && sr.external_id) {
    const existing = await findMatchingMedia(
      normalized,
      sr.provider,
      sr.external_id
    );
    if (existing) {
      return existing;
    }
  }

  let totalEpisodes = sr?.total_episodes ?? input.total_episodes ?? null;
  if (sr?.provider === "tvmaze" && totalEpisodes === null) {
    const catalog = await fetchCatalogEpisodes({
      provider: sr.provider,
      external_id: sr.external_id,
      mal_id: sr.mal_id,
      media_type: sr.media_type,
      total_episodes: null,
      current_season: 1,
      current_episode: 0,
    });
    if (catalog.length > 0) totalEpisodes = catalog.length;
  }

  const resolvedType = sr?.media_type || input.media_type || "anime";
  const resolvedProvider = sr?.provider || "manual";
  const season = Math.max(1, input.current_season ?? 1);
  const episode = Math.max(0, input.current_episode ?? 0);
  if (totalEpisodes !== null && episode > totalEpisodes) {
    totalEpisodes = episode;
  }
  const status = computeNextStatus(
    input.status || "watching",
    episode,
    totalEpisodes,
    sr?.status_airing
  );

  const { data, error } = await supabase
    .from("tv_watch_media")
    .insert({
      title,
      normalized_title: normalized,
      aliases: Array.from(new Set([title, ...(sr?.aliases || [])])),
      media_type: resolvedType,
      status,
      current_season: season,
      current_episode: episode,
      total_episodes: totalEpisodes,
      cover_image: sr?.cover_image || null,
      banner_image: sr?.banner_image || null,
      synopsis: sr?.synopsis || null,
      genres: sr?.genres || [],
      release_year: sr?.release_year || null,
      score: sr?.score || null,
      provider: resolvedProvider,
      external_id: sr?.external_id || null,
      mal_id: sr?.mal_id || null,
      last_app: "manual",
      last_watched_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) throw error;
  let media = await syncMediaCatalogCache(data as MediaItem);

  if (episode > 0) {
    const resolved = resolveTargetCatalogEpisode(
      media.catalog_episodes,
      season,
      episode
    );
    const absEp = resolved.abs_episode > 0 ? resolved.abs_episode : episode;
    const { data: finalized } = await supabase
      .from("tv_watch_media")
      .update({
        current_season: resolved.season,
        current_episode: absEp,
        status: computeNextStatus(
          status,
          absEp,
          media.total_episodes,
          media.airing_status
        ),
      })
      .eq("id", media.id)
      .select("*")
      .single();
    if (finalized) media = finalized as MediaItem;

    await markCatalogEpisodesWatchedUpTo({
      mediaId: media.id,
      catalog: resolved.catalog,
      upToAbsEpisode: absEp,
      latestTarget: { season: resolved.season, episode: resolved.episode },
      sourceApp: "manual",
      nowIso: new Date().toISOString(),
    });
  }

  return media;
}

export async function patchMedia(
  id: string,
  payload: MediaPatchAction
): Promise<MediaItem> {
  const supabase = getSupabaseAdmin();
  const { data: existingRow, error: fetchErr } = await supabase
    .from("tv_watch_media")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !existingRow) {
    throw new Error("Obra não encontrada");
  }

  let existing = existingRow as MediaItem;
  const nowIso = new Date().toISOString();

  if (
    payload.action !== "rematch" &&
    (!existing.catalog_episodes || existing.catalog_episodes.length === 0)
  ) {
    existing = await syncMediaCatalogCache(existing);
  }
  const catalog = ensureSequentialAbsEpisodes(existing.catalog_episodes || []);

  if (payload.action === "increment_episode") {
    const nextAbs = existing.current_episode + 1;
    const matchEp = catalog.find((ep) => ep.abs_episode === nextAbs);
    const season = matchEp?.season ?? existing.current_season;
    const targetEpInSeason = matchEp?.episode ?? nextAbs;

    let nextTotal = existing.total_episodes;
    if (nextTotal !== null && nextAbs > nextTotal) {
      nextTotal = existing.airing_status === "RELEASING" ? null : nextAbs;
    }
    const nextStatus = computeNextStatus(
      existing.status,
      nextAbs,
      nextTotal,
      existing.airing_status
    );

    await markCatalogEpisodesWatchedUpTo({
      mediaId: id,
      catalog,
      upToAbsEpisode: nextAbs,
      latestTarget: { season, episode: targetEpInSeason },
      sourceApp: "manual",
      nowIso,
    });

    const { data: updated, error } = await supabase
      .from("tv_watch_media")
      .update({
        current_season: season,
        current_episode: nextAbs,
        total_episodes: nextTotal,
        status: nextStatus,
        last_watched_at: nowIso,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    const updatedMedia = updated as MediaItem;
    if (!matchEp) {
      return syncMediaCatalogCache(updatedMedia);
    }
    return updatedMedia;
  }

  if (payload.action === "set_progress") {
    let nextSeason = payload.season ?? existing.current_season;
    let nextAbs = payload.episode ?? existing.current_episode;
    let targetEpInSeason = nextAbs;

    if (payload.episode !== undefined && payload.episode > 0) {
      const exactSeasonEp =
        payload.season !== undefined
          ? catalog.find(
              (ep) =>
                ep.season === payload.season && ep.episode === payload.episode
            )
          : undefined;
      const byAbs = catalog.find((ep) => ep.abs_episode === payload.episode);
      const chosen = exactSeasonEp || byAbs;
      if (chosen) {
        nextSeason = chosen.season;
        nextAbs = chosen.abs_episode ?? payload.episode;
        targetEpInSeason = chosen.episode;
      }
    }

    let nextTotal =
      payload.total_episodes !== undefined
        ? payload.total_episodes
        : existing.total_episodes;
    if (nextTotal !== null && nextAbs > nextTotal) {
      nextTotal = existing.airing_status === "RELEASING" ? null : nextAbs;
    }
    const nextStatus = payload.status
      ? payload.status
      : computeNextStatus(
          existing.status,
          nextAbs,
          nextTotal,
          existing.airing_status
        );

    if (payload.episode !== undefined && payload.episode === 0) {
      await supabase
        .from("tv_watch_episodes")
        .update({ watched: false })
        .eq("media_id", id);
    } else if (payload.episode !== undefined && nextAbs > 0) {
      await markCatalogEpisodesWatchedUpTo({
        mediaId: id,
        catalog,
        upToAbsEpisode: nextAbs,
        latestTarget: { season: nextSeason, episode: targetEpInSeason },
        sourceApp: "manual",
        nowIso,
      });
    }

    const { data: updated, error } = await supabase
      .from("tv_watch_media")
      .update({
        current_season: nextSeason,
        current_episode: nextAbs,
        total_episodes: nextTotal,
        status: nextStatus,
        last_watched_at: nowIso,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    const updatedMedia = updated as MediaItem;
    if (
      nextAbs > 0 &&
      !catalog.some((ep) => ep.abs_episode === nextAbs)
    ) {
      return syncMediaCatalogCache(updatedMedia);
    }
    return updatedMedia;
  }

  if (payload.action === "toggle_episode") {
    const season = Math.max(1, payload.season ?? existing.current_season);
    const { data: existingEp } = await supabase
      .from("tv_watch_episodes")
      .select("*")
      .eq("media_id", id)
      .eq("season", season)
      .eq("episode", payload.episode)
      .maybeSingle();

    const nextWatched =
      typeof payload.watched === "boolean"
        ? payload.watched
        : !(existingEp?.watched ?? false);

    await supabase.from("tv_watch_episodes").upsert(
      {
        media_id: id,
        season,
        episode: payload.episode,
        episode_title:
          payload.episode_title ?? existingEp?.episode_title ?? null,
        watched: nextWatched,
        source_app: existingEp?.source_app || "manual",
        watched_at: nowIso,
      },
      { onConflict: "media_id,season,episode" }
    );

    const { data: watchedRows } = await supabase
      .from("tv_watch_episodes")
      .select("season, episode")
      .eq("media_id", id)
      .eq("watched", true);

    const absByKey = new Map<string, number>();
    for (const ep of catalog) {
      absByKey.set(`${ep.season}:${ep.episode}`, ep.abs_episode ?? ep.episode);
    }

    let highestAbs = 0;
    let highestSeason = season;
    for (const w of watchedRows || []) {
      const absVal = absByKey.get(`${w.season}:${w.episode}`) ?? w.episode;
      if (absVal > highestAbs) {
        highestAbs = absVal;
        highestSeason = w.season;
      }
    }

    const nextStatus = computeNextStatus(
      existing.status,
      highestAbs,
      existing.total_episodes,
      existing.airing_status
    );

    const { data: updated, error } = await supabase
      .from("tv_watch_media")
      .update({
        current_season: highestSeason,
        current_episode: highestAbs,
        status: nextStatus,
        last_watched_at: nowIso,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return updated as MediaItem;
  }

  if (payload.action === "rematch") {
    const sr =
      payload.searchResult.provider === "tmdb"
        ? await enrichTMDBResult(payload.searchResult)
        : payload.searchResult;
    let totalEp = sr.total_episodes;
    if (sr.provider === "tvmaze" && totalEp === null) {
      const cat = await fetchCatalogEpisodes({
        provider: sr.provider,
        external_id: sr.external_id,
        mal_id: sr.mal_id,
        media_type: sr.media_type,
        total_episodes: null,
        current_season: existing.current_season,
        current_episode: existing.current_episode,
      });
      if (cat.length > 0) totalEp = cat.length;
    }

    const aliases = Array.from(
      new Set([existing.title, ...(existing.aliases || []), sr.title, ...(sr.aliases || [])])
    );

    const { data: updated, error } = await supabase
      .from("tv_watch_media")
      .update({
        title: sr.title,
        normalized_title: normalizeTitle(sr.title),
        aliases,
        media_type: sr.media_type,
        current_season: existing.current_season,
        total_episodes: totalEp,
        cover_image: sr.cover_image,
        banner_image: sr.banner_image,
        synopsis: sr.synopsis,
        genres: sr.genres,
        release_year: sr.release_year,
        score: sr.score,
        provider: sr.provider,
        external_id: sr.external_id,
        mal_id: sr.mal_id,
        status: computeNextStatus(
          existing.status,
          existing.current_episode,
          totalEp,
          existing.airing_status
        ),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return syncMediaCatalogCache(updated as MediaItem);
  }

  throw new Error("Ação inválida");
}

export async function deleteMedia(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("tv_watch_media").delete().eq("id", id);
  if (error) throw error;
}

export async function getMediaEpisodesWithStatus(
  id: string,
  forceRefresh = false
): Promise<{
  media: MediaItem;
  episodes: CatalogEpisode[];
}> {
  const supabase = getSupabaseAdmin();
  const [mediaRes, watchedRes] = await Promise.all([
    supabase.from("tv_watch_media").select("*").eq("id", id).single(),
    supabase
      .from("tv_watch_episodes")
      .select("*")
      .eq("media_id", id)
      .order("season", { ascending: true })
      .order("episode", { ascending: true }),
  ]);

  if (mediaRes.error || !mediaRes.data) {
    throw new Error("Obra não encontrada");
  }

  let media = mediaRes.data as MediaItem;
  const watchedRows = (watchedRes.data || []) as WatchedEpisode[];

  const cacheEmpty =
    !media.catalog_episodes || media.catalog_episodes.length === 0;
  if (forceRefresh || cacheEmpty) {
    media = await syncMediaCatalogCache(media);
  }

  const episodes = mergeCatalogWithWatched(media.catalog_episodes, watchedRows);
  return {
    media: {
      ...media,
      watched_episodes: watchedRows,
      catalog_episodes: episodes,
    },
    episodes,
  };
}
