import {
  fetchCatalogEpisodes,
  findBestMetadataMatch,
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
  currentEpisode: number,
  totalEpisodes: number | null
): WatchStatus {
  if (totalEpisodes && totalEpisodes > 0 && currentEpisode >= totalEpisodes) {
    return "completed";
  }
  if (currentStatus === "completed" && totalEpisodes && currentEpisode < totalEpisodes) {
    return "watching";
  }
  if (currentStatus === "plan_to_watch" && currentEpisode > 0) {
    return "watching";
  }
  return currentStatus;
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

  if (!media && parsed.title !== "Título Desconhecido") {
    const initialEp =
      parsed.episode ?? (matchedMetadata?.media_type === "movie" ? 1 : 0);
    const totalEp = matchedMetadata?.total_episodes ?? null;
    const aliases = Array.from(
      new Set([parsed.title, ...(matchedMetadata?.aliases || [])].filter(Boolean))
    );

    const insertRow = {
      title: matchedMetadata?.title || parsed.title,
      normalized_title: normalizeTitle(matchedMetadata?.title || parsed.title),
      aliases,
      media_type: matchedMetadata?.media_type || parsed.mediaTypeHint,
      status: computeNextStatus("watching", initialEp, totalEp),
      current_season: parsed.season,
      current_episode: initialEp,
      total_episodes: totalEp,
      cover_image: matchedMetadata?.cover_image || null,
      banner_image: matchedMetadata?.banner_image || null,
      synopsis: matchedMetadata?.synopsis || null,
      genres: matchedMetadata?.genres || [],
      release_year: matchedMetadata?.release_year || null,
      score: matchedMetadata?.score || null,
      provider: matchedMetadata?.provider || "manual",
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
    media = created as MediaItem;
  } else if (media) {
    const seasonAdvanced = parsed.season > media.current_season;
    const nextSeason = Math.max(media.current_season, parsed.season);
    const nextEpisode =
      parsed.episode !== null
        ? seasonAdvanced
          ? parsed.episode
          : parsed.season === media.current_season
            ? Math.max(media.current_episode, parsed.episode)
            : media.current_episode
        : media.current_episode;

    const updatedAliases = Array.from(
      new Set([...(media.aliases || []), parsed.title].filter(Boolean))
    );

    const { data: updated, error: updateErr } = await supabase
      .from("tv_watch_media")
      .update({
        aliases: updatedAliases,
        current_season: nextSeason,
        current_episode: nextEpisode,
        status: computeNextStatus(media.status, nextEpisode, media.total_episodes),
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
  }

  if (media && parsed.episode !== null) {
    await supabase.from("tv_watch_episodes").upsert(
      {
        media_id: media.id,
        season: parsed.season,
        episode: parsed.episode,
        episode_title: parsed.episodeTitle,
        watched: true,
        source_app: parsed.app,
        position_sec: parsed.positionSec,
        duration_sec: parsed.durationSec,
        watched_at: nowIso,
      },
      { onConflict: "media_id,season,episode" }
    );
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

  const enrichedAll = allMedia.map((m) => ({
    ...m,
    watched_episodes: epsByMedia.get(m.id) || [],
  }));

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
  const sr = input.searchResult;

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
      total_episodes: null,
      current_season: 1,
      current_episode: 0,
    });
    if (catalog.length > 0) totalEpisodes = catalog.length;
  }

  const season = Math.max(1, input.current_season ?? 1);
  const episode = Math.max(0, input.current_episode ?? 0);
  const status = computeNextStatus(
    input.status || "watching",
    episode,
    totalEpisodes
  );

  const { data, error } = await supabase
    .from("tv_watch_media")
    .insert({
      title,
      normalized_title: normalized,
      aliases: Array.from(new Set([title, ...(sr?.aliases || [])])),
      media_type: sr?.media_type || input.media_type || "anime",
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
      provider: sr?.provider || "manual",
      external_id: sr?.external_id || null,
      mal_id: sr?.mal_id || null,
      last_app: "manual",
      last_watched_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) throw error;
  const media = data as MediaItem;

  if (episode > 0) {
    const rows = Array.from({ length: Math.min(episode, 500) }, (_, idx) => ({
      media_id: media.id,
      season,
      episode: idx + 1,
      watched: true,
      source_app: "manual",
      watched_at: new Date().toISOString(),
    }));
    await supabase
      .from("tv_watch_episodes")
      .upsert(rows, { onConflict: "media_id,season,episode" });
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

  if (payload.action === "increment_episode") {
    const nextEp = existing.current_episode + 1;
    const nextStatus = computeNextStatus(
      existing.status,
      nextEp,
      existing.total_episodes
    );

    await supabase.from("tv_watch_episodes").upsert(
      {
        media_id: id,
        season: existing.current_season,
        episode: nextEp,
        watched: true,
        source_app: "manual",
        watched_at: nowIso,
      },
      { onConflict: "media_id,season,episode" }
    );

    const { data: updated, error } = await supabase
      .from("tv_watch_media")
      .update({
        current_episode: nextEp,
        status: nextStatus,
        last_watched_at: nowIso,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return updated as MediaItem;
  }

  if (payload.action === "set_progress") {
    const nextSeason = payload.season ?? existing.current_season;
    const nextEpisode = payload.episode ?? existing.current_episode;
    const nextTotal =
      payload.total_episodes !== undefined
        ? payload.total_episodes
        : existing.total_episodes;
    const nextStatus = payload.status
      ? payload.status
      : computeNextStatus(existing.status, nextEpisode, nextTotal);

    if (payload.episode !== undefined && payload.episode > 0) {
      const rows = Array.from(
        { length: Math.min(payload.episode, 500) },
        (_, idx) => ({
          media_id: id,
          season: nextSeason,
          episode: idx + 1,
          watched: true,
          source_app: "manual",
          watched_at: nowIso,
        })
      );
      await supabase
        .from("tv_watch_episodes")
        .upsert(rows, { onConflict: "media_id,season,episode" });
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
    return updated as MediaItem;
  }

  if (payload.action === "toggle_episode") {
    const season = payload.season ?? existing.current_season;
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
    const nextStatus = computeNextStatus(
      existing.status,
      highestEp,
      existing.total_episodes
    );

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
    const sr = payload.searchResult;
    let totalEp = sr.total_episodes;
    if (sr.provider === "tvmaze" && totalEp === null) {
      const catalog = await fetchCatalogEpisodes({
        provider: sr.provider,
        external_id: sr.external_id,
        mal_id: sr.mal_id,
        total_episodes: null,
        current_season: existing.current_season,
        current_episode: existing.current_episode,
      });
      if (catalog.length > 0) totalEp = catalog.length;
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
          totalEp
        ),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return updated as MediaItem;
  }

  throw new Error("Ação inválida");
}

export async function deleteMedia(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("tv_watch_media").delete().eq("id", id);
  if (error) throw error;
}

export async function getMediaEpisodesWithStatus(id: string): Promise<{
  media: MediaItem;
  episodes: CatalogEpisode[];
}> {
  const supabase = getSupabaseAdmin();
  const { data: mediaRow, error: mediaErr } = await supabase
    .from("tv_watch_media")
    .select("*")
    .eq("id", id)
    .single();

  if (mediaErr || !mediaRow) {
    throw new Error("Obra não encontrada");
  }

  const media = mediaRow as MediaItem;

  const [catalog, watchedRes] = await Promise.all([
    fetchCatalogEpisodes(media),
    supabase
      .from("tv_watch_episodes")
      .select("*")
      .eq("media_id", id)
      .order("season", { ascending: true })
      .order("episode", { ascending: true }),
  ]);

  const watchedRows = (watchedRes.data || []) as WatchedEpisode[];
  const watchedMap = new Map<string, WatchedEpisode>();
  for (const w of watchedRows) {
    watchedMap.set(`${w.season}:${w.episode}`, w);
  }

  const merged: CatalogEpisode[] = catalog.map((ep) => {
    const w = watchedMap.get(`${ep.season}:${ep.episode}`);
    if (w) watchedMap.delete(`${ep.season}:${ep.episode}`);
    return {
      ...ep,
      title: ep.title || w?.episode_title || `Episódio ${ep.episode}`,
      watched: w ? w.watched : false,
      watched_at: w?.watched ? w.watched_at : null,
      source_app: w?.source_app ?? null,
      position_sec: w?.position_sec ?? null,
      duration_sec: w?.duration_sec ?? null,
    };
  });

  // Append any extra watched episodes beyond catalog length
  for (const w of watchedMap.values()) {
    merged.push({
      season: w.season,
      episode: w.episode,
      title: w.episode_title || `Episódio ${w.episode}`,
      aired_at: null,
      duration_min: null,
      thumbnail: null,
      overview: null,
      watched: w.watched,
      watched_at: w.watched ? w.watched_at : null,
      source_app: w.source_app,
      position_sec: w.position_sec,
      duration_sec: w.duration_sec,
    });
  }

  merged.sort((a, b) =>
    a.season !== b.season ? a.season - b.season : a.episode - b.episode
  );

  return { media, episodes: merged };
}
