import {
  CatalogEpisode,
  MediaItem,
  MediaType,
  NextAiringInfo,
  SearchResult,
  SourceApp,
} from "./types";
import { normalizeTitle } from "./parser";

const FETCH_TIMEOUT_MS = 8000;

function stripHtml(html?: string | null): string | null {
  if (!html) return null;
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function titleSimilarityScore(query: string, candidates: string[]): number {
  const nq = normalizeTitle(query);
  if (!nq) return 0;

  let best = 0;
  const qTokens = new Set(nq.split(" ").filter(Boolean));

  for (const cand of candidates) {
    const nc = normalizeTitle(cand);
    if (!nc) continue;

    if (nc === nq) return 100;
    if (nc.startsWith(nq) || nq.startsWith(nc)) {
      best = Math.max(best, 85);
      continue;
    }
    if (nc.includes(nq) || nq.includes(nc)) {
      best = Math.max(best, 72);
      continue;
    }

    const cTokens = new Set(nc.split(" ").filter(Boolean));
    let overlap = 0;
    for (const t of qTokens) {
      if (cTokens.has(t)) overlap++;
    }
    if (overlap > 0) {
      const union = new Set([...qTokens, ...cTokens]).size;
      const jaccard = Math.round((overlap / union) * 65);
      best = Math.max(best, jaccard);
    }
  }

  return best;
}

// ============================================================================
// 1. AniList GraphQL API
// ============================================================================

interface AniListMediaNode {
  id: number;
  idMal: number | null;
  title: {
    romaji: string | null;
    english: string | null;
    native: string | null;
  };
  synonyms: string[] | null;
  coverImage: {
    extraLarge: string | null;
    large: string | null;
  } | null;
  bannerImage: string | null;
  episodes: number | null;
  status: string | null;
  seasonYear: number | null;
  averageScore: number | null;
  genres: string[] | null;
  description: string | null;
  format: string | null;
  nextAiringEpisode?: {
    episode: number;
    airingAt: number;
  } | null;
  airingSchedule?: {
    nodes?: Array<{
      episode: number;
      airingAt: number;
    }> | null;
  } | null;
  streamingEpisodes?: Array<{
    title: string | null;
    thumbnail: string | null;
    url: string | null;
  }> | null;
}

function mapAniListToSearchResult(node: AniListMediaNode): SearchResult {
  const title =
    node.title.english || node.title.romaji || node.title.native || "Sem Título";
  const aliases = Array.from(
    new Set(
      [
        node.title.romaji,
        node.title.english,
        node.title.native,
        ...(node.synonyms || []),
      ].filter((v): v is string => Boolean(v && v.trim()))
    )
  );

  return {
    provider: "anilist",
    external_id: String(node.id),
    mal_id: node.idMal,
    title,
    title_native: node.title.native,
    aliases,
    media_type: node.format === "MOVIE" ? "movie" : "anime",
    total_episodes: node.episodes,
    cover_image: node.coverImage?.extraLarge || node.coverImage?.large || null,
    banner_image: node.bannerImage || null,
    synopsis: stripHtml(node.description),
    genres: node.genres || [],
    release_year: node.seasonYear,
    score:
      typeof node.averageScore === "number"
        ? Math.round(node.averageScore) / 10
        : null,
    status_airing: node.status,
    next_airing: node.nextAiringEpisode
      ? {
          episode: node.nextAiringEpisode.episode,
          airing_at: new Date(
            node.nextAiringEpisode.airingAt * 1000
          ).toISOString(),
        }
      : null,
  };
}

export async function searchAniList(
  query: string,
  limit = 8
): Promise<SearchResult[]> {
  const gql = `
    query ($search: String, $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          idMal
          format
          title {
            romaji
            english
            native
          }
          synonyms
          coverImage {
            extraLarge
            large
          }
          bannerImage
          episodes
          status
          seasonYear
          averageScore
          genres
          description(asHtml: false)
          nextAiringEpisode {
            episode
            airingAt
          }
        }
      }
    }
  `;

  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: gql,
        variables: { search: query, perPage: limit },
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: { Page?: { media?: AniListMediaNode[] } };
    };
    const nodes = json.data?.Page?.media || [];
    return nodes.map(mapAniListToSearchResult);
  } catch {
    return [];
  }
}

