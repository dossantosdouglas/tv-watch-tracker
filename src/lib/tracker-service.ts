import {
  enrichTMDBResult,
  fetchCatalogEpisodes,
  fetchMediaCatalogAndAiring,
  findBestMetadataMatch,
  RawCatalogEpisode,
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
  WatchedEpisode,
  WatchStatus,
} from "./types";

function computeNextStatus(
  currentStatus: WatchStatus,
  currentEpisode: number
): WatchStatus {
  if (currentStatus === "plan_to_watch" && currentEpisode > 0) {
    return "watching";
  }
  return currentStatus;
}

function isAnimeMedia(media: {
  media_type?: MediaType | null;
  provider?: string | null;
}): boolean {
  return (
    media.media_type === "anime" ||
    media.provider === "anilist" ||
    media.provider === "jikan"
  );
}

async function ensureEpisodesWatchedUpTo(params: {
  mediaId: string;
  season: number;
  upToEpisode: number;
  sourceApp: "crunchyroll" | "youcine" | "manual";
  nowIso: string;
  latestEpisodeTitle?: string | null;
  positionSec?: number | null;
  durationSec?: number | null;
}): Promise<void> {
  const {
    mediaId,
    season,
    upToEpisode,
    sourceApp,
    nowIso,
    latestEpisodeTitle,
    positionSec,
    durationSec,
  } = params;
  if (!Number.isFinite(upToEpisode) || upToEpisode < 1) return;

  const supabase = getSupabaseAdmin();
  const clampedMax = Math.min(Math.floor(upToEpisode), 500);

  const { data: existingRows } = await supabase
    .from("tv_watch_episodes")
    .select("episode, watched, episode_title")
    .eq("media_id", mediaId)
    .eq("season", season)
    .lte("episode", clampedMax);

  const alreadyWatched = new Map<number, { watched: boolean; episode_title: string | null }>();
  for (const row of existingRows || []) {
    alreadyWatched.set(row.episode, {
      watched: Boolean(row.watched),
      episode_title: row.episode_title ?? null,
    });
  }

  const missingRows: Array<{
    media_id: string;
    season: number;
    episode: number;
    watched: boolean;
    source_app: "crunchyroll" | "youcine" | "manual";
    watched_at: string;
  }> = [];

  for (let ep = 1; ep < clampedMax; ep++) {
    const existing = alreadyWatched.get(ep);
    if (!existing || !existing.watched) {
      missingRows.push({
        media_id: mediaId,
        season,
        episode: ep,
        watched: true,
        source_app: sourceApp,
        watched_at: nowIso,
      });
    }
  }

  if (missingRows.length > 0) {
    await supabase
      .from("tv_watch_episodes")
      .upsert(missingRows, { onConflict: "media_id,season,episode" });
  }

  const prevLatest = alreadyWatched.get(clampedMax);
  await supabase.from("tv_watch_episodes").upsert(
    {
      media_id: mediaId,
      season,
      episode: clampedMax,
      episode_title: latestEpisodeTitle ?? prevLatest?.episode_title ?? null,
      watched: true,
      source_app: sourceApp,
      position_sec: positionSec ?? null,
      duration_sec: durationSec ?? null,
      watched_at: nowIso,
    },
    { onConflict: "media_id,season,episode" }
  );
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

  return merged;
}

export async function syncMediaCatalogCache(
  media: MediaItem
): Promise<MediaItem> {
  const supabase = getSupabaseAdmin();
  const { episodes, next_airing, airing_status, total_episodes } =
    await fetchMediaCatalogAndAiring(media);
  const nowIso = new Date().toISOString();
  const baseTotal = total_episodes ?? media.total_episodes;
  const nextTotal =
    baseTotal !== null && media.current_episode > baseTotal
      ? Math.max(baseTotal, media.current_episode, episodes.length)
      : baseTotal;

  const { data: updated, error } = await supabase
    .from("tv_watch_media")
    .update({
      catalog_episodes: episodes,
      catalog_updated_at: nowIso,
      next_airing,
      airing_status,
      total_episodes: nextTotal,
      status: computeNextStatus(media.status, media.current_episode),
    })
    .eq("id", media.id)
    .select("*")
    .single();

  if (error || !updated) {
    return {
      ...media,
      catalog_episodes: episodes as CatalogEpisode[],
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

  let effectiveSeason = parsed.season;

  if (!media && parsed.title !== "Título Desconhecido") {
    const initialEp =
      parsed.episode ?? (matchedMetadata?.media_type === "movie" ? 1 : 0);
    const resolvedType = matchedMetadata?.media_type || parsed.mediaTypeHint;
    const resolvedProvider = matchedMetadata?.provider || "manual";
    const isAnime = isAnimeMedia({
      media_type: resolvedType,
      provider: resolvedProvider,
    });
    effectiveSeason = isAnime ? 1 : parsed.season;

    let totalEp = matchedMetadata?.total_episodes ?? null;
    if (totalEp !== null && initialEp > totalEp) {
      totalEp = initialEp;
    }
    const aliases = Array.from(
      new Set([parsed.title, ...(matchedMetadata?.aliases || [])].filter(Boolean))
    );

    const insertRow = {
      title: matchedMetadata?.title || parsed.title,
      normalized_title: normalizeTitle(matchedMetadata?.title || parsed.title),
      aliases,
      media_type: resolvedType,
      status: computeNextStatus("watching", initialEp),
      current_season: effectiveSeason,
      current_episode: initialEp,
      total_episodes: totalEp,
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
  } else if (media) {
    const isAnime = isAnimeMedia(media);
    effectiveSeason = isAnime ? 1 : Math.max(media.current_season, parsed.season);
    const nextEpisode =
      parsed.episode !== null ? parsed.episode : media.current_episode;
    const nextTotal =
      media.total_episodes !== null && nextEpisode > media.total_episodes
        ? nextEpisode
        : media.total_episodes;

    const updatedAliases = Array.from(
      new Set([...(media.aliases || []), parsed.title].filter(Boolean))
    );

    const nextStatus =
      media.status === "completed" || media.status === "plan_to_watch"
        ? "watching"
        : computeNextStatus(media.status, nextEpisode);

    const { data: updated, error: updateErr } = await supabase
      .from("tv_watch_media")
      .update({
        aliases: updatedAliases,
        current_season: effectiveSeason,
        current_episode: nextEpisode,
        total_episodes: nextTotal,
        status: nextStatus,
        last_app: parsed.app,
        last_episode_title:
          parsed.episodeTitle ?? media.last_episode_title,
        last_position_sec: parsed.positionSec ?? media.last_position_sec,
        last_duration_sec: parsed.durationSec ?? media.last_duration_sec,
        last_watched_at: nowIso,
      })
      .eq("id", media.id)
      .select("*")
      .single();

    if (updateErr) throw updateErr;
    media = updated as MediaItem;

    const cacheEmpty =
      !media.catalog_episodes || media.catalog_episodes.length === 0;
    const cacheMissingCurrent =
      nextEpisode > 0 &&
      !(media.catalog_episodes || []).some(
        (ep) => ep.season === effectiveSeason && ep.episode === nextEpisode
      );
    const cacheStale =
      !media.catalog_updated_at ||
      Date.now() - new Date(media.catalog_updated_at).getTime() >
        6 * 60 * 60 * 1000;
    if (cacheEmpty || cacheMissingCurrent || cacheStale) {
      media = await syncMediaCatalogCache(media);
    }
  }

  if (media && parsed.episode !== null && parsed.episode > 0) {
    await ensureEpisodesWatchedUpTo({
      mediaId: media.id,
      season: effectiveSeason,
      upToEpisode: parsed.episode,
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
  const season = isAnimeMedia({
    media_type: resolvedType,
    provider: resolvedProvider,
  })
    ? 1
    : Math.max(1, input.current_season ?? 1);
  const episode = Math.max(0, input.current_episode ?? 0);
  if (totalEpisodes !== null && episode > totalEpisodes) {
    totalEpisodes = episode;
  }
  const status = computeNextStatus(input.status || "watching", episode);

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
  const media = await syncMediaCatalogCache(data as MediaItem);

  if (episode > 0) {
    await ensureEpisodesWatchedUpTo({
      mediaId: media.id,
      season,
      upToEpisode: episode,
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

  const existing = existingRow as MediaItem;
  const nowIso = new Date().toISOString();
  const isAnime = isAnimeMedia(existing);

  if (payload.action === "increment_episode") {
    const season = isAnime ? 1 : existing.current_season;
    const nextEp = existing.current_episode + 1;
    const nextTotal =
      existing.total_episodes !== null && nextEp > existing.total_episodes
        ? nextEp
        : existing.total_episodes;
    const nextStatus = computeNextStatus(existing.status, nextEp);

    await ensureEpisodesWatchedUpTo({
      mediaId: id,
      season,
      upToEpisode: nextEp,
      sourceApp: "manual",
      nowIso,
    });

    const { data: updated, error } = await supabase
      .from("tv_watch_media")
      .update({
        current_season: season,
        current_episode: nextEp,
        total_episodes: nextTotal,
        status: nextStatus,
        last_watched_at: nowIso,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    const updatedMedia = updated as MediaItem;
    const hasEpInCatalog = (updatedMedia.catalog_episodes || []).some(
      (ep) => ep.season === season && ep.episode === nextEp
    );
    if (!hasEpInCatalog) {
      return syncMediaCatalogCache(updatedMedia);
    }
    return updatedMedia;
  }

  if (payload.action === "set_progress") {
    const nextSeason = isAnime ? 1 : (payload.season ?? existing.current_season);
    const nextEpisode = payload.episode ?? existing.current_episode;
    let nextTotal =
      payload.total_episodes !== undefined
        ? payload.total_episodes
        : existing.total_episodes;
    if (nextTotal !== null && nextEpisode > nextTotal) {
      nextTotal = nextEpisode;
    }
    const nextStatus = payload.status
      ? payload.status
      : computeNextStatus(existing.status, nextEpisode);

    if (payload.episode !== undefined && payload.episode > 0) {
      await ensureEpisodesWatchedUpTo({
        mediaId: id,
        season: nextSeason,
        upToEpisode: payload.episode,
        sourceApp: "manual",
        nowIso,
      });
    }

    const { data: updated, error } = await supabase
      .from("tv_watch_media")
      .update({
        current_season: nextSeason,
        current_episode: nextEpisode,
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
      nextEpisode > 0 &&
      !(updatedMedia.catalog_episodes || []).some(
        (ep) => ep.season === nextSeason && ep.episode === nextEpisode
      )
    ) {
      return syncMediaCatalogCache(updatedMedia);
    }
    return updatedMedia;
  }

  if (payload.action === "toggle_episode") {
    const season = isAnime ? 1 : (payload.season ?? existing.current_season);
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
      .select("episode")
      .eq("media_id", id)
      .eq("season", season)
      .eq("watched", true)
      .order("episode", { ascending: false })
      .limit(1);

    const highestEp = watchedRows?.[0]?.episode ?? 0;
    const nextStatus = computeNextStatus(existing.status, highestEp);

    const { data: updated, error } = await supabase
      .from("tv_watch_media")
      .update({
        current_season: season,
        current_episode: highestEp,
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
      const catalog = await fetchCatalogEpisodes({
        provider: sr.provider,
        external_id: sr.external_id,
        mal_id: sr.mal_id,
        media_type: sr.media_type,
        total_episodes: null,
        current_season: existing.current_season,
        current_episode: existing.current_episode,
      });
      if (catalog.length > 0) totalEp = catalog.length;
    }

    const aliases = Array.from(
      new Set([existing.title, ...(existing.aliases || []), sr.title, ...(sr.aliases || [])])
    );

    const rematchedSeason = isAnimeMedia({
      media_type: sr.media_type,
      provider: sr.provider,
    })
      ? 1
      : existing.current_season;

    const { data: updated, error } = await supabase
      .from("tv_watch_media")
      .update({
        title: sr.title,
        normalized_title: normalizeTitle(sr.title),
        aliases,
        media_type: sr.media_type,
        current_season: rematchedSeason,
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
        status: computeNextStatus(existing.status, existing.current_episode),
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