async function fetchAniListMediaById(
  id: number
): Promise<AniListMediaNode | null> {
  const gql = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        format
        title {
          romaji
          english
          native
        }
        synonyms
        coverImage {
          extraLarge
          large
        }
        bannerImage
        episodes
        status
        seasonYear
        averageScore
        genres
        description(asHtml: false)
        nextAiringEpisode {
          episode
          airingAt
        }
        airingSchedule(perPage: 50) {
          nodes {
            episode
            airingAt
          }
        }
        streamingEpisodes {
          title
          thumbnail
          url
        }
      }
    }
  `;

  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: gql, variables: { id } }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { Media?: AniListMediaNode };
    };
    return json.data?.Media || null;
  } catch {
    return null;
  }
}

// ============================================================================
// 2. Jikan API v4 (MyAnimeList)
// ============================================================================

interface JikanAnime {
  mal_id: number;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  title_synonyms: string[] | null;
  type: string | null;
  episodes: number | null;
  status: string | null;
  year: number | null;
  score: number | null;
  synopsis: string | null;
  genres: Array<{ name: string }> | null;
  images: {
    jpg?: { large_image_url?: string; image_url?: string };
    webp?: { large_image_url?: string; image_url?: string };
  } | null;
}

export async function searchJikan(
  query: string,
  limit = 6
): Promise<SearchResult[]> {
  try {
    const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(
      query
    )}&limit=${limit}&sfw=true`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: JikanAnime[] };
    const items = json.data || [];

    return items.map((item) => {
      const title = item.title_english || item.title;
      const aliases = Array.from(
        new Set(
          [
            item.title,
            item.title_english,
            item.title_japanese,
            ...(item.title_synonyms || []),
          ].filter((v): v is string => Boolean(v && v.trim()))
        )
      );
      return {
        provider: "jikan",
        external_id: String(item.mal_id),
        mal_id: item.mal_id,
        title,
        title_native: item.title_japanese,
        aliases,
        media_type: item.type === "Movie" ? "movie" : "anime",
        total_episodes: item.episodes,
        cover_image:
          item.images?.webp?.large_image_url ||
          item.images?.jpg?.large_image_url ||
          item.images?.jpg?.image_url ||
          null,
        banner_image: null,
        synopsis: item.synopsis,
        genres: (item.genres || []).map((g) => g.name),
        release_year: item.year,
        score: item.score,
        status_airing: item.status,
      };
    });
  } catch {
    return [];
  }
}

interface JikanEpisode {
  mal_id: number;
  title: string | null;
  title_romanji: string | null;
  aired: string | null;
}

async function fetchJikanEpisodes(
  malId: number,
  maxPages = 2
): Promise<
  Array<{
    season: number;
    episode: number;
    title: string | null;
    aired_at: string | null;
    air_date: string | null;
  }>
> {
  const episodes: Array<{
    season: number;
    episode: number;
    title: string | null;
    aired_at: string | null;
    air_date: string | null;
  }> = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const res = await fetch(
        `https://api.jikan.moe/v4/anime/${malId}/episodes?page=${page}`,
        {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          cache: "no-store",
        }
      );
      if (!res.ok) break;
      const json = (await res.json()) as {
        data?: JikanEpisode[];
        pagination?: { has_next_page?: boolean };
      };
      for (const ep of json.data || []) {
        episodes.push({
          season: 1,
          episode: ep.mal_id,
          title: ep.title || ep.title_romanji || null,
          aired_at: ep.aired ? ep.aired.slice(0, 10) : null,
          air_date: ep.aired || null,
        });
      }
      if (!json.pagination?.has_next_page) break;
    } catch {
      break;
    }
  }

  return episodes;
}

// ============================================================================
// 3. TVMaze API (100% free, no key required)
// ============================================================================

interface TVMazeShow {
  id: number;
  name: string;
  type: string | null;
  genres: string[] | null;
  status: string | null;
  premiered: string | null;
  rating: { average: number | null } | null;
  image: { original?: string; medium?: string } | null;
  summary: string | null;
  _embedded?: {
    episodes?: Array<{
      id: number;
      season: number;
      number: number;
      name: string | null;
      airdate: string | null;
      airstamp?: string | null;
      runtime: number | null;
      image: { medium?: string; original?: string } | null;
      summary: string | null;
    }>;
  };
}

export async function searchTVMaze(
  query: string,
  limit = 8
): Promise<SearchResult[]> {
  try {
    const res = await fetch(
      `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as Array<{ show: TVMazeShow }>;
    return json.slice(0, limit).map(({ show }) => ({
      provider: "tvmaze",
      external_id: String(show.id),
      mal_id: null,
      title: show.name,
      title_native: null,
      aliases: [show.name],
      media_type: "series",
      total_episodes: null,
      cover_image: show.image?.original || show.image?.medium || null,
      banner_image: null,
      synopsis: stripHtml(show.summary),
      genres: show.genres || [],
      release_year: show.premiered ? parseInt(show.premiered.slice(0, 4), 10) : null,
      score: show.rating?.average ?? null,
      status_airing: show.status,
    }));
  } catch {
    return [];
  }
}

async function fetchTVMazeShowWithEpisodes(
  showId: string
): Promise<TVMazeShow | null> {
  try {
    const res = await fetch(
      `https://api.tvmaze.com/shows/${encodeURIComponent(
        showId
      )}?embed=episodes`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as TVMazeShow;
  } catch {
    return null;
  }
}

// ============================================================================
// 4. TMDB API (first-class for Series & Movies in pt-BR when configured)
// ============================================================================

const TMDB_GENRES: Record<number, string> = {
  10759: "Ação & Aventura",
  16: "Animação",
  35: "Comédia",
  80: "Crime",
  99: "Documentário",
  18: "Drama",
  10751: "Família",
  10762: "Infantil",
  9648: "Mistério",
  10763: "Notícias",
  10764: "Reality",
  10765: "Sci-Fi & Fantasia",
  10766: "Novela",
  10767: "Talk Show",
  10768: "Guerra & Política",
  37: "Faroeste",
  28: "Ação",
  12: "Aventura",
  14: "Fantasia",
  36: "História",
  27: "Terror",
  10402: "Música",
  10749: "Romance",
  878: "Ficção Científica",
  53: "Suspense",
  10752: "Guerra",
};

interface TMDBMultiItem {
  id: number;
  media_type: "tv" | "movie" | "person";
  name?: string;
  title?: string;
  original_name?: string;
  original_title?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string;
  release_date?: string;
  vote_average?: number;
  genre_ids?: number[];
}

interface TMDBTVDetails {
  id: number;
  name?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  number_of_episodes?: number;
  status?: string;
  genres?: Array<{ id: number; name: string }>;
  seasons?: Array<{ season_number: number; episode_count: number }>;
}

interface TMDBMovieDetails {
  id: number;
  title?: string;
  original_title?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  status?: string;
  genres?: Array<{ id: number; name: string }>;
}

function isTMDBConfigured(): boolean {
  return Boolean(
    process.env.TMDB_READ_TOKEN?.trim() || process.env.TMDB_API_KEY?.trim()
  );
}

async function tmdbFetch<T>(pathWithQuery: string): Promise<T | null> {
  const token = process.env.TMDB_READ_TOKEN?.trim();
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!token && !apiKey) return null;

  const sep = pathWithQuery.includes("?") ? "&" : "?";
  const url =
    token
      ? `https://api.themoviedb.org/3${pathWithQuery}`
      : `https://api.themoviedb.org/3${pathWithQuery}${sep}api_key=${encodeURIComponent(
          apiKey || ""
        )}`;

  try {
    const res = await fetch(url, {
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          }
        : { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function searchTMDB(
  query: string,
  limit = 6
): Promise<SearchResult[]> {
  if (!isTMDBConfigured()) return [];

  const json = await tmdbFetch<{ results?: TMDBMultiItem[] }>(
    `/search/multi?query=${encodeURIComponent(
      query
    )}&language=pt-BR&include_adult=false`
  );
  if (!json) return [];

  const filtered = (json.results || []).filter(
    (r) => r.media_type === "tv" || r.media_type === "movie"
  );

  return filtered.slice(0, limit).map((item) => {
    const title = item.name || item.title || "Sem Título";
    const orig = item.original_name || item.original_title || null;
    const dateStr = item.first_air_date || item.release_date || "";
    const genres = (item.genre_ids || [])
      .map((gid) => TMDB_GENRES[gid])
      .filter((g): g is string => Boolean(g));

    return {
      provider: "tmdb",
      external_id: `${item.media_type}:${item.id}`,
      mal_id: null,
      title,
      title_native: orig,
      aliases: Array.from(
        new Set([title, orig].filter((v): v is string => Boolean(v)))
      ),
      media_type: item.media_type === "movie" ? "movie" : "series",
      total_episodes: item.media_type === "movie" ? 1 : null,
      cover_image: item.poster_path
        ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
        : null,
      banner_image: item.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}`
        : null,
      synopsis: item.overview || null,
      genres,
      release_year: dateStr ? parseInt(dateStr.slice(0, 4), 10) : null,
      score:
        typeof item.vote_average === "number"
          ? Math.round(item.vote_average * 10) / 10
          : null,
    };
  });
}

export async function enrichTMDBResult(
  result: SearchResult
): Promise<SearchResult> {
  if (result.provider !== "tmdb" || !isTMDBConfigured()) return result;
  const [kind, tmdbId] = result.external_id.split(":");
  if (!tmdbId) return result;

  if (kind === "tv") {
    const details = await tmdbFetch<TMDBTVDetails>(
      `/tv/${tmdbId}?language=pt-BR`
    );
    if (!details) return result;
    return {
      ...result,
      title: details.name || result.title,
      aliases: Array.from(
        new Set(
          [...result.aliases, details.name, details.original_name].filter(
            (v): v is string => Boolean(v)
          )
        )
      ),
      total_episodes:
        typeof details.number_of_episodes === "number"
          ? details.number_of_episodes
          : result.total_episodes,
      synopsis: details.overview || result.synopsis,
      genres:
        details.genres && details.genres.length > 0
          ? details.genres.map((g) => g.name)
          : result.genres,
      status_airing: details.status || result.status_airing,
      cover_image: details.poster_path
        ? `https://image.tmdb.org/t/p/w500${details.poster_path}`
        : result.cover_image,
      banner_image: details.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}`
        : result.banner_image,
    };
  }

  if (kind === "movie") {
    const details = await tmdbFetch<TMDBMovieDetails>(
      `/movie/${tmdbId}?language=pt-BR`
    );
    if (!details) return result;
    return {
      ...result,
      title: details.title || result.title,
      aliases: Array.from(
        new Set(
          [...result.aliases, details.title, details.original_title].filter(
            (v): v is string => Boolean(v)
          )
        )
      ),
      total_episodes: 1,
      synopsis: details.overview || result.synopsis,
      genres:
        details.genres && details.genres.length > 0
          ? details.genres.map((g) => g.name)
          : result.genres,
      status_airing: details.status || result.status_airing,
    };
  }

  return result;
}

// ============================================================================
// Unified Search, Best Match & Episode Catalog Fetchers
// ============================================================================

export async function searchMetadata(
  query: string,
  type: "anime" | "series" | "all" = "all"
): Promise<SearchResult[]> {
  const cleanQ = query.trim();
  if (!cleanQ) return [];

  if (type === "anime") {
    const [anilist, jikan] = await Promise.all([
      searchAniList(cleanQ, 8),
      searchJikan(cleanQ, 5),
    ]);
    // Deduplicate Jikan entries already returned by AniList via mal_id
    const seenMal = new Set(
      anilist.map((a) => a.mal_id).filter((id): id is number => id !== null)
    );
    return [
      ...anilist,
      ...jikan.filter((j) => !j.mal_id || !seenMal.has(j.mal_id)),
    ];
  }

  if (type === "series") {
    const [tmdb, tvmaze] = await Promise.all([
      searchTMDB(cleanQ, 8),
      searchTVMaze(cleanQ, 6),
    ]);
    return [...tmdb, ...tvmaze];
  }

  const [anilist, tmdb, tvmaze] = await Promise.all([
    searchAniList(cleanQ, 6),
    searchTMDB(cleanQ, 6),
    searchTVMaze(cleanQ, 5),
  ]);

  let combined = [...anilist, ...tmdb, ...tvmaze];
  if (combined.length === 0) {
    combined = await searchJikan(cleanQ, 5);
  }

  return combined.sort((a, b) => {
    const sa = titleSimilarityScore(cleanQ, [a.title, ...a.aliases]);
    const sb = titleSimilarityScore(cleanQ, [b.title, ...b.aliases]);
    if (sb !== sa) return sb - sa;
    // Prefer TMDB/AniList over TVMaze on exact ties (pt-BR metadata + banners)
    const rank = (p: string) => (p === "tmdb" ? 3 : p === "anilist" ? 2 : 1);
    return rank(b.provider) - rank(a.provider);
  });
}

export async function findBestMetadataMatch(
  title: string,
  app: SourceApp,
  mediaTypeHint: MediaType
): Promise<SearchResult | null> {
  const cleanQ = title.trim();
  if (!cleanQ || cleanQ === "Título Desconhecido") return null;

  let candidates: SearchResult[] = [];
  if (app === "crunchyroll" || mediaTypeHint === "anime") {
    candidates = await searchMetadata(cleanQ, "anime");
    if (candidates.length === 0) {
      candidates = await searchMetadata(cleanQ, "all");
    }
  } else {
    candidates = await searchMetadata(cleanQ, "all");
  }

  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestScore = titleSimilarityScore(cleanQ, [best.title, ...best.aliases]);
  if (app === "youcine" && best.provider === "tmdb") bestScore += 4;

  for (const cand of candidates.slice(1)) {
    let s = titleSimilarityScore(cleanQ, [cand.title, ...cand.aliases]);
    if (app === "youcine" && cand.provider === "tmdb") s += 4;
    if (s > bestScore) {
      bestScore = s;
      best = cand;
    }
  }

  const chosen = bestScore >= 25 ? best : candidates[0];

  if (chosen.provider === "tvmaze" && chosen.total_episodes === null) {
    const show = await fetchTVMazeShowWithEpisodes(chosen.external_id);
    if (show?._embedded?.episodes) {
      chosen.total_episodes = show._embedded.episodes.length;
    }
  } else if (chosen.provider === "tmdb") {
    return enrichTMDBResult(chosen);
  }

  return chosen;
}

function parseStreamingEpNumber(title: string | null): {
  episode: number | null;
  cleanTitle: string | null;
} {
  if (!title) return { episode: null, cleanTitle: null };
  const match = title.match(/^(?:Episode|Epis[oó]dio|Ep\.?)\s*(\d+)\s*[-–—:]?\s*(.*)$/i);
  if (match) {
    return {
      episode: parseInt(match[1], 10),
      cleanTitle: match[2]?.trim() || title,
    };
  }
  return { episode: null, cleanTitle: title };
}

export type RawCatalogEpisode = Omit<
  CatalogEpisode,
  "watched" | "watched_at" | "source_app" | "position_sec" | "duration_sec"
>;

export interface MediaCatalogAndAiring {
  episodes: RawCatalogEpisode[];
  next_airing: NextAiringInfo | null;
  airing_status: string | null;
  total_episodes: number | null;
}

function computeIsUpcoming(airDate?: string | null): boolean {
  if (!airDate) return false;
  const parsed = new Date(airDate);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now();
}

export async function fetchMediaCatalogAndAiring(
  media: Pick<
    MediaItem,
    | "provider"
    | "external_id"
    | "mal_id"
    | "total_episodes"
    | "current_season"
    | "current_episode"
  >
): Promise<MediaCatalogAndAiring> {
  const map = new Map<string, RawCatalogEpisode>();
  let nextAiring: NextAiringInfo | null = null;
  let airingStatus: string | null = null;
  let totalEpisodes: number | null = media.total_episodes ?? null;

  const putEp = (
    season: number,
    episode: number,
    patch: Partial<RawCatalogEpisode>
  ) => {
    const key = `${season}:${episode}`;
    const prev = map.get(key);
    const airDate = patch.air_date ?? prev?.air_date ?? null;
    const airedAt =
      patch.aired_at ??
      prev?.aired_at ??
      (airDate ? airDate.slice(0, 10) : null);
    map.set(key, {
      season,
      episode,
      title: patch.title ?? prev?.title ?? null,
      aired_at: airedAt,
      air_date: airDate,
      is_upcoming:
        patch.is_upcoming !== undefined
          ? patch.is_upcoming
          : computeIsUpcoming(airDate),
      duration_min: patch.duration_min ?? prev?.duration_min ?? null,
      thumbnail: patch.thumbnail ?? prev?.thumbnail ?? null,
      overview: patch.overview ?? prev?.overview ?? null,
    });
  };

  if (media.provider === "anilist" && media.external_id) {
    const aniId = parseInt(media.external_id, 10);
    if (!Number.isNaN(aniId)) {
      const ani = await fetchAniListMediaById(aniId);
      if (ani) {
        airingStatus = ani.status || null;
        if (typeof ani.episodes === "number") {
          totalEpisodes = ani.episodes;
        }
        if (ani.nextAiringEpisode) {
          const iso = new Date(
            ani.nextAiringEpisode.airingAt * 1000
          ).toISOString();
          nextAiring = {
            episode: ani.nextAiringEpisode.episode,
            airing_at: iso,
          };
          putEp(1, ani.nextAiringEpisode.episode, {
            air_date: iso,
            aired_at: iso.slice(0, 10),
            is_upcoming: true,
          });
        }
        for (const node of ani.airingSchedule?.nodes || []) {
          const iso = new Date(node.airingAt * 1000).toISOString();
          putEp(1, node.episode, {
            air_date: iso,
            aired_at: iso.slice(0, 10),
            is_upcoming: computeIsUpcoming(iso),
          });
        }
        if (ani.streamingEpisodes) {
          ani.streamingEpisodes.forEach((se, idx) => {
            const parsed = parseStreamingEpNumber(se.title);
            const epNum = parsed.episode ?? idx + 1;
            putEp(1, epNum, {
              title: parsed.cleanTitle || se.title || null,
              thumbnail: se.thumbnail || null,
            });
          });
        }
      }
      const malId = media.mal_id || ani?.idMal || null;
      if (malId) {
        const jikanEps = await fetchJikanEpisodes(malId, 2);
        for (const je of jikanEps) {
          putEp(1, je.episode, {
            title: je.title,
            aired_at: je.aired_at,
            air_date: je.air_date,
          });
        }
      }
    }
  } else if (media.provider === "jikan" && media.external_id) {
    const malId = parseInt(media.external_id, 10);
    if (!Number.isNaN(malId)) {
      const jikanEps = await fetchJikanEpisodes(malId, 2);
      for (const je of jikanEps) {
        putEp(1, je.episode, {
          title: je.title,
          aired_at: je.aired_at,
          air_date: je.air_date,
        });
      }
    }
  } else if (media.provider === "tvmaze" && media.external_id) {
    const show = await fetchTVMazeShowWithEpisodes(media.external_id);
    if (show) airingStatus = show.status || null;
    for (const ep of show?._embedded?.episodes || []) {
      if (typeof ep.number === "number" && ep.number > 0) {
        const airDate = ep.airstamp || ep.airdate || null;
        putEp(ep.season || 1, ep.number, {
          title: ep.name || null,
          aired_at: ep.airdate || null,
          air_date: airDate,
          duration_min: ep.runtime ?? null,
          thumbnail: ep.image?.medium || ep.image?.original || null,
          overview: stripHtml(ep.summary),
        });
      }
    }
  } else if (
    media.provider === "tmdb" &&
    media.external_id &&
    isTMDBConfigured()
  ) {
    const [kind, tmdbId] = media.external_id.split(":");
    if (kind === "movie" && tmdbId) {
      const movie = await tmdbFetch<TMDBMovieDetails>(
        `/movie/${tmdbId}?language=pt-BR`
      );
      airingStatus = movie?.status || null;
      putEp(1, 1, {
        title: movie?.title ? `${movie.title} (Filme Completo)` : "Filme Completo",
        thumbnail: movie?.backdrop_path
          ? `https://image.tmdb.org/t/p/w300${movie.backdrop_path}`
          : null,
        overview: movie?.overview || null,
      });
    } else if (kind === "tv" && tmdbId) {
      const details = await tmdbFetch<TMDBTVDetails>(
        `/tv/${tmdbId}?language=pt-BR`
      );
      if (details) {
        airingStatus = details.status || null;
        if (typeof details.number_of_episodes === "number") {
          totalEpisodes = details.number_of_episodes;
        }
      }
      const regularSeasons = (details?.seasons || [])
        .map((s) => s.season_number)
        .filter((n) => n >= 1);
      const seasonsToFetch =
        regularSeasons.length > 0
          ? regularSeasons.slice(0, 8)
          : [media.current_season || 1];
      if (
        media.current_season > 0 &&
        !seasonsToFetch.includes(media.current_season)
      ) {
        seasonsToFetch.push(media.current_season);
      }

      const seasonResponses = await Promise.all(
        seasonsToFetch.map((sNum) =>
          tmdbFetch<{
            episodes?: Array<{
              episode_number: number;
              season_number: number;
              name?: string;
              air_date?: string;
              runtime?: number;
              still_path?: string | null;
              overview?: string;
            }>;
          }>(`/tv/${tmdbId}/season/${sNum}?language=pt-BR`)
        )
      );

      seasonResponses.forEach((sJson, idx) => {
        const sNum = seasonsToFetch[idx];
        for (const ep of sJson?.episodes || []) {
          const airDate = ep.air_date || null;
          putEp(ep.season_number || sNum, ep.episode_number, {
            title: ep.name || null,
            aired_at: airDate,
            air_date: airDate,
            duration_min: ep.runtime ?? null,
            thumbnail: ep.still_path
              ? `https://image.tmdb.org/t/p/w300${ep.still_path}`
              : null,
            overview: ep.overview || null,
          });
        }
      });
    }
  }

  // Fill numbered placeholders up to total_episodes (or current_episode) for season 1
  // when external catalog doesn't return all episodes (e.g. ongoing anime or manual entries).
  const maxMappedEp = Array.from(map.values()).reduce(
    (acc, e) => (e.season === (media.current_season || 1) ? Math.max(acc, e.episode) : acc),
    0
  );
  const targetCount = Math.max(
    totalEpisodes || 0,
    media.current_episode || 0,
    maxMappedEp
  );
  const hasFullProviderCatalog =
    (media.provider === "tvmaze" || media.provider === "tmdb") && map.size > 0;
  if (
    map.size === 0 ||
    (!hasFullProviderCatalog && targetCount > 0 && targetCount <= 200)
  ) {
    const fillCount = Math.min(Math.max(targetCount, map.size || 12), 200);
    const s = media.current_season || 1;
    for (let ep = 1; ep <= fillCount; ep++) {
      if (!map.has(`${s}:${ep}`) && !hasFullProviderCatalog) {
        putEp(s, ep, { title: `Episódio ${ep}` });
      }
    }
  }

  const episodes = Array.from(map.values()).sort((a, b) =>
    a.season !== b.season ? a.season - b.season : a.episode - b.episode
  );

  // If next_airing wasn't provided directly (e.g. TMDB/TVMaze), derive from earliest upcoming episode
  if (!nextAiring) {
    const nextUpcoming = episodes.find((e) => e.is_upcoming && e.air_date);
    if (nextUpcoming && nextUpcoming.air_date) {
      nextAiring = {
        episode: nextUpcoming.episode,
        airing_at: nextUpcoming.air_date,
      };
    }
  }

  return {
    episodes,
    next_airing: nextAiring,
    airing_status: airingStatus,
    total_episodes: totalEpisodes,
  };
}

export async function fetchCatalogEpisodes(
  media: Pick<
    MediaItem,
    | "provider"
    | "external_id"
    | "mal_id"
    | "total_episodes"
    | "current_season"
    | "current_episode"
  >
): Promise<RawCatalogEpisode[]> {
  const { episodes } = await fetchMediaCatalogAndAiring(media);
  return episodes;
}
